import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// Server-only HTTP helper: per-host rate limiting + a two-level cache
// (memory, then an SQLite file on disk so results survive app relaunches).

// ------------------------------------------------------------------ rate limiting (token bucket)
// Each host gets a bucket: short bursts are allowed, the long-run average stays within its policy.

type Bucket = {
  rate: number; burst: number; maxConcurrent: number; tokens: number; updated: number; active: number;
  queue: (() => void)[];
  /** Interactive (normal-priority) requests currently waiting — background work yields to them. */
  waitingNormal: number;
};

/** Background work (e.g. refining recommendations) runs with low priority so clicks never queue behind it. */
const priorityContext = new AsyncLocalStorage<"low" | "normal">();
export function inBackground<T>(fn: () => Promise<T>): Promise<T> {
  return priorityContext.run("low", fn);
}
/** Tokens kept free for interactive requests while background work is running. */
const RESERVE = 6;

const buckets: Record<string, Bucket> = {
  // Last.fm ToS: at most 5 requests/second averaged over 5 minutes → bursts are fine.
  "ws.audioscrobbler.com": { rate: 5, burst: 25, maxConcurrent: 10, tokens: 25, updated: Date.now(), active: 0, queue: [], waitingNormal: 0 },
  // MusicBrainz: 1 request/second, no bursts.
  "musicbrainz.org": { rate: 1, burst: 1, maxConcurrent: 1, tokens: 1, updated: Date.now(), active: 0, queue: [], waitingNormal: 0 },
  // Deezer: 50 requests per 5 seconds.
  "api.deezer.com": { rate: 9, burst: 20, maxConcurrent: 10, tokens: 20, updated: Date.now(), active: 0, queue: [], waitingNormal: 0 },
  "api.spotify.com": { rate: 3, burst: 6, maxConcurrent: 3, tokens: 6, updated: Date.now(), active: 0, queue: [], waitingNormal: 0 },
};

function refill(b: Bucket) {
  const now = Date.now();
  b.tokens = Math.min(b.burst, b.tokens + ((now - b.updated) / 1000) * b.rate);
  b.updated = now;
}

function acquire(host: string): Promise<() => void> {
  const b = buckets[host];
  if (!b) return Promise.resolve(() => {});
  const low = priorityContext.getStore() === "low";
  if (!low) b.waitingNormal++;
  return new Promise((resolve) => {
    const tryStart = () => {
      refill(b);
      if (b.active >= b.maxConcurrent) {
        b.queue.push(tryStart);
        return;
      }
      // Low priority only spends tokens beyond the reserve, and never while a click is waiting.
      const need = low ? 1 + Math.min(RESERVE, b.burst - 1) : 1;
      if (b.tokens < need || (low && b.waitingNormal > 0)) {
        setTimeout(tryStart, Math.max(50, Math.ceil(((need - b.tokens) / b.rate) * 1000)));
        return;
      }
      if (!low) b.waitingNormal--;
      b.tokens -= 1;
      b.active++;
      resolve(() => {
        b.active--;
        const next = b.queue.shift();
        if (next) next();
      });
    };
    tryStart();
  });
}

// ------------------------------------------------------------------ caches

type Entry = { exp: number; value: unknown };
const g = globalThis as unknown as {
  __sfCache?: Map<string, Entry>;
  __sfInflight?: Map<string, Promise<unknown>>;
  __sfDb?: DatabaseSync | null;
};
const memory = (g.__sfCache ??= new Map());
const inflight = (g.__sfInflight ??= new Map());
const MAX_MEMORY = 5000;

/** On-disk cache. The Mac app points SPOTIFIND_CACHE_DIR at ~/Library/Caches/Spotifind; dev uses the same place. */
function db(): DatabaseSync | null {
  if (g.__sfDb !== undefined) return g.__sfDb;
  try {
    const dir = process.env.SPOTIFIND_CACHE_DIR || join(homedir(), "Library", "Caches", "Spotifind");
    mkdirSync(dir, { recursive: true });
    const d = new DatabaseSync(join(dir, "api-cache.sqlite"));
    d.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;");
    d.exec("CREATE TABLE IF NOT EXISTS cache (k TEXT PRIMARY KEY, v TEXT NOT NULL, exp INTEGER NOT NULL)");
    d.prepare("DELETE FROM cache WHERE exp < ?").run(Date.now());
    g.__sfDb = d;
  } catch (e) {
    console.error("[cache] disk cache unavailable, using memory only:", (e as Error).message);
    g.__sfDb = null;
  }
  return g.__sfDb;
}

function readCache(key: string): unknown | undefined {
  const hit = memory.get(key);
  if (hit && hit.exp > Date.now()) return hit.value;
  const d = db();
  if (!d) return undefined;
  try {
    const row = d.prepare("SELECT v, exp FROM cache WHERE k = ?").get(key) as { v: string; exp: number } | undefined;
    if (!row || row.exp < Date.now()) return undefined;
    const value = JSON.parse(row.v);
    memory.set(key, { exp: row.exp, value });
    return value;
  } catch {
    return undefined;
  }
}

function writeCache(key: string, value: unknown, ttlSec: number) {
  const exp = Date.now() + ttlSec * 1000;
  if (memory.size > MAX_MEMORY) memory.delete(memory.keys().next().value as string);
  memory.set(key, { exp, value });
  try {
    db()?.prepare("INSERT OR REPLACE INTO cache (k, v, exp) VALUES (?, ?, ?)").run(key, JSON.stringify(value), exp);
  } catch {}
}

// ------------------------------------------------------------------ fetch

export class HttpError extends Error {
  constructor(public status: number, message: string, public retryAfter?: number) {
    super(message);
  }
}

export async function fetchJson<T = unknown>(
  url: string,
  opts: { ttlSec?: number; headers?: Record<string, string>; cacheKey?: string; method?: string; body?: string } = {},
): Promise<T> {
  const ttl = opts.ttlSec ?? 6 * 3600;
  const key = opts.cacheKey ?? url;
  if (ttl > 0) {
    const hit = readCache(key);
    if (hit !== undefined) return hit as T;
    if (inflight.has(key)) return inflight.get(key) as Promise<T>;
  }

  const run = (async () => {
    const host = new URL(url).host;
    const queuedAt = Date.now();
    const release = await acquire(host);
    const startedAt = Date.now();
    try {
      let res: Response | undefined;
      // Last.fm/Deezer occasionally stall a single request for 5–10 s while a retry answers in ~0.3 s,
      // so the first attempt gets a short deadline. MusicBrainz is strictly 1 req/s, so it keeps a long one.
      const firstTimeout = host === "musicbrainz.org" ? 12_000 : 4_000;
      // Rate limits (429) and overloads (502/503) are usually momentary: back off and retry twice.
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          res = await fetch(url, {
            method: opts.method ?? "GET",
            body: opts.body,
            headers: { "User-Agent": "Spotifind/0.1", Accept: "application/json", ...opts.headers },
            cache: "no-store",
            signal: AbortSignal.timeout(attempt === 0 ? firstTimeout : 12_000),
          });
        } catch (e) {
          if ((e as Error).name === "TimeoutError" && attempt === 0) continue; // stalled: try again right away
          throw e;
        }
        if (![429, 502, 503].includes(res.status) || attempt === 2) break;
        const retryAfter = Number(res.headers.get("retry-after"));
        if (retryAfter > 10) break; // a long ban: retrying now can't help
        await new Promise((r) => setTimeout(r, retryAfter > 0 && retryAfter < 10 ? retryAfter * 1000 : 800 * (attempt + 1)));
      }
      const total = Date.now() - queuedAt;
      if (total > 1500) {
        const safe = url.replace(/api_key=[^&]+/, "api_key=…");
        console.warn(`[slow] ${total}ms (waited ${startedAt - queuedAt}ms for rate limit) ${res!.status} ${safe}`);
      }
      if (!res!.ok) throw new HttpError(res!.status, `${host} responded ${res!.status}`, Number(res!.headers.get("retry-after")) || undefined);
      const json = (await res!.json()) as T;
      // Don't persist API-level error payloads (Last.fm/Deezer return those with HTTP 200).
      const isError = !!json && typeof json === "object" && "error" in (json as object);
      if (ttl > 0 && !isError) writeCache(key, json, ttl);
      return json;
    } finally {
      release();
    }
  })();

  if (ttl > 0) {
    inflight.set(key, run);
    run.finally(() => inflight.delete(key)).catch(() => {});
  }
  return run;
}

/** Run async tasks with bounded parallelism; failed tasks resolve to undefined. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T, i: number) => Promise<R>): Promise<(R | undefined)[]> {
  const out: (R | undefined)[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      try {
        out[idx] = await fn(items[idx], idx);
      } catch {
        out[idx] = undefined;
      }
    }
  });
  await Promise.all(workers);
  return out;
}

/** Resolve with the promise's value, or `fallback` if it takes longer than `ms` (the work keeps running and still caches). */
export function within<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p.catch(() => fallback), new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);
}
