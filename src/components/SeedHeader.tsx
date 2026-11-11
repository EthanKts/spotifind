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
    <header className={`relative px-4 pt-4 md:px-8 ${compact ? "pb-5" : "pb-6"}`}>
      <div className={`relative flex gap-5 ${compact ? "flex-row items-center" : "flex-col sm:flex-row sm:items-end"}`}>
        <Artwork
          src={item.image}
          alt={item.title}
          kind={item.kind}
          className={`shrink-0 ${compact ? "size-20 md:size-24" : "mx-auto size-44 sm:mx-0 md:size-48"}`}
        />
        <div className="min-w-0">
          <p className="text-xs text-mute">{label ?? (kind === "track" ? "Song" : kind === "album" ? "Album" : "Artist")}</p>
          <h1 className={`mt-1 line-clamp-2 font-semibold leading-tight tracking-tight ${compact ? "text-2xl md:text-[28px]" : "text-3xl md:text-4xl"}`}>{item.title}</h1>
          <p className={`${compact ? "mt-1" : "mt-3"} text-sm text-sub`}>
            {kind !== "artist" && (
              <Link href={artistHref(item.artist)} className="font-medium text-ink hover:underline">
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
            {[year, item.listeners != null ? `${formatCount(item.listeners)} listeners` : null, ...(stats ?? [])]
              .filter(Boolean)
              .map((x, i) => `${i || kind !== "artist" ? " · " : ""}${x}`)}
          </p>
        </div>
      </div>
      <div className={`relative flex flex-wrap items-center gap-x-2 gap-y-2 ${compact ? "mt-4" : "mt-5"}`}>
        {kind === "track" && <PlayButton item={item} size="sm" />}
        <div className="flex h-9 items-center gap-2 rounded-md border border-line px-3">
          <span className="text-xs text-sub">Your rating</span>
          <Rating item={item} size={20} showLabel />
        </div>
        <OpenInSpotify item={item} />
        {extra}
      </div>
    </header>
  );
}
