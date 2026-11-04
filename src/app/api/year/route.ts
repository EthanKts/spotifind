import type { NextRequest } from "next/server";
import * as mb from "@/lib/sources/musicbrainz";

// Original release year from MusicBrainz (rate-limited to 1 req/s server-side, cached for a week).
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const kind = sp.get("kind");
  const artist = sp.get("artist") ?? "";
  const title = sp.get("title") ?? "";
  try {
    if (kind === "album") {
      const rg = await mb.findReleaseGroup(artist, title);
      return Response.json({ year: rg?.year ?? null, mbid: rg?.id ?? null });
    }
    if (kind === "track") return Response.json({ year: (await mb.recordingYear(artist, title)) ?? null });
    return Response.json({ year: null });
  } catch (e) {
    console.error("[year]", kind, artist, title, (e as Error).message);
    return Response.json({ year: null, error: true });
  }
}
