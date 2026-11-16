import type { NextRequest } from "next/server";
import { PlaylistLinkError, readPlaylist } from "@/lib/sources/spotifyPlaylist";

// The songs of a public Spotify playlist, from a pasted link: GET ?url=https://open.spotify.com/playlist/…

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url") ?? "";
  try {
    return Response.json(await readPlaylist(url));
  } catch (e) {
    if (e instanceof PlaylistLinkError) return Response.json({ error: e.message }, { status: e.status });
    return Response.json({ error: `Couldn't read this playlist: ${(e as Error).message}` }, { status: 502 });
  }
}
