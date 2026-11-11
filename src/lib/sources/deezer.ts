import "server-only";
import { fetchJson } from "./http";
import type { Item } from "../types";
import { itemKey, artistKey, textKey } from "../util";

const BASE = "https://api.deezer.com";

async function dz<T>(path: string, ttlSec?: number): Promise<T> {
  const d = await fetchJson<T & { error?: { message: string; code?: number } }>(`${BASE}${path}`, { ttlSec });
  if (d && typeof d === "object" && "error" in d && d.error) throw new Error(`Deezer: ${d.error.message}`);
  return d;
}

/** Deezer serves a blank image for artists/albums without a picture; treat those as missing. */
export const realImage = (url?: string) => (url && !/\/images\/(artist|cover)\/\/|\/images\/(artist|cover)\/d41d8cd98f00b204e9800998ecf8427e\//.test(url) ? url : undefined);

export interface DzArtist { id: number; name: string; picture_xl?: string; picture_big?: string; nb_fan?: number }
export interface DzAlbum {
  id: number;
  title: string;
  cover_xl?: string;
  cover_big?: string;
  release_date?: string;
  artist?: DzArtist;
  nb_tracks?: number;
  record_type?: string;
  fans?: number;
  tracks?: { data: DzTrack[] };
}
export interface DzTrack {
  id: number;
  title: string;
  title_short?: string;
  duration?: number;
  rank?: number;
  preview?: string;
  artist: DzArtist;
  album?: DzAlbum;
  track_position?: number;
}

const q = (s: string) => s.replace(/"/g, "");

export function trackToItem(t: DzTrack): Item {
  return {
    kind: "track",
    key: itemKey("track", t.artist.name, t.title),
    title: t.title,
    artist: t.artist.name,
    album: t.album?.title,
    image: t.album?.cover_xl ?? t.album?.cover_big,
    deezerId: t.id,
    hasPreview: !!t.preview,
    durationSec: t.duration,
  };
}
export function albumToItem(a: DzAlbum, artistName?: string): Item {
  const artist = a.artist?.name ?? artistName ?? "";
  return {
    kind: "album",
    key: itemKey("album", artist, a.title),
    title: a.title,
    artist,
    image: a.cover_xl ?? a.cover_big,
    deezerId: a.id,
    year: a.release_date ? Number(a.release_date.slice(0, 4)) || undefined : undefined,
  };
}
export function artistToItem(a: DzArtist): Item {
  return {
    kind: "artist",
    key: itemKey("artist", a.name, a.name),
    title: a.name,
    artist: a.name,
    image: a.picture_xl ?? a.picture_big,
    deezerId: a.id,
    listeners: a.nb_fan,
  };
}

export async function searchTracks(query: string, limit = 10): Promise<DzTrack[]> {
  const d = await dz<{ data: DzTrack[] }>(`/search/track?q=${encodeURIComponent(query)}&limit=${limit}`, 1800);
  return d.data ?? [];
}
export async function searchAlbums(query: string, limit = 10): Promise<DzAlbum[]> {
  const d = await dz<{ data: DzAlbum[] }>(`/search/album?q=${encodeURIComponent(query)}&limit=${limit}`, 1800);
  return d.data ?? [];
}
export async function searchArtists(query: string, limit = 10): Promise<DzArtist[]> {
  const d = await dz<{ data: DzArtist[] }>(`/search/artist?q=${encodeURIComponent(query)}&limit=${limit}`, 1800);
  return d.data ?? [];
}

/** Find the Deezer track that is really this artist + title (not just a fuzzy hit). */
function pickTrack(res: DzTrack[], artist: string, title: string) {
  const a = artistKey(artist);
  const t = textKey(title);
  return (
    res.find((r) => artistKey(r.artist.name) === a && textKey(r.title) === t) ??
    res.find((r) => artistKey(r.artist.name) === a && textKey(r.title_short ?? r.title) === t) ??
    res.find((r) => artistKey(r.artist.name) === a && (textKey(r.title).startsWith(t) || t.startsWith(textKey(r.title_short ?? r.title))))
  );
}

export async function findTrack(artist: string, title: string): Promise<DzTrack | undefined> {
  // Deezer's strict field search sometimes returns nothing for tracks a plain search finds, so fall back.
  const strict = pickTrack(await searchTracks(`artist:"${q(artist)}" track:"${q(title)}"`, 5), artist, title);
  if (strict) return strict;
  return pickTrack(await searchTracks(`${artist} ${title}`, 10), artist, title);
}

function pickAlbum(res: DzAlbum[], artist: string, title: string) {
  const a = artistKey(artist);
  const t = textKey(title);
  return (
    res.find((r) => artistKey(r.artist?.name ?? "") === a && textKey(r.title) === t) ??
    res.find((r) => artistKey(r.artist?.name ?? "") === a && (textKey(r.title).startsWith(t) || t.startsWith(textKey(r.title))))
  );
}

export async function findAlbum(artist: string, title: string): Promise<DzAlbum | undefined> {
  const strict = pickAlbum(await searchAlbums(`artist:"${q(artist)}" album:"${q(title)}"`, 5), artist, title);
  if (strict) return strict;
  return pickAlbum(await searchAlbums(`${artist} ${title}`, 10), artist, title);
}

/**
 * The Deezer artist with this exact name. Several artists often share a name ("Pond": an Australian band with 27k fans,
 * plus small namesakes listed first), so pick the best-known one rather than the first hit.
 */
export async function findArtist(name: string): Promise<DzArtist | undefined> {
  const res = await searchArtists(name, 10);
  const n = artistKey(name);
  const exact = res.filter((r) => artistKey(r.name) === n).sort((a, b) => (b.nb_fan ?? 0) - (a.nb_fan ?? 0))[0];
  // Names in Japanese, Korean, Cyrillic…: Deezer finds the real artist by alias but lists the romanised name
  // (杏里 → Anri, 17k fans), often next to a tiny duplicate entry under the native name. Prefer the
  // established artist when it clearly outweighs the exact-name entry.
  if (!/[a-z0-9]/i.test(name)) {
    const top = res[0];
    if (top && (top.nb_fan ?? 0) >= 100 && (top.nb_fan ?? 0) > 10 * (exact?.nb_fan ?? 0)) return top;
  }
  return exact;
}

export async function album(id: number): Promise<DzAlbum> {
  return dz<DzAlbum>(`/album/${id}`, 24 * 3600);
}

/** Preview URLs are signed and expire, so this is never cached for long. */
export async function trackPreview(id: number): Promise<string | undefined> {
  const t = await dz<DzTrack>(`/track/${id}`, 300);
  return t.preview || undefined;
}

export async function relatedArtists(id: number, limit = 20): Promise<DzArtist[]> {
  const d = await dz<{ data: DzArtist[] }>(`/artist/${id}/related?limit=${limit}`, 24 * 3600);
  return d.data ?? [];
}

export async function artistTop(id: number, limit = 10): Promise<DzTrack[]> {
  const d = await dz<{ data: DzTrack[] }>(`/artist/${id}/top?limit=${limit}`, 6 * 3600);
  return d.data ?? [];
}

export async function artistAlbums(id: number, limit = 50): Promise<DzAlbum[]> {
  const d = await dz<{ data: DzAlbum[] }>(`/artist/${id}/albums?limit=${limit}`, 24 * 3600);
  return d.data ?? [];
}
