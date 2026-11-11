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
import { PageHeader, MediaCard, Shelf, ShelfItem, TrackRow } from "@/components/Cards";
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
    <div className="group relative rounded-lg border border-line bg-elev p-4 transition-colors hover:bg-hl">
      <Link href={hrefFor(item.kind, item.artist, item.title)} onClick={onPick} className="absolute inset-0 rounded-lg" aria-label={`Open ${item.title}`} />
      <Artwork src={item.image} alt={item.title} kind={item.kind} className="pointer-events-none relative size-20" />
      <p className="pointer-events-none relative mt-4 truncate text-xl font-semibold tracking-tight">{item.title}</p>
      <p className="pointer-events-none relative mt-1 text-sm text-sub">
        <span className="mr-1.5 capitalize text-mute">{item.kind === "track" ? "Song" : item.kind}</span>
        {item.kind !== "artist" && item.artist}
      </p>
      <div className="relative mt-5 flex flex-wrap items-center gap-2">
        <Link
          href={discoverHref(item.kind, item.artist, item.title)}
          onClick={onPick}
          className="btn btn-primary"
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
      <div>
      <PageHeader title="Search" description="Find a song, album or artist, or paste a Spotify link." />
      <div className="px-4 md:px-8">
        {p.recentQueries.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-3 text-lg font-semibold tracking-tight">Recent searches</h2>
            <div className="flex flex-wrap gap-2">
              {p.recentQueries.map((rq) => (
                <Link key={rq} href={`/search?q=${encodeURIComponent(rq)}`} className="flex items-center gap-1.5 rounded-full border border-line bg-elev px-3 py-1 text-[13px] hover:bg-hl">
                  <History className="size-3.5 text-mute" /> {rq}
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
        <div className="panel mt-8 p-4 text-sm text-sub">
          <p className="flex items-center gap-2 font-medium text-ink">
            <Link2 className="size-4 text-sub" /> Paste a Spotify link
          </p>
          <p className="mt-1">Drop an open.spotify.com track, album or artist link in the search bar to start discovering from it.</p>
        </div>
        <h2 className="mb-3 mt-8 text-lg font-semibold tracking-tight">Browse by sound</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {BROWSE.map((b) => (
            <Link
              key={b.tag}
              href={`/genre/${encodeURIComponent(b.tag.toLowerCase())}`}
              className="flex items-center gap-2.5 rounded-md border border-line bg-elev px-3 py-2.5 text-sm transition-colors hover:bg-hl"
            >
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: b.color }} />
              {b.tag}
            </Link>
          ))}
        </div>
      </div>
      </div>
    );
  }

  const pick = (it: Item) => () => taste.recordSearchPick(it);

  return (
    <div>
      {loading && (
        <p className="flex items-center gap-2 px-4 text-sub md:px-8">
          <Loader2 className="size-4 animate-spin" /> Searching…
        </p>
      )}
      {error && <p className="px-4 text-danger md:px-8">Search failed: {error}</p>}
      {data?.note && (
        <p className="panel mx-4 mb-4 flex items-center gap-2 px-3 py-2 text-sm text-sub md:mx-8">
          <Link2 className="size-4 shrink-0 text-sub" /> {data.note}
        </p>
      )}
      {data && !data.top && !data.tracks.length && (
        <div className="px-4 py-12 text-center md:px-8">
          <p className="text-[16px] font-semibold">No results for “{q}”</p>
          <p className="mt-2 text-sub">Check the spelling, or try fewer or different keywords.</p>
        </div>
      )}
      {data?.top && (
        <div className="grid gap-6 px-4 md:px-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <section>
            <h2 className="mb-3 text-lg font-semibold tracking-tight">Top result</h2>
            <TopResult item={data.top} onPick={pick(data.top)} />
          </section>
          {data.tracks.length > 0 && (
            <section className="min-w-0">
              <h2 className="mb-3 text-lg font-semibold tracking-tight">Songs</h2>
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
                        <Link href={discoverHref("track", t.artist, t.title)} title="Find music like this" className="rounded-md p-1.5 text-sub transition-colors hover:bg-hl hover:text-ink">
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
