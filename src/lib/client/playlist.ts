"use client";

// Playlist generator (10–50 songs, 15 by default). Uses the same real data and ranking as Discover:
// recommendation pools for 1–3 seeds are merged (songs suggested by several seeds rank higher),
// ranked with the chosen style + adventurousness + your taste, then capped per artist.

import type { Candidate, Enrichment, ImportedItem, Item, RecommendResponse, Seed, TagVector } from "../types";
import { MODES, rank, type Mode, type Ranked, type TasteInput } from "../recommend/score";
import { applyShape, shapeActive, type Shape } from "../recommend/shape";
import { INSTRUMENTS } from "../recommend/tags";
import { getFeatures, unmeasured } from "./features";
import { displayScore, explain } from "../recommend/explain";
import type { Playlist, PlaylistSettings, PlaylistSource, Profile } from "../taste/profile";
import { recommendUrl } from "./data";
import { itemKey, norm, songMatcher } from "../util";
import { genreNames, genresOf, resolveGenre } from "../recommend/genres";

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

/** What a playlist / session was built from, for labels: "your taste", "jazz for you", "Chameleon + 2 more". */
export function basisLabel(s: Pick<PlaylistSettings, "basis" | "seeds" | "genre" | "genres" | "source">) {
  if (s.basis === "taste") return "your taste";
  if (s.basis === "playlist") return `like ${s.source?.name ?? "a Spotify playlist"}`;
  if (s.basis === "genre") return `${genreNames(genresOf(s)) || "a genre"} for you`;
  if (!s.seeds.length) return "";
  return s.seeds.length === 1 ? seedName(s.seeds[0]) : `${seedName(s.seeds[0])} + ${s.seeds.length - 1} more`;
}

export function shapeOf(s: Pick<PlaylistSettings, "energy" | "instruments">): Shape {
  return { energy: s.energy ?? null, instruments: s.instruments ?? [] };
}

/** Your positive taste tags with the genres' own tags left out, so genre songs are matched on the rest of your taste. */
function tasteSeedTags(taste: TasteInput, genres: string[]): TagVector {
  const tags = genres.flatMap((g) => resolveGenre(g).lastfm);
  const words = tags.flatMap((g) => g.split(/[\s-]+/)).filter((w) => w.length > 2);
  const out: TagVector = {};
  for (const [t, w] of Object.entries(taste.tags)) {
    if (w <= 0 || tags.includes(t) || words.some((g) => t.includes(g))) continue;
    out[t] = w;
  }
  const max = Math.max(1e-9, ...Object.values(out));
  for (const t of Object.keys(out)) out[t] /= max;
  return Object.keys(out).length ? out : Object.fromEntries(tags.slice(0, 1).map((t) => [t, 1]));
}

/** Songs in 1–5 subgenres, plus bridges from your favourite artists into them (see recommend/genre.ts). */
export async function fetchGenrePool(
  genres: string[],
  loved: PlaylistSettings["seeds"],
  taste: TasteInput,
  depth: "lite" | "full",
): Promise<Pool> {
  const q = new URLSearchParams({ genres: genres.join("|"), loved: [...new Set(loved.map((s) => s.artist))].slice(0, 5).join("|"), depth });
  const res = await fetch(`/api/recommend/genre?${q}`)
    .then((r) => r.json() as Promise<RecommendResponse & { support?: Record<string, number> }>)
    .catch(() => null);
  return {
    candidates: (res?.candidates ?? []).filter((c) => c.kind === "track"),
    seed: res?.seed ? { ...res.seed, tags: tasteSeedTags(taste, genres) } : null,
    // Songs that fit several of the chosen genres rank a little higher.
    support: new Map(Object.entries(res?.support ?? {})),
  };
}

/**
 * Songs that feature the chosen instruments: songs similar to your picks are rarely tagged with an
 * instrument, so pull in songs from each instrument's own listener tag ("saxophone"), favouring artists
 * similar to your picks (the same bridge idea as exploring a genre). Each gets the tag so the filter keeps it.
 */
export async function instrumentCandidates(instruments: string[], loved: PlaylistSettings["seeds"], taste: TasteInput, depth: "lite" | "full"): Promise<Candidate[]> {
  const defs = INSTRUMENTS.filter((i) => instruments.includes(i.id) && i.id !== "acoustic");
  const pools = await Promise.all(defs.map((d) => fetchGenrePool([d.tags[0]], loved, taste, depth).catch(() => null)));
  const out: Candidate[] = [];
  pools.forEach((pool, i) => {
    for (const c of pool?.candidates ?? []) out.push({ ...c, tags: { ...c.tags, [defs[i].tags[0]]: Math.max(c.tags[defs[i].tags[0]] ?? 0, 0.5) } });
  });
  return out;
}

/**
 * Energy + instrument filter on top of the ranking: enrich the best candidates (to learn their Deezer
 * previews), measure their energy, then re-order. Returns the new order plus per-song notes.
 */
export async function shapeRanked(
  ranked: Ranked[],
  shape: Shape,
  need: number,
  onProgress?: (msg: string) => void,
  known: Record<string, Enrichment> = {},
): Promise<{ ranked: Ranked[]; notes: Map<string, string>; relaxed?: string; extra: Record<string, Enrichment> }> {
  const head = ranked.slice(0, Math.min(ranked.length, need * 4 + 30, 120));
  const missing = head.filter((r) => !known[r.c.key]).map((r) => r.c);
  const extra = { ...known, ...(missing.length ? await enrich(missing) : {}) };
  const wantsAudio = shape.energy != null || shape.instruments.some((i) => i === "instrumental" || i === "acoustic");
  let feats = new Map<number, import("../types").AudioFeatures | null>();
  if (wantsAudio) {
    const ids = head.map((r) => extra[r.c.key]?.deezerId).filter((x): x is number => !!x);
    const todo = unmeasured(ids);
    onProgress?.(todo ? `Measuring the energy of ${todo} songs (only the first time)…` : "Matching energy…");
    feats = await getFeatures(ids, (done, total) => total && onProgress?.(`Measuring the energy of songs… ${done}/${total}`));
  }
  const shaped = applyShape(
    head,
    shape,
    (r) => {
      const id = extra[r.c.key]?.deezerId;
      return id ? feats.get(id) : undefined;
    },
    need,
  );
  return { ...shaped, extra };
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

/** The playlist's most frequent artists, used where a few "picks" are needed (instrument bridges, labels). */
export function playlistArtists(src: PlaylistSource, n = 5): PlaylistSettings["seeds"] {
  const count = new Map<string, { artist: string; n: number }>();
  for (const t of src.tracks) {
    const e = count.get(norm(t.artist)) ?? { artist: t.artist, n: 0 };
    e.n++;
    count.set(norm(t.artist), e);
  }
  return [...count.values()].sort((a, b) => b.n - a.n).slice(0, n).map((a) => ({ kind: "artist" as const, artist: a.artist, title: a.artist }));
}

/** Songs like the whole pasted playlist (every song counts; see recommend/playlist.ts). */
export async function fetchPlaylistPool(src: PlaylistSource, depth: "lite" | "full"): Promise<Pool> {
  const res = await fetch("/api/recommend/playlist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: src.id, name: src.name, tracks: src.tracks, depth }),
  })
    .then((r) => r.json() as Promise<RecommendResponse & { support?: Record<string, number> }>)
    .catch(() => null);
  return {
    candidates: (res?.candidates ?? []).filter((c) => c.kind === "track"),
    seed: res?.seed ?? null,
    support: new Map(Object.entries(res?.support ?? {})),
  };
}

/** "all 150 songs" / "the first 100 of 150 songs" */
export function sourceSongs(src: Pick<PlaylistSource, "tracks" | "total">) {
  return src.tracks.length < src.total ? `the first ${src.tracks.length} of ${src.total} songs` : `all ${src.tracks.length} songs`;
}

export type GenerateResult = Pick<Playlist, "tracks" | "alternates" | "reasons" | "scores"> & {
  /** Shown to you once, e.g. when the instrument filter had to be relaxed. Not saved. */
  note?: string;
};

export async function generatePlaylist(
  settings: PlaylistSettings,
  taste: TasteInput,
  ratedKeys: Set<string>,
  onProgress?: (msg: string) => void,
): Promise<GenerateResult> {
  const fromPlaylist = settings.basis === "playlist";
  if (fromPlaylist && !settings.source?.tracks.length) throw new Error("Paste a Spotify playlist link to build from.");
  if (!fromPlaylist && !settings.seeds.length) throw new Error("Pick something to build the playlist from.");
  const n = playlistLength(settings);
  // Deep Cuts / Explore Further need the full pass (deep catalogue + second hop); long playlists need its bigger pool.
  const depth = settings.mode === "deep" || settings.mode === "explore" || n > 25 ? "full" : "lite";

  const genres = settings.basis === "genre" ? genresOf(settings) : [];
  if (settings.basis === "genre" && !genres.length) throw new Error("Pick a genre to explore.");
  onProgress?.(
    genres.length
      ? `Finding ${genreNames(genres)} you might like…`
      : fromPlaylist
        ? `Reading ${sourceSongs(settings.source!)} of ${settings.source!.name}… (up to a minute the first time)`
        : `Gathering recommendations from ${settings.seeds.map(seedName).join(", ")}…`,
  );
  const instruments = settings.instruments ?? [];
  const [{ candidates: base, seed, support }, extraInstr] = await Promise.all([
    genres.length
      ? fetchGenrePool(genres, settings.seeds, taste, depth)
      : fromPlaylist
        ? fetchPlaylistPool(settings.source!, depth)
        : fetchPool(settings.seeds, depth),
    instruments.length ? instrumentCandidates(instruments, settings.seeds, taste, "lite") : Promise.resolve([] as Candidate[]),
  ]);
  const pool = base;
  const have = new Set(pool.map((c) => c.key));
  const all = [...pool, ...extraInstr.filter((c) => !have.has(c.key) && (have.add(c.key), true))];
  const original = settings.source ? songMatcher(settings.source.tracks) : () => false;
  const candidates = all.filter((c) => !(settings.skipRated && ratedKeys.has(c.key)) && !original(c));
  if (!candidates.length) throw new Error("Not enough recommendation data for these picks yet — try another seed or style.");

  onProgress?.(`Ranking ${candidates.length} songs for ${modeLabel(settings.mode)}…`);
  const rankWith = (perArtist: number) =>
    rank(candidates, seed, settings.mode as Mode, settings.adventure, taste, { kind: "track", perArtist })
      // Songs several seeds lead to rank higher. A playlist has dozens of "seeds", so its boost grows slowly.
      .map((r) => {
        const k = support.get(r.c.key) ?? 1;
        return { r, s: r.score + (fromPlaylist ? 0.08 * Math.log2(k) : 0.06 * (k - 1)) };
      })
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

  // Energy / instruments: re-order the best candidates by how well they fit.
  const shape = shapeOf(settings);
  let known: Record<string, Enrichment> = {};
  let notes = new Map<string, string>();
  let note: string | undefined;
  if (shapeActive(shape)) {
    onProgress?.("Fetching artwork and previews…");
    // Choose from a wider list (up to 3 songs per artist), then re-apply your per-artist limit afterwards,
    // so the energy/instrument filter has enough songs to pick from.
    const wide = settings.perArtist >= 3 ? ranked : (() => {
      const seen = new Set(ranked.map((r) => r.c.key));
      return [...ranked, ...rankWith(3).filter((r) => !seen.has(r.c.key))];
    })();
    const shaped = await shapeRanked(wide, shape, n, onProgress);
    known = shaped.extra;
    notes = shaped.notes;
    note = shaped.relaxed;
    const perArtist = new Map<string, number>();
    const capped: Ranked[] = [];
    const overflow: Ranked[] = [];
    for (const r of shaped.ranked) {
      const a = r.c.artist.toLowerCase();
      if ((perArtist.get(a) ?? 0) < settings.perArtist) {
        perArtist.set(a, (perArtist.get(a) ?? 0) + 1);
        capped.push(r);
      } else overflow.push(r);
    }
    ranked = [...capped, ...overflow];
  }

  // Artwork + preview availability for the songs shown now. Swap candidates get theirs when swapped in,
  // unless "previewable only" needs to check them up front.
  const spare = Math.min(n, 15); // songs kept ready for "swap"
  // Several genres: check more songs up front, so songs missing from Spotify (often older recordings) don't
  // leave one genre under-represented.
  const multi = genres.length > 1;
  const head = ranked.slice(0, settings.previewsOnly ? n * 2 + 30 : multi ? n * 2 + spare : n + spare);
  onProgress?.("Fetching artwork and previews…");
  const toEnrich = (settings.previewsOnly ? head : head.slice(0, multi ? n * 2 + 8 : n + 8)).map((r) => r.c).filter((c) => !known[c.key]);
  const extra = { ...known, ...(toEnrich.length ? await enrich(toEnrich) : {}) };
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
    const shapeNote = notes.get(r.c.key);
    const several = genres.length ? `Fits ${n} of your genres · ` : fromPlaylist ? `Similar to ${n} songs in ${settings.source!.name} · ` : `Suggested by ${n} of your picks · `;
    reasons[r.c.key] = (n > 1 ? several : "") + explain(r) + (shapeNote ? ` · ${shapeNote}` : "");
    const ds = displayScore(r.c);
    if (ds && ds.label === "Last.fm similarity") scores[r.c.key] = ds.value;
  }
  const items = vary(multi ? takeTurns(withArt, genres) : withArt, n);
  return {
    tracks: items.slice(0, n),
    alternates: items.slice(n, n + spare),
    reasons,
    scores,
    note,
  };
}

/**
 * Several genres: take turns between them (each in its own ranking order), so a genre with a bigger pool, or
 * with more songs available on Spotify, doesn't crowd out the others.
 */
function takeTurns<T extends { r: Ranked }>(list: T[], genres: string[]): T[] {
  const first = (x: T) => x.r.c.genres?.[0] ?? genres[0];
  const buckets = genres.map((g) => list.filter((x) => first(x) === g));
  const rest = list.filter((x) => !genres.includes(first(x)));
  const out: T[] = [];
  for (let i = 0; buckets.some((b) => i < b.length); i++) for (const b of buckets) if (b[i]) out.push(b[i]);
  return [...out, ...rest];
}

/** Main tag of a song: its strongest tag that isn't generic (decade, "seen live"…). */
function mainTag(c: Candidate) {
  let best = "", w = 0;
  for (const [t, v] of Object.entries(c.tags)) if (v > w && !/^(\d0s|\d{4}s?|seen live|favorites?|favourites?|love|beautiful|awesome)$/.test(t)) [best, w] = [t, v];
  return best;
}

/**
 * Variety, keeping the ranking order otherwise:
 * - at most one song per album (songs whose album is unknown are never blocked);
 * - no more than 2 songs in a row with the same main tag, so the playlist doesn't feel samey.
 * Songs pushed back by these rules are kept, after the others, as swap candidates.
 */
function vary(list: { r: Ranked; item: Item }[], n: number): Item[] {
  const albums = new Set<string>();
  const ok: { r: Ranked; item: Item }[] = [];
  const later: { r: Ranked; item: Item }[] = [];
  for (const x of list) {
    const al = x.item.album ? `${x.item.artist}|${x.item.album}`.toLowerCase() : "";
    if (al && albums.has(al)) later.push(x);
    else {
      if (al) albums.add(al);
      ok.push(x);
    }
  }
  // Too few songs after the album rule: let second songs from an album back in rather than come up short.
  const pool = ok.length >= n ? ok : [...ok, ...later.splice(0, n - ok.length)];
  const out: { r: Ranked; item: Item }[] = [];
  const rest = [...pool];
  while (rest.length && out.length < n) {
    const t1 = out.length >= 2 ? mainTag(out[out.length - 1].r.c) : "";
    const run = t1 && t1 === mainTag(out[out.length - 2].r.c);
    // Look ahead a few places only, so a strong match is never pushed far down.
    let i = 0;
    if (run) {
      const j = rest.slice(0, 6).findIndex((x) => mainTag(x.r.c) !== t1);
      if (j > 0) i = j;
    }
    out.push(rest.splice(i, 1)[0]);
  }
  return [...out, ...rest, ...later].map((x) => x.item);
}

export function defaultName(settings: PlaylistSettings) {
  const label = modeLabel(settings.mode);
  if (settings.basis === "taste") return `${label} Mix`;
  if (settings.basis === "genre") return `${genreNames(genresOf(settings)) || "Genre"} for You`;
  if (settings.basis === "playlist") return `${label}: like ${settings.source?.name ?? "a playlist"}`;
  return `${label}: ${basisLabel(settings)}`;
}

/** Current time, for timestamps set in click handlers. */
export const nowMs = () => Date.now();

export function newId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}
