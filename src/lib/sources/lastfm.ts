import "server-only";
import { fetchJson } from "./http";
import type { TagVector } from "../types";
import { norm } from "../util";

const BASE = "https://ws.audioscrobbler.com/2.0/";
const PLACEHOLDER = "2a96cbd8b46e442fc41c2b86b821562f";

export function hasLastfm() {
  return !!process.env.LASTFM_API_KEY;
}

type LfImage = { "#text": string; size: string }[];

async function call<T>(method: string, params: Record<string, string | number | undefined>, ttlSec?: number): Promise<T> {
  const key = process.env.LASTFM_API_KEY;
  if (!key) throw new Error("LASTFM_API_KEY missing");
  const p = new URLSearchParams({ method, api_key: key, format: "json", autocorrect: "1" });
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") p.set(k, String(v));
  const data = await fetchJson<T & { error?: number; message?: string }>(`${BASE}?${p}`, {
    ttlSec,
    cacheKey: `lf:${method}:${[...p.entries()].filter(([k]) => k !== "api_key").map((e) => e.join("=")).join("&")}`,
  });
  if (data && typeof data === "object" && "error" in data && data.error) {
    throw new Error(`Last.fm ${method}: ${data.message}`);
  }
  return data;
}

function arr<T>(x: T | T[] | undefined): T[] {
  if (!x) return [];
  return Array.isArray(x) ? x : [x];
}

export function lfImage(img?: LfImage): string | undefined {
  if (!img) return undefined;
  const pick = img.find((i) => i.size === "extralarge") ?? img.find((i) => i.size === "large") ?? img[img.length - 1];
  const url = pick?.["#text"];
  if (!url || url.includes(PLACEHOLDER)) return undefined;
  return url;
}

// Tags that describe the listener's library rather than the music.
const JUNK = new Set([
  "seen live", "favorites", "favourite", "favorite", "favourites", "my favorite", "albums i own", "love", "loved",
  "awesome", "beautiful", "amazing", "cool", "good", "best", "great", "spotify", "check out", "owned", "vinyl",
  "favorite songs", "favourite songs", "favorite albums", "favorite artists", "all", "music", "fip", "under 2000 listeners",
  "radio", "sex", "deezer",
]);

/** Converts a Last.fm tag list into a normalised vector, dropping junk/artist-name tags. */
export function toTagVector(tags: { name: string; count?: number | string }[], artistName?: string, max = 15): TagVector {
  const out: TagVector = {};
  const artistN = artistName ? norm(artistName) : "";
  const withCounts = tags.some((t) => t.count !== undefined && Number(t.count) > 0);
  let i = 0;
  for (const t of tags) {
    const name = t.name.toLowerCase().trim();
    if (!name || JUNK.has(name) || name.length > 30) continue;
    if (artistN && norm(name) === artistN) continue;
    const w = withCounts ? Number(t.count) / 100 : Math.max(0.2, 1 - i * 0.08);
    if (w < 0.05) continue;
    out[name] = Math.max(out[name] ?? 0, Math.min(1, w));
    if (++i >= max) break;
  }
  return out;
}

export interface LfTrack {
  name: string;
  artist: string;
  match?: number;
  playcount?: number;
  listeners?: number;
  durationSec?: number;
  mbid?: string;
  image?: string;
  rank?: number;
}

export async function similarTracks(artist: string, track: string, limit = 100): Promise<LfTrack[]> {
  type R = { similartracks?: { track?: unknown } };
  const d = await call<R>("track.getSimilar", { artist, track, limit });
  return arr(d.similartracks?.track as never[]).map((t: Record<string, never>) => ({
    name: t.name,
    artist: (t.artist as { name: string })?.name,
    match: Number(t.match),
    playcount: Number(t.playcount) || undefined,
    durationSec: Number(t.duration) || undefined,
    mbid: t.mbid || undefined,
  }));
}

export interface LfArtist {
  name: string;
  match?: number;
  mbid?: string;
  listeners?: number;
}

export async function similarArtists(artist: string, limit = 50): Promise<LfArtist[]> {
  type R = { similarartists?: { artist?: unknown } };
  const d = await call<R>("artist.getSimilar", { artist, limit });
  return arr(d.similarartists?.artist as never[]).map((a: Record<string, never>) => ({
    name: a.name,
    match: Number(a.match),
    mbid: a.mbid || undefined,
  }));
}

export async function trackTags(artist: string, track: string): Promise<TagVector> {
  type R = { toptags?: { tag?: unknown } };
  const d = await call<R>("track.getTopTags", { artist, track });
  return toTagVector(arr(d.toptags?.tag as never[]), artist);
}

export async function artistTags(artist: string): Promise<TagVector> {
  type R = { toptags?: { tag?: unknown } };
  const d = await call<R>("artist.getTopTags", { artist });
  return toTagVector(arr(d.toptags?.tag as never[]), artist);
}

export async function albumTags(artist: string, album: string): Promise<TagVector> {
  type R = { toptags?: { tag?: unknown } };
  const d = await call<R>("album.getTopTags", { artist, album });
  return toTagVector(arr(d.toptags?.tag as never[]), artist);
}

export async function artistTopTracks(artist: string, limit = 50, page = 1): Promise<LfTrack[]> {
  type R = { toptracks?: { track?: unknown } };
  const d = await call<R>("artist.getTopTracks", { artist, limit, page });
  return arr(d.toptracks?.track as never[]).map((t: Record<string, never>) => ({
    name: t.name,
    artist: (t.artist as { name: string })?.name ?? artist,
    playcount: Number(t.playcount) || undefined,
    listeners: Number(t.listeners) || undefined,
    rank: Number((t["@attr"] as { rank?: string })?.rank) || undefined,
    mbid: t.mbid || undefined,
  }));
}

export interface LfAlbum {
  name: string;
  artist: string;
  playcount?: number;
  mbid?: string;
  image?: string;
}

export async function artistTopAlbums(artist: string, limit = 20): Promise<LfAlbum[]> {
  type R = { topalbums?: { album?: unknown } };
  const d = await call<R>("artist.getTopAlbums", { artist, limit });
  return arr(d.topalbums?.album as never[])
    .map((a: Record<string, never>) => ({
      name: a.name,
      artist: (a.artist as { name: string })?.name ?? artist,
      playcount: Number(a.playcount) || undefined,
      mbid: a.mbid || undefined,
      image: lfImage(a.image),
    }))
    .filter((a) => a.name && a.name !== "(null)");
}

export interface LfAlbumInfo {
  name: string;
  artist: string;
  mbid?: string;
  listeners?: number;
  playcount?: number;
  image?: string;
  tags: TagVector;
  tracks: { name: string; durationSec?: number; rank: number }[];
  wiki?: string;
}

export async function albumInfo(artist: string, album: string): Promise<LfAlbumInfo> {
  type R = { album: Record<string, never> };
  const d = await call<R>("album.getInfo", { artist, album });
  const a = d.album;
  const tags = arr((a.tags as unknown as { tag?: never })?.tag as unknown as never[]);
  return {
    name: a.name,
    artist: a.artist,
    mbid: a.mbid || undefined,
    listeners: Number(a.listeners) || undefined,
    playcount: Number(a.playcount) || undefined,
    image: lfImage(a.image),
    tags: toTagVector(tags, a.artist),
    tracks: arr((a.tracks as unknown as { track?: never })?.track as unknown as never[]).map((t: Record<string, never>, i) => ({
      name: t.name,
      durationSec: Number(t.duration) || undefined,
      rank: Number((t["@attr"] as { rank?: number })?.rank) || i + 1,
    })),
    wiki: stripLinks((a.wiki as unknown as { summary?: string })?.summary),
  };
}

export interface LfTrackInfo {
  name: string;
  artist: string;
  listeners?: number;
  playcount?: number;
  durationSec?: number;
  album?: string;
  image?: string;
  tags: TagVector;
}

export async function trackInfo(artist: string, track: string): Promise<LfTrackInfo> {
  type R = { track: Record<string, never> };
  const d = await call<R>("track.getInfo", { artist, track });
  const t = d.track;
  const album = t.album as unknown as { title?: string; image?: LfImage } | undefined;
  return {
    name: t.name,
    artist: (t.artist as { name: string })?.name ?? artist,
    listeners: Number(t.listeners) || undefined,
    playcount: Number(t.playcount) || undefined,
    durationSec: Number(t.duration) ? Number(t.duration) / 1000 : undefined,
    album: album?.title,
    image: lfImage(album?.image),
    tags: toTagVector(arr((t.toptags as unknown as { tag?: never })?.tag as unknown as never[]), artist),
  };
}

export interface LfArtistInfo {
  name: string;
  mbid?: string;
  listeners?: number;
  playcount?: number;
  tags: TagVector;
  bio?: string;
}

export async function artistInfo(artist: string): Promise<LfArtistInfo> {
  type R = { artist: Record<string, never> };
  const d = await call<R>("artist.getInfo", { artist });
  const a = d.artist;
  const stats = a.stats as unknown as { listeners?: string; playcount?: string };
  return {
    name: a.name,
    mbid: a.mbid || undefined,
    listeners: Number(stats?.listeners) || undefined,
    playcount: Number(stats?.playcount) || undefined,
    tags: toTagVector(arr((a.tags as unknown as { tag?: never })?.tag as unknown as never[]), a.name),
    bio: stripLinks((a.bio as unknown as { summary?: string })?.summary),
  };
}

export async function tagTopArtists(tag: string, limit = 12): Promise<LfArtist[]> {
  type R = { topartists?: { artist?: unknown } };
  const d = await call<R>("tag.getTopArtists", { tag, limit });
  return arr(d.topartists?.artist as never[]).map((a: Record<string, never>) => ({ name: a.name, mbid: a.mbid || undefined }));
}

export async function tagTopAlbums(tag: string, limit = 12): Promise<LfAlbum[]> {
  type R = { albums?: { album?: unknown } };
  const d = await call<R>("tag.getTopAlbums", { tag, limit });
  return arr(d.albums?.album as never[]).map((a: Record<string, never>) => ({
    name: a.name,
    artist: (a.artist as { name: string })?.name,
    mbid: a.mbid || undefined,
    image: lfImage(a.image),
  }));
}

function stripLinks(s?: string) {
  if (!s) return undefined;
  const t = s.replace(/<a [^>]*>.*?<\/a>\.?/g, "").replace(/<[^>]+>/g, "").trim();
  return t || undefined;
}
