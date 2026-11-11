import type { NextRequest } from "next/server";
import { clearImport, readImport, removeImported, runImport, ScopeError } from "@/lib/sources/spotifyImport";
import { SpotifyAuthError } from "@/lib/sources/spotifyUser";

// Your imported Spotify taste (top artists + tracks). GET reads it, POST (re-)imports, DELETE removes one (?key=) or all.

export async function GET() {
  return Response.json(readImport() ?? { importedAt: 0, items: [], removed: [] });
}

export async function POST() {
  try {
    return Response.json(await runImport());
  } catch (e) {
    const msg = (e as Error).message;
    if (e instanceof SpotifyAuthError) return Response.json({ error: msg, code: "login" }, { status: 401 });
    if (e instanceof ScopeError) return Response.json({ error: msg, code: "reconnect" }, { status: 403 });
    // api() turns Spotify 403s into an explanation of the Premium / app-owner rule.
    if (/\b403\b/.test(msg)) {
      if (/scope/i.test(msg)) {
        return Response.json({ error: "Spotify says this login can't read your top artists. Reconnect Spotify to grant it.", code: "reconnect" }, { status: 403 });
      }
      return Response.json({ error: msg, code: "forbidden" }, { status: 403 });
    }
    return Response.json({ error: `Couldn't import from Spotify: ${msg}`, code: "failed" }, { status: 502 });
  }
}

export async function DELETE(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (key) return Response.json(removeImported(key) ?? { importedAt: 0, items: [], removed: [] });
  clearImport();
  return Response.json({ importedAt: 0, items: [], removed: [] });
}
