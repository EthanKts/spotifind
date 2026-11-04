import type { NextRequest } from "next/server";
import { clientId, connectedUser, redirectUriFor } from "@/lib/sources/spotifyUser";

export interface SpotifyStatus {
  configured: boolean;
  connected: boolean;
  user?: { id: string; display_name?: string; product?: string };
  /** The exact Redirect URI to register in the Spotify developer dashboard. */
  redirectUri: string;
}

export async function GET(req: NextRequest) {
  const user = connectedUser();
  return Response.json({
    configured: !!clientId(),
    connected: !!user,
    user,
    redirectUri: redirectUriFor(req.url),
  } satisfies SpotifyStatus);
}
