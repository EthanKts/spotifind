"use client";

// Taste profile: single user, persisted in localStorage.
// Star ratings are the ONLY feedback signal. Your learned tastes (tag weights + artist affinity)
// are always *derived* from the ratings, so changing or clearing a rating can never leave drift behind.
//
//   5★  strong "more like this"      tags +1.5   artist +1
//   4★  "more like this"             tags +0.75  artist +0.5
//   3★  neutral                      —
//   2★  "less like this"             tags −0.4   artist −0.34
//   1★  "not for me": hidden from recommendations, tags −0.75, artist −0.5
//       (rating an ARTIST 1★ hides that artist entirely)
//
// Imported Spotify taste (your top artists/tracks, see imported.ts) adds a weaker signal: at most a 4★
// equivalent, scaled by its weight (long term → short term, chart position). It never hides anything,
// and a real rating of the same item replaces it.

import { useMemo, useSyncExternalStore } from "react";
import type { ImportedItem, Item, TagVector } from "../types";
import { norm } from "../util";
import type { TasteInput } from "../recommend/score";
import { useImported } from "./imported";

export interface Entry { item: Item; at: number; via?: string }

export interface RatingContext {
  /** Title of the seed the item was recommended from, if it came from a recommendation. */
  seed?: string;
  /** Discovery mode that produced it (closest, deep, hidden, groove, mood, explore). */
  mode?: string;
}

export interface Rating extends Entry {
  rating: number; // 1..5
  tags?: TagVector;
  ctx?: RatingContext;
}

export interface PlaylistSettings {
  basis: "taste" | "seed";
  seeds: { kind: Item["kind"]; artist: string; title: string }[];
  mode: string;
  adventure: number;
  perArtist: number;
  skipRated: boolean;
  previewsOnly: boolean;
  /** Number of songs (10–50). Older playlists without it are 15. */
  length?: number;
}

export interface Playlist {
  id: string;
  name: string;
  createdAt: number;
  settings: PlaylistSettings;
  /** Human label for what it was built from, e.g. "your taste" or "Chameleon". */
  seedLabel: string;
  tracks: Item[];
  /** Next-best songs, used by "swap". */
  alternates: Item[];
  /** Why each song is in the playlist (real match explanation), by key. */
  reasons: Record<string, string>;
  /** Real Last.fm similarity where available, by key. */
  scores: Record<string, number>;
  /** Set once the playlist has been saved to your Spotify account. */
  spotify?: { id: string; url: string; uri: string; exportedAt: number; found: number; missing: string[] };
}

export interface Profile {
  v: 2;
  ratings: Record<string, Rating>;
  playlists: Playlist[];
  /** Interests you removed on the My Ratings page; excluded from the derived profile. */
  removedTags: string[];
  recentSearches: Entry[];
  recentQueries: string[];
  recentlyDiscovered: Entry[];
  recentlyViewed: Entry[];
}

const STORAGE_KEY = "spotifind:profile:v2";
const LEGACY_KEY = "spotifind:profile:v1";

const EMPTY: Profile = Object.freeze({
  v: 2,
  ratings: {},
  playlists: [],
  removedTags: [],
  recentSearches: [],
  recentQueries: [],
  recentlyDiscovered: [],
  recentlyViewed: [],
}) as Profile;

let state: Profile = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

// ------------------------------------------------------------------ persistence + migration

interface LegacyProfile {
  liked?: Record<string, { item: Item; at: number; tags?: TagVector }>;
  disliked?: Record<string, { item: Item; at: number; tags?: TagVector }>;
  saved?: Record<string, { item: Item; at: number; tags?: TagVector }>;
  savedAlbums?: Record<string, { item: Item; at: number; tags?: TagVector }>;
  ratings?: Record<string, { item: Item; at: number; tags?: TagVector; rating: number }>;
  recentSearches?: Entry[];
  recentQueries?: string[];
  recentlyDiscovered?: Entry[];
  recentlyViewed?: Entry[];
}

/** v1 → v2: likes and saves become 4★, dislikes 1★; explicit ratings win. */
function migrate(old: LegacyProfile): Profile {
  const ratings: Record<string, Rating> = {};
  const put = (src: LegacyProfile["liked"], rating: number) => {
    for (const [k, e] of Object.entries(src ?? {})) ratings[k] = { item: e.item, at: e.at, tags: e.tags, rating };
  };
  put(old.saved, 4);
  put(old.savedAlbums, 4);
  put(old.liked, 4);
  put(old.disliked, 1);
  for (const [k, r] of Object.entries(old.ratings ?? {})) ratings[k] = { item: r.item, at: r.at, tags: r.tags, rating: r.rating };
  return {
    ...EMPTY,
    ratings,
    recentSearches: old.recentSearches ?? [],
    recentQueries: old.recentQueries ?? [],
    recentlyDiscovered: old.recentlyDiscovered ?? [],
    recentlyViewed: old.recentlyViewed ?? [],
  };
}

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      state = { ...EMPTY, ...(JSON.parse(raw) as Profile) };
      return;
    }
    const legacy = window.localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      state = migrate(JSON.parse(legacy) as LegacyProfile);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      window.localStorage.removeItem(LEGACY_KEY);
    }
  } catch {}
}

function commit(next: Profile) {
  state = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {}
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  load();
  listeners.add(l);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      loaded = false;
      load();
      l();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot() {
  load();
  return state;
}

export function useProfile(): Profile {
  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
}

// ------------------------------------------------------------------ derived taste

// Low ratings weigh less on tags than high ones: one "not for me" is rarely a verdict on a whole genre.
const TAG_DELTA: Record<number, number> = { 5: 1.5, 4: 0.75, 3: 0, 2: -0.4, 1: -0.75 };
const ARTIST_DELTA: Record<number, number> = { 5: 1, 4: 0.5, 3: 0, 2: -0.34, 1: -0.5 };

export interface DerivedTaste {
  tags: TagVector; // signed
  artists: Record<string, number>; // norm(artist) -> affinity; -1 = hidden
  loved: Set<string>; // keys rated 4–5★
  hidden: Set<string>; // keys rated 1★
}

export function deriveTaste(p: Profile, imported: ImportedItem[] = []): DerivedTaste {
  const tags: TagVector = {};
  const artists: Record<string, number> = {};
  const hiddenArtists = new Set<string>();
  const loved = new Set<string>();
  const hidden = new Set<string>();
  const removed = new Set(p.removedTags);

  for (const [key, r] of Object.entries(p.ratings)) {
    if (r.rating >= 4) loved.add(key);
    if (r.rating === 1) hidden.add(key);
    const td = TAG_DELTA[r.rating] ?? 0;
    for (const [t, w] of Object.entries(r.tags ?? {})) {
      if (!removed.has(t)) tags[t] = (tags[t] ?? 0) + td * w;
    }
    const a = norm(r.item.artist);
    const boost = r.item.kind === "artist" ? 1.5 : 1;
    artists[a] = (artists[a] ?? 0) + (ARTIST_DELTA[r.rating] ?? 0) * (r.rating >= 4 ? boost : 1);
    if (r.item.kind === "artist" && r.rating === 1) hiddenArtists.add(a);
  }
  // Imported signals: ≤ 4★ each. Skipped when you rated the item (or, for an artist, rated the artist itself).
  for (const it of imported) {
    if (p.ratings[it.key]) continue;
    const w = Math.max(0, Math.min(1, it.weight));
    loved.add(it.key); // you already know it: Discover favours new music over it
    for (const [t, tw] of Object.entries(it.tags ?? {})) {
      if (!removed.has(t)) tags[t] = (tags[t] ?? 0) + TAG_DELTA[4] * w * tw;
    }
    const a = norm(it.artist);
    artists[a] = (artists[a] ?? 0) + ARTIST_DELTA[4] * w * (it.kind === "artist" ? 1.5 : 1);
  }
  for (const t of Object.keys(tags)) {
    const v = Math.max(-5, Math.min(10, tags[t]));
    if (Math.abs(v) < 0.01) delete tags[t];
    else tags[t] = Math.round(v * 1000) / 1000;
  }
  for (const a of Object.keys(artists)) {
    artists[a] = Math.max(-0.99, Math.min(5, artists[a]));
    if (Math.abs(artists[a]) < 0.01) delete artists[a];
  }
  for (const a of hiddenArtists) artists[a] = -1;
  return { tags, artists, loved, hidden };
}

export function useDerivedTaste(): DerivedTaste {
  const p = useProfile();
  const imp = useImported();
  return useMemo(() => deriveTaste(p, imp.items), [p, imp]);
}

export function useTasteInput(): TasteInput {
  const d = useDerivedTaste();
  return useMemo(() => ({ tags: d.tags, artists: d.artists, loved: d.loved, hidden: d.hidden }), [d]);
}

/** True once at least one thing is rated 4★ or more (or a Spotify taste import exists). */
export function hasTaste(p: Profile, imported: ImportedItem[] = []) {
  return imported.length > 0 || Object.values(p.ratings).some((r) => r.rating >= 4);
}

// ------------------------------------------------------------------ top rated lists (sidebar)

export interface TopArtist {
  name: string;
  key: string;
  /** Your explicit artist rating, if any. */
  rating?: number;
  /** Average of your song/album ratings for this artist. */
  songAvg?: number;
  songCount: number;
  /** Explicit rating wins; otherwise the song average. */
  score: number;
  image?: string;
}

/** Artists you rated 4–5★ directly, or whose songs you rate 4★+ on average. */
export function topRatedArtists(p: Profile, min = 4): TopArtist[] {
  const by = new Map<string, TopArtist & { sum: number }>();
  for (const r of Object.values(p.ratings)) {
    const k = norm(r.item.artist);
    const a = by.get(k) ?? { name: r.item.artist, key: `artist:${k}::${k}`, songCount: 0, score: 0, sum: 0 };
    if (r.item.kind === "artist") {
      a.rating = r.rating;
      a.key = r.item.key;
      a.image = r.item.image ?? a.image;
    } else {
      a.songCount += 1;
      a.sum += r.rating;
      a.image ??= r.item.image;
    }
    by.set(k, a);
  }
  return [...by.values()]
    .map((a) => ({ ...a, songAvg: a.songCount ? a.sum / a.songCount : undefined, score: a.rating ?? a.sum / Math.max(1, a.songCount) }))
    .filter((a) => a.score >= min)
    .sort((x, y) => y.score - x.score || y.songCount - x.songCount);
}

/** Songs (and albums) you rated 4–5★, best first. */
export function topRatedSongs(p: Profile, min = 4): Rating[] {
  return Object.values(p.ratings)
    .filter((r) => r.item.kind !== "artist" && r.rating >= min)
    .sort((a, b) => b.rating - a.rating || b.at - a.at);
}

// ------------------------------------------------------------------ tags for a rated item

const tagCache = new Map<string, Promise<TagVector>>();

function tagsFor(item: Item, known?: TagVector): Promise<TagVector> {
  if (known && Object.keys(known).length) return Promise.resolve(known);
  let p = tagCache.get(item.key);
  if (!p) {
    const q = new URLSearchParams({ kind: item.kind, artist: item.artist, title: item.title });
    p = fetch(`/api/tags?${q}`)
      .then((r) => r.json())
      .then((j: { tags?: TagVector }) => j.tags ?? {})
      .catch(() => {
        tagCache.delete(item.key); // allow a retry later
        return {};
      });
    tagCache.set(item.key, p);
  }
  return p;
}

const strip = (item: Item): Item => ({
  kind: item.kind, key: item.key, title: item.title, artist: item.artist, album: item.album, year: item.year,
  image: item.image, deezerId: item.deezerId, hasPreview: item.hasPreview, durationSec: item.durationSec,
});

// ------------------------------------------------------------------ actions

export const taste = {
  /** Rate 1–5. Clicking the current rating again (or passing 0) clears it. */
  rate(item: Item, rating: number, tags?: TagVector, ctx?: RatingContext) {
    load();
    const ratings = { ...state.ratings };
    const prev = ratings[item.key];
    if (rating === 0 || prev?.rating === rating) {
      delete ratings[item.key];
      commit({ ...state, ratings });
      return;
    }
    const knownTags = tags && Object.keys(tags).length ? tags : prev?.tags;
    ratings[item.key] = { item: strip(item), at: Date.now(), rating, tags: knownTags, ctx: ctx ?? prev?.ctx };
    commit({ ...state, ratings });
    if (!knownTags || !Object.keys(knownTags).length) {
      void tagsFor(item).then((t) => {
        const cur = state.ratings[item.key];
        if (cur && Object.keys(t).length) commit({ ...state, ratings: { ...state.ratings, [item.key]: { ...cur, tags: t } } });
      });
    }
  },

  recordQuery(q: string) {
    load();
    const qs = [q, ...state.recentQueries.filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 12);
    commit({ ...state, recentQueries: qs });
  },

  recordSearchPick(item: Item) {
    load();
    const list = [{ item: strip(item), at: Date.now() }, ...state.recentSearches.filter((e) => e.item.key !== item.key)].slice(0, 20);
    commit({ ...state, recentSearches: list });
  },

  recordView(item: Item) {
    load();
    const top = state.recentlyViewed[0];
    if (top?.item.key === item.key && (top.item.image || !item.image)) return;
    const list = [{ item: strip(item), at: Date.now() }, ...state.recentlyViewed.filter((e) => e.item.key !== item.key)].slice(0, 30);
    commit({ ...state, recentlyViewed: list });
  },

  recordDiscovered(item: Item, via?: string) {
    load();
    const list = [{ item: strip(item), at: Date.now(), via }, ...state.recentlyDiscovered.filter((e) => e.item.key !== item.key)].slice(0, 60);
    commit({ ...state, recentlyDiscovered: list });
  },

  savePlaylist(pl: Playlist) {
    load();
    const rest = state.playlists.filter((x) => x.id !== pl.id);
    commit({ ...state, playlists: [{ ...pl, tracks: pl.tracks.map(strip), alternates: pl.alternates.map(strip) }, ...rest] });
  },

  updatePlaylist(id: string, patch: Partial<Playlist>) {
    load();
    commit({ ...state, playlists: state.playlists.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  },

  deletePlaylist(id: string) {
    load();
    commit({ ...state, playlists: state.playlists.filter((x) => x.id !== id) });
  },

  removeTag(tag: string) {
    load();
    if (!state.removedTags.includes(tag)) commit({ ...state, removedTags: [...state.removedTags, tag] });
  },

  restoreTags() {
    load();
    commit({ ...state, removedTags: [] });
  },

  reset() {
    commit({ ...EMPTY });
  },
};
