import "server-only";
import { configValue } from "./config";
import { fetchJson, HttpError, peekCache } from "./http";
import type { TagVector } from "../types";
import { norm } from "../util";

// Discogs: precise genres and fine-grained styles ("Trip Hop", "Darkwave") per album (master release) and,
// aggregated over an artist's best-known masters, per artist. Optional: needs DISCOGS_TOKEN (your config.env,
// .env.local in dev, or the copy someone shared with you). Everyone shares one token's 60 requests/minute, so
// answers are cached for 30 days, and a missing or rejected token just switches Discogs off.

const API = "https://api.discogs.com";
const TTL = 30 * 24 * 3600;
const g = globalThis as unknown as { __sfDiscogsRejected?: boolean };

export function hasDiscogs() {
  return !!configValue("DISCOGS_TOKEN") && !g.__sfDiscogsRejected;
}

export interface DiscogsInfo {
  genres: string[];
  styles: string[];
  year?: number;
}

type Result = { title?: string; year?: string; genre?: string[]; style?: string[] };

async function search(params: Record<string, string>): Promise<Result[]> {
  const token = configValue("DISCOGS_TOKEN");
  if (!token || g.__sfDiscogsRejected) return [];
  const q = new URLSearchParams({ ...params, per_page: "10" }).toString();
  try {
    const d = await fetchJson<{ results?: Result[] }>(`${API}/database/search?${q}`, {
      ttlSec: TTL,
      cacheKey: `dg:search:${q}`, // the token never goes into the cache key or logs
      headers: { Authorization: `Discogs token=${token}` },
    });
    return d.results ?? [];
  } catch (e) {
    if (e instanceof HttpError && e.status === 401) g.__sfDiscogsRejected = true;
    return [];
  }
}

/** Cached answer only (no request), for ranking paths that must stay fast. */
export function peekArtistStyles(artist: string): TagVector | undefined {
  const q = new URLSearchParams({ type: "master", artist, per_page: "10" }).toString();
  const d = peekCache<{ results?: Result[] }>(`dg:search:${q}`);
  return d ? toStyleVector(d.results ?? [], artist) : undefined;
}

function toStyleVector(results: Result[], artist: string): TagVector {
  const a = norm(artist);
  const counts: Record<string, number> = {};
  for (const r of results) {
    if (!norm(r.title ?? "").startsWith(a)) continue; // "Artist - Title"
    for (const s of r.style ?? []) counts[s.toLowerCase()] = (counts[s.toLowerCase()] ?? 0) + 1;
    for (const s of r.genre ?? []) counts[s.toLowerCase()] = (counts[s.toLowerCase()] ?? 0) + 0.5;
  }
  const max = Math.max(1e-9, ...Object.values(counts));
  return Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, Math.round((v / max) * 1000) / 1000]));
}

/** Styles of an artist, from its best-known master releases (weights 0..1). */
export async function artistStyles(artist: string): Promise<TagVector> {
  return toStyleVector(await search({ type: "master", artist }), artist);
}

/** Genres, styles and original year of one album (master release). */
export async function albumInfo(artist: string, album: string): Promise<DiscogsInfo | null> {
  const results = await search({ type: "master", artist, release_title: album });
  const a = norm(artist);
  const t = norm(album);
  const hit =
    results.find((r) => norm(r.title ?? "") === norm(`${artist} - ${album}`)) ??
    results.find((r) => norm(r.title ?? "").startsWith(a) && norm(r.title ?? "").includes(t));
  if (!hit) return null;
  return { genres: hit.genre ?? [], styles: hit.style ?? [], year: Number(hit.year) || undefined };
}

export interface StyleMaster {
  artist: string;
  album: string;
  year?: number;
  /** How many Discogs users own it: a good measure of how well known the album is. */
  have: number;
}

/** Discogs credits look like "Art Blakey And The Jazz Messengers*" or "Prince (2)". */
function cleanArtist(s: string) {
  return s.replace(/\s*\(\d+\)/g, "").replace(/\*/g, "").split(/\s*,\s*/)[0].trim();
}

/**
 * The best-known albums Discogs files under a style (master releases, most owned first). Only albums where
 * the style is one of the main ones count: an album filed under ten styles says little about any of them.
 * Pages of 100, cached 30 days.
 */
export async function styleMasters(style: string, genre: string | undefined, pages = 1, country?: string): Promise<StyleMaster[]> {
  const token = configValue("DISCOGS_TOKEN");
  if (!token || g.__sfDiscogsRejected) return [];
  const out: StyleMaster[] = [];
  for (let page = 1; page <= pages; page++) {
    const q = new URLSearchParams({
      type: "master", style, ...(genre ? { genre } : {}), ...(country ? { country } : {}), sort: "have", sort_order: "desc", per_page: "100", page: String(page),
    }).toString();
    type R = { results?: (Result & { community?: { have?: number } })[]; pagination?: { pages?: number } };
    let d: R;
    try {
      d = await fetchJson<R>(`${API}/database/search?${q}`, {
        ttlSec: TTL,
        cacheKey: `dg:style:${q}`, // the token never goes into the cache key or logs
        headers: { Authorization: `Discogs token=${token}` },
      });
    } catch (e) {
      if (e instanceof HttpError && e.status === 401) g.__sfDiscogsRejected = true;
      break;
    }
    for (const r of d.results ?? []) {
      const styles = r.style ?? [];
      const at = styles.indexOf(style);
      // The album's main style, or its second one when it has only a few.
      if (at < 0 || at > 1 || (at === 1 && styles.length > 3)) continue;
      const [artist, ...rest] = (r.title ?? "").split(" - ");
      const album = rest.join(" - ").trim();
      const a = cleanArtist(artist ?? "");
      if (!a || !album || /^various$/i.test(a)) continue;
      out.push({ artist: a, album, year: Number(r.year) || undefined, have: r.community?.have ?? 0 });
    }
    if ((d.pagination?.pages ?? 1) <= page) break;
  }
  return out;
}
