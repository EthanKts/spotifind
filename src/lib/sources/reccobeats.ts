import "server-only";
import { fetchJson, HttpError, peekCache } from "./http";
import * as dz from "./deezer";
import type { AudioFeatures } from "../types";

// Real audio features (energy, danceability, mood, tempo…) for songs, since Spotify's audio-features
// endpoint is closed to new apps. Spotifind sends the song's public 30-second Deezer preview to ReccoBeats'
// free analysis endpoint (no key, no account, nothing personal) and caches the answer for a year, so every
// song is analysed once.

const ENDPOINT = "https://api.reccobeats.com/v1/analysis/audio-features";
const YEAR = 365 * 24 * 3600;

// Like Spotify: when ReccoBeats says "slow down" for a while, stop asking until then.
const g = globalThis as unknown as { __sfRbBlockedUntil?: number };
const blocked = () => (g.__sfRbBlockedUntil ?? 0) > Date.now();

type Raw = Partial<Record<keyof AudioFeatures, number>> & { error?: string };

function toFeatures(raw: Raw | undefined): AudioFeatures | null {
  if (typeof raw?.energy !== "number") return null;
  return {
    energy: raw.energy,
    danceability: raw.danceability ?? 0,
    valence: raw.valence ?? 0,
    tempo: raw.tempo ?? 0,
    acousticness: raw.acousticness ?? 0,
    instrumentalness: raw.instrumentalness ?? 0,
    speechiness: raw.speechiness ?? 0,
  };
}

export async function audioFeatures(deezerId: number): Promise<AudioFeatures | null> {
  // The preview URL is signed and changes, so results are cached by Deezer track id, checked before downloading.
  const key = `rb:features:${deezerId}`;
  const cached = peekCache<Raw>(key);
  if (cached) return toFeatures(cached);
  if (blocked()) return null;
  const preview = await dz.trackPreview(deezerId).catch(() => undefined);
  if (!preview) return null;
  try {
    const raw = await fetchJson<Raw>(ENDPOINT, { method: "POST", cacheKey: key, ttlSec: YEAR, body: await previewForm(preview) });
    return toFeatures(raw);
  } catch (e) {
    if (e instanceof HttpError && e.status === 429) g.__sfRbBlockedUntil = Date.now() + (e.retryAfter ?? 60) * 1000;
    return null;
  }
}

async function previewForm(url: string): Promise<FormData> {
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000), cache: "no-store" });
  if (!res.ok) throw new Error(`preview ${res.status}`);
  const form = new FormData();
  form.append("audioFile", new Blob([await res.arrayBuffer()], { type: "audio/mpeg" }), "preview.mp3");
  return form;
}
