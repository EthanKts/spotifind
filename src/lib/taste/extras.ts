"use client";

// Taste signals from the new data sources, learned from your ratings (and, at lower weight, your imported
// Spotify taste):
//   styles — Discogs style weights of the artists you rate well (negative for 1–2★)
//   audio  — your preferred sound: star-weighted average of measured features of songs you rated
// Loaded in the background and cached in memory; ranking simply ignores them until they arrive.

import { useEffect, useSyncExternalStore } from "react";
import type { AudioFeatures, ImportedItem, TagVector } from "../types";
import type { Profile } from "./profile";
import { getFeatures } from "../client/features";

export interface TasteExtras {
  styles: TagVector;
  /** Preferred value per feature (0..1, tempo in BPM) and how confident that is (0..1). */
  audio?: AudioFeatures;
  audioConfidence: number;
}

const EMPTY: TasteExtras = { styles: {}, audioConfidence: 0 };
let state: TasteExtras = EMPTY;
let lastSig = "";
const listeners = new Set<() => void>();
const set = (s: TasteExtras) => {
  state = s;
  listeners.forEach((l) => l());
};

const STAR_W: Record<number, number> = { 5: 1, 4: 0.6, 3: 0, 2: -0.4, 1: -0.6 };

async function compute(p: Profile, imported: ImportedItem[]) {
  // Styles: artists you rated (directly or through songs), plus imported artists at ≤ 0.5.
  const weights = new Map<string, number>();
  for (const r of Object.values(p.ratings)) weights.set(r.item.artist, (weights.get(r.item.artist) ?? 0) + (STAR_W[r.rating] ?? 0));
  for (const it of imported) if (!weights.has(it.artist)) weights.set(it.artist, 0.5 * it.weight);
  const artists = [...weights.entries()].filter(([, w]) => w !== 0).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 80).map(([a]) => a);
  const res = await fetch("/api/styles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ artists, fetch: 10 }) })
    .then((r) => r.json() as Promise<{ styles: Record<string, TagVector> }>)
    .catch(() => ({ styles: {} as Record<string, TagVector> }));
  const styles: TagVector = {};
  for (const [a, vec] of Object.entries(res.styles)) for (const [s, v] of Object.entries(vec)) styles[s] = (styles[s] ?? 0) + v * (weights.get(a) ?? 0);
  const max = Math.max(1e-9, ...Object.values(styles).map(Math.abs));
  for (const s of Object.keys(styles)) styles[s] = Math.round((styles[s] / max) * 1000) / 1000;

  // Audio: songs you rated that have a Deezer preview.
  const rated = Object.values(p.ratings).filter((r) => r.item.kind === "track" && r.item.deezerId && STAR_W[r.rating]);
  const feats = rated.length ? await getFeatures(rated.map((r) => r.item.deezerId!)) : new Map();
  const keys: (keyof AudioFeatures)[] = ["energy", "danceability", "valence", "tempo", "acousticness", "instrumentalness", "speechiness"];
  const sum: Record<string, number> = {};
  let wsum = 0;
  let n = 0;
  for (const r of rated) {
    const f = feats.get(r.item.deezerId!);
    const w = STAR_W[r.rating];
    if (!f || w <= 0) continue; // the preferred sound is learned from songs you like; dislikes count via styles/tags
    n++;
    wsum += w;
    for (const k of keys) sum[k] = (sum[k] ?? 0) + w * f[k];
  }
  const audio = wsum ? (Object.fromEntries(keys.map((k) => [k, sum[k] / wsum])) as unknown as AudioFeatures) : undefined;
  set({ styles, audio, audioConfidence: Math.min(1, n / 8) });
}

export function useTasteExtras(p: Profile, imported: ImportedItem[]): TasteExtras {
  const snap = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => EMPTY,
  );
  useEffect(() => {
    const sig = `${Object.keys(p.ratings).length}:${Object.values(p.ratings).reduce((s, r) => s + r.rating, 0)}:${imported.length}`;
    if (sig === lastSig) return;
    lastSig = sig;
    const t = setTimeout(() => void compute(p, imported).catch(() => {}), 1500); // after first paint
    return () => clearTimeout(t);
  }, [p, imported]);
  return snap;
}
