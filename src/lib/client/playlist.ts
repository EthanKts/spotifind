"use client";

// Playlist generator (10–50 songs, 15 by default). Uses the same real data and ranking as Discover:
// recommendation pools for 1–3 seeds are merged (songs suggested by several seeds rank higher),
// ranked with the chosen style + adventurousness + your taste, then capped per artist.

import type { Candidate, Enrichment, ImportedItem, Item, RecommendResponse, Seed, TagVector } from "../types";
import { MODES, rank, type Mode, type TasteInput } from "../recommend/score";
import { displayScore, explain } from "../recommend/explain";
import type { Playlist, PlaylistSettings, Profile } from "../taste/profile";
import { recommendUrl } from "./data";
import { itemKey } from "../util";

export const PLAYLIST_LENGTH = 15;
export const LENGTH_CHOICES = [10, 15, 20, 25, 30, 40, 50];

export function playlistLength(s: PlaylistSettings) {
  return Math.max(5, Math.min(50, s.length ?? PLAYLIST_LENGTH));
}

export function modeLabel(mode: string) {
  return MODES.find((m) => m.id === mode)?.label ?? mode;
}

/**
 * Your best-rated songs/albums/artists, used for "From my taste".
 * With fewer than n favourites rated, your strongest imported Spotify favourites fill the gap (cold start).
 */
export function tasteSeeds(p: Profile, n = 3, imported: ImportedItem[] = []): PlaylistSettings["seeds"] {
  const rated = Object.values(p.ratings)
    .filter((r) => r.rating >= 4)
    .sort((a, b) => b.rating - a.rating || b.at - a.at)
    .slice(0, n)
    .map((r) => ({ kind: r.item.kind, artist: r.item.artist, title: r.item.title }));
  const fill = imported
    .filter((it) => !p.ratings[it.key] && (it.kind === "track" || it.ranges.length > 1 || it.weight > 0.8))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, n - rated.length)
    .map((it) => ({ kind: it.kind, artist: it.artist, title: it.title }));
  return [...rated, ...fill];
}

export function seedName(s: PlaylistSettings["seeds"][number]) {
  return s.kind === "artist" ? s.artist : s.title;
}

function mergeSeedTags(seeds: (Seed | null)[]): TagVector {
  const out: TagVector = {};
  for (const s of seeds) for (const [t, w] of Object.entries(s?.tags ?? {})) out[t] = (out[t] ?? 0) + w;
  const max = Math.max(1e-9, ...Object.values(out));
  for (const t of Object.keys(out)) out[t] = out[t] / max;
  return out;
}

export async function enrich(items: Item[]): Promise<Record<string, Enrichment>> {
  const out: Record<string, Enrichment> = {};
  for (let i = 0; i < items.length; i += 40) {
    const batch = items.slice(i, i + 40);
    const res = await fetch("/api/enrich", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: batch.map((b) => ({ kind: b.kind, artist: b.artist, title: b.title })) }),
    }).then((r) => r.json() as Promise<Record<string, Enrichment>>);
    Object.assign(out, res);
  }
  return out;
}

export interface Pool {
  candidates: Candidate[];
  /** Merged seed (tags of all seeds), used by the ranker. */
  seed: Seed | null;
  /** How many seeds suggested each song. */
  support: Map<string, number>;
}

/** Fetch and merge recommendation pools (tracks only) for 1–3 seeds. */
export async function fetchPool(seeds: PlaylistSettings["seeds"], depth: "lite" | "full", foreground = true): Promise<Pool> {
  const responses = await Promise.all(
    seeds.map((s) =>
      // fg=1: you're waiting for this, so the server runs it at normal priority instead of the background lane.
      fetch(`${recommendUrl(s.kind, s.artist, s.title, depth)}${foreground ? "&fg=1" : ""}`)
        .then((r) => r.json() as Promise<RecommendResponse>)
        .catch(() => null),
    ),
  );
  // Merge pools: keep the strongest evidence for each song, and count how many seeds suggested it.
  const pool = new Map<string, Candidate>();
  const support = new Map<string, number>();
  for (const res of responses) {
    for (const c of res?.candidates ?? []) {
      if (c.kind !== "track") continue;
      support.set(c.key, (support.get(c.key) ?? 0) + 1);
      const prev = pool.get(c.key);
      if (!prev || (c.match ?? c.artistMatch ?? 0) > (prev.match ?? prev.artistMatch ?? 0)) pool.set(c.key, c);
    }
  }
  const seedKeys = new Set(seeds.filter((s) => s.kind === "track").map((s) => itemKey("track", s.artist, s.title)));
  const first = responses.find((r) => r?.seed)?.seed;
  return {
    candidates: [...pool.values()].filter((c) => !seedKeys.has(c.key)),
    seed: first ? { ...first, tags: mergeSeedTags(responses.map((r) => r?.seed ?? null)) } : null,
    support,
  };
}

export type GenerateResult = Pick<Playlist, "tracks" | "alternates" | "reasons" | "scores">;

export async function generatePlaylist(
  settings: PlaylistSettings,
  taste: TasteInput,
  ratedKeys: Set<string>,
  onProgress?: (msg: string) => void,
): Promise<GenerateResult> {
  if (!settings.seeds.length) throw new Error("Pick something to build the playlist from.");
  const n = playlistLength(settings);
  // Deep Cuts / Explore Further need the full pass (deep catalogue + second hop); long playlists need its bigger pool.
  const depth = settings.mode === "deep" || settings.mode === "explore" || n > 25 ? "full" : "lite";

  onProgress?.(`Gathering recommendations from ${settings.seeds.map(seedName).join(", ")}…`);
  const { candidates: all, seed, support } = await fetchPool(settings.seeds, depth);
  const candidates = all.filter((c) => !(settings.skipRated && ratedKeys.has(c.key)));
  if (!candidates.length) throw new Error("Not enough recommendation data for these picks yet — try another seed or style.");

  onProgress?.(`Ranking ${candidates.length} songs for ${modeLabel(settings.mode)}…`);
  const rankWith = (perArtist: number) =>
    rank(candidates, seed, settings.mode as Mode, settings.adventure, taste, { kind: "track", perArtist })
      .map((r) => ({ r, s: r.score + 0.06 * ((support.get(r.c.key) ?? 1) - 1) }))
      .sort((a, b) => b.s - a.s)
      .map((x) => x.r);
  let ranked = rankWith(settings.perArtist);
  // Not enough different artists for "one per artist"? Fill the rest with second songs rather than come up short.
  // Not enough different artists for the requested length? Allow more songs per artist, step by step.
  // Deep cuts are by nature lesser-known songs by the same artists, so that style may go further.
  for (const cap of settings.mode === "deep" ? [2, 3, 4, 6, 8] : [2, 3, 4]) {
    if (ranked.length >= n + Math.min(n, 15) || settings.perArtist >= cap) continue;
    const seen = new Set(ranked.map((r) => r.c.key));
    ranked = [...ranked, ...rankWith(cap).filter((r) => !seen.has(r.c.key))];
  }

  // Artwork + preview availability for the songs shown now. Swap candidates get theirs when swapped in,
  // unless "previewable only" needs to check them up front.
  const spare = Math.min(n, 15); // songs kept ready for "swap"
  const head = ranked.slice(0, settings.previewsOnly ? n * 2 + 30 : n + spare);
  onProgress?.("Fetching artwork and previews…");
  const extra = await enrich((settings.previewsOnly ? head : head.slice(0, n + 8)).map((r) => r.c));
  const withArt = head
    .map((r) => {
      const e = extra[r.c.key] ?? {};
      const item: Item = {
        kind: "track", key: r.c.key, title: r.c.title, artist: r.c.artist, album: r.c.album ?? e.album,
        image: e.image ?? r.c.image, deezerId: e.deezerId, hasPreview: e.hasPreview, durationSec: r.c.durationSec ?? e.durationSec,
        onSpotify: e.onSpotify,
        noMatch: e.noMatch,
      };
      return { r, item };
    })
    // Songs Spotify doesn't have are left out (unchecked ones stay). Swap candidates are checked when swapped in.
    .filter((x) => x.item.onSpotify !== false && !x.item.noMatch && (!settings.previewsOnly || x.item.hasPreview));

  const reasons: Record<string, string> = {};
  const scores: Record<string, number> = {};
  for (const { r } of withArt) {
    const n = support.get(r.c.key) ?? 1;
    reasons[r.c.key] = (n > 1 ? `Suggested by ${n} of your picks · ` : "") + explain(r);
    const ds = displayScore(r.c);
    if (ds && ds.label === "Last.fm similarity") scores[r.c.key] = ds.value;
  }
  const items = withArt.map((x) => x.item);
  return {
    tracks: items.slice(0, n),
    alternates: items.slice(n, n + spare),
    reasons,
    scores,
  };
}

export function defaultName(settings: PlaylistSettings) {
  const label = modeLabel(settings.mode);
  if (settings.basis === "taste") return `${label} Mix`;
  return `${label}: ${seedName(settings.seeds[0])}`;
}

export function newId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}
