"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Compass, History, Link2, Loader2 } from "lucide-react";
import { useEffect } from "react";
import type { Item } from "@/lib/types";
import type { SearchResponse } from "../api/search/route";
import { useJson } from "@/lib/client/data";
import { taste, useProfile } from "@/lib/taste/profile";
import { Artwork } from "@/components/Artwork";
import { MediaCard, Shelf, ShelfItem, TrackRow } from "@/components/Cards";
import { discoverHref, OpenInSpotify, PlayButton } from "@/components/Actions";
import { hrefFor } from "@/lib/util";

const BROWSE: { tag: string; color: string }[] = [
  { tag: "Jazz Fusion", color: "#8d67ab" },
  { tag: "Funk", color: "#e8115b" },
  { tag: "Neo-Soul", color: "#ba5d07" },
  { tag: "Hip-Hop", color: "#477d95" },
  { tag: "House", color: "#1e3264" },
  { tag: "Indie", color: "#608108" },
  { tag: "Ambient", color: "#27856a" },
  { tag: "City Pop", color: "#dc148c" },
  { tag: "Afrobeat", color: "#e1118c" },
  { tag: "Shoegaze", color: "#7358ff" },
  { tag: "Bossa Nova", color: "#148a08" },
  { tag: "Trip-Hop", color: "#503750" },
  { tag: "Soul", color: "#a56752" },
  { tag: "Electronic", color: "#0d73ec" },
  { tag: "Psychedelic Rock", color: "#e91429" },
  { tag: "Classical", color: "#7d4b32" },
];

function TopResult({ item, onPick }: { item: Item; onPick: () => void }) {
  return (
    <div className="group relative rounded-lg bg-elev p-5 transition-colors hover:bg-hl">
      <Link href={hrefFor(item.kind, item.artist, item.title)} onClick={onPick} className="absolute inset-0 rounded-lg" aria-label={`Open ${item.title}`} />
      <Artwork src={item.image} alt={item.title} kind={item.kind} className="pointer-events-none relative size-24 shadow-[0_8px_24px_rgb(0_0_0/0.5)]" />
      <p className="pointer-events-none relative mt-5 truncate text-3xl font-extrabold tracking-tight">{item.title}</p>
      <p className="pointer-events-none relative mt-1 text-sm text-sub">
        <span className="mr-2 rounded-full bg-black/40 px-2.5 py-1 text-xs font-bold capitalize text-ink">{item.kind === "track" ? "Song" : item.kind}</span>
        {item.kind !== "artist" && item.artist}
      </p>
      <div className="relative mt-5 flex flex-wrap items-center gap-2">
        <Link
          href={discoverHref(item.kind, item.artist, item.title)}
          onClick={onPick}
          className="flex items-center gap-2 rounded-full bg-find px-4 py-2 text-sm font-bold text-black transition-transform hover:scale-105"
        >
          <Compass className="size-4" /> Find music like this
        </Link>
        <OpenInSpotify item={item} />
        {item.kind === "track" && <PlayButton item={item} className="ml-auto" />}
      </div>
    </div>
  );
}

export function SearchView() {
  const q = useSearchParams().get("q")?.trim() ?? "";
  const p = useProfile();
  const { data, loading, error } = useJson<SearchResponse>(q ? `/api/search?q=${encodeURIComponent(q)}` : null);

  useEffect(() => {
    if (q && data && (data.tracks.length || data.albums.length || data.artists.length) && !/spotify/.test(q)) {
      const t = setTimeout(() => taste.recordQuery(q), 1500);
      return () => clearTimeout(t);
    }
  }, [q, data]);

  if (!q) {
    return (
      <div className="px-4 md:px-6">
        {p.recentQueries.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-3 text-2xl font-bold tracking-tight">Recent searches</h2>
            <div className="flex flex-wrap gap-2">
              {p.recentQueries.map((rq) => (
                <Link key={rq} href={`/search?q=${encodeURIComponent(rq)}`} className="flex items-center gap-2 rounded-full bg-hl px-4 py-1.5 text-sm font-semibold hover:bg-hl-2">
                  <History className="size-4 text-sub" /> {rq}
                </Link>
              ))}
            </div>
          </section>
        )}
        {p.recentSearches.length > 0 && (
          <Shelf title="Recently opened from search">
            {p.recentSearches.slice(0, 12).map((e) => (
              <ShelfItem key={e.item.key}>
                <MediaCard item={e.item} />
              </ShelfItem>
            ))}
          </Shelf>
        )}
        <div className="mt-8 rounded-xl border border-line bg-elev p-4 text-sm text-sub">
          <p className="flex items-center gap-2 font-semibold text-ink">
            <Link2 className="size-4 text-brand" /> Paste a Spotify link
          </p>
          <p className="mt-1">Drop an open.spotify.com track, album or artist link in the search bar to start discovering from it.</p>
        </div>
        <h2 className="mb-3 mt-8 text-2xl font-bold tracking-tight">Browse by sound</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {BROWSE.map((b) => (
            <Link
              key={b.tag}
              href={`/genre/${encodeURIComponent(b.tag.toLowerCase())}`}
              className="relative aspect-[1.6] overflow-hidden rounded-lg p-4 text-xl font-extrabold tracking-tight transition-transform hover:scale-[1.02]"
              style={{ background: b.color }}
            >
              {b.tag}
              <span className="absolute -bottom-3 -right-4 size-20 rotate-[25deg] rounded-md bg-black/25 shadow-xl" />
            </Link>
          ))}
        </div>
      </div>
    );
  }

  const pick = (it: Item) => () => taste.recordSearchPick(it);

  return (
    <div>
      {loading && (
        <p className="flex items-center gap-2 px-4 text-sub md:px-6">
          <Loader2 className="size-4 animate-spin" /> Searching…
        </p>
      )}
      {error && <p className="px-4 text-danger md:px-6">Search failed: {error}</p>}
      {data?.note && (
        <p className="mx-4 mb-4 flex items-center gap-2 rounded-lg bg-elev px-3 py-2 text-sm text-sub md:mx-6">
          <Link2 className="size-4 shrink-0 text-brand" /> {data.note}
        </p>
      )}
      {data && !data.top && !data.tracks.length && (
        <div className="px-4 py-12 text-center md:px-6">
          <p className="text-xl font-bold">No results found for “{q}”</p>
          <p className="mt-2 text-sub">Check the spelling, or try fewer or different keywords.</p>
        </div>
      )}
      {data?.top && (
        <div className="grid gap-6 px-4 md:px-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <section>
            <h2 className="mb-3 text-2xl font-bold tracking-tight">Top result</h2>
            <TopResult item={data.top} onPick={pick(data.top)} />
          </section>
          {data.tracks.length > 0 && (
            <section className="min-w-0">
              <h2 className="mb-3 text-2xl font-bold tracking-tight">Songs</h2>
              <div onClickCapture={(e) => {
                const row = (e.target as HTMLElement).closest("[data-key]");
                const it = data.tracks.find((t) => t.key === row?.getAttribute("data-key"));
                if (it) taste.recordSearchPick(it);
              }}>
                {data.tracks.slice(0, 5).map((t) => (
                  <div key={t.key} data-key={t.key}>
                    <TrackRow
                      item={t}
                      queue={data.tracks}
                      extra={
                        <Link href={discoverHref("track", t.artist, t.title)} title="Find music like this" className="rounded-full p-1.5 text-sub transition-colors hover:text-find">
                          <Compass className="size-4" />
                        </Link>
                      }
                    />
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
      {data && data.tracks.length > 5 && (
        <Shelf title="More songs">
          {data.tracks.slice(5).map((t) => (
            <ShelfItem key={t.key}>
              <MediaCard item={t} queue={data.tracks} onOpen={pick(t)} />
            </ShelfItem>
          ))}
        </Shelf>
      )}
      {data && data.artists.length > 0 && (
        <Shelf title="Artists">
          {data.artists.map((a) => (
            <ShelfItem key={a.key}>
              <MediaCard item={a} onOpen={pick(a)} />
            </ShelfItem>
          ))}
        </Shelf>
      )}
      {data && data.albums.length > 0 && (
        <Shelf title="Albums">
          {data.albums.map((a) => (
            <ShelfItem key={a.key}>
              <MediaCard item={a} onOpen={pick(a)} />
            </ShelfItem>
          ))}
        </Shelf>
      )}
    </div>
  );
}
