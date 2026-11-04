import type { NextRequest } from "next/server";
import * as dz from "@/lib/sources/deezer";
import * as sp from "@/lib/sources/spotify";
import type { Item } from "@/lib/types";
import { norm, uniqueByKey } from "@/lib/util";

export interface SearchResponse {
  query: string;
  top?: Item;
  tracks: Item[];
  albums: Item[];
  artists: Item[];
  resolvedFrom?: "spotify-api" | "spotify-oembed";
  note?: string;
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!q) return Response.json({ query: q, tracks: [], albums: [], artists: [] } satisfies SearchResponse);

  try {
    // Pasted Spotify link?
    const link = sp.parseSpotifyLink(q);
    if (link) {
      if (sp.hasSpotify()) {
        const item = await sp.resolveSpotifyLink(link.kind, link.id);
        const rest = await searchAll(`${item.artist} ${item.kind === "artist" ? "" : item.title}`);
        return Response.json({ ...rest, query: q, top: item, resolvedFrom: "spotify-api" } satisfies SearchResponse);
      }
      // No keys: read the public page's title + artist, then find that exact item on Deezer.
      const info = await sp.publicLinkInfo(link.kind, link.id).catch(() => undefined);
      if (info) {
        const top =
          link.kind === "track"
            ? await dz.findTrack(info.artist, info.title).then((t) => (t ? dz.trackToItem(t) : undefined))
            : link.kind === "album"
              ? await dz.findAlbum(info.artist, info.title).then((a) => (a ? dz.albumToItem(a) : undefined))
              : await dz.findArtist(info.artist).then((a) => (a ? dz.artistToItem(a) : undefined));
        const rest = await searchAll(link.kind === "artist" ? info.artist : `${info.artist} ${info.title}`);
        return Response.json({
          ...rest,
          query: q,
          top: top ?? rest.top,
          resolvedFrom: "spotify-oembed",
          note: top
            ? `Spotify link → ${info.title}${link.kind !== "artist" ? ` by ${info.artist}` : ""}.`
            : `Read “${info.title}” from the Spotify link but couldn't find an exact match — showing closest results.`,
        } satisfies SearchResponse);
      }
      const title = await sp.oembedTitle(q.startsWith("spotify:") ? `https://open.spotify.com/${link.kind}/${link.id}` : q);
      if (!title) return Response.json({ query: q, tracks: [], albums: [], artists: [], note: "Couldn't read that Spotify link." });
      const rest = await searchAll(sp.cleanTitle(title));
      return Response.json({
        ...rest,
        query: q,
        resolvedFrom: "spotify-oembed",
        note: `Spotify link matched by title only (“${title}”). Add Spotify API keys for exact link matching.`,
      } satisfies SearchResponse);
    }
    return Response.json(await searchAll(q));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}

async function searchAll(q: string): Promise<SearchResponse> {
  const [tracks, albums, artists] = await Promise.all([
    dz.searchTracks(q, 12).catch(() => []),
    dz.searchAlbums(q, 10).catch(() => []),
    dz.searchArtists(q, 8).catch(() => []),
  ]);
  const tItems = uniqueByKey(tracks.map(dz.trackToItem));
  const alItems = uniqueByKey(albums.map((a) => dz.albumToItem(a)));
  const arItems = uniqueByKey(artists.map(dz.artistToItem));
  const nq = norm(q);
  const top =
    arItems.find((a) => norm(a.title) === nq) ??
    alItems.find((a) => norm(a.title) === nq) ??
    tItems.find((t) => norm(t.title) === nq) ??
    tItems[0] ??
    arItems[0];
  return { query: q, top, tracks: tItems, albums: alItems, artists: arItems };
}
