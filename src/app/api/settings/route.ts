import { configValue, readConfigFile, setConfigValue, sharedValue } from "@/lib/sources/config";

// Settings: where each key comes from (never the value itself), and saving your own keys to config.env.

type Source = "own" | "built-in" | "missing";
const KEYS = ["LASTFM_API_KEY", "DISCOGS_TOKEN"] as const;
type KeyName = (typeof KEYS)[number];

function source(key: KeyName): Source {
  if (process.env[key] || readConfigFile()[key]) return "own";
  if (sharedValue(key)) return "built-in";
  return "missing";
}

export interface SettingsStatus {
  keys: Record<KeyName, Source>;
}

export async function GET() {
  return Response.json({ keys: { LASTFM_API_KEY: source("LASTFM_API_KEY"), DISCOGS_TOKEN: source("DISCOGS_TOKEN") } } satisfies SettingsStatus);
}

const UA = "Spotifind/1.0 (+https://github.com/EthanKts/spotifind)";

async function check(name: KeyName, value: string): Promise<string | null> {
  try {
    if (name === "LASTFM_API_KEY") {
      if (!/^[0-9a-f]{32}$/i.test(value)) return "A Last.fm API key is 32 letters and numbers.";
      const r = await fetch(`https://ws.audioscrobbler.com/2.0/?method=artist.getInfo&artist=Radiohead&format=json&api_key=${encodeURIComponent(value)}`, { signal: AbortSignal.timeout(10_000) });
      const j = (await r.json()) as { error?: number };
      return j.error === 10 || j.error === 26 ? "Last.fm doesn't recognise that key." : null;
    }
    const r = await fetch("https://api.discogs.com/oauth/identity", { headers: { Authorization: `Discogs token=${value}`, "User-Agent": UA }, signal: AbortSignal.timeout(10_000) });
    return r.status === 401 ? "Discogs doesn't accept that token. Copy it again from discogs.com/settings/developers." : null;
  } catch {
    return null; // offline: save anyway, it's checked when used
  }
}

export async function POST(req: Request) {
  const { name, value } = (await req.json().catch(() => ({}))) as { name?: string; value?: string };
  if (!KEYS.includes(name as KeyName)) return Response.json({ error: "Unknown setting" }, { status: 400 });
  const v = (value ?? "").trim();
  if (v) {
    const problem = await check(name as KeyName, v);
    if (problem) return Response.json({ error: problem }, { status: 400 });
  }
  setConfigValue(name as KeyName, v); // empty = back to the built-in key (if any)
  return Response.json({ ok: true, source: v ? "own" : sharedValue(name as KeyName) ? "built-in" : "missing", configured: !!configValue(name as KeyName) });
}
