import type { NextRequest } from "next/server";
import * as lf from "@/lib/sources/lastfm";
import * as dz from "@/lib/sources/deezer";
import * as mb from "@/lib/sources/musicbrainz";
import { within } from "@/lib/sources/http";
import type { AlbumDetail, AlbumTrack } from "@/lib/types";
import { itemKey, norm } from "@/lib/util";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const artist = sp.get("artist")?.trim() ?? "";
  const title = sp.get("title")?.trim() ?? "";
  if (!artist || !title) return Response.json({ error: "artist and title required" }, { status: 400 });

  const sources = new Set<string>();
  const hasLf = lf.hasLastfm();
  // Everything in parallel. MusicBrainz (1 req/s, shared with release-year lookups) may be busy, so it gets
  // a short head start only; the page shows without the year and the client fills it in from /api/year.
  const [info, counted, dzFull, artistTop, rg] = await Promise.all([
    hasLf ? lf.albumInfo(artist, title).catch(() => undefined) : undefined,
    hasLf ? lf.albumTags(artist, title).catch(() => ({})) : ({} as Record<string, number>),
    dz.findAlbum(artist, title).then((a) => (a ? dz.album(a.id) : undefined)).catch(() => undefined),
    // One request gives play counts for the artist's 200 most-played songs — replaces a request per track.
    hasLf ? lf.artistTopTracks(artist, 200).catch(() => []) : [],
    within(mb.findReleaseGroup(artist, title).catch(() => undefined), 1200, undefined),
  ]);
  if (info) sources.add("Last.fm");
  if (dzFull) sources.add("Deezer");
  if (rg) sources.add("MusicBrainz");

  const realArtist = info?.artist ?? dzFull?.artist?.name ?? artist;
  const realTitle = info?.name ?? dzFull?.title ?? title;

  // Tracklist: Deezer (has previews + durations), else Last.fm.
  const dzTracks = dzFull?.tracks?.data ?? [];
  type BaseTrack = { title: string; artist: string; position: number; durationSec?: number; deezerId?: number; hasPreview: boolean };
  const base: BaseTrack[] = dzTracks.length
    ? dzTracks.map((t, i) => ({ title: t.title, artist: t.artist?.name ?? realArtist, position: i + 1, durationSec: t.duration, deezerId: t.id, hasPreview: !!t.preview }))
    : (info?.tracks ?? []).map((t) => ({ title: t.name, artist: realArtist, position: t.rank, durationSec: t.durationSec, deezerId: undefined, hasPreview: false }));

  const tags = Object.keys(counted).length >= 3 ? counted : (info?.tags ?? {});
  const plays = new Map(artistTop.map((t) => [norm(t.name), t]));

  // Last.fm has no tags for most individual songs, so tracks carry the album's tags.
  const tracks: AlbumTrack[] = base.map((t) => {
    const s = plays.get(norm(t.title));
    return {
      key: itemKey("track", t.artist, t.title),
      title: t.title,
      artist: t.artist,
      position: t.position,
      durationSec: t.durationSec,
      deezerId: t.deezerId,
      hasPreview: t.hasPreview,
      playcount: s?.playcount,
      listeners: s?.listeners,
      tags,
    };
  });

  const image = dzFull?.cover_xl ?? info?.image ?? (rg ? mb.coverArtUrl(rg.id, 1200) : undefined);
  const detail: AlbumDetail = {
    item: {
      kind: "album",
      key: itemKey("album", realArtist, realTitle),
      title: realTitle,
      artist: realArtist,
      year: rg?.year,
      image,
      listeners: info?.listeners,
      playcount: info?.playcount,
      mbid: rg?.id,
      deezerId: dzFull?.id,
    },
    tags,
    tracks,
    wiki: info?.wiki,
    sources: [...sources],
  };
  if (!tracks.length && !info && !dzFull) return Response.json({ error: "Album not found" }, { status: 404 });
  detail.tracks.sort((a, b) => a.position - b.position);
  return Response.json(detail);
}
