"use client";

// Bottom-player store. Plays ONLY real 30-second Deezer previews; otherwise reports "unavailable"
// so the UI can offer "Open in Spotify" instead.

import { useSyncExternalStore } from "react";
import type { Item } from "../types";
import { enrichOne } from "./data";

export type PlayerStatus = "idle" | "loading" | "playing" | "paused" | "unavailable";

export interface PlayerState {
  item?: Item;
  queue: Item[];
  index: number;
  status: PlayerStatus;
  position: number;
  duration: number;
  volume: number;
}

let s: PlayerState = { queue: [], index: -1, status: "idle", position: 0, duration: 30, volume: 0.8 };
const listeners = new Set<() => void>();
let audio: HTMLAudioElement | null = null;
let token = 0;

function set(p: Partial<PlayerState>) {
  s = { ...s, ...p };
  listeners.forEach((l) => l());
}

function el(): HTMLAudioElement {
  if (audio) return audio;
  audio = new Audio();
  audio.preload = "auto";
  try {
    const v = Number(window.localStorage.getItem("spotifind:volume"));
    if (v >= 0 && v <= 1 && window.localStorage.getItem("spotifind:volume") !== null) s.volume = v;
  } catch {}
  audio.volume = s.volume;
  audio.addEventListener("timeupdate", () => set({ position: audio!.currentTime }));
  audio.addEventListener("loadedmetadata", () => set({ duration: audio!.duration || 30 }));
  audio.addEventListener("play", () => set({ status: "playing" }));
  audio.addEventListener("pause", () => s.status === "playing" && set({ status: "paused" }));
  audio.addEventListener("ended", () => player.next(true));
  return audio;
}

async function load(item: Item, index: number, queue: Item[]) {
  const my = ++token;
  const a = el();
  a.pause();
  set({ item, index, queue, status: "loading", position: 0, duration: 30 });
  let it = item;
  if (it.kind === "track" && !it.deezerId) it = await enrichOne(it).catch(() => it);
  if (my !== token) return;
  set({ item: it });
  if (it.kind !== "track" || !it.deezerId || it.hasPreview === false) {
    set({ status: "unavailable" });
    return;
  }
  const r = await fetch(`/api/preview?id=${it.deezerId}`).then((x) => x.json() as Promise<{ url: string | null }>).catch(() => ({ url: null }));
  if (my !== token) return;
  if (!r.url) {
    set({ status: "unavailable" });
    return;
  }
  a.src = r.url;
  try {
    await a.play();
  } catch {
    set({ status: "paused" });
  }
}

export const player = {
  play(item: Item, queue?: Item[]) {
    const q = queue && queue.length ? queue : [item];
    const idx = Math.max(0, q.findIndex((x) => x.key === item.key));
    if (s.item?.key === item.key && (s.status === "paused" || s.status === "playing")) {
      player.toggle();
      return;
    }
    void load(q[idx] ?? item, idx, q);
  },
  toggle() {
    const a = el();
    if (s.status === "playing") a.pause();
    else if (s.status === "paused") void a.play().catch(() => {});
  },
  next(auto = false) {
    if (s.index < s.queue.length - 1) void load(s.queue[s.index + 1], s.index + 1, s.queue);
    else if (auto) set({ status: "paused", position: 0 });
  },
  prev() {
    const a = el();
    if (a.currentTime > 3 || s.index <= 0) {
      a.currentTime = 0;
      return;
    }
    void load(s.queue[s.index - 1], s.index - 1, s.queue);
  },
  seek(t: number) {
    const a = el();
    if (isFinite(t)) a.currentTime = t;
  },
  setVolume(v: number) {
    const a = el();
    a.volume = v;
    set({ volume: v });
    try {
      window.localStorage.setItem("spotifind:volume", String(v));
    } catch {}
  },
};

export function usePlayer(): PlayerState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => s,
    () => s,
  );
}
