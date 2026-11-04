import { setClientId } from "@/lib/sources/spotifyUser";

// Save your Spotify app's Client ID (from developer.spotify.com/dashboard). It's a public identifier, not a secret.
export async function POST(req: Request) {
  const { clientId } = (await req.json().catch(() => ({}))) as { clientId?: string };
  const id = clientId?.trim() ?? "";
  if (!/^[0-9a-f]{32}$/i.test(id)) {
    return Response.json({ error: "That doesn't look like a Spotify Client ID (32 letters and numbers)." }, { status: 400 });
  }
  setClientId(id);
  return Response.json({ ok: true });
}
