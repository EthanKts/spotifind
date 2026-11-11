import "server-only";
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SUPPORT_DIR } from "./config";
import { api, connectedUser, grantedScopes, SpotifyAuthError, TOP_READ_SCOPE } from "./spotifyUser";
import { inBackground, mapLimit } from "./http";
import * as lf from "./lastfm";
import { itemKey } from "../util";
import type { ImportedItem, SpotifyImport, SpotifyRange, TagVector } from "../types";

// "Import my taste from Spotify": your top artists and top tracks (long, medium and short term) become
// imported taste signals. They are NOT star ratings — the taste profile weighs them below manual ratings
// (≈ a 4★ at most) and any real rating of the same item replaces them.
// Stored only on this Mac: ~/Library/Application Support/Spotifind/spotify-import.json (mode 600).

const FILE = join(SUPPORT_DIR, "spotify-import.json");

/** Strength per Spotify time range, relative to a 4★ rating. Recent listening (last 4 weeks) counts most, decaying to all-time. */
export const RANGE_WEIGHT: Record<SpotifyRange, number> = { short_term: 1, medium_term: 0.8, long_term: 0.6 };
const RANGES = Object.keys(RANGE_WEIGHT) as SpotifyRange[];

export class ScopeError extends Error {}

export function readImport(): SpotifyImport | null {
  try {
    return JSON.parse(readFileSync(FILE, "utf8")) as SpotifyImport;
  } catch {
    return null;
  }
}

function writeImport(d: SpotifyImport) {
  mkdirSync(SUPPORT_DIR, { recursive: true });
  writeFileSync(FILE, JSON.stringify(d), { mode: 0o600 });
  try {
    chmodSync(FILE, 0o600);
  } catch {}
}

export function clearImport() {
  try {
    rmSync(FILE, { force: true });
  } catch {}
}

export function removeImported(key: string): SpotifyImport | null {
  const d = readImport();
  if (!d) return null;
  const next = { ...d, items: d.items.filter((x) => x.key !== key), removed: [...new Set([...d.removed, key])] };
  writeImport(next);
  return next;
}

interface SpImage { url: string; width?: number }
interface SpArtist { name: string; images?: SpImage[] }
interface SpTrack { name: string; artists: { name: string }[]; album?: { name?: string; images?: SpImage[] }; duration_ms?: number }

/** Medium-sized artwork (Spotify lists images largest first). */
const pickImage = (imgs?: SpImage[]) => (imgs?.length ? (imgs.find((i) => (i.width ?? 0) <= 320) ?? imgs[0]).url : undefined);

/** Position 1 → 1.0, position 50 → 0.5. */
const rankFactor = (i: number, n: number) => 1 - 0.5 * (i / Math.max(1, n - 1));

async function tagsFor(kind: "artist" | "track", artist: string, title: string): Promise<TagVector> {
  if (!lf.hasLastfm()) return {};
  try {
    let tags = kind === "track" ? await lf.trackTags(artist, title) : {};
    if (Object.keys(tags).length < 3) tags = await lf.artistTags(artist);
    return tags;
  } catch {
    return {};
  }
}

export async function runImport(): Promise<SpotifyImport> {
  if (!connectedUser()) throw new SpotifyAuthError("Not connected to Spotify");
  if (!grantedScopes().includes(TOP_READ_SCOPE)) {
    throw new ScopeError("Your Spotify login is from before taste import existed. Reconnect Spotify once to allow reading your top artists and tracks.");
  }

  const byKey = new Map<string, ImportedItem>();
  const add = (base: Omit<ImportedItem, "weight" | "ranges" | "tags">, range: SpotifyRange, w: number) => {
    const prev = byKey.get(base.key);
    if (!prev) {
      byKey.set(base.key, { ...base, weight: w, ranges: [range], tags: {} });
      return;
    }
    // In several top lists: keep the strongest, plus a small bonus for staying power.
    prev.ranges.push(range);
    prev.weight = Math.min(1, Math.max(prev.weight, w) + 0.1);
    prev.image ??= base.image;
  };

  for (const range of RANGES) {
    const [artists, tracks] = await Promise.all([
      api<{ items?: SpArtist[] }>(`/me/top/artists?limit=50&time_range=${range}`),
      api<{ items?: SpTrack[] }>(`/me/top/tracks?limit=50&time_range=${range}`),
    ]);
    const as = artists.items ?? [];
    as.forEach((a, i) => {
      if (!a?.name) return;
      add({ kind: "artist", key: itemKey("artist", a.name, a.name), title: a.name, artist: a.name, image: pickImage(a.images) }, range, RANGE_WEIGHT[range] * rankFactor(i, as.length));
    });
    const ts = tracks.items ?? [];
    ts.forEach((t, i) => {
      const artist = t?.artists?.[0]?.name;
      if (!artist || !t.name) return;
      add(
        {
          kind: "track", key: itemKey("track", artist, t.name), title: t.name, artist, album: t.album?.name,
          image: pickImage(t.album?.images), durationSec: t.duration_ms ? Math.round(t.duration_ms / 1000) : undefined,
        },
        range,
        RANGE_WEIGHT[range] * rankFactor(i, ts.length),
      );
    });
  }

  const removed = readImport()?.removed ?? [];
  const items = [...byKey.values()].filter((x) => !removed.includes(x.key));
  if (!items.length) throw new Error("Spotify returned no top artists or tracks for this account yet — listen a little more and try again.");

  // Last.fm tags, through the shared rate limiter + disk cache. Background lane so browsing stays responsive.
  const tags = await inBackground(() => mapLimit(items, 6, (it) => tagsFor(it.kind as "artist" | "track", it.artist, it.title)));
  items.forEach((it, i) => (it.tags = tags[i] ?? {}));
  items.sort((a, b) => b.weight - a.weight);

  const u = connectedUser();
  const d: SpotifyImport = { importedAt: Date.now(), user: u?.display_name || u?.id, items, removed };
  writeImport(d);
  return d;
}
