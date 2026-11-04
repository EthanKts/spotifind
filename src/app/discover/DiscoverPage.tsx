"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Compass, Loader2, Search } from "lucide-react";
import { useState } from "react";
import type { Item, Kind } from "@/lib/types";
import type { SearchResponse } from "../api/search/route";
import { useJson } from "@/lib/client/data";
import { useProfile } from "@/lib/taste/profile";
import { DiscoverView } from "@/components/Discovery";
import { SeedHeader } from "@/components/SeedHeader";
import { Artwork } from "@/components/Artwork";
import { discoverHref } from "@/components/Actions";

function SeedPicker() {
  const router = useRouter();
  const p = useProfile();
  const [q, setQ] = useState("");
  const [submitted, setSubmitted] = useState("");
  const { data, loading } = useJson<SearchResponse>(submitted ? `/api/search?q=${encodeURIComponent(submitted)}` : null);
  const suggestions = [...Object.values(p.ratings).filter((r) => r.rating >= 4), ...p.recentlyViewed]
    .sort((a, b) => b.at - a.at)
    .map((e) => e.item)
    .filter((it, i, arr) => arr.findIndex((x) => x.key === it.key) === i)
    .slice(0, 12);
  const results: Item[] = data ? [...(data.top ? [data.top] : []), ...data.tracks.slice(0, 6), ...data.albums.slice(0, 4), ...data.artists.slice(0, 4)].filter((it, i, arr) => arr.findIndex((x) => x.key === it.key) === i) : [];
  const go = (it: Item) => router.push(discoverHref(it.kind, it.artist, it.title));

  return (
    <div className="px-4 md:px-6">
      <div className="rounded-2xl bg-gradient-to-br from-find/25 via-elev to-brand/10 p-6 md:p-10">
        <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-find">
          <Compass className="size-4" /> Discover
        </p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight md:text-5xl">Start from something you love.</h1>
        <p className="mt-3 max-w-2xl text-sub">
          Pick a song, album or artist. Spotifind finds music that matches its groove, instrumentation, mood and vocal feel — then lets you steer from
          Closest Match to more adventurous.
        </p>
        <form
          className="relative mt-6 max-w-xl"
          onSubmit={(e) => {
            e.preventDefault();
            setSubmitted(q.trim());
          }}
        >
          <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-sub" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="e.g. Chameleon — Herbie Hancock"
            aria-label="Choose a seed song, album or artist"
            className="h-12 w-full rounded-full bg-black/50 pl-12 pr-28 text-ink placeholder:text-mute focus:outline-none focus:ring-2 focus:ring-find"
          />
          <button className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full bg-find px-4 py-2 text-sm font-bold text-black">Find</button>
        </form>
      </div>

      {loading && (
        <p className="mt-6 flex items-center gap-2 text-sub">
          <Loader2 className="size-4 animate-spin" /> Searching…
        </p>
      )}
      {results.length > 0 && <SeedList title="Pick a starting point" items={results} onPick={go} />}
      {suggestions.length > 0 && <SeedList title="Or start from something you rated or viewed" items={suggestions} onPick={go} />}
    </div>
  );
}

function SeedList({ title, items, onPick }: { title: string; items: Item[]; onPick: (it: Item) => void }) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-xl font-bold">{title}</h2>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((it) => (
          <button key={it.key} onClick={() => onPick(it)} className="group flex items-center gap-3 rounded-lg bg-elev p-2 text-left transition-colors hover:bg-hl">
            <Artwork src={it.image} alt={it.title} kind={it.kind} className="size-14 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{it.title}</span>
              <span className="block truncate text-sm capitalize text-sub">
                {it.kind === "track" ? "Song" : it.kind}
                {it.kind !== "artist" && ` · ${it.artist}`}
              </span>
            </span>
            <Compass className="mr-2 size-5 text-sub transition-colors group-hover:text-find" />
          </button>
        ))}
      </div>
    </section>
  );
}

export function DiscoverPage() {
  const sp = useSearchParams();
  const kind = sp.get("kind") as Kind | null;
  const artist = sp.get("artist");
  const title = sp.get("title") ?? artist;
  if (!kind || !artist || !title || !["track", "album", "artist"].includes(kind)) return <SeedPicker />;
  return (
    <div key={`${kind}|${artist}|${title}`}>
      <SeedHeader
        kind={kind}
        artist={artist}
        title={title}
        label={`Discovering from this ${kind === "track" ? "song" : kind}`}
        compact
        extra={
          <Link href="/discover" className="text-sm font-semibold text-sub hover:text-ink hover:underline">
            Change seed
          </Link>
        }
      />
      <DiscoverView seed={{ kind, artist, title }} heading={false} />
    </div>
  );
}
