"use client";

// Measured audio features (energy, danceability, …) for songs, by Deezer id. Batched and cached in memory;
// the server caches them for a year, so each song is analysed once.

import type { AudioFeatures } from "../types";

const known = new Map<number, AudioFeatures | null>();

export async function getFeatures(ids: number[], onProgress?: (done: number, total: number) => void): Promise<Map<number, AudioFeatures | null>> {
  const todo = [...new Set(ids.filter((id) => id && !known.has(id)))];
  let done = 0;
  // Small batches so progress moves and one slow analysis doesn't hold up the rest.
  const batches: number[][] = [];
  for (let i = 0; i < todo.length; i += 8) batches.push(todo.slice(i, i + 8));
  onProgress?.(0, todo.length);
  await Promise.all(
    batches.map(async (batch, i) => {
      await new Promise((r) => setTimeout(r, i * 150)); // stagger
      const res = await fetch("/api/features", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: batch }),
      })
        .then((r) => (r.ok ? (r.json() as Promise<Record<string, AudioFeatures | null>>) : ({} as Record<string, AudioFeatures | null>)))
        .catch(() => ({}) as Record<string, AudioFeatures | null>);
      // Only remember real measurements: a failure (busy service, no preview) is retried next time.
      for (const id of batch) if (res[id]) known.set(id, res[id]);
      done += batch.length;
      onProgress?.(done, todo.length);
    }),
  );
  return new Map(ids.map((id) => [id, known.get(id) ?? null]));
  // (ids that failed come back null here and fall back to a tag-based estimate)
}

/** How many of these still need measuring (to tell the user why it takes a moment). */
export function unmeasured(ids: number[]) {
  return ids.filter((id) => id && !known.has(id)).length;
}
// Note: `known` only holds successful measurements, so unmeasured() also counts songs that failed before.
