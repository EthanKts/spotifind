"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { useMemo, useState } from "react";
import type { Item } from "@/lib/types";
import { topRatedArtists, useProfile } from "@/lib/taste/profile";
import { useEnriched } from "@/lib/client/data";
import { artistHref, norm } from "@/lib/util";
import { Artwork } from "./Artwork";
import { artistItem, Rating } from "./Actions";
import { useRecommendations } from "./Discovery";

type Candidate = { item: Item; why: string };

/**
 * Rate artists in seconds: a grid of artists you're likely to have an opinion on
 * (from songs you rated, music you explored, and artists close to your favourites).
 * Rating one swaps in the next.
 */
export function QuickRateArtists({ count = 8, title = "Rate some artists" }: { count?: number; title?: string }) {
  const p = useProfile();
  const [skipped, setSkipped] = useState<Set<string>>(() => new Set());

  // Seed for "similar to your favourite" suggestions.
  const fav = useMemo(() => topRatedArtists(p)[0]?.name, [p]);
  const favSeed = useMemo(() => (fav ? { kind: "artist" as const, artist: fav, title: fav } : null), [fav]);
  const similar = useRecommendations(favSeed, "lite");

  const candidates = useMemo(() => {
    const rated = new Set(Object.values(p.ratings).filter((r) => r.item.kind === "artist").map((r) => norm(r.item.artist)));
    const out = new Map<string, Candidate>();
    const add = (name: string, why: string) => {
      const k = norm(name);
      if (!k || rated.has(k) || out.has(k)) return;
      out.set(k, { item: artistItem(name), why });
    };
    // 1. Artists of songs/albums you've rated but never rated as an artist.
    const counts = new Map<string, { name: string; n: number; sum: number }>();
    for (const r of Object.values(p.ratings)) {
      if (r.item.kind === "artist") continue;
      const k = norm(r.item.artist);
      const c = counts.get(k) ?? { name: r.item.artist, n: 0, sum: 0 };
      c.n += 1;
      c.sum += r.rating;
      counts.set(k, c);
    }
    for (const c of [...counts.values()].sort((a, b) => b.n - a.n)) {
      add(c.name, `You rated ${c.n} of their song${c.n > 1 ? "s" : ""} (avg ${(c.sum / c.n).toFixed(1)}★)`);
    }
    // 2. Artists behind music you recently explored.
    for (const e of [...p.recentlyDiscovered, ...p.recentlyViewed]) add(e.item.artist, "From music you explored");
    // 3. Artists Last.fm links to your favourite.
    for (const c of similar.data?.candidates ?? []) {
      if (c.kind === "artist" && c.match != null && c.match >= 0.3) add(c.artist, `${Math.round(c.match * 100)}% similar to ${fav}`);
    }
    return [...out.values()];
  }, [p, similar.data, fav]);

  const visible = useMemo(() => candidates.filter((c) => !skipped.has(c.item.key)).slice(0, count), [candidates, skipped, count]);
  const items = useEnriched(useMemo(() => visible.map((v) => v.item), [visible]));

  if (!visible.length) return null;

  return (
    <section className="mx-4 mt-8 md:mx-8" aria-label={title}>
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          <p className="mt-0.5 text-[13px] text-sub">Each rating brings in the next artist.</p>
        </div>
        <span className="hidden text-xs text-mute sm:block">{candidates.length - skipped.size} to go</span>
      </div>
      <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
        {visible.map((c, i) => {
          const it = items[i] ?? c.item;
          return (
            <li key={c.item.key} className="group relative flex flex-col items-center rounded-lg border border-line bg-elev p-3 text-center">
              <button
                onClick={() => setSkipped((s) => new Set(s).add(c.item.key))}
                aria-label={`Skip ${c.item.title}`}
                title="Skip"
                className="absolute right-1.5 top-1.5 rounded-full p-1 text-mute opacity-0 transition-opacity hover:bg-hl hover:text-ink group-hover:opacity-100 focus:opacity-100"
              >
                <X className="size-3.5" />
              </button>
              <Link href={artistHref(c.item.artist)} className="w-3/4">
                <Artwork src={it.image} alt={c.item.title} kind="artist" className="aspect-square w-full" />
              </Link>
              <p className="mt-2 w-full truncate text-sm font-medium">{c.item.title}</p>
              <p className="line-clamp-2 min-h-[2lh] text-[11px] leading-tight text-mute">{c.why}</p>
              <div className="mt-1.5">
                <Rating item={c.item} size={16} />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
