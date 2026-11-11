"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { Enrichment, Item, KeyStatus, Kind } from "../types";

// ------------------------------------------------------------------ cached JSON fetch

const jsonCache = new Map<string, { data?: unknown; error?: string; p?: Promise<void> }>();

/** Start (or reuse) the request for a URL. Shared by components and hover-prefetching. */
function ensure(url: string) {
  let entry = jsonCache.get(url);
  if (!entry) {
    entry = {};
    jsonCache.set(url, entry);
    const e = entry;
    e.p = fetch(url)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok || (j && typeof j === "object" && "error" in j)) e.error = (j as { error?: string }).error ?? `HTTP ${r.status}`;
        else e.data = j;
      })
      .catch((err: Error) => {
        e.error = err.message;
      })
      .finally(() => {
        if (e.error) setTimeout(() => jsonCache.delete(url), 5000);
      });
  }
  return entry;
}

export function useJson<T>(url: string | null): { data?: T; error?: string; loading: boolean } {
  const [, force] = useState(0);
  useEffect(() => {
    if (!url) return;
    const entry = ensure(url);
    if (entry.data || entry.error) return;
    let alive = true;
    entry.p?.then(() => alive && force((n) => n + 1));
    return () => {
      alive = false;
    };
  }, [url]);
  const e = url ? jsonCache.get(url) : undefined;
  return { data: e?.data as T | undefined, error: e?.error, loading: !!url && !e?.data && !e?.error };
}

// ------------------------------------------------------------------ page data URLs + hover prefetch

export type RecDepth = "quick" | "lite" | "full";

export function recommendUrl(kind: Kind, artist: string, title: string, depth: RecDepth = "full") {
  return `/api/recommend?${new URLSearchParams({ kind, artist, title, depth })}`;
}
export function albumUrl(artist: string, title: string) {
  return `/api/album?${new URLSearchParams({ artist, title })}`;
}
export function artistUrl(name: string) {
  return `/api/artist?name=${encodeURIComponent(name)}`;
}

/** Warm the data a click on this item would need, so the next page appears immediately. */
export function prefetchItem(item: { kind: Kind; artist: string; title: string }) {
  if (item.kind === "album") {
    ensure(albumUrl(item.artist, item.title));
    ensure(recommendUrl("album", item.artist, item.title, "quick"));
  } else if (item.kind === "artist") {
    ensure(artistUrl(item.artist));
  } else {
    ensure(recommendUrl("track", item.artist, item.title, "quick"));
    ensure(recommendUrl("track", item.artist, item.title, "full"));
  }
}

const hoverTimers = new WeakMap<EventTarget, ReturnType<typeof setTimeout>>();
/** Props for any card/row: prefetch after a short hover (ignores quick mouse-overs). */
export function hoverPrefetch(item: { kind: Kind; artist: string; title: string }) {
  return {
    onPointerEnter: (e: { currentTarget: EventTarget }) => {
      const t = e.currentTarget;
      hoverTimers.set(t, setTimeout(() => prefetchItem(item), 120));
    },
    onPointerLeave: (e: { currentTarget: EventTarget }) => {
      const id = hoverTimers.get(e.currentTarget);
      if (id) clearTimeout(id);
    },
  };
}

// ------------------------------------------------------------------ key status

let status: KeyStatus | null = null;
const statusListeners = new Set<() => void>();
let statusRequested = false;

export function useKeyStatus(): KeyStatus | null {
  return useSyncExternalStore(
    (l) => {
      statusListeners.add(l);
      if (!statusRequested) {
        statusRequested = true;
        fetch("/api/status")
          .then((r) => r.json())
          .then((s: KeyStatus) => {
            status = s;
            statusListeners.forEach((x) => x());
          })
          .catch(() => {});
      }
      return () => statusListeners.delete(l);
    },
    () => status,
    () => null,
  );
}

// ------------------------------------------------------------------ enrichment (artwork + previews)

const enrich = new Map<string, Enrichment>();
const queued = new Map<string, Item>();
const enrichListeners = new Set<() => void>();
let version = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

function flush() {
  timer = null;
  const batch = [...queued.values()].slice(0, 30);
  batch.forEach((b) => queued.delete(b.key));
  if (!batch.length) return;
  fetch("/api/enrich", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items: batch.map((b) => ({ kind: b.kind, artist: b.artist, title: b.title })) }),
  })
    .then((r) => r.json())
    .then((res: Record<string, Enrichment>) => {
      for (const b of batch) enrich.set(b.key, res[b.key] ?? {});
    })
    .catch(() => {
      for (const b of batch) enrich.set(b.key, {});
    })
    .finally(() => {
      version++;
      enrichListeners.forEach((l) => l());
      if (queued.size) timer = setTimeout(flush, 30);
    });
}

function request(items: Item[]) {
  let added = false;
  for (const it of items) {
    if (enrich.has(it.key) || queued.has(it.key)) continue;
    // Artists with a photo are complete. Songs and albums are always checked: the server confirms they're
    // on Spotify and swaps in Spotify's cover (Last.fm artwork is often missing or wrong).
    if (it.kind === "artist" && it.image) {
      enrich.set(it.key, {});
      continue;
    }
    queued.set(it.key, it);
    added = true;
  }
  if (added && !timer) timer = setTimeout(flush, 40);
}

/** Merge artwork, preview and Spotify availability into items (requests missing ones in batches). */
export function useEnriched<T extends Item>(items: T[]): T[] {
  useSyncExternalStore(
    (l) => {
      enrichListeners.add(l);
      return () => enrichListeners.delete(l);
    },
    () => version,
    () => 0,
  );
  useEffect(() => {
    request(items);
  }, [items]);
  return items.map((it) => {
    const e = enrich.get(it.key);
    if (!e) return it;
    return {
      ...it,
      image: (it.kind === "artist" ? it.image ?? e.image : e.image ?? it.image),
      onSpotify: e.onSpotify ?? it.onSpotify,
      deezerId: it.deezerId ?? e.deezerId,
      hasPreview: it.hasPreview ?? e.hasPreview,
      album: it.album ?? e.album,
      durationSec: it.durationSec ?? e.durationSec,
    };
  });
}

export async function enrichOne(item: Item): Promise<Item> {
  const e = enrich.get(item.key);
  if (e && (e.deezerId || e.image)) return { ...item, ...e, image: e.image ?? item.image };
  const res = await fetch("/api/enrich", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items: [{ kind: item.kind, artist: item.artist, title: item.title }] }),
  }).then((r) => r.json() as Promise<Record<string, Enrichment>>);
  const got = res[item.key] ?? {};
  enrich.set(item.key, got);
  return { ...item, ...got, image: got.image ?? item.image };
}

/** Recommendations only show what you can actually play on Spotify. Unchecked items (no Spotify login) stay. */
export const playableOnSpotify = (it: { onSpotify?: boolean }) => it.onSpotify !== false;

// ------------------------------------------------------------------ release years (MusicBrainz, 1 req/s)

const years = new Map<string, number | null>();
const yearQueue: Item[] = [];
const yearPending = new Set<string>();
const yearListeners = new Set<() => void>();
let yearVersion = 0;
let yearActive = 0;

function pumpYears() {
  while (yearActive < 2 && yearQueue.length) {
    const it = yearQueue.shift()!;
    yearActive++;
    const q = new URLSearchParams({ kind: it.kind, artist: it.artist, title: it.title });
    fetch(`/api/year?${q}`)
      .then((r) => r.json())
      // Transient failures (rate limits, timeouts) aren't remembered, so a later view retries.
      .then((j: { year: number | null; error?: boolean }) => {
        if (!j.error) years.set(it.key, j.year);
      })
      .catch(() => {})
      .finally(() => {
        yearPending.delete(it.key);
        yearActive--;
        yearVersion++;
        yearListeners.forEach((l) => l());
        pumpYears();
      });
  }
}

/** Original release year, from MusicBrainz. Undefined while loading or when unknown. */
export function useYear(item: Item | undefined): number | undefined {
  useSyncExternalStore(
    (l) => {
      yearListeners.add(l);
      return () => yearListeners.delete(l);
    },
    () => yearVersion,
    () => 0,
  );
  useEffect(() => {
    if (!item || item.kind === "artist" || item.year || years.has(item.key) || yearPending.has(item.key)) return;
    yearPending.add(item.key);
    yearQueue.push(item);
    pumpYears();
  }, [item]);
  if (!item) return undefined;
  return item.year ?? years.get(item.key) ?? undefined;
}
