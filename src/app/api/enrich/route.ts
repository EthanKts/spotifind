import * as dz from "@/lib/sources/deezer";
import * as sp from "@/lib/sources/spotify";
import * as lf from "@/lib/sources/lastfm";
import { mapLimit } from "@/lib/sources/http";
import type { Enrichment, Kind } from "@/lib/types";
import { itemKey } from "@/lib/util";

// Artwork, previews and availability for a batch of items.
//
//   1. Deezer (no key, generous limits): an exact artist + title match gives the cover, the preview and
//      tells us the release is in the streaming catalogues.
//   2. Spotify, only for what Deezer can't find: confirms it exists on Spotify and supplies the cover.
//      Spotify's quota for personal apps is small, so it is asked sparingly and cached for a week.
//
// Items no catalogue recognises (Last.fm compilations, "[Enhanced]" re-uploads…) are marked noMatch,
// and recommendations leave them out rather than showing a blank cover.

type In = { kind: Kind; artist: string; title: string };
type DzResult = Enrichment & { found: boolean; failed?: boolean };

async function deezer(it: In): Promise<DzResult> {
  try {
    if (it.kind === "track") {
      const t = await dz.findTrack(it.artist, it.title);
      return t
        ? { found: true, image: dz.realImage(t.album?.cover_xl ?? t.album?.cover_big), deezerId: t.id, hasPreview: !!t.preview, album: t.album?.title, durationSec: t.duration }
        : { found: false, hasPreview: false };
    }
    if (it.kind === "album") {
      const a = await dz.findAlbum(it.artist, it.title);
      return a ? { found: true, image: dz.realImage(a.cover_xl ?? a.cover_big), deezerId: a.id } : { found: false };
    }
    const a = await dz.findArtist(it.artist);
    return a ? { found: true, image: dz.realImage(a.picture_xl ?? a.picture_big), deezerId: a.id } : { found: false };
  } catch {
    return { found: false, failed: true };
  }
}

/** undefined: Spotify can't be asked (no login, or its quota is used up). "failed": a transient error. */
async function spotify(it: In): Promise<sp.SpotifyMatch | undefined | "failed"> {
  if (!sp.hasSpotify() || sp.spotifyBlockedUntil()) return undefined;
  try {
    return await sp.spotifyMatch(it.kind, it.artist, it.title);
  } catch {
    return sp.spotifyBlockedUntil() ? undefined : "failed";
  }
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { items?: In[] };
  const items = (body.items ?? []).slice(0, 40);
  const results = await mapLimit(items, 6, async (it): Promise<[string, Enrichment]> => {
    const key = itemKey(it.kind, it.artist, it.title);
    const { found, failed, ...d } = await deezer(it);
    // Spotify only when Deezer has no match (or, for an artist, no photo).
    const s = !found || !d.image ? await spotify(it) : undefined;
    const sm = s === "failed" ? undefined : s;
    let image = d.image ?? sm?.image;
    // Songs neither catalogue has (or Spotify can't be asked right now): Last.fm knows their album's cover.
    if (!image && it.kind === "track" && lf.hasLastfm()) {
      image = await lf.trackInfo(it.artist, it.title).then((t) => t.image).catch(() => undefined);
    }
    return [
      key,
      {
        ...d,
        image,
        onSpotify: sm ? sm.found : undefined,
        spotifyUrl: sm?.url,
        noMatch: !found && !sm?.found && !failed && s !== "failed" ? true : undefined,
        incomplete: (failed || s === "failed") && !image ? true : undefined,
      },
    ];
  });
  const out: Record<string, Enrichment> = {};
  for (const r of results) if (r) out[r[0]] = r[1];
  return Response.json(out);
}
