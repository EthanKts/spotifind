import type { NextRequest } from "next/server";
import { clientId, connectedUser, grantedScopes, redirectUriFor, TOP_READ_SCOPE, usingSharedClient } from "@/lib/sources/spotifyUser";
import { sharedBy } from "@/lib/sources/config";

export interface SpotifyStatus {
  configured: boolean;
  connected: boolean;
  user?: { id: string; display_name?: string; product?: string };
  /** The login includes user-top-read (needed to import your taste). Older logins need a reconnect. */
  canImport: boolean;
  /** Using the Spotify app built into a shared copy: friends log in with one click, no developer setup. */
  shared: boolean;
  /** Who shared this copy, for "ask Ethan to add you". */
  sharedBy?: string;
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
    shared: usingSharedClient(),
    sharedBy: sharedBy(),
    redirectUri: redirectUriFor(req.url),
  } satisfies SpotifyStatus);
}
