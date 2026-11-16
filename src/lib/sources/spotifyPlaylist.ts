import "server-only";
import { peekCache, storeCache } from "./http";
import { cleanTitle, spotifyBlockedUntil } from "./spotify";
import { api, connectedUser } from "./spotifyUser";

// Read the songs of any public Spotify playlist from a pasted link.
//
// Since Spotify's February 2026 Web API changes, development-mode apps only get the songs of playlists you own or
// collaborate on (other playlists return metadata only). The public embed player page has every public playlist's
// first 100 songs, needs no login and doesn't touch the app's small API quota, so that comes first. Longer playlists
// that are yours are completed through the API; otherwise the first 100 songs are used.

export interface SourceTrack {
  title: string;
  artist: string;
  uri?: string;
  durationSec?: number;
}

export interface SourcePlaylist {
  id: string;
  name: string;
  owner?: string;
  image?: string;
  tracks: SourceTrack[];
  /** Songs in the playlist on Spotify (may be more than tracks.length). */
  total: number;
  /** True when only part of the playlist could be read. */
  truncated: boolean;
}

export class PlaylistLinkError extends Error {
  constructor(message: string, public status: 400 | 404 | 502) {
    super(message);
  }
}

/** Playlist id from https://open.spotify.com/(intl-xx/)playlist/ID?si=…, spotify:playlist:ID or the bare id. */
export function parsePlaylistId(input: string): string {
  const s = input.trim();
  const m = s.match(/(?:open\.spotify\.com\/(?:intl-[a-z-]+\/)?(?:embed\/)?playlist\/|spotify:playlist:)([A-Za-z0-9]{22})/) ?? s.match(/^([A-Za-z0-9]{22})$/);
  if (!m) {
    if (/spotify\.(com|link)|spotify:/.test(s) && !/playlist/.test(s))
      throw new PlaylistLinkError("That's a Spotify link, but not to a playlist. Copy the playlist's link (Share → Copy link to playlist).", 400);
    if (/spotify\.link\//.test(s)) throw new PlaylistLinkError("Short spotify.link links aren't supported. Open it, then copy the open.spotify.com link.", 400);
    throw new PlaylistLinkError("Paste a Spotify playlist link, like https://open.spotify.com/playlist/…", 400);
  }
  return m[1];
}

// A full browser user agent gets the JavaScript app without the song-count meta tags; this one gets the server page.
const UA = "Mozilla/5.0";

async function page(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en" }, cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new PlaylistLinkError(`Spotify responded ${res.status} for this playlist.`, res.status === 404 ? 404 : 502);
  return res.text();
}

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"');

interface EmbedEntity {
  name?: string;
  title?: string;
  subtitle?: string;
  coverArt?: { sources?: { url: string; width?: number | null }[] };
  trackList?: { uri?: string; title?: string; subtitle?: string; duration?: number }[];
}

/** First artist of "Artist A, Artist B" (the embed separates artists with ", " and non-breaking spaces). */
const firstArtist = (s: string) => s.replace(/ /g, " ").split(/,\s+/)[0].trim();

async function fromEmbed(id: string): Promise<SourcePlaylist> {
  const html = await page(`https://open.spotify.com/embed/playlist/${id}`);
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new PlaylistLinkError("Spotify changed its player page, so this playlist couldn't be read.", 502);
  let entity: EmbedEntity | undefined;
  try {
    entity = JSON.parse(m[1])?.props?.pageProps?.state?.data?.entity;
  } catch {
    throw new PlaylistLinkError("Spotify changed its player page, so this playlist couldn't be read.", 502);
  }
  if (!entity) throw new PlaylistLinkError("This playlist is private or doesn't exist. Only public playlists can be read from a link.", 404);
  const tracks = (entity.trackList ?? [])
    .filter((t) => t.title && t.subtitle && t.uri?.startsWith("spotify:track:")) // skips podcast episodes and local files
    .map((t) => ({ title: cleanTitle(t.title!), artist: firstArtist(t.subtitle!), uri: t.uri, durationSec: t.duration ? Math.round(t.duration / 1000) : undefined }));
  const images = entity.coverArt?.sources ?? [];
  return {
    id,
    name: entity.name ?? entity.title ?? "Spotify playlist",
    owner: entity.subtitle || undefined,
    image: images[0]?.url,
    tracks,
    total: entity.trackList?.length ?? tracks.length,
    truncated: false,
  };
}

/** The real song count, from the public playlist page (the embed stops at 100). */
async function songCount(id: string): Promise<number | undefined> {
  try {
    const html = await page(`https://open.spotify.com/playlist/${id}`);
    const m = html.match(/<meta name="music:song_count" content="(\d+)"/);
    return m ? Number(decode(m[1])) : undefined;
  } catch {
    return undefined;
  }
}

interface ApiItem {
  item?: { type?: string; uri?: string; name?: string; duration_ms?: number; artists?: { name: string }[] } | null;
  track?: ApiItem["item"];
}

/** All songs through your login: only works for playlists you own or collaborate on. */
async function fromApi(id: string, total: number): Promise<SourceTrack[]> {
  const out: SourceTrack[] = [];
  for (let offset = 0; offset < Math.min(total, 1000); offset += 50) {
    const page = await api<{ items: ApiItem[]; next?: string | null }>(`/playlists/${id}/items?limit=50&offset=${offset}`);
    for (const it of page.items ?? []) {
      const t = it.item ?? it.track;
      if (!t || (t.type && t.type !== "track") || !t.name || !t.artists?.length) continue;
      out.push({ title: cleanTitle(t.name), artist: t.artists[0].name, uri: t.uri, durationSec: t.duration_ms ? Math.round(t.duration_ms / 1000) : undefined });
    }
    if (!page.next) break;
  }
  return out;
}

export async function readPlaylist(input: string): Promise<SourcePlaylist> {
  const id = parsePlaylistId(input);
  const key = `spl1:${id}`;
  const hit = peekCache<SourcePlaylist>(key);
  if (hit) return hit;

  const pl = await fromEmbed(id);
  if (!pl.tracks.length) throw new PlaylistLinkError("This playlist has no songs that can be read.", 404);
  if (pl.total >= 100) {
    const total = await songCount(id);
    if (total && total > pl.tracks.length) {
      pl.total = total;
      pl.truncated = true;
      // Yours (or collaborative)? The API has the rest. Anyone else's: the first 100 songs are used.
      if (connectedUser() && !spotifyBlockedUntil()) {
        try {
          const all = await fromApi(id, total);
          if (all.length > pl.tracks.length) {
            pl.tracks = all;
            pl.truncated = all.length < total;
          }
        } catch {}
      }
    }
  }
  storeCache(key, pl, 3600);
  return pl;
}
