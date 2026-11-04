import { setConfigValue } from "@/lib/sources/config";

// First-launch setup: check a Last.fm API key with Last.fm itself, then save it to config.env.
export async function POST(req: Request) {
  const { key } = (await req.json().catch(() => ({}))) as { key?: string };
  const k = key?.trim() ?? "";
  if (!/^[0-9a-f]{32}$/i.test(k)) {
    return Response.json({ error: "A Last.fm API key is 32 letters and numbers — copy the one labelled “API key” (not the shared secret)." }, { status: 400 });
  }
  try {
    const res = await fetch(
      `https://ws.audioscrobbler.com/2.0/?method=artist.getInfo&artist=Radiohead&format=json&api_key=${encodeURIComponent(k)}`,
      { cache: "no-store", signal: AbortSignal.timeout(10_000) },
    );
    const j = (await res.json()) as { error?: number; message?: string; artist?: unknown };
    if (j.error === 10 || j.error === 26) {
      return Response.json({ error: "Last.fm doesn't recognise that key. Check you copied the “API key” exactly." }, { status: 400 });
    }
    if (!j.artist) return Response.json({ error: `Last.fm couldn't confirm the key right now (${j.message ?? res.status}). Try again in a moment.` }, { status: 502 });
  } catch {
    return Response.json({ error: "Couldn't reach Last.fm to check the key. Are you online?" }, { status: 502 });
  }
  setConfigValue("LASTFM_API_KEY", k);
  return Response.json({ ok: true });
}
