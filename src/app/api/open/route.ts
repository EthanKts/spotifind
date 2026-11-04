import type { NextRequest } from "next/server";
import * as sp from "@/lib/sources/spotify";
import type { Kind } from "@/lib/types";

// "Open in Spotify": exact URL when Spotify keys are configured, otherwise Spotify's own search page.
// `?json=1` returns { url } instead of redirecting — the Mac app uses it to open the Spotify desktop app.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const kind = (q.get("kind") ?? "track") as Kind;
  const artist = q.get("artist") ?? "";
  const title = q.get("title") ?? artist;
  let url: string | undefined;
  if (sp.hasSpotify()) {
    try {
      url = await sp.findSpotifyUrl(kind, artist, title);
    } catch {}
  }
  if (!url) {
    const term = kind === "artist" ? artist : `${title} ${artist}`;
    url = `https://open.spotify.com/search/${encodeURIComponent(term)}`;
  }
  return q.get("json") === "1" ? Response.json({ url }) : Response.redirect(url, 302);
}
