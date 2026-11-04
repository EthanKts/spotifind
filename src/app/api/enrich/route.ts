import * as dz from "@/lib/sources/deezer";
import { mapLimit } from "@/lib/sources/http";
import type { Enrichment, Kind } from "@/lib/types";
import { itemKey } from "@/lib/util";

// Artwork, Deezer id and preview availability for a batch of items (Deezer, no key needed).

type In = { kind: Kind; artist: string; title: string };

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { items?: In[] };
  const items = (body.items ?? []).slice(0, 40);
  const results = await mapLimit(items, 6, async (it): Promise<[string, Enrichment]> => {
    const key = itemKey(it.kind, it.artist, it.title);
    if (it.kind === "track") {
      const t = await dz.findTrack(it.artist, it.title);
      if (!t) return [key, {}];
      return [key, {
        image: t.album?.cover_xl ?? t.album?.cover_big,
        deezerId: t.id,
        hasPreview: !!t.preview,
        album: t.album?.title,
        durationSec: t.duration,
      }];
    }
    if (it.kind === "album") {
      const a = await dz.findAlbum(it.artist, it.title);
      return [key, a ? { image: a.cover_xl ?? a.cover_big, deezerId: a.id } : {}];
    }
    const a = await dz.findArtist(it.artist);
    return [key, a ? { image: a.picture_xl ?? a.picture_big, deezerId: a.id } : {}];
  });
  const out: Record<string, Enrichment> = {};
  for (const r of results) if (r) out[r[0]] = r[1];
  return Response.json(out);
}
