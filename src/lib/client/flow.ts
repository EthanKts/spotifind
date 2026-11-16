"use client";

// Smooth flow: order a playlist like a DJ set. Measured tempo + energy (ReccoBeats, cached) decide the order:
// start from the calmest song, then always continue with the song closest in BPM and energy, so each
// transition is small. Songs that can't be measured keep their place at the end.

import type { AudioFeatures, Item } from "../types";
import { getFeatures } from "./features";

function distance(a: AudioFeatures, b: AudioFeatures) {
  // Tempo counts as half/double-time compatible (a 70 BPM song mixes into 140 BPM).
  const t = Math.min(Math.abs(a.tempo - b.tempo), Math.abs(a.tempo * 2 - b.tempo), Math.abs(a.tempo - b.tempo * 2));
  return t / 20 + Math.abs(a.energy - b.energy) * 2 + Math.abs(a.valence - b.valence) * 0.5;
}

export async function smoothFlow(tracks: Item[], onProgress?: (done: number, total: number) => void): Promise<{ order: Item[]; measured: number }> {
  const ids = tracks.map((t) => t.deezerId).filter((x): x is number => !!x);
  const feats = await getFeatures(ids, onProgress);
  const known = tracks.filter((t) => t.deezerId && feats.get(t.deezerId));
  const unknown = tracks.filter((t) => !(t.deezerId && feats.get(t.deezerId)));
  if (known.length < 3) return { order: tracks, measured: known.length };
  const f = (t: Item) => feats.get(t.deezerId!)!;
  const left = [...known];
  // Start calm, build up from there.
  left.sort((a, b) => f(a).energy - f(b).energy);
  const order: Item[] = [left.shift()!];
  while (left.length) {
    const last = f(order[order.length - 1]);
    let best = 0;
    for (let i = 1; i < left.length; i++) if (distance(last, f(left[i])) < distance(last, f(left[best]))) best = i;
    order.push(left.splice(best, 1)[0]);
  }
  return { order: [...order, ...unknown], measured: known.length };
}
