"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { deriveTaste, useDerivedTaste, useProfile, type Profile } from "@/lib/taste/profile";
import type { ImportedItem, Item, Kind } from "@/lib/types";
import { useImported } from "@/lib/taste/imported";
import { SpotifyImport } from "@/components/SpotifyImport";
import type { Mode } from "@/lib/recommend/score";
import { displayScore } from "@/lib/recommend/explain";
import { useEnriched, useJson } from "@/lib/client/data";
import { useRanked, useRecommendations } from "@/components/Discovery";
import { MediaCard, Shelf, ShelfItem } from "@/components/Cards";
import { Artwork } from "@/components/Artwork";
import { Rating } from "@/components/Actions";
import { QuickRateArtists } from "@/components/QuickRateArtists";
import { hrefFor, norm } from "@/lib/util";

type Seed = { kind: Kind; artist: string; title: string };
const seedOf = (i: Item): Seed => ({ kind: i.kind, artist: i.artist, title: i.title });

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? "Good night" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}
const noopSubscribe = () => () => {};
/** Time-of-day greeting, read only in the browser (prerender shows a neutral greeting). */
function useGreeting() {
  return useSyncExternalStore(noopSubscribe, greeting, () => "Welcome back");
}

/** Pick seeds from what you rated 4–5★ (highest first, then most recent) and what you searched. */
function pickSeeds(p: Profile, imported: ImportedItem[]) {
  const rated = Object.values(p.ratings)
    .filter((r) => r.rating >= 4)
    .sort((a, b) => b.rating - a.rating || b.at - a.at);
  // Cold start: your strongest imported Spotify favourites stand in until you've rated a few things.
  const positives = rated.length >= 3 ? rated : [...rated, ...imported.filter((it) => !p.ratings[it.key]).slice(0, 6).map((it) => ({ item: it as Item, rating: 4, at: 0 }))];
  const artistAffinity = deriveTaste(p, imported).artists;
  const favTrackOrAlbum = positives.find((e) => e.item.kind !== "artist")?.item;
  const second = positives.filter((e) => e.item.kind !== "artist" && e.item.key !== favTrackOrAlbum?.key)[0]?.item;
  const topArtist = Object.entries(artistAffinity).sort((a, b) => b[1] - a[1])[0];
  const favArtistEntry = topArtist && topArtist[1] > 0
    ? positives.find((e) => norm(e.item.artist) === topArtist[0])?.item
    : undefined;
  const favArtist = favArtistEntry ? favArtistEntry.artist : positives[0]?.item.artist;
  const artistSeed = favArtist ? { kind: "artist" as const, artist: favArtist, title: favArtist } : null;
  return {
    madeForYou: favTrackOrAlbum ? seedOf(favTrackOrAlbum) : favArtist ? { kind: "artist" as const, artist: favArtist, title: favArtist } : null,
    hidden: second ? seedOf(second) : favTrackOrAlbum ? seedOf(favTrackOrAlbum) : artistSeed,
    favArtist: favArtist ? { kind: "artist" as const, artist: favArtist, title: favArtist } : null,
    search: p.recentSearches[0] ? seedOf(p.recentSearches[0].item) : null,
  };
}

function RecShelf({
  title,
  subtitle,
  seed,
  kind,
  mode = "closest",
  adventure = 0.25,
}: {
  title: string;
  subtitle?: string;
  seed: Seed | null;
  kind?: Kind;
  mode?: Mode;
  adventure?: number;
}) {
  const d = useDerivedTaste();
  const { data, loading, error } = useRecommendations(seed, "lite");
  // Shelves show new music: skip anything you've already rated well.
  const exclude = d.loved;
  const { ranked, items } = useRanked(data, mode, adventure, { kind, limit: 16, perArtist: 1, exclude });
  if (!seed || error || (data && !items.length)) return null;
  const href = `/discover?${new URLSearchParams({ kind: seed.kind, artist: seed.artist, title: seed.title })}`;
  return (
    <Shelf title={title} subtitle={subtitle} href={href} loading={loading}>
      {items.map((it, i) => {
        const s = displayScore(ranked[i].c);
        return (
          <ShelfItem key={it.key}>
            <MediaCard
              item={it}
              queue={items.filter((x) => x.kind === "track")}
              badge={s && <span className="rounded bg-black/80 px-1.5 py-0.5 text-[11px] font-medium text-ink">{Math.round(s.value * 100)}%</span>}
            />
          </ShelfItem>
        );
      })}
    </Shelf>
  );
}

const GENRES = ["jazz", "funk", "soul", "hip-hop", "electronic", "indie", "rock", "rnb", "house", "ambient", "jazz fusion", "neo-soul", "city pop", "afrobeat", "bossa nova", "shoegaze", "trip-hop", "metal", "folk", "classical"];

function Onboarding() {
  const [tag, setTag] = useState("jazz");
  const { data, loading } = useJson<{ artists: Item[]; albums: Item[] }>(`/api/tag?tag=${encodeURIComponent(tag)}`);
  const artists = useEnriched(data?.artists ?? []);
  const p = useProfile();
  const ratedArtists = Object.values(p.ratings).filter((r) => r.item.kind === "artist" && r.rating >= 4).length;
  return (
    <section className="panel mx-4 p-5 md:mx-8">
      <h2 className="text-lg font-semibold tracking-tight">Set up your taste</h2>
      <p className="mt-1 max-w-2xl text-sm text-sub">Rate a few artists you like, or import your listening from Spotify. Recommendations start once Spotifind knows 3 favourites.</p>
      <div className="mt-4 border-b border-line pb-5">
        <SpotifyImport variant="inline" />
      </div>
      <p className="label mt-5">Or rate artists by genre</p>
      <div className="no-scrollbar -mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {GENRES.map((g) => (
          <button
            key={g}
            onClick={() => setTag(g)}
            data-on={g === tag}
            className="option shrink-0 rounded-full px-3 py-1 text-[13px] capitalize"
          >
            {g}
          </button>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-4 sm:grid-cols-4 lg:grid-cols-6">
        {loading && Array.from({ length: 12 }, (_, i) => <div key={i} className="aspect-square animate-pulse rounded-full bg-hl" />)}
        {artists.map((a) => (
          <div key={a.key} className="group relative flex flex-col items-center text-center">
            <Link href={hrefFor("artist", a.artist, a.title)} className="w-full">
              <Artwork src={a.image} alt={a.title} kind="artist" className="aspect-square w-full" />
            </Link>
            <p className="mt-2 w-full truncate text-sm font-medium">{a.title}</p>
            <div className="mt-1">
              <Rating item={a} size={15} />
            </div>
          </div>
        ))}
      </div>
      {ratedArtists > 0 && (
        <p className="mt-4 text-sm text-sub">
          {ratedArtists} artist{ratedArtists > 1 ? "s" : ""} rated 4★+ — rate {Math.max(0, 3 - ratedArtists)} more and your shelves take over.
        </p>
      )}
    </section>
  );
}

export function HomeView() {
  const p = useProfile();
  const imp = useImported();
  const seeds = useMemo(() => pickSeeds(p, imp.items), [p, imp]);
  const recent = useMemo(() => {
    const seen = new Set<string>();
    return [...p.recentlyViewed, ...p.recentlyDiscovered]
      .sort((a, b) => b.at - a.at)
      .filter((e) => (seen.has(e.item.key) ? false : (seen.add(e.item.key), true)))
      .map((e) => e.item);
  }, [p]);
  const quick = recent.slice(0, 8);
  const positives = Object.values(p.ratings).filter((r) => r.rating >= 4).length;
  const showOnboarding = positives < 3 && !imp.items.length; // keep it up until a few favourites are rated (or Spotify taste imported)
  const hello = useGreeting();

  return (
    <div>
      <div className="px-4 pb-4 pt-4 md:px-8">
        <h1 className="text-2xl font-semibold tracking-tight md:text-[28px]">{hello}</h1>
        {quick.length > 0 && (
          <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
            {quick.map((it) => (
              <Link
                key={it.key}
                href={hrefFor(it.kind, it.artist, it.title)}
                className="group flex items-center gap-3 overflow-hidden rounded-md border border-line bg-elev pr-2 transition-colors hover:bg-hl"
              >
                <Artwork src={it.image} alt={it.title} kind={it.kind} rounded={false} className="size-11 shrink-0 rounded-none" />
                <span className="truncate text-[13px] font-medium">{it.title}</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {showOnboarding && <Onboarding />}

      {!showOnboarding && <QuickRateArtists />}

      <RecShelf title="Made for You" subtitle={seeds.madeForYou ? `Built from your love of ${seeds.madeForYou.title}` : undefined} seed={seeds.madeForYou} kind="track" />
      <RecShelf
        title="Based on Your Recent Searches"
        subtitle={seeds.search ? `Because you looked up ${seeds.search.title}` : undefined}
        seed={seeds.search}
        kind={seeds.search?.kind === "album" ? "album" : seeds.search?.kind === "artist" ? "artist" : "track"}
      />
      <RecShelf title="Albums You Might Love" subtitle={seeds.favArtist ? `Key albums from artists close to ${seeds.favArtist.artist}` : undefined} seed={seeds.favArtist} kind="album" />
      <RecShelf title="Hidden Gems" subtitle="Strong matches with far fewer listeners" seed={seeds.hidden} kind="track" mode="hidden" adventure={0.55} />
      <RecShelf title="Similar to Your Favorites" subtitle={seeds.favArtist ? `Artists Last.fm links to ${seeds.favArtist.artist}` : undefined} seed={seeds.favArtist} kind="artist" />

      {recent.length > 0 && (
        <Shelf title="Continue Exploring" subtitle="Where you left off" href="/recent">
          {recent.slice(0, 16).map((it) => (
            <ShelfItem key={it.key}>
              <MediaCard item={it} queue={recent.filter((x) => x.kind === "track")} />
            </ShelfItem>
          ))}
        </Shelf>
      )}
    </div>
  );
}
