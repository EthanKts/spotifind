"use client";

// Rapid-fire queue: one previewable song at a time, from the same pipeline as Discover and Playlists
// (candidates.ts pools → score.ts rank → explain.ts reason). Scoring itself is untouched; the queue just
// re-ranks what's left of the pool with your *current* taste each time it tops up, so the stars you give
// in a session steer what comes next. Songs you rate 4–5★ also become extra seeds for later top-ups.

import type { Candidate, Item, TagVector } from "../types";
import { rank, type Mode, type TasteInput } from "../recommend/score";
import { displayScore, explain } from "../recommend/explain";
import type { PlaylistSettings } from "../taste/profile";
import { enrich, fetchGenrePool, fetchPool, instrumentCandidates, type Pool } from "./playlist";
import { energyOf, matchesInstrument, NO_SHAPE, shapeActive, type Shape } from "../recommend/shape";
import { INSTRUMENTS } from "../recommend/tags";
import { getFeatures } from "./features";
import { itemKey, norm } from "../util";

export interface RapidCard {
  item: Item;
  tags: TagVector;
  reason: string;
  /** Real Last.fm similarity, when there is one. */
  score?: { value: number; label: string };
}

export interface RapidSettings {
  /** Your picks, or (for a genre) your favourites used to bridge into it. */
  seeds: PlaylistSettings["seeds"];
  mode: Mode;
  adventure: number;
  /** Explore these subgenres (ids from recommend/genres.ts), matched to your taste. */
  genres?: string[];
  /** Energy + instruments. */
  shape?: Shape;
}

/** How far from the chosen energy a song may be and still be played (widened if too few songs fit). */
const ENERGY_TOLERANCE = 0.2;

/** At most this many songs per artist in one session, so a single favourite can't take over. */
const PER_ARTIST = 3;
type Seed = PlaylistSettings["seeds"][number];
const seedKey = (s: Seed) => itemKey(s.kind, s.artist, s.title);

export class RapidQueue {
  private pool = new Map<string, Candidate>();
  private support = new Map<string, number>();
  private seed: Pool["seed"] = null;
  private queued = new Set<string>();
  private noPreview = new Set<string>();
  private perArtist = new Map<string, number>();
  private usedSeeds = new Set<string>();
  private background: Promise<void> | null = null;
  /** Songs measured and found not to fit the energy / instruments. */
  private offShape = new Set<string>();
  private tolerance = ENERGY_TOLERANCE;
  private instrumentsRelaxed = false;
  /** Set when the filters had to be loosened because too few songs fit. */
  relaxedNote: string | null = null;

  constructor(private settings: RapidSettings) {
    for (const s of settings.seeds) this.usedSeeds.add(seedKey(s));
  }

  /** additive: the pool comes from new seeds (adds support); otherwise it's a deeper pass of the same seeds. */
  private merge(p: Pool, additive = false) {
    for (const c of p.candidates) {
      const n = p.support.get(c.key) ?? 1;
      const prevN = this.support.get(c.key) ?? 0;
      this.support.set(c.key, additive ? prevN + n : Math.max(prevN, n));
      const prev = this.pool.get(c.key);
      if (!prev || (c.match ?? c.artistMatch ?? 0) > (prev.match ?? prev.artistMatch ?? 0)) this.pool.set(c.key, c);
    }
    this.seed ??= p.seed;
  }

  /** First pool: the quicker "lite" depth unless the mode needs the deep catalogue; the full pool follows in the background. */
  async start(taste: TasteInput) {
    const { mode, seeds, genres } = this.settings;
    const needsFull = mode === "deep" || mode === "explore";
    const get = (depth: "lite" | "full", fg = true) => (genres?.length ? fetchGenrePool(genres, seeds, taste, depth) : fetchPool(seeds, depth, fg));
    const instruments = this.settings.shape?.instruments ?? [];
    const [main, extra] = await Promise.all([
      get(needsFull ? "full" : "lite"),
      instruments.length ? instrumentCandidates(instruments, seeds, taste, "lite") : Promise.resolve([] as Candidate[]),
    ]);
    this.merge(main);
    if (extra.length) this.merge({ candidates: extra, seed: null, support: new Map() }, true);
    if (!needsFull) this.background = get("full", false).then((p) => this.merge(p)).catch(() => {});
  }

  /** Add seeds (e.g. songs you just loved) so later top-ups also draw from their neighbourhoods. */
  addSeeds(seeds: Seed[]) {
    const fresh = seeds.filter((s) => !this.usedSeeds.has(seedKey(s))).slice(0, 2);
    if (!fresh.length) return;
    fresh.forEach((s) => this.usedSeeds.add(seedKey(s)));
    const p = fetchPool(fresh, "lite", false).then((x) => this.merge(x, true)).catch(() => {});
    this.background = this.background ? this.background.then(() => p) : p;
  }

  /**
   * Next n previewable songs, re-ranked with your current taste. Skips anything already queued, rated
   * (any stars, including 1★-hidden) or known, and songs with no Deezer preview.
   */
  async next(n: number, taste: TasteInput, known: Set<string>): Promise<RapidCard[]> {
    const out: RapidCard[] = [];
    for (let round = 0; round < 2 && out.length < n; round++) {
      if (round === 1) {
        if (!this.background) break;
        await this.background; // pool ran low: wait for the full pass / extra seeds, then try again
        this.background = null;
      }
      const left = [...this.pool.values()].filter(
        (c) =>
          !this.queued.has(c.key) && !this.noPreview.has(c.key) && !this.offShape.has(c.key) && !known.has(c.key) &&
          (this.perArtist.get(norm(c.artist)) ?? 0) < PER_ARTIST,
      );
      if (!left.length) continue;
      const ranked = rank(left, this.seed, this.settings.mode, this.settings.adventure, taste, { kind: "track", perArtist: 2 })
        .map((r) => ({ r, s: r.score + 0.06 * ((this.support.get(r.c.key) ?? 1) - 1) }))
        .sort((a, b) => b.s - a.s)
        .map((x) => x.r);

      // Check previews a dozen at a time until we have enough.
      for (let i = 0; i < ranked.length && out.length < n; i += 12) {
        const batch = ranked.slice(i, i + 12);
        const extra = await enrich(batch.map((r) => r.c)).catch(() => ({}) as Awaited<ReturnType<typeof enrich>>);
        const shape = this.settings.shape ?? NO_SHAPE;
        const wantsAudio = shape.energy != null || shape.instruments.some((x) => x === "instrumental" || x === "acoustic");
        const ids = batch.map((r) => extra[r.c.key]?.deezerId).filter((x): x is number => !!x && x > 0);
        const feats = wantsAudio && ids.length ? await getFeatures(ids) : new Map();
        for (const r of batch) {
          const c = r.c;
          const e = extra[c.key] ?? {};
          if (!e.hasPreview || !e.deezerId || e.onSpotify === false || e.noMatch) {
            this.noPreview.add(c.key);
            continue;
          }
          const shapeNote = shapeActive(shape) ? this.fits(c, shape, feats.get(e.deezerId)) : "";
          if (shapeNote === null) {
            this.offShape.add(c.key);
            continue;
          }
          const a = norm(c.artist);
          if (out.length >= n || (this.perArtist.get(a) ?? 0) >= PER_ARTIST) continue;
          this.queued.add(c.key);
          this.perArtist.set(a, (this.perArtist.get(a) ?? 0) + 1);
          const sup = this.support.get(c.key) ?? 1;
          out.push({
            item: {
              kind: "track", key: c.key, title: c.title, artist: c.artist, album: c.album ?? e.album,
              image: e.image ?? c.image, deezerId: e.deezerId, hasPreview: true, onSpotify: e.onSpotify, durationSec: c.durationSec ?? e.durationSec,
            },
            tags: c.tags,
            reason: (sup > 1 && this.settings.seeds.length > 1 ? `Suggested by ${sup} of your picks · ` : "") + explain(r) + (shapeNote ? ` · ${shapeNote}` : ""),
            score: displayScore(c),
          });
        }
      }
    }
    // Nothing more fits the energy/instruments: loosen step by step rather than end the session.
    if (!out.length && this.offShape.size && !this.instrumentsRelaxed) {
      this.relax();
      return this.next(n, taste, known);
    }
    return out;
  }

  /** null = doesn't fit; otherwise a short note ("energy 0.71 · features saxophone"). */
  private fits(c: Candidate, shape: Shape, f: import("../types").AudioFeatures | null | undefined): string | null {
    const notes: string[] = [];
    if (shape.energy != null) {
      const e = energyOf(f, c.tags);
      if (e && Math.abs(e.value - shape.energy) > this.tolerance) return null;
      if (e) notes.push(`energy ${e.value.toFixed(2)}${e.measured ? "" : " (estimated)"}`);
    }
    if (shape.instruments.length && !this.instrumentsRelaxed) {
      const found = shape.instruments.filter((id) => matchesInstrument(c.tags, f, id));
      if (!found.length) return null;
      notes.push(`features ${found.map((id) => INSTRUMENTS.find((x) => x.id === id)?.label.toLowerCase() ?? id).join(" & ")}`);
    }
    return notes.join(" · ");
  }

  private relax() {
    this.tolerance = Math.min(0.45, this.tolerance + 0.15);
    if (this.tolerance >= 0.45) this.instrumentsRelaxed = true;
    this.offShape.clear();
    this.relaxedNote = "Few songs here fit your energy and instruments exactly, so the closest matches are coming up.";
  }
}
