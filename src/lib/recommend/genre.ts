import "server-only";
import * as lf from "../sources/lastfm";
import * as dg from "../sources/discogs";
import { inBackground, mapLimit } from "../sources/http";
import type { Candidate, RecommendResponse, Seed, TagVector } from "../types";
import { itemKey, norm } from "../util";
import type { Depth } from "./candidates";
import { resolveGenre, type Subgenre } from "./genres";

// "Explore a genre, matched to my taste", for one or more precise subgenres (see genres.ts). Songs come from:
//   1. The subgenre's best-known albums on Discogs (filed under that exact style by Discogs editors): the most
//      popular songs from those albums.
//   2. Last.fm's chart for the subgenre's tag.
//   3. Bridge artists: artists Last.fm rates similar to the ones you love.
// Every artist must pass a membership check: in Discogs' albums for the style, or the subgenre's tag is one of
// the artist's own strongest Last.fm tags (weight >= MIN_TAG). A tag someone applied loosely isn't enough.
// The client ranks the pool against the rest of your taste (groove, mood, instruments).

type Pool = Map<string, Candidate>;

const NOVELTY_EDIT = /\b(nightcore|sped[\s-]?up|slowed|8d audio|karaoke|ringtone)\b/i;
/** An artist belongs to a subgenre on Last.fm when the tag is at least this strong among its top tags (0..1). */
const MIN_TAG = 0.4;

/** Names as Discogs and Last.fm both write them: "Art Blakey And The Jazz Messengers" = "Art Blakey & The Jazz Messengers". */
const nameKey = (s: string) => norm(s).replace(/&/g, "and").replace(/^the\s+/, "").replace(/\s+/g, " ").trim();

function addTrack(pool: Pool, t: lf.LfTrack, extra: Partial<Candidate> & Pick<Candidate, "source" | "via">) {
  if (!t.name || !t.artist || NOVELTY_EDIT.test(t.name)) return;
  const key = itemKey("track", t.artist, t.name);
  const prev = pool.get(key);
  // A bridge (similar to something you love) is stronger evidence than a chart entry.
  if (prev && (prev.source === "lastfm:genre-bridge-artist" || extra.source !== "lastfm:genre-bridge-artist")) return;
  pool.set(key, {
    kind: "track", key, title: t.name, artist: t.artist, playcount: t.playcount, listeners: t.listeners,
    popularity: t.playcount ?? t.listeners, durationSec: t.durationSec, mbid: t.mbid, artistRank: t.rank,
    hop: 1, sameArtistAsSeed: false, tags: {}, ...extra,
  });
}

export async function buildGenre(ids: string[], loved: string[], depth: Depth): Promise<RecommendResponse & { support: Record<string, number> }> {
  const run = () => buildMany(ids, loved, depth);
  return depth === "full" ? inBackground(run) : run();
}

async function buildMany(ids: string[], loved: string[], depth: Depth) {
  const subs = [...new Map(ids.map((id) => resolveGenre(id)).map((s) => [s.id, s])).values()].slice(0, 5);
  const seed: Seed = {
    kind: "artist", key: `genre:${subs.map((s) => s.id).join("+")}`, title: subs.map((s) => s.name).join(" & "), artist: "",
    tags: Object.fromEntries(subs.flatMap((s) => s.lastfm.slice(0, 1).map((t) => [t, 1]))),
  };
  if (!lf.hasLastfm()) {
    return { seed, candidates: [], sources: [], limitations: ["Exploring a genre needs Last.fm."], support: {} };
  }
  // With several genres, each gets a smaller pool so the total stays about the same.
  const results = await Promise.all(subs.map((s) => build(s, loved, depth, subs.length).catch(() => null)));
  const pool: Pool = new Map();
  const support: Record<string, number> = {};
  const sources = new Set<string>();
  const empty: string[] = [];
  results.forEach((r, i) => {
    if (!r || !r.pool.size) empty.push(subs[i].name);
    if (!r) return;
    r.sources.forEach((s) => sources.add(s));
    for (const c of r.pool.values()) {
      support[c.key] = (support[c.key] ?? 0) + 1;
      const prev = pool.get(c.key);
      if (!prev) {
        pool.set(c.key, { ...c, genres: [subs[i].id] });
        continue;
      }
      prev.genres = [...(prev.genres ?? []), subs[i].id];
      if (!prev.via?.includes(subs[i].name) && c.source !== "lastfm:genre-bridge-artist") prev.via = `${prev.via} & ${subs[i].name}`;
    }
  });
  return {
    seed,
    candidates: [...pool.values()],
    sources: [...sources],
    limitations: empty.length ? [`Not enough songs found for ${empty.join(", ")}.`] : [],
    support,
  };
}

async function build(sg: Subgenre, loved: string[], depth: Depth, of: number) {
  const full = depth === "full";
  const share = (n: number) => Math.max(4, Math.round(n / Math.sqrt(of)));
  const pool: Pool = new Map();
  const sources = new Set<string>();
  const tag = sg.lastfm[0];
  const lovedSet = new Set(loved.map(nameKey));

  const [masters, chartTracks, chartArtists, ...similar] = await Promise.all([
    dg.hasDiscogs() && sg.discogs.length
      ? Promise.all(sg.discogs.map((st) => dg.styleMasters(st, sg.dgGenre, full ? 2 : 1, sg.dgCountry).catch(() => []))).then((l) => l.flat())
      : Promise.resolve([] as dg.StyleMaster[]),
    lf.tagTopTracks(tag, full ? 150 : 80).catch(() => []),
    lf.tagTopArtists(tag, full ? 300 : 150).catch(() => []),
    ...loved.slice(0, full ? 5 : 3).map((a) => lf.similarArtists(a, 100).catch(() => [])),
  ]);

  // Discogs: artists with their best-known albums in this style.
  const dgArtists = new Map<string, { name: string; have: number; albums: string[] }>();
  for (const m of masters) {
    const k = nameKey(m.artist);
    const a = dgArtists.get(k) ?? { name: m.artist, have: 0, albums: [] };
    a.have += m.have;
    if (a.albums.length < 3) a.albums.push(m.album);
    dgArtists.set(k, a);
  }
  if (dgArtists.size) sources.add(`Discogs “${sg.discogs.join(" / ")}” albums`);

  // Which artists to check: bridges first (similar to what you love), then the genre's best-known artists.
  const bridgeMatch = new Map<string, { name: string; match: number; via: string }>();
  similar.forEach((list, i) => {
    for (const a of list.slice(0, full ? 100 : 60)) {
      const k = nameKey(a.name);
      if (lovedSet.has(k)) continue;
      const prev = bridgeMatch.get(k);
      if (!prev || (a.match ?? 0) > prev.match) bridgeMatch.set(k, { name: a.name, match: a.match ?? 0, via: loved[i] });
    }
  });
  const chartArtistSet = new Set(chartArtists.map((a) => nameKey(a.name)));
  // Bridges Discogs or the genre chart already vouch for are sure; the others need their own tags checked.
  const bridgeOrder = [...bridgeMatch.entries()].sort(
    (a, b) => Number(dgArtists.has(b[0]) || chartArtistSet.has(b[0])) - Number(dgArtists.has(a[0]) || chartArtistSet.has(a[0])) || b[1].match - a[1].match,
  );
  const toCheck = new Map<string, string>();
  for (const [k, b] of bridgeOrder.slice(0, share(full ? 40 : 25))) toCheck.set(k, b.name);
  // The genre's best-known artists: from Discogs when it has the style, otherwise from Last.fm's chart for the tag.
  const known: [string, { name: string; have: number; albums: string[] }][] = dgArtists.size
    ? [...dgArtists.entries()].sort((a, b) => b[1].have - a[1].have)
    : chartArtists.slice(0, 40).map((a) => [nameKey(a.name), { name: a.name, have: 0, albums: [] }]);
  const topDg = known.filter(([k]) => !lovedSet.has(k)).slice(0, share(full ? 24 : 14));
  for (const [k, a] of topDg) toCheck.set(k, a.name);
  for (const t of chartTracks.slice(0, full ? 120 : 60)) {
    const k = nameKey(t.artist ?? "");
    if (k && !lovedSet.has(k) && toCheck.size < (full ? 110 : 70)) toCheck.set(k, t.artist);
  }

  const names = [...toCheck.values()];
  const tagLists = await mapLimit(names, 8, (a) => lf.artistTags(a));
  const tagsOf = new Map<string, TagVector>();
  names.forEach((a, i) => tagLists[i] && tagsOf.set(nameKey(a), tagLists[i]!));
  const tagWeight = (t: TagVector | undefined) => Math.max(0, ...sg.lastfm.map((x) => t?.[x] ?? 0));
  // A genre typed by hand (not in genres.ts, e.g. an instrument tag) keeps the looser check: in the tag's chart.
  const adhoc = !sg.family;
  // Without Discogs (no matching style, or no token), the top of Last.fm's own chart for the tag also counts.
  const chartCore = new Set(chartArtists.slice(0, dgArtists.size ? 0 : 40).map((a) => nameKey(a.name)));
  // Last.fm's tag charts are noisy (Elvis is in the "french pop" chart), so the artist must also carry the tag itself.
  const hasTag = (k: string) => tagWeight(tagsOf.get(k)) > 0;
  const belongs = (k: string) =>
    dgArtists.has(k) || tagWeight(tagsOf.get(k)) >= MIN_TAG || (chartCore.has(k) && hasTag(k)) || (adhoc && chartArtistSet.has(k));

  // Songs of an artist that are on its albums in this style (Discogs). If those albums aren't on Last.fm, its
  // best-known songs, but only when Last.fm also agrees the artist belongs, so a versatile artist (Miles Davis
  // in Jazz-Funk) gives the right era and never just its biggest hits.
  const songsInStyle = async (name: string, albums: string[] | undefined, limit: number) => {
    const [top, ...infos] = await Promise.all([
      lf.artistTopTracks(name, 50).catch(() => []),
      ...(albums ?? []).slice(0, 3).map((al) => lf.albumInfo(name, al).catch(() => null)),
    ]);
    const onAlbums = new Set(infos.flatMap((al) => al?.tracks.map((t) => norm(t.name)) ?? []));
    const picked = onAlbums.size ? top.filter((t) => onAlbums.has(norm(t.name))) : [];
    if (picked.length) return picked.slice(0, limit);
    const k = nameKey(name);
    return (albums?.length ? tagWeight(tagsOf.get(k)) >= MIN_TAG : belongs(k))
      ? top.slice(0, limit)
      : [];
  };

  // 1. Discogs albums: the most-played songs from each artist's albums in this style.
  const via = sg.name;
  const dgPicks = topDg.filter(([k]) => !bridgeMatch.has(k));
  const dgTracks = await mapLimit(dgPicks, 6, ([, a]) => songsInStyle(a.name, a.albums, full ? 4 : 3));
  dgPicks.forEach((_, i) => {
    for (const t of dgTracks[i] ?? []) addTrack(pool, t, { source: "lastfm:genre-top-track", via });
  });

  // 2. Last.fm chart songs whose artist really belongs to the genre.
  for (const t of chartTracks) {
    const k = nameKey(t.artist ?? "");
    if (!lovedSet.has(k) && (adhoc || (tagsOf.has(k) && belongs(k)))) addTrack(pool, t, { source: "lastfm:genre-top-track", via });
  }
  if (pool.size) sources.add(`Last.fm “${tag}” charts`);

  // 3. Bridges that belong: similar to an artist you love AND in this genre.
  const bridges = bridgeOrder.filter(([k]) => tagsOf.has(k) && belongs(k)).slice(0, share(full ? 25 : 12));
  const bridgeTracks = await mapLimit(bridges, 6, ([k, b]) => songsInStyle(b.name, dgArtists.get(k)?.albums, full ? 5 : 3));
  bridges.forEach(([, b], i) => {
    for (const t of bridgeTracks[i] ?? []) addTrack(pool, t, { source: "lastfm:genre-bridge-artist", artistMatch: b.match, via: b.via });
  });
  if (bridges.length) sources.add("Last.fm similar artists");

  // Artist tags so the ranking can match the rest of your taste. Artists not checked yet get theirs now.
  const missing = [...new Set([...pool.values()].map((c) => c.artist))].filter((a) => !tagsOf.has(nameKey(a))).slice(0, full ? 40 : 20);
  const more = await mapLimit(missing, 8, (a) => lf.artistTags(a));
  missing.forEach((a, i) => more[i] && tagsOf.set(nameKey(a), more[i]!));
  for (const c of pool.values()) {
    const t = tagsOf.get(nameKey(c.artist));
    if (t) {
      c.tags = t;
      c.tagsFromArtist = true;
    }
  }
  sources.add("Last.fm tags");
  return { pool, sources };
}
