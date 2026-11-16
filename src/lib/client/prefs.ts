"use client";

// Small view preferences (sort order, list/grid) remembered on this Mac. Only conveniences live here: if storage
// is unavailable the defaults are used and nothing breaks.

import { useCallback, useSyncExternalStore } from "react";

const PREFIX = "spotifind:pref:";
const listeners = new Set<() => void>();
const cache = new Map<string, string | null>();

function read(key: string): string | null {
  if (!cache.has(key)) {
    let v: string | null = null;
    try {
      v = window.localStorage.getItem(PREFIX + key);
    } catch {}
    cache.set(key, v);
  }
  return cache.get(key) ?? null;
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** A remembered choice from a fixed list; anything unknown falls back to the default. */
export function usePref<T extends string>(key: string, fallback: T, allowed: readonly T[]): [T, (v: T) => void] {
  const raw = useSyncExternalStore(subscribe, () => read(key), () => null);
  const value = raw && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
  const set = useCallback(
    (v: T) => {
      cache.set(key, v);
      try {
        window.localStorage.setItem(PREFIX + key, v);
      } catch {}
      listeners.forEach((l) => l());
    },
    [key],
  );
  return [value, set];
}
