// Offline evaluation of Spotifind's recommendations (dev only): `npm run eval` with the dev server running.
//
// 1. Reads your ratings (read-only) from the Mac app's WebKit storage, plus your imported Spotify top songs.
// 2. Hides 20% of your favourites (4–5★ + imported top songs), builds the taste profile and seeds from the rest,
//    asks the running server for recommendations, and ranks them with the real score.ts.
// 3. Counts how many hidden favourites land in the top 50 (a song exactly, or an artist via any of its songs).
// 4. Repeats with each new source switched off, to show what each one contributes.
// Nothing is written to your data. No Spotify calls are made.

import { DatabaseSync } from "node:sqlite";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { rank } from "../src/lib/recommend/score";
import type { Candidate, RecommendResponse, TagVector } from "../src/lib/types";

const SERVER = process.env.SPOTIFIND_URL ?? "http://localhost:3000";
const SPLITS = Number(process.env.SPLITS ?? 3);
const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();

type Rating = { item: { kind: string; key: string; title: string; artist: string }; rating: number; tags?: TagVector };
type Fav = { key: string; kind: "track" | "artist" | "album"; artist: string; title: string; rating: number; tags?: TagVector; imported?: boolean };

function readRatings(): Rating[] {
  const root = join(homedir(), "Library/WebKit/com.ethanlilti.spotifind/WebsiteData/Default");
  const files: string[] = [];
  const dirs = (d: string) => (existsSync(d) ? readdirSync(d).filter((x) => statSync(join(d, x)).isDirectory()) : []);
  for (const a of dirs(root)) for (const b of dirs(join(root, a))) {
    const f = join(root, a, b, "LocalStorage/localstorage.sqlite3");
    if (existsSync(f)) files.push(f);
  }
  for (const f of files) {
    const db = new DatabaseSync(f, { readOnly: true });
    const row = db.prepare("SELECT value FROM ItemTable WHERE key = 'spotifind:profile:v2'").get() as { value: Uint8Array } | undefined;
    db.close();
    if (!row) continue;
    const json = Buffer.from(row.value).toString("utf16le");
    return Object.values((JSON.parse(json) as { ratings: Record<string, Rating> }).ratings);
  }
  return [];
}

function readImported(): Fav[] {
  const f = join(homedir(), "Library/Application Support/Spotifind/spotify-import.json");
  if (!existsSync(f)) return [];
  const d = JSON.parse(readFileSync(f, "utf8")) as { items: { key: string; kind: "track" | "artist"; artist: string; title: string; weight: number; tags: TagVector }[] };
  return d.items.filter((x) => x.kind === "track").sort((a, b) => b.weight - a.weight).slice(0, 40).map((x) => ({ key: x.key, kind: "track", artist: x.artist, title: x.title, rating: 4, tags: x.tags, imported: true }));
}

/** Deterministic shuffle so every configuration is compared on exactly the same hidden favourites. */
function shuffled<T>(xs: T[], seed: number): T[] {
  const a = [...xs];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) % 2 ** 31;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const TAG_DELTA: Record<number, number> = { 5: 1.5, 4: 0.75, 3: 0, 2: -0.4, 1: -0.75 };
function taste(known: Fav[], all: Rating[], hiddenKeys: Set<string>) {
  const tags: TagVector = {};
  const artists: Record<string, number> = {};
  for (const r of [...all.filter((r) => !hiddenKeys.has(r.item.key)).map((r) => ({ ...r.item, rating: r.rating, tags: r.tags })), ...known.filter((k) => k.imported)]) {
    for (const [t, w] of Object.entries(r.tags ?? {})) tags[t] = (tags[t] ?? 0) + (TAG_DELTA[r.rating] ?? 0) * w;
    artists[norm(r.artist)] = (artists[norm(r.artist)] ?? 0) + (r.rating >= 4 ? 0.5 : r.rating <= 2 ? -0.4 : 0);
  }
  return { tags, artists, loved: new Set(known.map((k) => k.key)), hidden: new Set<string>() };
}

async function pool(seeds: Fav[], exclude: string): Promise<{ cands: Candidate[]; seedTags: TagVector }> {
  const res = await Promise.all(
    seeds.map((s) =>
      fetch(`${SERVER}/api/recommend?${new URLSearchParams({ kind: s.kind, artist: s.artist, title: s.title, depth: "full", fg: "1", exclude, wait: "15000" })}`)
        .then((r) => r.json() as Promise<RecommendResponse>)
        .catch(() => null),
    ),
  );
  const byKey = new Map<string, Candidate>();
  const seedTags: TagVector = {};
  for (const r of res) {
    for (const [t, w] of Object.entries(r?.seed?.tags ?? {})) seedTags[t] = (seedTags[t] ?? 0) + w;
    for (const c of r?.candidates ?? []) if (c.kind === "track" && !byKey.has(c.key)) byKey.set(c.key, c);
  }
  return { cands: [...byKey.values()], seedTags };
}

const CONFIGS: { name: string; exclude: string }[] = [
  { name: "Last.fm only (before)", exclude: "listenbrainz,discogs,audio" },
  { name: "+ ListenBrainz", exclude: "discogs,audio" },
  { name: "+ Discogs styles", exclude: "listenbrainz,audio" },
  { name: "+ measured audio", exclude: "listenbrainz,discogs" },
  { name: "All sources (after)", exclude: "" },
];

async function main() {
  const ratings = readRatings();
  const favs: Fav[] = [
    ...ratings.filter((r) => r.rating >= 4).map((r) => ({ key: r.item.key, kind: r.item.kind as Fav["kind"], artist: r.item.artist, title: r.item.title, rating: r.rating, tags: r.tags })),
    ...readImported(),
  ];
  console.log(`Favourites: ${favs.length} (${ratings.filter((r) => r.rating >= 4).length} rated 4–5★, ${favs.filter((f) => f.imported).length} imported top songs) · ${SPLITS} random splits · hidden 20% each`);
  if (favs.length < 10) return console.log("Not enough favourites to evaluate yet.");

  const totals = new Map(CONFIGS.map((c) => [c.name, { hits: 0, songHits: 0, artistHits: 0, hidden: 0 }]));
  for (let split = 1; split <= SPLITS; split++) {
    const order = shuffled(favs, split * 7919);
    const nHidden = Math.max(2, Math.round(favs.length * 0.2));
    const hidden = order.slice(0, nHidden);
    const known = order.slice(nHidden);
    const hiddenKeys = new Set(hidden.map((h) => h.key));
    const t = taste(known, ratings, hiddenKeys);
    const seeds = known.filter((k) => !k.imported).sort((a, b) => b.rating - a.rating).slice(0, 3);
    for (const cfg of CONFIGS) {
      const { cands, seedTags } = await pool(seeds, cfg.exclude);
      const max = Math.max(1e-9, ...Object.values(seedTags));
      const seed = { kind: "artist" as const, key: "seed", title: "seed", artist: "seed", tags: Object.fromEntries(Object.entries(seedTags).map(([k, v]) => [k, v / max])) };
      const top = rank(cands.filter((c) => !t.loved.has(c.key) || hiddenKeys.has(c.key)), seed, "closest", 0.3, { ...t, loved: new Set() }, { kind: "track", limit: 50, perArtist: 2 });
      const keys = new Set(top.map((r) => r.c.key));
      const artists = new Set(top.map((r) => norm(r.c.artist)));
      const tot = totals.get(cfg.name)!;
      for (const h of hidden) {
        tot.hidden++;
        if (h.kind === "track" && keys.has(h.key)) {
          tot.hits++;
          tot.songHits++;
        } else if (h.kind === "artist" && artists.has(norm(h.artist))) {
          tot.hits++;
          tot.artistHits++;
        }
      }
    }
    process.stdout.write(`  split ${split}/${SPLITS} done\n`);
  }
  console.log("\nHidden favourites found in the top 50 (higher is better):");
  const base = totals.get(CONFIGS[0].name)!;
  for (const cfg of CONFIGS) {
    const t = totals.get(cfg.name)!;
    const rate = (100 * t.hits) / t.hidden;
    const delta = rate - (100 * base.hits) / base.hidden;
    console.log(`  ${cfg.name.padEnd(24)} ${String(t.hits).padStart(3)}/${t.hidden}  = ${rate.toFixed(1)}%  (songs ${t.songHits}, artists ${t.artistHits})${cfg === CONFIGS[0] ? "" : `  ${delta >= 0 ? "+" : ""}${delta.toFixed(1)} pts`}`);
  }
}

void main();
