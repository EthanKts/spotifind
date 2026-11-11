"use client";

import Link from "next/link";
import { Compass, ExternalLink, Star, Play, Pause, Loader2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { taste, useProfile, type RatingContext } from "@/lib/taste/profile";
import type { Item, Kind, TagVector } from "@/lib/types";
import { artistHref, itemKey, spotifyOpenHref } from "@/lib/util";
import { SpotifyGlyph } from "./icons";
import { player, usePlayer } from "@/lib/client/player";

export function discoverHref(kind: Kind, artist: string, title: string) {
  const p = new URLSearchParams({ kind, artist, title });
  return `/discover?${p}`;
}

const btn = "grid place-items-center rounded-md transition-colors hover:bg-hl";

const LABELS = ["", "Not for me", "Not really", "It's okay", "Really like it", "Love it"];

/**
 * Star rating — the one feedback control in Spotifind.
 * 4–5★ steer recommendations toward this sound, 1★ hides it. Click the same star again to clear.
 */
export function Rating({
  item,
  tags,
  ctx,
  size = 16,
  showLabel = false,
}: {
  item: Item;
  tags?: TagVector;
  ctx?: RatingContext;
  size?: number;
  showLabel?: boolean;
}) {
  const p = useProfile();
  const r = p.ratings[item.key]?.rating ?? 0;
  const [hover, setHover] = useState(0);
  const [flash, setFlash] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const shown = hover || r;
  const label = flash ?? (hover ? LABELS[hover] : r ? LABELS[r] : "Rate it");

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center" role="radiogroup" aria-label={`Rate ${item.title}`} onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            role="radio"
            aria-checked={r === n}
            aria-label={`${n} star${n > 1 ? "s" : ""}: ${LABELS[n]}`}
            title={LABELS[n]}
            onMouseEnter={() => setHover(n)}
            onFocus={() => setHover(n)}
            onBlur={() => setHover(0)}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const clearing = r === n;
              taste.rate(item, n, tags, ctx);
              setFlash(clearing ? "Rating cleared" : n === 1 ? "Hidden — won't recommend it" : n >= 4 ? "Got it — more like this" : "Got it");
              if (timer.current) clearTimeout(timer.current);
              timer.current = setTimeout(() => setFlash(null), 1600);
            }}
            className="p-0.5"
          >
            <Star
              style={{ width: size, height: size }}
              className={
                n <= shown
                  ? shown === 1
                    ? "fill-danger text-danger"
                    : "fill-find text-find"
                  : "text-mute hover:text-sub"
              }
            />
          </button>
        ))}
      </div>
      {showLabel && (
        <span aria-live="polite" className={`text-xs ${flash ? "font-semibold text-find" : "text-sub"}`}>
          {label}
        </span>
      )}
    </div>
  );
}

export function artistItem(name: string): Item {
  return { kind: "artist", key: itemKey("artist", name, name), title: name, artist: name };
}

/**
 * An artist name you can rate on the spot: hover (or focus) reveals small stars next to the name,
 * and an existing rating shows as a badge. No need to open the artist page.
 */
export function ArtistLine({ name, className = "" }: { name: string; className?: string }) {
  const p = useProfile();
  const item = useMemo(() => artistItem(name), [name]);
  const r = p.ratings[item.key]?.rating;
  return (
    <div className={`group/artist flex min-w-0 items-center gap-1.5 ${className}`}>
      <Link href={artistHref(name)} onClick={(e) => e.stopPropagation()} className="truncate hover:text-ink hover:underline">
        {name}
      </Link>
      {r ? (
        <span className={`shrink-0 text-[11px] font-bold group-hover/artist:hidden ${r === 1 ? "text-danger" : "text-find"}`} title={`You rated ${name} ${r}★`}>
          {r}★
        </span>
      ) : null}
      <span className="hidden shrink-0 group-hover/artist:flex group-focus-within/artist:flex" title={`Rate ${name}`}>
        <Rating item={item} size={12} />
      </span>
    </div>
  );
}

export function ExploreButton({ item, compact = false }: { item: Item; compact?: boolean }) {
  return (
    <Link
      href={discoverHref(item.kind, item.artist, item.title)}
      onClick={(e) => e.stopPropagation()}
      title="Find more like this"
      className={
        compact
          ? `${btn} p-1.5 text-sub hover:text-find`
          : "btn btn-secondary"
      }
    >
      <Compass className={compact ? "size-5" : "size-4"} />
      {!compact && "Explore similar"}
    </Link>
  );
}

export function OpenInSpotify({ item, compact = false }: { item: Item; compact?: boolean }) {
  return (
    <a
      href={spotifyOpenHref(item.kind, item.artist, item.title)}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      title="Open in Spotify"
      aria-label={`Open ${item.title} in Spotify`}
      className={
        compact
          ? `${btn} p-1.5 text-sub hover:text-ink`
          : "btn btn-secondary"
      }
    >
      <SpotifyGlyph className={compact ? "size-5" : "size-4"} />
      {!compact && (
        <>
          Open in Spotify <ExternalLink className="size-3.5" />
        </>
      )}
    </a>
  );
}

/** Round green play button. Tracks only — plays the real 30s preview when one exists. */
export function PlayButton({ item, queue, size = "md", className = "" }: { item: Item; queue?: Item[]; size?: "sm" | "md" | "lg"; className?: string }) {
  const s = usePlayer();
  const current = s.item?.key === item.key;
  const playing = current && s.status === "playing";
  const loading = current && s.status === "loading";
  const noPreview = item.kind === "track" && item.hasPreview === false;
  const dim = size === "lg" ? "size-12" : size === "md" ? "size-10" : "size-9";
  const icon = size === "lg" ? "size-5" : size === "md" ? "size-4" : "size-4";
  return (
    <button
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); player.play(item, queue); }}
      aria-label={playing ? `Pause ${item.title}` : noPreview ? `${item.title}: no preview, open in Spotify` : `Play preview of ${item.title}`}
      title={noPreview ? "No preview available — use Open in Spotify" : "Play 30s preview"}
      className={`${dim} grid place-items-center rounded-full bg-brand text-black transition-colors hover:bg-brand-hi ${noPreview ? "opacity-60" : ""} ${className}`}
    >
      {loading ? <Loader2 className={`${icon} animate-spin`} /> : playing ? <Pause className={`${icon} fill-black`} /> : <Play className={`${icon} translate-x-px fill-black`} />}
    </button>
  );
}
