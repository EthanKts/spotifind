import * as dz from "@/lib/sources/deezer";
import * as sp from "@/lib/sources/spotify";
import { mapLimit } from "@/lib/sources/http";
import type { Enrichment, Kind } from "@/lib/types";
import { itemKey } from "@/lib/util";

// Artwork, previews and availability for a batch of items.
//   Deezer  → preview + Deezer id (no key needed)
//   Spotify → is it really on Spotify, and its cover (needs your Spotify login or an app secret)
// Spotify's artwork wins: it's the cover you'll see when you open the item there. Deezer's is the fallback.

type In = { kind: Kind; artist: string; title: string };

async function spotify(it: In): Promise<sp.SpotifyMatch | undefined> {
  if (!sp.hasSpotify()) return undefined;
  try {
    return await sp.spotifyMatch(it.kind, it.artist, it.title);
  } catch {
    return undefined; // rate-limited / offline: unknown, never "missing"
  }
}

async function deezer(it: In): Promise<Enrichment> {
  try {
    if (it.kind === "track") {
      const t = await dz.findTrack(it.artist, it.title);
      return t
        ? { image: dz.realImage(t.album?.cover_xl ?? t.album?.cover_big), deezerId: t.id, hasPreview: !!t.preview, album: t.album?.title, durationSec: t.duration }
        : { hasPreview: false };
    }
    if (it.kind === "album") {
      const a = await dz.findAlbum(it.artist, it.title);
      return a ? { image: dz.realImage(a.cover_xl ?? a.cover_big), deezerId: a.id } : {};
    }
    const a = await dz.findArtist(it.artist);
    return a ? { image: dz.realImage(a.picture_xl ?? a.picture_big), deezerId: a.id } : {};
  } catch {
    return {};
  }
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { items?: In[] };
  const items = (body.items ?? []).slice(0, 40);
  const results = await mapLimit(items, 6, async (it): Promise<[string, Enrichment]> => {
    const key = itemKey(it.kind, it.artist, it.title);
    // Artists: Deezer photos are good and plentiful; Spotify is only asked when Deezer has none.
    const [d, s] = await Promise.all([deezer(it), it.kind === "artist" ? Promise.resolve(undefined) : spotify(it)]);
    const s2 = it.kind === "artist" && !d.image ? await spotify(it) : s;
    return [
      key,
      {
        ...d,
        image: (it.kind !== "artist" && s2?.image) || d.image || s2?.image,
        onSpotify: s2?.found,
        spotifyUrl: s2?.url,
      },
    ];
  });
  const out: Record<string, Enrichment> = {};
  for (const r of results) if (r) out[r[0]] = r[1];
  return Response.json(out);
}
