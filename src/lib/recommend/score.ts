// Pure ranking logic — runs in the browser so modes and the slider re-rank instantly.
import type { AudioFeatures, Candidate, Kind, Seed, TagVector } from "../types";
import { ADVENTURE, AGREEMENT_BOOST, AUDIO_FEATURES, EXTRA, MODE, TASTE_EXTRA } from "./weights";
import { clamp, cosine, norm } from "../util";
import { GROOVE, MOOD } from "./tags";

import type { Mode } from "./weights";
export type { Mode };

export const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: "closest", label: "Closest Match", hint: "Strongest Last.fm similarity and shared tags" },
  { id: "deep", label: "Deep Cuts", hint: "Album tracks and lesser-known songs, not the hits" },
  { id: "hidden", label: "Hidden Gems", hint: "Close matches with far fewer listeners" },
  { id: "groove", label: "Same Groove", hint: "Weighs rhythm, genre and instrumentation tags" },
  { id: "mood", label: "Same Mood", hint: "Weighs mood and energy tags" },
  { id: "explore", label: "Explore Further", hint: "Two steps out, other artists only" },
];

export interface TasteInput {
  tags: TagVector; // signed, derived from star ratings: positive = rated well, negative = rated poorly
  artists: Record<string, number>; // norm(artist) -> affinity; -1 = artist rated 1★ (hidden)
  loved: Set<string>; // keys rated 4–5★
  hidden: Set<string>; // keys rated 1★
  /** Discogs style weights learned from your ratings (signed). Optional. */
  styles?: TagVector;
  /** Your preferred sound, learned from songs you rated well, and its confidence (0..1). Optional. */
  audio?: AudioFeatures;
  audioConfidence?: number;
}

export interface Ranked {
  c: Candidate;
  score: number;
  sharedGroove: string[];
  sharedMood: string[];
  sharedOther: string[];
  tasteShared: string[];
  novelty: number;
  /** Discogs styles this song shares with the seed. */
  sharedStyles?: string[];
}

const BASE = MODE;

/** 1 = identical sound, 0 = opposite. Only the features both sides have count. */
export function audioSimilarity(a: AudioFeatures, b: AudioFeatures): number {
  let sum = 0;
  let wsum = 0;
  for (const [k, w] of Object.entries(AUDIO_FEATURES) as [keyof typeof AUDIO_FEATURES, number][]) {
    const x = k === "tempo" ? Math.min(1, a.tempo / 200) : a[k];
    const y = k === "tempo" ? Math.min(1, b.tempo / 200) : b[k];
    if (typeof x !== "number" || typeof y !== "number") continue;
    sum += w * (1 - Math.abs(x - y));
    wsum += w;
  }
  return wsum ? sum / wsum : 0;
}

function split(v: TagVector) {
  const pos: TagVector = {};
  const neg: TagVector = {};
  for (const [t, w] of Object.entries(v)) {
    if (w > 0) pos[t] = w;
    else if (w < 0) neg[t] = -w;
  }
  return { pos, neg };
}

/**
 * Rank candidates for a mode and adventurousness (0 = very similar, 1 = more adventurous).
 * Every input signal is real API data; this only decides how to weigh them.
 */
export function rank(
  candidates: Candidate[],
  seed: Seed | null,
  mode: Mode,
  adventure: number,
  taste: TasteInput,
  opts: { kind?: Kind; limit?: number; perArtist?: number } = {},
): Ranked[] {
  const a = clamp(adventure);
  const w = { ...BASE[mode] };
  w.match *= 1 - ADVENTURE.match * a;
  w.tag *= 1 - ADVENTURE.tag * a;
  w.groove *= 1 - ADVENTURE.groove * a;
  w.mood *= 1 - ADVENTURE.mood * a;
  w.novelty += ADVENTURE.novelty * a;
  const extra = EXTRA[mode];

  const seedTags = seed?.tags ?? {};
  const seedHasGroove = Object.keys(seedTags).some((t) => GROOVE.has(t));
  const seedHasMood = Object.keys(seedTags).some((t) => MOOD.has(t));
  // If the seed has no tags in the requested category, fall back to all tags rather than ranking on nothing.
  if (mode === "groove" && !seedHasGroove) { w.tag += w.groove; w.groove = 0; }
  if (mode === "mood" && !seedHasMood) { w.tag += w.mood; w.mood = 0; }

  const { pos: tastePos, neg: tasteNeg } = split(taste.tags);
  const hasTaste = Object.keys(tastePos).length > 0;
  if (!hasTaste) { w.tag += w.taste; w.taste = 0; }

  const pool = candidates.filter((c) => (!opts.kind || c.kind === opts.kind));
  // Novelty: log-scaled popularity relative to this pool and kind (1 = least known).
  const maxPop: Record<string, number> = {};
  for (const c of pool) if (c.popularity) maxPop[c.kind] = Math.max(maxPop[c.kind] ?? 0, c.popularity);
  const novelty = (c: Candidate) => {
    const m = maxPop[c.kind];
    if (!m || !c.popularity) return 0.5; // unknown popularity: neutral, never assumed obscure
    return clamp(1 - Math.log10(c.popularity + 1) / Math.log10(m + 1));
  };

  // Hidden Gems = the least-known 40% of this pool (per kind). Relative, because "obscure" depends on the neighbourhood.
  const hiddenCut: Record<string, number> = {};
  if (mode === "hidden") {
    const byKind: Record<string, number[]> = {};
    for (const c of pool) if (c.popularity) (byKind[c.kind] ??= []).push(novelty(c));
    for (const [k, vals] of Object.entries(byKind)) {
      vals.sort((x, y) => x - y);
      hiddenCut[k] = vals[Math.floor(vals.length * 0.6)] ?? 1;
    }
  }

  const allowHop2 = mode === "explore" || a >= 0.5;
  const out: Ranked[] = [];

  for (const c of pool) {
    if (taste.hidden.has(c.key)) continue; // rated 1★
    const aff = taste.artists[norm(c.artist)] ?? 0;
    if (aff <= -1) continue; // artist rated 1★
    if (c.hop === 2 && !allowHop2) continue;
    if (mode === "explore" && c.sameArtistAsSeed) continue;

    const nov = novelty(c);
    if (mode === "deep") {
      const isDeep = c.source === "lastfm:artist-deep-cut" || (c.artistRank != null && c.artistRank > (c.kind === "track" ? 10 : 2));
      if (!isDeep && !(c.kind === "artist" && nov > 0.5)) continue;
    }
    if (mode === "hidden" && (!c.popularity || nov < (hiddenCut[c.kind] ?? 1))) continue;

    const m = c.match ?? (c.artistMatch != null ? c.artistMatch * 0.6 : 0);
    const all = cosine(seedTags, c.tags);
    const groove = cosine(seedTags, c.tags, GROOVE);
    const mood = cosine(seedTags, c.tags, MOOD);
    const tp = hasTaste ? cosine(tastePos, c.tags) : { score: 0, shared: [] };
    const tn = Object.keys(tasteNeg).length ? cosine(tasteNeg, c.tags).score : 0;

    let s =
      w.match * m +
      w.tag * all.score +
      w.groove * groove.score +
      w.mood * mood.score +
      w.taste * (tp.score - 0.6 * tn) +
      w.novelty * nov;

    // New data (Discogs styles, measured audio, ListenBrainz agreement) only counts when present on both sides.
    let sharedStyles: string[] | undefined;
    if (seed?.styles && c.styles && Object.keys(seed.styles).length && Object.keys(c.styles).length) {
      const st = cosine(seed.styles, c.styles);
      s += extra.style * st.score;
      sharedStyles = st.shared.slice(0, 3);
    }
    if (seed?.audio && c.audio) s += extra.audio * audioSimilarity(seed.audio, c.audio);
    if (c.lbMatch != null && (c.match != null || c.artistMatch != null)) s += AGREEMENT_BOOST * Math.min(1, c.lbMatch * 2);
    // Your taste, from the new sources: styles you rate well, and your preferred sound (by confidence).
    if (taste.styles && c.styles && Object.keys(taste.styles).length) {
      const { pos: sp, neg: sn } = split(taste.styles);
      s += TASTE_EXTRA.style * (cosine(sp, c.styles).score - 0.6 * (Object.keys(sn).length ? cosine(sn, c.styles).score : 0));
    }
    if (taste.audio && c.audio) s += TASTE_EXTRA.audio * (taste.audioConfidence ?? 0) * audioSimilarity(taste.audio, c.audio);

    if (c.hop === 2) s -= 0.12 * (1 - a);
    if (c.sameArtistAsSeed) s -= 0.05 + 0.25 * a;
    if (aff > 0) s += 0.04 * Math.min(aff, 3);
    if (aff < 0) s += 0.1 * aff;
    if (taste.loved.has(c.key)) s -= 0.15; // you already know and love it

    const sharedGroove = groove.shared.slice(0, 3);
    const sharedMood = mood.shared.slice(0, 2);
    const used = new Set([...sharedGroove, ...sharedMood]);
    out.push({
      c,
      score: s,
      sharedGroove,
      sharedMood,
      sharedOther: all.shared.filter((t) => !used.has(t)).slice(0, 2),
      tasteShared: tp.shared.slice(0, 2),
      novelty: nov,
      sharedStyles,
    });
  }

  out.sort((x, y) => y.score - x.score);

  // Diversity: cap results per artist (tighter when adventurous).
  const cap = opts.perArtist ?? (mode === "deep" ? 4 : a > 0.5 ? 1 : 2);
  const counts = new Map<string, number>();
  const limited: Ranked[] = [];
  for (const r of out) {
    const k = norm(r.c.artist);
    const n = counts.get(k) ?? 0;
    if (n >= cap) continue;
    counts.set(k, n + 1);
    limited.push(r);
    if (opts.limit && limited.length >= opts.limit) break;
  }
  return limited;
}
