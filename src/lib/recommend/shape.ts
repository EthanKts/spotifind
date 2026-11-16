// "Shape" controls layered on top of the normal ranking (score.ts is untouched):
//   energy  — calm ↔ energetic, from the song's measured audio (tag-based estimate when not measured)
//   instruments — only songs that feature at least one chosen instrument
import type { AudioFeatures, TagVector } from "../types";
import { HIGH_ENERGY, INSTRUMENTS, LOW_ENERGY } from "./tags";
import type { Ranked } from "./score";

export interface Shape {
  /** 0 = calm … 1 = energetic; null = any energy. */
  energy: number | null;
  /** INSTRUMENTS ids; empty = any. */
  instruments: string[];
}

export const NO_SHAPE: Shape = { energy: null, instruments: [] };
export const shapeActive = (s?: Shape | null) => !!s && (s.energy != null || s.instruments.length > 0);

/** Measured energy, or an estimate from tags (null when there's nothing to go on). */
export function energyOf(features: AudioFeatures | null | undefined, tags: TagVector): { value: number; measured: boolean } | null {
  if (features) return { value: features.energy, measured: true };
  let hi = 0;
  let lo = 0;
  for (const [t, w] of Object.entries(tags)) {
    if (HIGH_ENERGY.has(t)) hi += w;
    if (LOW_ENERGY.has(t)) lo += w;
  }
  if (hi + lo < 0.15) return null;
  return { value: 0.2 + 0.6 * (hi / (hi + lo)), measured: false };
}

export function matchesInstrument(tags: TagVector, features: AudioFeatures | null | undefined, id: string): boolean {
  if (id === "instrumental" && features) return features.instrumentalness > 0.5;
  if (id === "acoustic" && features && features.acousticness > 0.6) return true;
  const def = INSTRUMENTS.find((i) => i.id === id);
  return !!def && def.tags.some((t) => (tags[t] ?? 0) > 0);
}

export interface Shaped {
  ranked: Ranked[];
  /** Extra "why" text per song key, e.g. "energy 0.72 · features saxophone". */
  notes: Map<string, string>;
  /** Set when too few songs featured the chosen instruments and the filter had to be relaxed. */
  relaxed?: string;
}

/**
 * Filter by instruments, then re-sort by closeness to the target energy. `need` is how many songs the caller
 * wants; if the instrument filter leaves fewer, the best non-matching songs fill in and `relaxed` says so.
 */
export function applyShape(ranked: Ranked[], shape: Shape, features: (r: Ranked) => AudioFeatures | null | undefined, need = 0): Shaped {
  const notes = new Map<string, string>();
  let list = ranked;
  let relaxed: string | undefined;
  let hitKeys: Set<string> | null = null; // songs featuring a chosen instrument (null = no instrument filter)

  if (shape.instruments.length) {
    const label = (id: string) => INSTRUMENTS.find((i) => i.id === id)?.label.toLowerCase() ?? id;
    const hits: Ranked[] = [];
    const misses: Ranked[] = [];
    for (const r of list) {
      const found = shape.instruments.filter((id) => matchesInstrument(r.c.tags, features(r), id));
      if (found.length) {
        hits.push(r);
        notes.set(r.c.key, `features ${found.map(label).join(" & ")}`);
      } else misses.push(r);
    }
    list = hits;
    hitKeys = new Set(hits.map((r) => r.c.key));
    if (need && hits.length < need) {
      relaxed = `Only ${hits.length} songs here are tagged with ${shape.instruments.map(label).join(" or ")}; the closest other matches fill the rest.`;
      list = [...hits, ...misses];
    }
  }

  if (shape.energy != null) {
    // You asked for an energy level, so it comes first: songs within a tolerance of it, best matches first,
    // then the rest by how close they are. The tolerance only widens when too few songs fit.
    const target = shape.energy;
    const withE = list.map((r) => {
      const e = energyOf(features(r), r.c.tags);
      if (e) {
        const prev = notes.get(r.c.key);
        const txt = `energy ${e.value.toFixed(2)}${e.measured ? "" : " (estimated)"}`;
        notes.set(r.c.key, prev ? `${txt} · ${prev}` : txt);
      }
      // Unknown energy counts as far away: never preferred, never thrown away.
      return { r, dist: e ? Math.abs(e.value - target) : 0.5 };
    });
    let tol = 0.12;
    let fit = withE.filter((x) => x.dist <= tol);
    while (need && fit.length < need && tol < 0.4) {
      tol += 0.07;
      fit = withE.filter((x) => x.dist <= tol);
    }
    const inFit = new Set(fit);
    const hit = (k: string) => (hitKeys ? Number(hitKeys.has(k)) : 0);
    fit.sort((a, b) => hit(b.r.c.key) - hit(a.r.c.key) || b.r.score - 0.5 * b.dist - (a.r.score - 0.5 * a.dist));
    const rest = withE.filter((x) => !inFit.has(x)).sort((a, b) => hit(b.r.c.key) - hit(a.r.c.key) || a.dist - b.dist);
    list = [...fit, ...rest].map((x) => x.r);
  }
  return { ranked: list, notes, relaxed };
}
