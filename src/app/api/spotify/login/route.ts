import type { NextRequest } from "next/server";
import { authorizeUrl } from "@/lib/sources/spotifyUser";

// Starts the Spotify login. The Mac app opens this in your default browser (where you're signed in to Spotify).
export async function GET(req: NextRequest) {
  const ret = req.nextUrl.searchParams.get("return") ?? "/playlists";
  const returnTo = ret.startsWith("/") && !ret.startsWith("//") ? ret : "/playlists";
  try {
    return Response.redirect(authorizeUrl(req.url, returnTo), 302);
  } catch (e) {
    return new Response((e as Error).message, { status: 400 });
  }
}
