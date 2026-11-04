import type { Kind, TagVector } from "./types";

export function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s*[\(\[].*?(remaster|edit|version|mono|stereo|live|deluxe|mix).*?[\)\]]/g, "")
    .replace(/\s+-\s+.*(remaster|edit|version|mono|stereo|live|mix).*$/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** norm(), but falls back to the trimmed lower-case original when normalising leaves nothing (e.g. 日本語 titles). */
function keyPart(s: string): string {
  return norm(s) || s.trim().toLowerCase();
}

export function itemKey(kind: Kind, artist: string, title: string): string {
  return `${kind}:${keyPart(artist)}::${keyPart(kind === "artist" ? artist : title)}`;
}

/** Drop later items whose key was already seen (several releases often normalise to one key). */
export function uniqueByKey<T extends { key: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((it) => (seen.has(it.key) ? false : (seen.add(it.key), true)));
}

export function cosine(a: TagVector, b: TagVector, only?: Set<string>): { score: number; shared: string[] } {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const shared: { t: string; w: number }[] = [];
  for (const [t, w] of Object.entries(a)) {
    if (only && !only.has(t)) continue;
    na += w * w;
    const v = b[t];
    if (v) {
      dot += w * v;
      shared.push({ t, w: w * v });
    }
  }
  for (const [t, w] of Object.entries(b)) {
    if (only && !only.has(t)) continue;
    nb += w * w;
  }
  if (!na || !nb) return { score: 0, shared: [] };
  shared.sort((x, y) => y.w - x.w);
  return { score: dot / Math.sqrt(na * nb), shared: shared.map((s) => s.t) };
}

export function clamp(x: number, lo = 0, hi = 1) {
  return Math.max(lo, Math.min(hi, x));
}

export function formatCount(n?: number): string | undefined {
  if (n == null) return undefined;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}

export function formatDuration(sec?: number): string {
  if (!sec || !isFinite(sec)) return "";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function albumHref(artist: string, title: string) {
  return `/album/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
}
export function artistHref(name: string) {
  return `/artist/${encodeURIComponent(name)}`;
}
export function trackHref(artist: string, title: string) {
  return `/track/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
}

export function spotifyOpenHref(kind: Kind, artist: string, title: string) {
  const p = new URLSearchParams({ kind, artist, title });
  return `/api/open?${p.toString()}`;
}

export function hrefFor(kind: Kind, artist: string, title: string) {
  if (kind === "album") return albumHref(artist, title);
  if (kind === "artist") return artistHref(artist);
  return trackHref(artist, title);
}
