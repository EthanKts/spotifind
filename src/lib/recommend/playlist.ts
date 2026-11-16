import "server-only";
import * as lf from "../sources/lastfm";
import { mapLimit } from "../sources/http";
import { itemKey, norm, songMatcher } from "../util";
import type { RecommendResponse, Seed, TagVector } from "../types";
import { add, attachTags, trackCand, type Depth, type Pool } from "./candidates";

// Songs like a whole pasted Spotify playlist, without the songs already in it.
//
// Every song in the playlist counts: each one's Last.fm similar songs are pooled, and a song that many of them
// point to ranks higher (`support`). Its most frequent artists add their similar artists' top songs (and their own
// deeper cuts), which also covers songs Last.fm has no similarity data for. Only a few cheap requests per song,
// all cached, so the second time is instant.

export type PlaylistPool = RecommendResponse & { support: Record<string, number> };

export async function buildFromPlaylist(name: string, tracks: { artist: string; title: string }[], depth: Depth): Promise<PlaylistPool> {
  const pool: Pool = new Map();
  const support = new Map<string, number>();
  const sources = new Set<string>();
  const inPlaylist = songMatcher(tracks);

  // Artists by number of songs in the playlist.
  const count = new Map<string, { name: string; n: number }>();
  for (const t of tracks) {
    const k = norm(t.artist);
    const e = count.get(k) ?? { name: t.artist, n: 0 };
    e.n++;
    count.set(k, e);
  }
  const artists = [...count.values()].sort((a, b) => b.n - a.n);
  const own = new Set(count.keys());

  // 1. Every song's similar songs.
  // 2. Similar artists of the playlist's main artists (in parallel).
  const mainArtists = artists.slice(0, 20);
  const [similar, simArtists] = await Promise.all([
    mapLimit(tracks, 8, (t) => lf.similarTracks(t.artist, t.title, 50)),
    mapLimit(mainArtists, 8, (a) => lf.similarArtists(a.name, 30)),
  ]);

  tracks.forEach((t, i) => {
    const seen = new Set<string>();
    for (const s of similar[i] ?? []) {
      if (!s.artist || !s.name) continue;
      const c = trackCand(s, t.artist, { source: "lastfm:similar-track", hop: 1, match: s.match, via: t.title });
      if (inPlaylist(c) || seen.has(c.key)) continue;
      seen.add(c.key);
      c.sameArtistAsSeed = own.has(norm(c.artist));
      add(pool, c);
      support.set(c.key, (support.get(c.key) ?? 0) + 1);
    }
  });
  if (support.size) sources.add("Last.fm similar tracks");

  // Similar artists across the playlist, weighted by how central the artist they come from is.
  // `from`: the playlist artist it's most similar to, for the explanation.
  const related = new Map<string, { name: string; w: number; match: number; from: string }>();
  mainArtists.forEach((a, i) => {
    for (const s of simArtists[i] ?? []) {
      const k = norm(s.name);
      if (own.has(k)) continue;
      const e = related.get(k) ?? { name: s.name, w: 0, match: 0, from: a.name };
      e.w += (s.match ?? 0) * a.n;
      if ((s.match ?? 0) > e.match) {
        e.match = s.match ?? 0;
        e.from = a.name;
      }
      related.set(k, e);
    }
  });
  const topRelated = [...related.values()].sort((a, b) => b.w - a.w).slice(0, 15);
  const topOwn = artists.slice(0, 5);
  const [relatedTops, ownTops] = await Promise.all([
    mapLimit(topRelated, 8, (a) => lf.artistTopTracks(a.name, depth === "full" ? 20 : 8)),
    mapLimit(topOwn, 5, (a) => lf.artistTopTracks(a.name, 40)),
  ]);
  topRelated.forEach((a, i) => {
    for (const t of relatedTops[i] ?? []) {
      const c = trackCand(t, "", { source: "lastfm:similar-artist-top-track", hop: 1, artistMatch: a.match, via: a.from });
      if (!inPlaylist(c)) add(pool, c);
    }
  });
  topOwn.forEach((a, i) => {
    for (const t of ownTops[i] ?? []) {
      if ((t.rank ?? 0) <= 10) continue; // their hits are likely in the playlist already, or known
      const c = trackCand(t, a.name, { source: "lastfm:artist-deep-cut", hop: 1, artistMatch: 1, via: a.name });
      if (!inPlaylist(c)) add(pool, c);
    }
  });
  if (related.size) sources.add("Last.fm similar artists");

  // Keep the strongest candidates, then tag them like any other pool.
  const strength = (k: string) => {
    const c = pool.get(k)!;
    return (c.match ?? (c.artistMatch ?? 0) * 0.6) + 0.1 * Math.log2(support.get(k) ?? 1);
  };
  const keep = [...pool.keys()].sort((a, b) => strength(b) - strength(a)).slice(0, 400);
  const trimmed: Pool = new Map(keep.map((k) => [k, pool.get(k)!]));
  await attachTags(trimmed, "full"); // tags for the 20 strongest artists (a large, varied pool needs more than lite's 8)

  // The playlist's overall sound: its main artists' tags, merged.
  const tagLists = await mapLimit(artists.slice(0, 10), 5, (a) => lf.artistTags(a.name));
  const tags: TagVector = {};
  tagLists.forEach((t, i) => {
    for (const [k, w] of Object.entries(t ?? {})) tags[k] = (tags[k] ?? 0) + w * artists[i].n;
  });
  const max = Math.max(1e-9, ...Object.values(tags));
  for (const k of Object.keys(tags)) tags[k] /= max;
  sources.add("Last.fm tags");

  const seed: Seed = { kind: "track", key: itemKey("track", artists[0]?.name ?? "", name), title: name, artist: artists[0]?.name ?? "", tags };
  return {
    seed,
    candidates: [...trimmed.values()],
    sources: [...sources],
    limitations: trimmed.size ? [] : ["Last.fm has no similarity data for the songs in this playlist."],
    support: Object.fromEntries(keep.filter((k) => support.has(k)).map((k) => [k, support.get(k)!])),
  };
}
