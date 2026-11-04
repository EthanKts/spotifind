import type { NextRequest } from "next/server";
import * as lf from "@/lib/sources/lastfm";

// Tag vector for one item — used to update the taste profile when you like/save/rate something.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const kind = sp.get("kind");
  const artist = sp.get("artist") ?? "";
  const title = sp.get("title") ?? artist;
  if (!lf.hasLastfm()) return Response.json({ tags: {} });
  try {
    let tags = kind === "track" ? await lf.trackTags(artist, title) : kind === "album" ? await lf.albumTags(artist, title) : {};
    if (Object.keys(tags).length < 3) tags = await lf.artistTags(artist);
    return Response.json({ tags });
  } catch {
    return Response.json({ tags: {} });
  }
}
