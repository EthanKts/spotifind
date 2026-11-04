// Pure ranking logic — runs in the browser so modes and the slider re-rank instantly.
import type { Candidate, Kind, Seed, TagVector } from "../types";
import { clamp, cosine, norm } from "../util";
import { GROOVE, MOOD } from "./tags";

export type Mode = "closest" | "deep" | "hidden" | "groove" | "mood" | "explore";

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
}

export interface Ranked {
  c: Candidate;
  score: number;
  sharedGroove: string[];
  sharedMood: string[];
  sharedOther: string[];
  tasteShared: string[];
  novelty: number;
}

interface Weights { match: number; tag: number; groove: number; mood: number; taste: number; novelty: number }

const BASE: Record<Mode, Weights> = {
  closest: { match: 0.5, tag: 0.3, groove: 0, mood: 0, taste: 0.15, novelty: 0 },
  deep: { match: 0.3, tag: 0.25, groove: 0, mood: 0, taste: 0.15, novelty: 0.3 },
  hidden: { match: 0.25, tag: 0.3, groove: 0, mood: 0, taste: 0.1, novelty: 0.45 },
  groove: { match: 0.25, tag: 0.05, groove: 0.55, mood: 0, taste: 0.1, novelty: 0.05 },
  mood: { match: 0.25, tag: 0.05, groove: 0, mood: 0.55, taste: 0.1, novelty: 0.05 },
  explore: { match: 0.2, tag: 0.3, groove: 0, mood: 0, taste: 0.1, novelty: 0.4 },
};

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
  w.match *= 1 - 0.6 * a;
  w.tag *= 1 - 0.3 * a;
  w.groove *= 1 - 0.2 * a;
  w.mood *= 1 - 0.2 * a;
  w.novelty += 0.45 * a;

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
