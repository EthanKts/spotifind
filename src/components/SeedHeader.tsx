"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import type { Item, Kind } from "@/lib/types";
import { useEnriched, useYear } from "@/lib/client/data";
import { taste } from "@/lib/taste/profile";
import { artistHref, formatCount, hrefFor, itemKey } from "@/lib/util";
import { Artwork } from "./Artwork";
import { OpenInSpotify, PlayButton, Rating } from "./Actions";

/** Big Spotify-style header for a track / album / artist, with all taste actions. */
export function SeedHeader({
  kind,
  artist,
  title,
  label,
  extra,
  item: given,
  stats,
  compact = false,
}: {
  kind: Kind;
  artist: string;
  title: string;
  label?: string;
  extra?: React.ReactNode;
  item?: Item;
  stats?: string[];
  compact?: boolean;
}) {
  const base = useMemo<Item[]>(
    () => [given ?? { kind, key: itemKey(kind, artist, title), title: kind === "artist" ? artist : title, artist }],
    [given, kind, artist, title],
  );
  const [item] = useEnriched(base);
  const year = useYear(item);

  useEffect(() => {
    taste.recordView(item);
    // record once per item key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.key, item.image]);

  return (
    <header className={`relative px-4 pt-2 md:px-6 ${compact ? "pb-4" : "pb-6"}`}>
      <div className="pointer-events-none absolute inset-x-0 -top-20 bottom-0 bg-gradient-to-b from-find/20 via-brand-deep/10 to-transparent" />
      <div className={`relative flex gap-5 ${compact ? "flex-row items-center" : "flex-col sm:flex-row sm:items-end"}`}>
        <Artwork
          src={item.image}
          alt={item.title}
          kind={item.kind}
          className={`shrink-0 shadow-[0_12px_48px_rgb(0_0_0/0.6)] ${compact ? "size-24 md:size-32" : "mx-auto size-48 sm:mx-0 md:size-56"}`}
        />
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider text-sub">{label ?? (kind === "track" ? "Song" : kind)}</p>
          <h1 className={`mt-1 line-clamp-2 font-extrabold leading-tight tracking-tight ${compact ? "text-2xl md:text-4xl" : "text-4xl md:text-6xl"}`}>{item.title}</h1>
          <p className={`${compact ? "mt-1" : "mt-3"} text-sm text-sub`}>
            {kind !== "artist" && (
              <Link href={artistHref(item.artist)} className="font-bold text-ink hover:underline">
                {item.artist}
              </Link>
            )}
            {kind === "track" && item.album && (
              <>
                {" · "}
                <Link href={hrefFor("album", item.artist, item.album)} className="hover:text-ink hover:underline">
                  {item.album}
                </Link>
              </>
            )}
            {year && ` · ${year}`}
            {item.listeners != null && ` · ${formatCount(item.listeners)} listeners`}
            {stats?.map((s) => ` · ${s}`)}
          </p>
        </div>
      </div>
      <div className={`relative flex flex-wrap items-center gap-x-3 gap-y-3 ${compact ? "mt-4" : "mt-6"}`}>
        {kind === "track" && <PlayButton item={item} size={compact ? "md" : "lg"} />}
        <div className="flex items-center gap-2 rounded-full bg-black/30 py-1 pl-3 pr-3">
          <span className="text-xs font-semibold text-sub">Your rating</span>
          <Rating item={item} size={20} showLabel />
        </div>
        <OpenInSpotify item={item} />
        {extra}
      </div>
    </header>
  );
}
