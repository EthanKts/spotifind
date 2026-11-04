import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { configValue, setConfigValue, SUPPORT_DIR } from "./config";
import { mapLimit } from "./http";
import { norm } from "../util";

// Your Spotify account, connected with Authorization Code + PKCE (no client secret needed).
// Tokens live only on this Mac: ~/Library/Application Support/Spotifind/spotify-auth.json (mode 600).
// Endpoints follow Spotify's February 2026 Web API changes:
//   POST /me/playlists (create) · POST/PUT /playlists/{id}/items (add/replace) · search limit ≤ 10.

const AUTH_FILE = join(SUPPORT_DIR, "spotify-auth.json");
const SCOPES = ["playlist-modify-private", "playlist-modify-public"];
const API = "https://api.spotify.com/v1";

interface Auth {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  scope: string;
  user?: { id: string; display_name?: string; product?: string };
}

// ------------------------------------------------------------------ config (Client ID)

export function clientId(): string | undefined {
  return configValue("SPOTIFY_CLIENT_ID");
}

/** Save the Client ID to config.env (and use it immediately, no restart). */
export function setClientId(id: string) {
  setConfigValue("SPOTIFY_CLIENT_ID", id);
  // A different app means the old login is no longer valid.
  disconnect();
}

// ------------------------------------------------------------------ token storage

function readAuth(): Auth | undefined {
  try {
    return JSON.parse(readFileSync(AUTH_FILE, "utf8")) as Auth;
  } catch {
    return undefined;
  }
}

function writeAuth(a: Auth) {
  mkdirSync(SUPPORT_DIR, { recursive: true });
  writeFileSync(AUTH_FILE, JSON.stringify(a), { mode: 0o600 });
  try {
    chmodSync(AUTH_FILE, 0o600);
  } catch {}
}

export function disconnect() {
  try {
    rmSync(AUTH_FILE, { force: true });
  } catch {}
}

export function connectedUser() {
  return readAuth()?.user;
}

// ------------------------------------------------------------------ PKCE login

const b64url = (b: Buffer) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

type Pending = { verifier: string; redirectUri: string; returnTo: string; created: number };
const g = globalThis as unknown as { __sfPkce?: Map<string, Pending> };
const pending = (g.__sfPkce ??= new Map());

/** Spotify only accepts loopback redirects as an IP literal (not "localhost"). */
export function redirectUriFor(requestUrl: string) {
  const u = new URL(requestUrl);
  return `http://127.0.0.1:${u.port || "80"}/api/spotify/callback`;
}

export function authorizeUrl(requestUrl: string, returnTo: string): string {
  const id = clientId();
  if (!id) throw new Error("No Spotify Client ID configured");
  for (const [k, v] of pending) if (Date.now() - v.created > 15 * 60_000) pending.delete(k);
  const verifier = b64url(randomBytes(48));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  const state = b64url(randomBytes(16));
  const redirectUri = redirectUriFor(requestUrl);
  pending.set(state, { verifier, redirectUri, returnTo, created: Date.now() });
  const q = new URLSearchParams({
    client_id: id,
    response_type: "code",
    redirect_uri: redirectUri,
    code_challenge_method: "S256",
    code_challenge: challenge,
    scope: SCOPES.join(" "),
    state,
  });
  return `https://accounts.spotify.com/authorize?${q}`;
}

async function tokenRequest(body: Record<string, string>) {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
    cache: "no-store",
  });
  const j = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string; error_description?: string };
  if (!res.ok || !j.access_token) throw new Error(j.error_description || j.error || `Spotify token request failed (${res.status})`);
  return j;
}

/** Finish login: exchange the code, save tokens, remember who you are. Returns where to send the user next. */
export async function completeLogin(code: string, state: string): Promise<{ returnTo: string; name: string }> {
  const p = pending.get(state);
  if (!p) throw new Error("This login link expired — start again from Spotifind.");
  pending.delete(state);
  const j = await tokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: p.redirectUri,
    client_id: clientId()!,
    code_verifier: p.verifier,
  });
  const auth: Auth = {
    access_token: j.access_token!,
    refresh_token: j.refresh_token!,
    expires_at: Date.now() + (j.expires_in ?? 3600) * 1000,
    scope: j.scope ?? "",
  };
  writeAuth(auth);
  const me = await api<{ id: string; display_name?: string; product?: string }>("/me");
  writeAuth({ ...auth, user: { id: me.id, display_name: me.display_name, product: me.product } });
  return { returnTo: p.returnTo, name: me.display_name || me.id };
}

/** Your access token (refreshed when needed) — also lets catalogue lookups work without a client secret. */
export function userAccessToken(): Promise<string> {
  return accessToken();
}

async function accessToken(): Promise<string> {
  const a = readAuth();
  if (!a) throw new SpotifyAuthError("Not connected to Spotify");
  if (a.expires_at > Date.now() + 60_000) return a.access_token;
  const j = await tokenRequest({ grant_type: "refresh_token", refresh_token: a.refresh_token, client_id: clientId()! }).catch((e) => {
    throw new SpotifyAuthError(`Spotify login expired — reconnect (${(e as Error).message})`);
  });
  const next: Auth = {
    ...a,
    access_token: j.access_token!,
    refresh_token: j.refresh_token ?? a.refresh_token, // Spotify may rotate it
    expires_at: Date.now() + (j.expires_in ?? 3600) * 1000,
  };
  writeAuth(next);
  return next.access_token;
}

export class SpotifyAuthError extends Error {}

/** Call the Web API as you. Retries once on 401 (expired token) and on 429 (rate limit). */
export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const token = await accessToken();
    const res = await fetch(`${API}${path}`, {
      method: init.method ?? "GET",
      headers: { Authorization: `Bearer ${token}`, ...(init.body ? { "Content-Type": "application/json" } : {}) },
      body: init.body ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 401 && attempt === 0) {
      const a = readAuth();
      if (a) writeAuth({ ...a, expires_at: 0 }); // force refresh
      continue;
    }
    if (res.status === 429 && attempt < 2) {
      const wait = Math.min(10, Number(res.headers.get("retry-after")) || 2);
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      const msg = j.error?.message ?? `Spotify responded ${res.status}`;
      if (res.status === 403) {
        throw new Error(
          `Spotify refused (403: ${msg}). Spotify developer apps only work when the app owner has Spotify Premium, and your account must be the app's owner or on its user list.`,
        );
      }
      throw new Error(msg);
    }
    return (res.status === 204 ? undefined : await res.json()) as T;
  }
  throw new Error("Spotify request failed");
}

// ------------------------------------------------------------------ export

interface SpTrack { uri: string; name: string; artists: { name: string }[]; is_playable?: boolean }

/** Find the Spotify track for an artist + title (exact title/artist match first, then the best looser match). */
async function findTrackUri(artist: string, title: string): Promise<string | undefined> {
  const a = norm(artist);
  const t = norm(title);
  const pick = (items: SpTrack[]) =>
    items.find((x) => norm(x.name) === t && x.artists.some((y) => norm(y.name) === a)) ??
    items.find((x) => x.artists.some((y) => norm(y.name) === a) && (norm(x.name).startsWith(t) || t.startsWith(norm(x.name))));
  const strict = await api<{ tracks: { items: SpTrack[] } }>(
    `/search?type=track&limit=10&q=${encodeURIComponent(`track:${title.replace(/"/g, "")} artist:${artist.replace(/"/g, "")}`)}`,
  );
  const hit = pick(strict.tracks?.items ?? []);
  if (hit) return hit.uri;
  const loose = await api<{ tracks: { items: SpTrack[] } }>(`/search?type=track&limit=10&q=${encodeURIComponent(`${title} ${artist}`)}`);
  return pick(loose.tracks?.items ?? [])?.uri;
}

export interface ExportResult {
  id: string;
  url: string;
  uri: string;
  found: number;
  missing: string[];
}

export async function exportPlaylist(input: {
  name: string;
  description: string;
  isPublic: boolean;
  tracks: { artist: string; title: string }[];
  existingId?: string;
}): Promise<ExportResult> {
  await accessToken(); // not connected / login expired → SpotifyAuthError, so the app asks you to connect
  let firstError: Error | undefined;
  const uris = await mapLimit(input.tracks, 4, (t) =>
    findTrackUri(t.artist, t.title).catch((e: Error) => {
      firstError ??= e;
      return undefined;
    }),
  );
  const found = uris.filter((u): u is string => !!u);
  if (!found.length && firstError) throw firstError; // e.g. 403 — report the real reason, not "not found"
  const missing = input.tracks.filter((_, i) => !uris[i]).map((t) => `${t.artist} – ${t.title}`);
  if (!found.length) throw new Error("None of these songs could be found on Spotify.");

  let id = input.existingId;
  let url = "";
  let uri = "";
  if (id) {
    // Update an earlier export in place: rename, then replace its songs.
    try {
      await api(`/playlists/${id}`, { method: "PUT", body: { name: input.name, description: input.description } });
      await api(`/playlists/${id}/items`, { method: "PUT", body: { uris: found } });
      url = `https://open.spotify.com/playlist/${id}`;
      uri = `spotify:playlist:${id}`;
    } catch {
      id = undefined; // deleted on Spotify, or not ours any more → make a new one
    }
  }
  if (!id) {
    const created = await api<{ id: string; uri: string; external_urls: { spotify: string } }>("/me/playlists", {
      method: "POST",
      body: { name: input.name, description: input.description, public: input.isPublic },
    });
    id = created.id;
    url = created.external_urls.spotify;
    uri = created.uri;
    await api(`/playlists/${id}/items`, { method: "POST", body: { uris: found } });
  }
  return { id, url, uri, found: found.length, missing };
}
