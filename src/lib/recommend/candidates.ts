import "server-only";
import * as lf from "../sources/lastfm";
import * as dz from "../sources/deezer";
import { inBackground, mapLimit } from "../sources/http";
import type { Candidate, Kind, RecommendResponse, Seed, TagVector } from "../types";
import { itemKey, norm } from "../util";

/** quick = similarity only, no tags (≈2–3 requests, shown instantly); lite = + artist tags; full = + deep cuts, second hop. */
export type Depth = "full" | "lite" | "quick";

type Pool = Map<string, Candidate>;

// Fan-made edits that pile up on Last.fm with few plays — they'd otherwise pass as "hidden gems".
const NOVELTY_EDIT = /\b(nightcore|sped[\s-]?up|slowed\s*(?:\+|&|and)?\s*reverb|8d audio|karaoke|tiktok (?:version|remix)|bass ?boosted|ringtone)\b|\((?:slowed|sped up)\)/i;

function add(pool: Pool, c: Candidate) {
  if (NOVELTY_EDIT.test(c.title)) return;
  const prev = pool.get(c.key);
  if (!prev) {
    pool.set(c.key, c);
    return;
  }
  // Keep the strongest evidence: a direct hop beats a second hop; a real track match beats an artist match.
  const better =
    (c.hop < prev.hop) ||
    (c.hop === prev.hop && (c.match ?? -1) > (prev.match ?? -1)) ||
    (prev.match == null && c.match == null && (c.artistMatch ?? 0) > (prev.artistMatch ?? 0));
  const merged: Candidate = better ? { ...prev, ...c } : { ...c, ...prev };
  merged.artistRank = prev.artistRank ?? c.artistRank;
  merged.popularity = prev.popularity ?? c.popularity;
  merged.image = prev.image ?? c.image;
  pool.set(c.key, merged);
}

function trackCand(
  t: lf.LfTrack,
  seedArtist: string,
  extra: Partial<Candidate> & { source: Candidate["source"]; hop: 1 | 2 },
): Candidate {
  return {
    kind: "track",
    key: itemKey("track", t.artist, t.name),
    title: t.name,
    artist: t.artist,
    playcount: t.playcount,
    listeners: t.listeners,
    popularity: t.playcount ?? t.listeners,
    durationSec: t.durationSec,
    mbid: t.mbid,
    artistRank: t.rank,
    sameArtistAsSeed: norm(t.artist) === norm(seedArtist),
    tags: {},
    ...extra,
  };
}

/** Fill tag vectors: per-item tags for the strongest candidates, artist tags for the rest. */
async function attachTags(pool: Pool, depth: Depth) {
  const all = [...pool.values()];
  const strength = (c: Candidate) => (c.match ?? (c.artistMatch ?? 0) * 0.6) / c.hop;

  // Last.fm rarely has tags for individual songs any more, so per-song tag requests are skipped (they cost
  // ~3 s and almost always came back empty); album candidates still get their own album tags.
  const itemTagTargets = depth === "full"
    ? all.filter((c) => c.kind === "album" && c.hop === 1).sort((a, b) => strength(b) - strength(a)).slice(0, 12)
    : [];
  const artistOrder: string[] = [];
  const seen = new Set<string>();
  for (const c of [...all].sort((a, b) => strength(b) - strength(a))) {
    const n = norm(c.artist);
    if (!seen.has(n)) {
      seen.add(n);
      artistOrder.push(c.artist);
    }
  }
  const artistTargets = artistOrder.slice(0, depth === "full" ? 20 : 8);

  const [itemTags, artistTagList] = await Promise.all([
    mapLimit(itemTagTargets, 8, (c) => lf.albumTags(c.artist, c.title)),
    mapLimit(artistTargets, 8, (a) => lf.artistTags(a)),
  ]);
  const byArtist = new Map<string, TagVector>();
  artistTargets.forEach((a, i) => artistTagList[i] && byArtist.set(norm(a), artistTagList[i]!));
  const byItem = new Map<string, TagVector>();
  itemTagTargets.forEach((c, i) => {
    const t = itemTags[i];
    if (t && Object.keys(t).length >= 3) byItem.set(c.key, t);
  });

  for (const c of pool.values()) {
    const own = byItem.get(c.key);
    if (own) {
      c.tags = own;
      c.tagsFromArtist = false;
    } else {
      const at = byArtist.get(norm(c.artist));
      if (at) {
        c.tags = at;
        c.tagsFromArtist = c.kind !== "artist";
      }
    }
  }
}

async function seedTagsFor(kind: Kind, artist: string, title: string): Promise<TagVector> {
  try {
    const t =
      kind === "track" ? await lf.trackTags(artist, title) : kind === "album" ? await lf.albumTags(artist, title) : await lf.artistTags(artist);
    if (Object.keys(t).length >= 3) return t;
  } catch {}
  return lf.artistTags(artist).catch(() => ({}));
}

// ---------------------------------------------------------------- Last.fm paths

async function fromTrack(seed: Seed, pool: Pool, depth: Depth, sources: Set<string>) {
  const [similar, simArtists] = await Promise.all([
    lf.similarTracks(seed.artist, seed.title, 100).catch(() => []),
    lf.similarArtists(seed.artist, 30).catch(() => []),
  ]);
  if (similar.length) sources.add("Last.fm similar tracks");
  for (const t of similar) {
    if (norm(t.artist) === norm(seed.artist) && norm(t.name) === norm(seed.title)) continue;
    add(pool, trackCand(t, seed.artist, { source: "lastfm:similar-track", hop: 1, match: t.match, via: seed.title }));
  }

  const topSim = depth === "quick" ? [] : simArtists.slice(0, depth === "full" ? 8 : 5);
  const tops = await mapLimit(topSim, 8, (a) => lf.artistTopTracks(a.name, depth === "full" ? 40 : 5));
  topSim.forEach((a, i) => {
    for (const t of tops[i] ?? []) {
      const deep = (t.rank ?? 0) > 10;
      if (deep && depth !== "full") continue;
      add(pool, trackCand(t, seed.artist, {
        source: deep ? "lastfm:artist-deep-cut" : "lastfm:similar-artist-top-track",
        hop: 1, artistMatch: a.match, via: seed.artist,
      }));
    }
  });
  if (simArtists.length) sources.add("Last.fm similar artists");

  if (depth === "full") {
    // Deep cuts from the seed artist's own catalogue (beyond their top 10).
    const own = await lf.artistTopTracks(seed.artist, 50).catch(() => []);
    for (const t of own) {
      if ((t.rank ?? 0) <= 10 || norm(t.name) === norm(seed.title)) continue;
      add(pool, trackCand(t, seed.artist, { source: "lastfm:artist-deep-cut", hop: 1, artistMatch: 1, via: seed.artist }));
    }
    // Second hop: what is similar to the closest neighbours (by other artists).
    const hubs = similar.filter((t) => norm(t.artist) !== norm(seed.artist)).slice(0, 3);
    const hop2 = await mapLimit(hubs, 3, (h) => lf.similarTracks(h.artist, h.name, 30));
    hubs.forEach((h, i) => {
      for (const t of hop2[i] ?? []) {
        add(pool, trackCand(t, seed.artist, {
          source: "lastfm:second-hop", hop: 2, match: (h.match ?? 0) * (t.match ?? 0), via: `${h.name} — ${h.artist}`,
        }));
      }
    });
  }
}

async function fromAlbum(seed: Seed, pool: Pool, depth: Depth, sources: Set<string>) {
  const [info, simArtists, ownAlbums, ownTop] = await Promise.all([
    lf.albumInfo(seed.artist, seed.title).catch(() => undefined),
    lf.similarArtists(seed.artist, 30).catch(() => []),
    lf.artistTopAlbums(seed.artist, 10).catch(() => []),
    lf.artistTopTracks(seed.artist, 50).catch(() => []),
  ]);
  if (info?.image && !seed.image) seed.image = info.image;
  if (info?.listeners) seed.listeners = info.listeners;

  const topSim = simArtists.slice(0, depth === "full" ? 14 : 8);
  const albums = await mapLimit(topSim, 8, (a) => lf.artistTopAlbums(a.name, 4));
  topSim.forEach((a, i) => {
    (albums[i] ?? []).forEach((al, rank) => {
      add(pool, {
        kind: "album", key: itemKey("album", al.artist, al.name), title: al.name, artist: al.artist, image: al.image,
        playcount: al.playcount, popularity: al.playcount, mbid: al.mbid, artistRank: rank + 1,
        source: "lastfm:similar-artist-top-album", hop: 1, artistMatch: a.match, via: seed.artist,
        sameArtistAsSeed: false, tags: {},
      });
    });
  });
  if (simArtists.length) sources.add("Last.fm similar artists");

  ownAlbums.forEach((al, rank) => {
    if (norm(al.name) === norm(seed.title)) return;
    add(pool, {
      kind: "album", key: itemKey("album", al.artist, al.name), title: al.name, artist: al.artist, image: al.image,
      playcount: al.playcount, popularity: al.playcount, artistRank: rank + 1, source: "lastfm:artist-deep-cut",
      hop: 1, artistMatch: 1, via: seed.artist, sameArtistAsSeed: true, tags: {},
    });
  });

  // Track recommendations: what's similar to this album's most-played songs.
  if (info?.tracks.length && depth !== "quick") {
    const onAlbum = new Set(info.tracks.map((t) => norm(t.name)));
    const anchors = ownTop.filter((t) => onAlbum.has(norm(t.name))).slice(0, depth === "full" ? 2 : 1);
    const sims = await mapLimit(anchors, 2, (a) => lf.similarTracks(a.artist, a.name, 40));
    anchors.forEach((a, i) => {
      for (const t of sims[i] ?? []) {
        if (norm(t.artist) === norm(seed.artist)) continue;
        add(pool, trackCand(t, seed.artist, { source: "lastfm:similar-track", hop: 1, match: t.match, via: a.name }));
      }
    });
    if (anchors.length) sources.add("Last.fm similar tracks");
  }
}

async function fromArtist(seed: Seed, pool: Pool, depth: Depth, sources: Set<string>) {
  const [simArtists, ownTop] = await Promise.all([
    lf.similarArtists(seed.artist, 50).catch(() => []),
    lf.artistTopTracks(seed.artist, depth === "full" ? 50 : 3).catch(() => []),
  ]);
  for (const a of simArtists) {
    add(pool, {
      kind: "artist", key: itemKey("artist", a.name, a.name), title: a.name, artist: a.name, mbid: a.mbid,
      source: "lastfm:similar-artist", hop: 1, match: a.match, via: seed.artist, sameArtistAsSeed: false, tags: {},
    });
  }
  if (simArtists.length) sources.add("Last.fm similar artists");

  // Songs from many similar artists (3 each) gives playlists and "one per artist" enough variety;
  // albums only from the closest few.
  const topSim = depth === "quick" ? [] : simArtists.slice(0, depth === "full" ? 20 : 15);
  const [tracks, albums] = await Promise.all([
    mapLimit(topSim, 8, (a) => lf.artistTopTracks(a.name, 3)),
    mapLimit(topSim.slice(0, depth === "full" ? 10 : 6), 8, (a) => lf.artistTopAlbums(a.name, 3)),
  ]);
  topSim.forEach((a, i) => {
    for (const t of tracks[i] ?? [])
      add(pool, trackCand(t, seed.artist, { source: "lastfm:similar-artist-top-track", hop: 1, artistMatch: a.match, via: seed.artist }));
    (albums[i] ?? []).forEach((al, rank) =>
      add(pool, {
        kind: "album", key: itemKey("album", al.artist, al.name), title: al.name, artist: al.artist, image: al.image,
        playcount: al.playcount, popularity: al.playcount, artistRank: rank + 1, source: "lastfm:similar-artist-top-album",
        hop: 1, artistMatch: a.match, via: seed.artist, sameArtistAsSeed: false, tags: {},
      }),
    );
  });

  // Song-level matches: tracks similar to the artist's signature songs.
  const anchors = depth === "quick" ? [] : ownTop.slice(0, depth === "full" ? 3 : 1);
  const sims = await mapLimit(anchors, 3, (a) => lf.similarTracks(a.artist, a.name, 40));
  anchors.forEach((a, i) => {
    for (const t of sims[i] ?? []) {
      if (norm(t.artist) === norm(seed.artist)) continue;
      add(pool, trackCand(t, seed.artist, { source: "lastfm:similar-track", hop: 1, match: t.match, via: a.name }));
    }
  });

  if (depth === "full") {
    for (const t of ownTop) {
      if ((t.rank ?? 0) <= 10) continue;
      add(pool, trackCand(t, seed.artist, { source: "lastfm:artist-deep-cut", hop: 1, artistMatch: 1, via: seed.artist }));
    }
    const hubs = simArtists.slice(0, 3);
    const hop2 = await mapLimit(hubs, 3, (h) => lf.similarArtists(h.name, 20));
    hubs.forEach((h, i) => {
      for (const a of hop2[i] ?? []) {
        if (norm(a.name) === norm(seed.artist)) continue;
        add(pool, {
          kind: "artist", key: itemKey("artist", a.name, a.name), title: a.name, artist: a.name,
          source: "lastfm:second-hop", hop: 2, match: (h.match ?? 0) * (a.match ?? 0), via: h.name,
          sameArtistAsSeed: false, tags: {},
        });
      }
    });
  }
}

/** Popularity for candidates: Last.fm artist listeners (for artist candidates), via artist.getInfo. */
async function attachArtistPopularity(pool: Pool, depth: Depth) {
  const artists = [...pool.values()].filter((c) => c.kind === "artist").slice(0, depth === "full" ? 15 : 10);
  const infos = await mapLimit(artists, 8, (c) => lf.artistInfo(c.artist));
  artists.forEach((c, i) => {
    const inf = infos[i];
    if (inf?.listeners) {
      c.listeners = inf.listeners;
      c.popularity = inf.listeners;
    }
  });
}

// ---------------------------------------------------------------- Deezer fallback (no Last.fm key)

async function fromDeezer(seed: Seed, pool: Pool, sources: Set<string>) {
  const artist = await dz.findArtist(seed.artist);
  if (!artist) return;
  const related = await dz.relatedArtists(artist.id, 20);
  sources.add("Deezer related artists");
  for (const a of related) {
    add(pool, {
      ...dz.artistToItem(a), source: "deezer:related-artist", hop: 1, via: seed.artist, popularity: a.nb_fan,
      listeners: undefined, sameArtistAsSeed: false, tags: {},
    });
  }
  const tops = await mapLimit(related.slice(0, 10), 5, (a) => dz.artistTop(a.id, 5));
  related.slice(0, 10).forEach((a, i) => {
    (tops[i] ?? []).forEach((t, rank) => {
      add(pool, {
        ...dz.trackToItem(t), source: "deezer:related-artist-top-track", hop: 1, via: seed.artist, popularity: t.rank,
        artistRank: rank + 1, sameArtistAsSeed: false, tags: {},
      });
    });
  });
}

// ---------------------------------------------------------------- entry point

export async function buildRecommendations(
  kind: Kind,
  artist: string,
  title: string,
  depth: Depth,
  opts: { foreground?: boolean } = {},
): Promise<RecommendResponse> {
  // The full pass usually refines results already on screen: run it in the background lane so it never
  // delays clicks — unless someone is actively waiting for it (e.g. building a long playlist).
  if (depth === "full" && !opts.foreground) return inBackground(() => build(kind, artist, title, depth));
  return build(kind, artist, title, depth);
}

async function build(kind: Kind, artist: string, title: string, depth: Depth): Promise<RecommendResponse> {
  const sources = new Set<string>();
  const limitations: string[] = [];
  const pool: Pool = new Map();

  const seed: Seed = { kind, key: itemKey(kind, artist, title), title: kind === "artist" ? artist : title, artist, tags: {} };

  if (lf.hasLastfm()) {
    const [tags] = await Promise.all([
      depth === "quick" ? Promise.resolve({}) : seedTagsFor(kind, artist, seed.title),
      kind === "track" ? fromTrack(seed, pool, depth, sources) : kind === "album" ? fromAlbum(seed, pool, depth, sources) : fromArtist(seed, pool, depth, sources),
    ]);
    seed.tags = tags;
    pool.delete(seed.key);
    if (depth !== "quick") {
      // Artist popularity (for Hidden Gems among artists) costs a request per artist — full depth only.
      await Promise.all([attachTags(pool, depth), depth === "full" ? attachArtistPopularity(pool, depth) : Promise.resolve()]);
      sources.add("Last.fm tags");
    }
    if (!pool.size) limitations.push("Last.fm has no similarity data for this item yet — try the artist or a better-known track.");
  } else {
    await fromDeezer(seed, pool, sources);
    pool.delete(seed.key);
    limitations.push(
      "No Last.fm key configured: recommendations come from Deezer's related-artists graph only. There are no similarity scores or tags, so Same Groove / Same Mood can't be applied.",
    );
  }

  limitations.push(
    "Similarity comes from listening behaviour (Last.fm) and community tags describing genre, instrumentation and mood — not from analysing the audio itself.",
  );
  if (lf.hasLastfm()) {
    limitations.push(
      "Last.fm has no tags for many individual songs. When a song has none, the album's or artist's tags are used instead — song-level matching then rests on Last.fm's listening-based similarity score.",
    );
  }

  return { seed, candidates: [...pool.values()], sources: [...sources], limitations };
}
