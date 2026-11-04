"use client";

import Link from "next/link";
import { Compass, Sparkles } from "lucide-react";
import { useMemo, useState, useSyncExternalStore } from "react";
import { deriveTaste, hasTaste, useDerivedTaste, useProfile, type Profile } from "@/lib/taste/profile";
import type { Item, Kind } from "@/lib/types";
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
function pickSeeds(p: Profile) {
  const positives = Object.values(p.ratings)
    .filter((r) => r.rating >= 4)
    .sort((a, b) => b.rating - a.rating || b.at - a.at);
  const artistAffinity = deriveTaste(p).artists;
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
              badge={s && <span className="rounded-full bg-black/75 px-2 py-0.5 text-[11px] font-bold text-brand backdrop-blur">{Math.round(s.value * 100)}%</span>}
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
    <section className="mx-4 rounded-2xl bg-gradient-to-br from-brand/20 via-elev to-find/10 p-5 md:mx-6 md:p-8">
      <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-find">
        <Sparkles className="size-4" /> Set up your taste profile
      </p>
      <h2 className="mt-2 text-3xl font-extrabold tracking-tight md:text-4xl">What do you love listening to?</h2>
      <p className="mt-2 max-w-2xl text-sub">
        Pick a genre and give a few artists you love 4 or 5 stars — or search any song you love and hit Explore. Every rating sharpens your recommendations.
      </p>
      <div className="no-scrollbar -mx-1 mt-5 flex gap-2 overflow-x-auto px-1 pb-1">
        {GENRES.map((g) => (
          <button
            key={g}
            onClick={() => setTag(g)}
            className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold capitalize transition-colors ${g === tag ? "bg-ink text-black" : "bg-black/40 text-ink hover:bg-black/60"}`}
          >
            {g}
          </button>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {loading && Array.from({ length: 12 }, (_, i) => <div key={i} className="aspect-square animate-pulse rounded-full bg-hl" />)}
        {artists.map((a) => (
          <div key={a.key} className="group relative flex flex-col items-center text-center">
            <Link href={hrefFor("artist", a.artist, a.title)} className="w-full">
              <Artwork src={a.image} alt={a.title} kind="artist" className="aspect-square w-full transition-transform group-hover:scale-[1.03]" />
            </Link>
            <p className="mt-2 w-full truncate text-sm font-semibold">{a.title}</p>
            <div className="mt-1">
              <Rating item={a} size={15} />
            </div>
          </div>
        ))}
      </div>
      {ratedArtists > 0 && (
        <p className="mt-4 text-sm text-brand">
          {ratedArtists} artist{ratedArtists > 1 ? "s" : ""} rated 4★+ — rate {Math.max(0, 3 - ratedArtists)} more and your shelves take over.
        </p>
      )}
    </section>
  );
}

export function HomeView() {
  const p = useProfile();
  const seeds = useMemo(() => pickSeeds(p), [p]);
  const recent = useMemo(() => {
    const seen = new Set<string>();
    return [...p.recentlyViewed, ...p.recentlyDiscovered]
      .sort((a, b) => b.at - a.at)
      .filter((e) => (seen.has(e.item.key) ? false : (seen.add(e.item.key), true)))
      .map((e) => e.item);
  }, [p]);
  const quick = recent.slice(0, 8);
  const tasteReady = hasTaste(p);
  const positives = Object.values(p.ratings).filter((r) => r.rating >= 4).length;
  const showOnboarding = positives < 3; // keep it up until a few favourites are rated
  const hello = useGreeting();

  return (
    <div>
      <div className="bg-gradient-to-b from-brand-deep/30 to-transparent px-4 pb-4 pt-2 md:px-6">
        <h1 className="text-3xl font-extrabold tracking-tight md:text-[32px]">{hello}</h1>
        {quick.length > 0 && (
          <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
            {quick.map((it) => (
              <Link
                key={it.key}
                href={hrefFor(it.kind, it.artist, it.title)}
                className="group flex items-center gap-3 overflow-hidden rounded-md bg-white/[0.07] pr-2 transition-colors hover:bg-white/[0.16]"
              >
                <Artwork src={it.image} alt={it.title} kind={it.kind} rounded={false} className="size-12 shrink-0 rounded-none md:size-14" />
                <span className="truncate text-sm font-bold">{it.title}</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {showOnboarding && <Onboarding />}

      {tasteReady && !showOnboarding && (
        <div className="mx-4 mt-2 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-elev px-4 py-3 md:mx-6">
          <p className="text-sm text-sub">
            <span className="font-semibold text-ink">Spotifind is for finding, Spotify is for listening.</span> Open any shelf to fine-tune with Discovery controls.
          </p>
          <Link href="/discover" className="flex items-center gap-2 rounded-full bg-find px-4 py-1.5 text-sm font-bold text-black transition-transform hover:scale-105">
            <Compass className="size-4" /> Discover
          </Link>
        </div>
      )}

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
