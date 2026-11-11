import type { NextRequest } from "next/server";
import { clientId, connectedUser, grantedScopes, redirectUriFor, TOP_READ_SCOPE } from "@/lib/sources/spotifyUser";

export interface SpotifyStatus {
  configured: boolean;
  connected: boolean;
  user?: { id: string; display_name?: string; product?: string };
  /** The login includes user-top-read (needed to import your taste). Older logins need a reconnect. */
  canImport: boolean;
  /** The exact Redirect URI to register in the Spotify developer dashboard. */
  redirectUri: string;
}

export async function GET(req: NextRequest) {
  const user = connectedUser();
  return Response.json({
    configured: !!clientId(),
    connected: !!user,
    user,
    canImport: !!user && grantedScopes().includes(TOP_READ_SCOPE),
    redirectUri: redirectUriFor(req.url),
  } satisfies SpotifyStatus);
}
