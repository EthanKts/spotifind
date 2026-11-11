import "server-only";
import { fetchJson } from "./http";
import type { Item, Kind } from "../types";
import { itemKey, norm } from "../util";
import { connectedUser, userAccessToken } from "./spotifyUser";

// Client-credentials flow: catalogue lookups only (search, track/album/artist by id).
// Spotify's audio-features and recommendations endpoints are closed to new apps (Nov 2024),
// so Spotifind never uses Spotify data for similarity.

const hasSecret = () => !!(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET);

/** Catalogue lookups work with an app secret, or — without one — with your connected Spotify login. */
export function hasSpotify() {
  return hasSecret() || !!connectedUser();
}

let token: { value: string; exp: number } | undefined;

async function getToken(): Promise<string> {
  if (!hasSecret()) return userAccessToken();
  if (token && token.exp > Date.now() + 30_000) return token.value;
  const id = process.env.SPOTIFY_CLIENT_ID!;
  const secret = process.env.SPOTIFY_CLIENT_SECRET!;
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Spotify token request failed (${res.status}) — check SPOTIFY_CLIENT_ID/SECRET`);
  const j = (await res.json()) as { access_token: string; expires_in: number };
  token = { value: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return token.value;
}

async function sp<T>(path: string, ttlSec = 6 * 3600): Promise<T> {
  const t = await getToken();
  return fetchJson<T>(`https://api.spotify.com/v1${path}`, { ttlSec, headers: { Authorization: `Bearer ${t}` }, cacheKey: `sp:${path}` });
}

type SpImage = { url: string; width: number }[];
interface SpArtist { id: string; name: string; images?: SpImage; external_urls: { spotify: string } }
interface SpAlbum { id: string; name: string; release_date?: string; images?: SpImage; artists: SpArtist[]; external_urls: { spotify: string } }
interface SpTrack { id: string; name: string; duration_ms: number; artists: SpArtist[]; album: SpAlbum; external_urls: { spotify: string } }

const img = (i?: SpImage) => i?.[0]?.url;
const yr = (d?: string) => (d ? Number(d.slice(0, 4)) || undefined : undefined);

/** Exact Spotify URL for an item, or undefined if not found. */
export async function findSpotifyUrl(kind: Kind, artist: string, title: string): Promise<string | undefined> {
  const qs =
    kind === "artist"
      ? `artist:${artist}`
      : kind === "album"
        ? `album:${title} artist:${artist}`
        : `track:${title} artist:${artist}`;
  const d = await sp<{ tracks?: { items: SpTrack[] }; albums?: { items: SpAlbum[] }; artists?: { items: SpArtist[] } }>(
    `/search?type=${kind}&limit=5&q=${encodeURIComponent(qs)}`,
  );
  const a = norm(artist);
  const t = norm(title);
  if (kind === "track")
    return d.tracks?.items.find((x) => norm(x.name) === t && x.artists.some((y) => norm(y.name) === a))?.external_urls.spotify ??
      d.tracks?.items[0]?.external_urls.spotify;
  if (kind === "album")
    return d.albums?.items.find((x) => norm(x.name) === t && x.artists.some((y) => norm(y.name) === a))?.external_urls.spotify ??
      d.albums?.items[0]?.external_urls.spotify;
  return d.artists?.items.find((x) => norm(x.name) === a)?.external_urls.spotify ?? d.artists?.items[0]?.external_urls.spotify;
}

export function parseSpotifyLink(s: string): { kind: Kind; id: string } | undefined {
  const m = s.trim().match(/(?:open\.spotify\.com\/(?:intl-[a-z]+\/)?|spotify:)(track|album|artist)[/:]([A-Za-z0-9]{22})/);
  return m ? { kind: m[1] as Kind, id: m[2] } : undefined;
}

export async function resolveSpotifyLink(kind: Kind, id: string): Promise<Item> {
  if (kind === "track") {
    const t = await sp<SpTrack>(`/tracks/${id}`);
    return {
      kind, key: itemKey(kind, t.artists[0].name, t.name), title: t.name, artist: t.artists[0].name,
      album: t.album.name, image: img(t.album.images), year: yr(t.album.release_date), durationSec: t.duration_ms / 1000,
    };
  }
  if (kind === "album") {
    const a = await sp<SpAlbum>(`/albums/${id}`);
    return { kind, key: itemKey(kind, a.artists[0].name, a.name), title: a.name, artist: a.artists[0].name, image: img(a.images), year: yr(a.release_date) };
  }
  const a = await sp<SpArtist>(`/artists/${id}`);
  return { kind, key: itemKey(kind, a.name, a.name), title: a.name, artist: a.name, image: img(a.images) };
}

/** Strip edition noise ("- Remastered 2011", "(Deluxe Edition)") so other catalogues can find the item. */
export function cleanTitle(s: string) {
  return s
    .replace(/\s+-\s+.*(remaster|version|edit|mono|stereo|live|mix|deluxe).*$/i, "")
    .replace(/\s*[\(\[][^\)\]]*(remaster|version|edition|deluxe|mono|stereo|anniversary)[^\)\]]*[\)\]]/gi, "")
    .trim();
}

function meta(html: string, key: string) {
  const re = new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)"`, "i");
  const m = html.match(re);
  return m ? m[1].replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"') : undefined;
}

/**
 * Without API keys: read the public page's Open Graph tags (title + artist).
 * Returns undefined if the page can't be read.
 */
export async function publicLinkInfo(kind: Kind, id: string): Promise<{ title: string; artist: string } | undefined> {
  const res = await fetch(`https://open.spotify.com/${kind}/${id}`, {
    headers: { "User-Agent": "Mozilla/5.0 (Spotifind link preview)" },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return undefined;
  const html = await res.text();
  const ogTitle = meta(html, "og:title");
  const desc = meta(html, "og:description") ?? "";
  if (!ogTitle) return undefined;
  if (kind === "track") {
    const artist = meta(html, "music:musician_description") ?? desc.split(" · ")[0];
    return artist ? { title: cleanTitle(ogTitle), artist } : undefined;
  }
  if (kind === "album") {
    const m = ogTitle.match(/^Listen to (.*) - Album by (.*) \| Spotify$/);
    const title = m ? m[1] : ogTitle;
    const artist = m ? m[2] : desc.split(" · ")[0];
    return { title: cleanTitle(title), artist };
  }
  const name = ogTitle.replace(/ \| Spotify$/, "");
  return { title: name, artist: name };
}

/** Without API keys: Spotify's public oEmbed endpoint gives the title only. */
export async function oembedTitle(url: string): Promise<string | undefined> {
  const res = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`, { cache: "no-store" });
  if (!res.ok) return undefined;
  const j = (await res.json()) as { title?: string };
  return j.title;
}

// ------------------------------------------------------------------ catalogue check (is it really on Spotify?)

/** Title without edition noise for comparing catalogues: "(Remastered 2011)", "[Enhanced]", "- Single", "- EP". */
function relax(s: string) {
  return norm(s.replace(/\s*[\(\[][^\)\]]*[\)\]]/g, "").replace(/\s+-\s+.*$/, "")) || norm(s);
}
/** Field filters break on quotes and apostrophes ("artist:Melody's Echo Chamber" finds nothing). */
const q = (s: string) => s.replace(/["'’`]/g, "").replace(/\s*[\(\[][^\)\]]*[\)\]]/g, "").replace(/\s+-\s+(single|ep)$/i, "").trim();

function sameTitle(a: string, b: string) {
  if (norm(a) === norm(b)) return true;
  const x = relax(a);
  const y = relax(b);
  return x === y || (Math.min(x.length, y.length) >= 4 && (x.startsWith(y) || y.startsWith(x)));
}
const hasArtist = (artists: { name: string }[], artist: string) => {
  const a = norm(artist);
  return artists.some((x) => norm(x.name) === a);
};

export interface SpotifyMatch {
  found: boolean;
  url?: string;
  /** Cover (album/track) or photo (artist) from Spotify — the artwork you'd see in Spotify itself. */
  image?: string;
  year?: number;
}

/**
 * Look an item up in Spotify's catalogue. found=false means Spotify really doesn't have it (two searches, strict
 * then loose). Throws when Spotify can't be asked (no login, rate limit) so callers can treat it as "unknown".
 * Searches are cached for a week.
 */
export async function spotifyMatch(kind: Kind, artist: string, title: string): Promise<SpotifyMatch> {
  type R = { tracks?: { items: SpTrack[] }; albums?: { items: SpAlbum[] }; artists?: { items: SpArtist[] } };
  const search = (query: string) => sp<R>(`/search?type=${kind}&limit=10&q=${encodeURIComponent(query)}`, 7 * 24 * 3600);
  const pick = (d: R): SpotifyMatch | undefined => {
    if (kind === "track") {
      const t = d.tracks?.items.find((x) => x && hasArtist(x.artists, artist) && sameTitle(x.name, title));
      return t && { found: true, url: t.external_urls.spotify, image: img(t.album.images), year: yr(t.album.release_date) };
    }
    if (kind === "album") {
      const a = d.albums?.items.find((x) => x && hasArtist(x.artists, artist) && sameTitle(x.name, title));
      return a && { found: true, url: a.external_urls.spotify, image: img(a.images), year: yr(a.release_date) };
    }
    const a = d.artists?.items.find((x) => x && norm(x.name) === norm(artist));
    return a && { found: true, url: a.external_urls.spotify, image: img(a.images) };
  };
  const field = kind === "artist" ? `artist:${q(artist)}` : `${kind}:${q(title)} artist:${q(artist)}`;
  const strict = pick(await search(field));
  if (strict) return strict;
  const loose = pick(await search(kind === "artist" ? q(artist) : `${q(title)} ${q(artist)}`));
  return loose ?? { found: false };
}
