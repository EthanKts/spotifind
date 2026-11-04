import type { NextRequest } from "next/server";
import * as lf from "@/lib/sources/lastfm";
import * as dz from "@/lib/sources/deezer";
import { mapLimit } from "@/lib/sources/http";
import type { Item } from "@/lib/types";
import { itemKey, uniqueByKey } from "@/lib/util";

// Genre starter shelves for a new profile: Last.fm top artists/albums for a tag (Deezer charts as fallback).
export async function GET(req: NextRequest) {
  const tag = req.nextUrl.searchParams.get("tag")?.trim();
  if (!tag) return Response.json({ artists: [], albums: [] });
  try {
    if (lf.hasLastfm()) {
      const [artists, albums] = await Promise.all([lf.tagTopArtists(tag, 12), lf.tagTopAlbums(tag, 12)]);
      const art: Item[] = artists.map((a) => ({ kind: "artist", key: itemKey("artist", a.name, a.name), title: a.name, artist: a.name, mbid: a.mbid }));
      const pics = await mapLimit(art, 6, (a) => dz.findArtist(a.artist));
      art.forEach((a, i) => (a.image = pics[i]?.picture_xl));
      const alb: Item[] = albums.map((a) => ({ kind: "album", key: itemKey("album", a.artist, a.name), title: a.name, artist: a.artist, image: a.image, mbid: a.mbid }));
      return Response.json({ artists: uniqueByKey(art), albums: uniqueByKey(alb) });
    }
    const artists = await dz.searchArtists(tag, 12);
    return Response.json({ artists: uniqueByKey(artists.map(dz.artistToItem)), albums: [] });
  } catch (e) {
    return Response.json({ artists: [], albums: [], error: (e as Error).message });
  }
}
