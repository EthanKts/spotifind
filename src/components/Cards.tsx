"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, Compass } from "lucide-react";
import { useRef, type ReactNode } from "react";
import type { Item } from "@/lib/types";
import type { RatingContext } from "@/lib/taste/profile";
import { formatDuration, hrefFor } from "@/lib/util";
import { Artwork } from "./Artwork";
import { ArtistLine, discoverHref, OpenInSpotify, PlayButton, Rating } from "./Actions";
import { hoverPrefetch, useYear } from "@/lib/client/data";
import { usePlayer } from "@/lib/client/player";

/** Spotify-style card: artwork, title, subtitle, hover action. */
export function MediaCard({
  item,
  subtitle,
  badge,
  queue,
  onOpen,
}: {
  item: Item;
  subtitle?: ReactNode;
  badge?: ReactNode;
  queue?: Item[];
  onOpen?: () => void;
}) {
  const year = useYear(item.kind === "album" ? item : undefined);
  const sub =
    subtitle ??
    (item.kind === "artist" ? "Artist" : item.kind === "album" ? `${year ? `${year} · ` : ""}${item.artist}` : item.artist);
  return (
    <div {...hoverPrefetch(item)} className="group relative w-full rounded-lg p-3 transition-colors duration-200 hover:bg-hl/80 animate-rise">
      <Link
        href={hrefFor(item.kind, item.artist, item.title)}
        onClick={onOpen}
        aria-label={`${item.title}${item.kind !== "artist" ? ` by ${item.artist}` : ""}`}
        className="absolute inset-0 z-0 rounded-lg"
      />
      <div className="pointer-events-none relative">
        <Artwork src={item.image} alt={item.title} kind={item.kind} className="aspect-square w-full shadow-[0_8px_24px_rgb(0_0_0/0.5)]" />
        {badge && <div className="absolute left-2 top-2">{badge}</div>}
        <div className="pointer-events-auto absolute bottom-2 right-2 z-10 translate-y-2 opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100">
          {item.kind === "track" ? (
            <PlayButton item={item} queue={queue} />
          ) : (
            <Link
              href={discoverHref(item.kind, item.artist, item.title)}
              onClick={(e) => e.stopPropagation()}
              aria-label={`Discover music like ${item.title}`}
              title="Discover similar"
              className="grid size-12 place-items-center rounded-full bg-find text-black shadow-[0_8px_16px_rgb(0_0_0/0.4)] transition-transform hover:scale-105"
            >
              <Compass className="size-6" />
            </Link>
          )}
        </div>
      </div>
      <p className="pointer-events-none relative mt-3 truncate text-[15px] font-bold">{item.title}</p>
      <p className="pointer-events-none relative mt-0.5 line-clamp-2 text-sm text-sub">{sub}</p>
      {item.kind === "artist" && (
        <div className="relative z-10 mt-1.5 w-fit">
          <Rating item={item} size={14} />
        </div>
      )}
    </div>
  );
}

/** Horizontally scrollable shelf with Spotify-like header + arrow buttons. */
export function Shelf({ title, subtitle, href, children, loading }: { title: string; subtitle?: ReactNode; href?: string; children: ReactNode; loading?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (dir: number) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.8, behavior: "smooth" });
  return (
    <section className="group/shelf mt-6 first:mt-2">
      <div className="flex items-end justify-between gap-4 px-4 md:px-6">
        <div className="min-w-0">
          <h2 className="truncate text-2xl font-bold tracking-tight hover:underline">{href ? <Link href={href}>{title}</Link> : title}</h2>
          {subtitle && <p className="mt-0.5 truncate text-sm text-sub">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {href && (
            <Link href={href} className="text-sm font-bold text-sub hover:text-ink hover:underline">
              Show all
            </Link>
          )}
          <button onClick={() => scroll(-1)} aria-label="Scroll left" className="hidden size-8 place-items-center rounded-full bg-elev-2 text-sub hover:text-ink md:grid">
            <ChevronLeft className="size-5" />
          </button>
          <button onClick={() => scroll(1)} aria-label="Scroll right" className="hidden size-8 place-items-center rounded-full bg-elev-2 text-sub hover:text-ink md:grid">
            <ChevronRight className="size-5" />
          </button>
        </div>
      </div>
      <div ref={ref} className="no-scrollbar mt-2 flex snap-x snap-mandatory gap-0 overflow-x-auto scroll-smooth px-1 md:px-3">
        {loading
          ? Array.from({ length: 7 }, (_, i) => <CardSkeleton key={i} />)
          : children}
      </div>
    </section>
  );
}

export function ShelfItem({ children }: { children: ReactNode }) {
  return <div className="w-[44vw] max-w-[200px] shrink-0 snap-start sm:w-[180px] lg:w-[200px]">{children}</div>;
}

export function CardSkeleton() {
  return (
    <div className="w-[44vw] max-w-[200px] shrink-0 p-3 sm:w-[180px] lg:w-[200px]">
      <div className="aspect-square w-full animate-pulse rounded-md bg-hl" />
      <div className="mt-3 h-4 w-3/4 animate-pulse rounded bg-hl" />
      <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-hl" />
    </div>
  );
}

export function Grid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-1 px-1 sm:grid-cols-3 md:px-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">{children}</div>;
}

/** Spotify-like track row. */
export function TrackRow({
  item,
  index,
  queue,
  showArt = true,
  showAlbum = false,
  extra,
  highlight,
  ratingCtx,
}: {
  item: Item;
  index?: number;
  queue?: Item[];
  showArt?: boolean;
  showAlbum?: boolean;
  extra?: ReactNode;
  highlight?: ReactNode;
  ratingCtx?: RatingContext;
}) {
  const s = usePlayer();
  const current = s.item?.key === item.key;
  return (
    <div {...hoverPrefetch(item)} className={`group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-hl/70 md:px-4 ${showAlbum ? "md:grid-cols-[auto_minmax(0,1.4fr)_minmax(0,1fr)_auto]" : ""}`}>
      <div className="relative grid w-8 place-items-center text-sub tabular-nums">
        {index != null && <span className={`group-hover:invisible ${current ? "text-brand" : ""}`}>{index}</span>}
        <div className={`${index != null ? "absolute invisible group-hover:visible" : ""}`}>
          <PlayButton item={item} queue={queue} size="sm" className="!size-8 !bg-transparent !text-ink !shadow-none [&_svg]:!fill-ink" />
        </div>
      </div>
      <div className="flex min-w-0 items-center gap-3">
        {showArt && <Artwork src={item.image} alt={item.title} kind="track" className="size-10 shrink-0" />}
        <div className="min-w-0">
          <Link href={hrefFor("track", item.artist, item.title)} className={`block truncate font-medium hover:underline ${current ? "text-brand" : ""}`}>
            {item.title}
          </Link>
          <div className="flex min-w-0 items-center gap-2 text-sm text-sub">
            {item.hasPreview === false && <span className="shrink-0 rounded-sm bg-hl-2 px-1 text-[10px] font-bold uppercase text-mute" title="No preview available">No preview</span>}
            <ArtistLine name={item.artist} />
          </div>
          {highlight}
        </div>
      </div>
      {showAlbum && (
        <span className="hidden truncate text-sm text-sub md:block">
          {item.album ? (
            <Link href={hrefFor("album", item.artist, item.album)} className="hover:text-ink hover:underline">
              {item.album}
            </Link>
          ) : null}
        </span>
      )}
      <div className="flex items-center gap-1">
        {extra}
        <span className="opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
          <OpenInSpotify item={item} compact />
        </span>
        <span className="hidden sm:block">
          <Rating item={item} size={14} ctx={ratingCtx} />
        </span>
        <span className="hidden w-11 text-right text-sm tabular-nums text-sub sm:block">{formatDuration(item.durationSec)}</span>
      </div>
    </div>
  );
}

export function SectionTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-2 mt-8 px-4 md:px-6">
      <h2 className="text-2xl font-bold tracking-tight">{children}</h2>
      {sub && <p className="mt-0.5 text-sm text-sub">{sub}</p>}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mx-4 my-8 flex flex-col items-center rounded-xl bg-elev px-6 py-12 text-center md:mx-6">
      <p className="text-xl font-bold">{title}</p>
      {children && <div className="mt-2 max-w-md text-sub">{children}</div>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
