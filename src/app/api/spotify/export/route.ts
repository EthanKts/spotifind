import { exportPlaylist, SpotifyAuthError } from "@/lib/sources/spotifyUser";

// Create (or update) a playlist in your Spotify account from a Spotifind playlist.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    description?: string;
    isPublic?: boolean;
    tracks?: { artist: string; title: string }[];
    existingId?: string;
  };
  const tracks = (body.tracks ?? []).filter((t) => t?.artist && t?.title).slice(0, 100);
  if (!body.name || !tracks.length) return Response.json({ error: "Nothing to export" }, { status: 400 });
  try {
    const res = await exportPlaylist({
      name: body.name.slice(0, 100),
      // Spotify descriptions are single-line, max 300 characters.
      description: (body.description ?? "").replace(/\s+/g, " ").slice(0, 300),
      isPublic: !!body.isPublic,
      tracks,
      existingId: body.existingId,
    });
    return Response.json(res);
  } catch (e) {
    const auth = e instanceof SpotifyAuthError;
    return Response.json({ error: (e as Error).message, needsLogin: auth }, { status: auth ? 401 : 502 });
  }
}
