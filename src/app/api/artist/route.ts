import type { NextRequest } from "next/server";
import * as lf from "@/lib/sources/lastfm";
import * as dz from "@/lib/sources/deezer";
import * as mb from "@/lib/sources/musicbrainz";
import { mapLimit, within } from "@/lib/sources/http";
import type { ArtistDetail, Item, TagVector } from "@/lib/types";
import { itemKey, norm, uniqueByKey } from "@/lib/util";

export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get("name")?.trim() ?? "";
  if (!name) return Response.json({ error: "name required" }, { status: 400 });
  const sources = new Set<string>();
  const hasLf = lf.hasLastfm();

  // One parallel wave: Last.fm, Deezer and MusicBrainz chains all start at once.
  const infoP = hasLf ? lf.artistInfo(name).catch(() => undefined) : Promise.resolve(undefined);
  const topP = hasLf ? lf.artistTopTracks(name, 20).catch(() => []) : Promise.resolve([]);
  const dzArtistP = dz.findArtist(name).catch(() => undefined);
  // MusicBrainz (1 req/s, shared with release-year lookups) only gets 2 s; Deezer's album list is the fallback.
  const studioP = within(
    infoP.then(async (i) => {
      const id = i?.mbid ?? (await mb.findArtistMbid(i?.name ?? name).catch(() => undefined));
      return { mbid: id, albums: id ? await mb.studioAlbums(id).catch(() => []) : [] };
    }),
    1500,
    { mbid: undefined as string | undefined, albums: [] as { id: string; title: string; year?: number }[] },
  );
  const [info, top, topAlbums, similar, dzArtist, studioRes, tagList, dzExtra] = await Promise.all([
    infoP,
    topP,
    hasLf ? lf.artistTopAlbums(name, 30).catch(() => []) : [],
    hasLf ? lf.similarArtists(name, 20).catch(() => []) : [],
    dzArtistP,
    studioP,
    topP.then((t) => (hasLf ? mapLimit(t.slice(0, 12), 8, (x) => lf.trackTags(x.artist, x.name)) : [])),
    dzArtistP.then(
      (a): Promise<[dz.DzAlbum[], dz.DzTrack[], dz.DzArtist[]]> =>
        a
          ? Promise.all([
              dz.artistAlbums(a.id, 100).catch(() => []),
              !hasLf ? dz.artistTop(a.id, 15).catch(() => []) : Promise.resolve([]),
              !hasLf ? dz.relatedArtists(a.id, 20).catch(() => []) : Promise.resolve([]),
            ])
          : Promise.resolve([[], [], []]),
    ),
  ]);
  const [dzAlbums, dzTop, dzRelated] = dzExtra;
  const studio = studioRes.albums;
  const mbid = studioRes.mbid ?? info?.mbid;
  if (info) sources.add("Last.fm");
  if (dzArtist) sources.add("Deezer");
  if (studio.length) sources.add("MusicBrainz");
  const realName = info?.name ?? dzArtist?.name ?? name;

  // Discography: MusicBrainz studio albums (original years), with Deezer/Last.fm covers where titles match.
  const coverByTitle = new Map<string, string>();
  for (const a of dzAlbums) if (a.cover_xl) coverByTitle.set(norm(a.title), a.cover_xl);
  for (const a of topAlbums) if (a.image && !coverByTitle.has(norm(a.name))) coverByTitle.set(norm(a.name), a.image);
  let albums: Item[] = studio.map((a) => ({
    kind: "album", key: itemKey("album", realName, a.title), title: a.title, artist: realName, year: a.year, mbid: a.id,
    image: coverByTitle.get(norm(a.title)) ?? mb.coverArtUrl(a.id, 500),
  }));
  if (!albums.length) {
    albums = dzAlbums.filter((a) => a.record_type === "album").map((a) => dz.albumToItem(a, realName));
    if (!albums.length) albums = topAlbums.map((a) => ({ kind: "album", key: itemKey("album", a.artist, a.name), title: a.name, artist: a.artist, image: a.image, playcount: a.playcount }));
  }
  // Popularity of each album on Last.fm, for "most relevant" ordering.
  const playsByTitle = new Map(topAlbums.map((a) => [norm(a.name), a.playcount]));
  for (const a of albums) a.playcount ??= playsByTitle.get(norm(a.title));

  // Top tracks with their own tags (for taste matching on the client).
  let topTracks: (Item & { tags: TagVector })[];
  if (hasLf) {
    topTracks = top.map((t, i) => ({
      kind: "track", key: itemKey("track", t.artist, t.name), title: t.name, artist: t.artist,
      playcount: t.playcount, listeners: t.listeners, tags: tagList[i] ?? {},
    }));
  } else {
    topTracks = dzTop.map((t) => ({ ...dz.trackToItem(t), tags: {} }));
  }

  const related = hasLf
    ? similar.map((a) => ({ kind: "artist" as const, key: itemKey("artist", a.name, a.name), title: a.name, artist: a.name, match: a.match }))
    : dzRelated.map((a) => ({ ...dz.artistToItem(a), match: undefined }));

  if (!info && !dzArtist) return Response.json({ error: "Artist not found" }, { status: 404 });

  const detail: ArtistDetail = {
    item: {
      kind: "artist", key: itemKey("artist", realName, realName), title: realName, artist: realName,
      image: dzArtist?.picture_xl, listeners: info?.listeners, playcount: info?.playcount, mbid, deezerId: dzArtist?.id,
    },
    tags: info?.tags ?? {},
    bio: info?.bio,
    topTracks: uniqueByKey(topTracks),
    albums: uniqueByKey(albums),
    related: uniqueByKey<Item & { match?: number }>(related),
    sources: [...sources],
  };
  return Response.json(detail);
}
