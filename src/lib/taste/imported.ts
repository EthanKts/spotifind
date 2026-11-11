"use client";

// Imported Spotify taste, kept by the server in ~/Library/Application Support/Spotifind/spotify-import.json.
// The browser only holds a copy in memory, so nothing about your Spotify history goes into WebKit storage.

import { useSyncExternalStore } from "react";
import type { SpotifyImport } from "../types";

const EMPTY: SpotifyImport = Object.freeze({ importedAt: 0, items: [], removed: [] }) as SpotifyImport;
let state: SpotifyImport = EMPTY;
let started = false;
const listeners = new Set<() => void>();

function set(next: SpotifyImport) {
  state = next?.items ? next : EMPTY;
  listeners.forEach((l) => l());
}

function ensureLoaded() {
  if (started || typeof window === "undefined") return;
  started = true;
  fetch("/api/spotify/import", { cache: "no-store" })
    .then((r) => r.json())
    .then((j: SpotifyImport) => set(j))
    .catch(() => {
      started = false; // try again on the next subscriber
    });
}

export function useImported(): SpotifyImport {
  return useSyncExternalStore(
    (l) => {
      ensureLoaded();
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => EMPTY,
  );
}

export interface ImportError {
  message: string;
  /** login: not connected · reconnect: login lacks user-top-read · forbidden: Premium / app-owner rule · failed: anything else */
  code: "login" | "reconnect" | "forbidden" | "failed";
}

export const imported = {
  /** Fetch your Spotify top artists + tracks and map them to Last.fm tags (can take ~30 s the first time). */
  async run(): Promise<SpotifyImport> {
    const res = await fetch("/api/spotify/import", { method: "POST" });
    const j = await res.json().catch(() => ({ error: `Import failed (${res.status})`, code: "failed" }));
    if (!res.ok) throw Object.assign(new Error(j.error ?? "Import failed"), { code: j.code ?? "failed" }) as Error & ImportError;
    set(j);
    return j;
  },
  async remove(key: string) {
    set({ ...state, items: state.items.filter((x) => x.key !== key) }); // optimistic
    const j = await fetch(`/api/spotify/import?key=${encodeURIComponent(key)}`, { method: "DELETE" }).then((r) => r.json()).catch(() => null);
    if (j) set(j);
  },
  async removeAll() {
    set(EMPTY);
    await fetch("/api/spotify/import", { method: "DELETE" }).catch(() => {});
  },
};
