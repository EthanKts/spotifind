import "server-only";
import { fetchJson } from "./http";
import { norm } from "../util";

const BASE = "https://musicbrainz.org/ws/2";

interface MbReleaseGroup {
  id: string;
  title: string;
  "first-release-date"?: string;
  "primary-type"?: string;
  "secondary-types"?: string[];
  "artist-credit"?: { name: string }[];
  score?: number;
}

function year(d?: string) {
  const y = d ? Number(d.slice(0, 4)) : NaN;
  return Number.isFinite(y) && y > 1800 ? y : undefined;
}

export function coverArtUrl(releaseGroupId: string, size: 250 | 500 | 1200 = 500) {
  return `https://coverartarchive.org/release-group/${releaseGroupId}/front-${size}`;
}

/** Look up an album's release group: its MBID and original release year. */
export async function findReleaseGroup(artist: string, title: string): Promise<{ id: string; year?: number } | undefined> {
  const query = `releasegroup:"${title.replace(/"/g, "")}" AND artist:"${artist.replace(/"/g, "")}"`;
  const d = await fetchJson<{ "release-groups": MbReleaseGroup[] }>(
    `${BASE}/release-group?query=${encodeURIComponent(query)}&limit=5&fmt=json`,
    { ttlSec: 7 * 24 * 3600 },
  );
  const a = norm(artist);
  const t = norm(title);
  const rg =
    d["release-groups"]?.find((r) => norm(r.title) === t && r["artist-credit"]?.some((c) => norm(c.name) === a)) ??
    d["release-groups"]?.find((r) => (r.score ?? 0) >= 95);
  return rg ? { id: rg.id, year: year(rg["first-release-date"]) } : undefined;
}

/** Official studio albums (no compilations/live) for an artist, oldest first. */
export async function studioAlbums(artistMbid: string): Promise<{ id: string; title: string; year?: number }[]> {
  const d = await fetchJson<{ "release-groups": MbReleaseGroup[] }>(
    `${BASE}/release-group?artist=${artistMbid}&type=album&limit=100&fmt=json`,
    { ttlSec: 7 * 24 * 3600 },
  );
  return (d["release-groups"] ?? [])
    .filter((r) => !(r["secondary-types"] ?? []).length)
    .map((r) => ({ id: r.id, title: r.title, year: year(r["first-release-date"]) }))
    .sort((x, y) => (x.year ?? 9999) - (y.year ?? 9999));
}

export async function findArtistMbid(name: string): Promise<string | undefined> {
  const d = await fetchJson<{ artists: { id: string; name: string; score?: number }[] }>(
    `${BASE}/artist?query=${encodeURIComponent(`artist:"${name.replace(/"/g, "")}"`)}&limit=3&fmt=json`,
    { ttlSec: 7 * 24 * 3600 },
  );
  const n = norm(name);
  return d.artists?.find((a) => norm(a.name) === n && (a.score ?? 0) >= 90)?.id;
}

/** Original release year of a recording (earliest release). */
export async function recordingYear(artist: string, title: string): Promise<number | undefined> {
  const query = `recording:"${title.replace(/"/g, "")}" AND artist:"${artist.replace(/"/g, "")}"`;
  // Popular songs have many equal-scoring recordings (live, reissues); fetch enough to include the original.
  const d = await fetchJson<{ recordings: { title: string; "first-release-date"?: string; score?: number; "artist-credit"?: { name: string }[] }[] }>(
    `${BASE}/recording?query=${encodeURIComponent(query)}&limit=50&fmt=json`,
    { ttlSec: 7 * 24 * 3600 },
  );
  const t = norm(title);
  const a = norm(artist);
  const years = (d.recordings ?? [])
    .filter((r) => norm(r.title) === t && (r.score ?? 0) >= 80 && (r["artist-credit"] ?? []).some((c) => norm(c.name) === a))
    .map((r) => year(r["first-release-date"]))
    .filter((y): y is number => !!y);
  return years.length ? Math.min(...years) : undefined;
}
