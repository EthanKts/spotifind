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
import { PageHeader } from "@/components/Cards";
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
    <div>
      <PageHeader title="Discover" description="Pick a song, album or artist to find music that sounds like it." />
      <div className="px-4 md:px-8">
        <form
          className="relative max-w-xl"
          onSubmit={(e) => {
            e.preventDefault();
            setSubmitted(q.trim());
          }}
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-sub" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="e.g. Chameleon — Herbie Hancock"
            aria-label="Choose a seed song, album or artist"
            className="input h-11 w-full pl-9 pr-24"
          />
          <button className="btn btn-primary btn-sm absolute right-1.5 top-1/2 -translate-y-1/2">Find</button>
        </form>

      {loading && (
        <p className="mt-6 flex items-center gap-2 text-sub">
          <Loader2 className="size-4 animate-spin" /> Searching…
        </p>
      )}
      {results.length > 0 && <SeedList title="Results" items={results} onPick={go} />}
      {suggestions.length > 0 && <SeedList title="From your ratings and history" items={suggestions} onPick={go} />}
      </div>
    </div>
  );
}

function SeedList({ title, items, onPick }: { title: string; items: Item[]; onPick: (it: Item) => void }) {
  return (
    <section className="mt-8">
      <h2 className="label mb-2">{title}</h2>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((it) => (
          <button key={it.key} onClick={() => onPick(it)} className="group flex items-center gap-3 rounded-md border border-line bg-elev p-2 text-left transition-colors hover:bg-hl">
            <Artwork src={it.image} alt={it.title} kind={it.kind} className="size-11 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{it.title}</span>
              <span className="block truncate text-[13px] capitalize text-sub">
                {it.kind === "track" ? "Song" : it.kind}
                {it.kind !== "artist" && ` · ${it.artist}`}
              </span>
            </span>
            <Compass className="mr-2 size-4 text-mute transition-colors group-hover:text-ink" />
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
        label={`Discover from this ${kind === "track" ? "song" : kind}`}
        compact
        extra={
          <Link href="/discover" className="btn btn-ghost btn-sm">
            Change seed
          </Link>
        }
      />
      <DiscoverView seed={{ kind, artist, title }} heading={false} />
    </div>
  );
}
