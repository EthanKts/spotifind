"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Clock3, Compass, Home, ListMusic, Search, Sparkles, Star } from "lucide-react";
import { useMemo, useState } from "react";
import { Logo } from "./Logo";
import { topRatedArtists, topRatedSongs, useProfile, type Playlist } from "@/lib/taste/profile";
import { useEnriched } from "@/lib/client/data";
import { Artwork } from "./Artwork";
import { artistHref, hrefFor } from "@/lib/util";
import { artistItem } from "./Actions";
import type { Item } from "@/lib/types";

const MAIN = [
  { href: "/", label: "Home", icon: Home },
  { href: "/search", label: "Search", icon: Search },
  { href: "/discover", label: "Discover", icon: Compass, accent: true },
  { href: "/playlists", label: "Playlists", icon: ListMusic },
];

type Tab = "songs" | "artists" | "playlists";

function isActive(path: string, href: string) {
  if (href === "/") return path === "/";
  if (href === "/playlists") return path === "/playlists" || path === "/playlist";
  return path === href || path.startsWith(href + "/");
}

export function PlaylistCover({ pl, className = "" }: { pl: Playlist; className?: string }) {
  const arts = pl.tracks.map((t) => t.image).filter(Boolean).slice(0, 4) as string[];
  if (arts.length < 4) return <Artwork src={arts[0]} alt={pl.name} kind="album" className={className} />;
  return (
    <div className={`grid grid-cols-2 overflow-hidden rounded-md ${className}`} role="img" aria-label={pl.name}>
      {arts.map((src, i) => (
        // eslint-disable-next-line @next/next/no-img-element -- remote art from several CDNs
        <img key={i} src={src} alt="" className="aspect-square size-full object-cover" loading="lazy" />
      ))}
    </div>
  );
}

function Row({ href, image, title, sub, right, kind, round }: { href: string; image?: string; title: string; sub: string; right?: React.ReactNode; kind: Item["kind"]; round?: boolean }) {
  return (
    <li>
      <Link href={href} className="flex items-center gap-3 rounded-md p-2 transition-colors hover:bg-hl">
        <Artwork src={image} alt={title} kind={kind} rounded={round} className="size-12 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-medium">{title}</span>
          <span className="block truncate text-sm text-sub">{sub}</span>
        </span>
        {right}
      </Link>
    </li>
  );
}

function Stars({ n }: { n: number }) {
  return (
    <span className="flex shrink-0 items-center gap-0.5 text-xs font-bold tabular-nums text-find">
      {Number.isInteger(n) ? n : n.toFixed(1)}
      <Star className="size-3 fill-find" />
    </span>
  );
}

export function Sidebar() {
  const path = usePathname();
  const p = useProfile();
  const [tab, setTab] = useState<Tab>("songs");

  const songs = useMemo(() => topRatedSongs(p).slice(0, 50), [p]);
  const artists = useMemo(() => topRatedArtists(p).slice(0, 50), [p]);
  // Real artist photos (Deezer) instead of album art for the artist list.
  const artistPics = useEnriched(useMemo(() => artists.map((a) => artistItem(a.name)), [artists]));

  const empty =
    tab === "songs" ? !songs.length : tab === "artists" ? !artists.length : !p.playlists.length;

  return (
    <aside className="hidden w-[260px] shrink-0 min-h-0 flex-col gap-2 md:flex lg:w-[300px]">
      <nav className="rounded-lg bg-base px-3 py-4" aria-label="Main">
        <Link href="/" className="block px-3 pb-4" aria-label="Spotifind home">
          <Logo id="sf-g-side" />
        </Link>
        <ul className="space-y-1">
          {MAIN.map(({ href, label, icon: Icon, accent }) => {
            const active = isActive(path, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={`flex items-center gap-4 rounded-md px-3 py-2 text-[15px] font-bold transition-colors ${active ? "text-ink" : "text-sub hover:text-ink"}`}
                >
                  <Icon className={`size-6 ${accent && active ? "text-find" : ""}`} strokeWidth={active ? 2.6 : 2} />
                  {label}
                  {accent && (
                    <span className="ml-auto flex items-center gap-1 rounded-full bg-find/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-find">
                      <Sparkles className="size-3" />
                      Core
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <section className="flex min-h-0 flex-1 flex-col rounded-lg bg-base" aria-label="Your music">
        <div className="px-3 pt-3">
          <Link
            href="/recent"
            className={`flex items-center gap-4 rounded-md px-3 py-2 text-[15px] font-bold transition-colors ${isActive(path, "/recent") ? "bg-hl text-ink" : "text-sub hover:text-ink"}`}
          >
            <Clock3 className="size-5" />
            Recently Discovered
          </Link>
        </div>
        <div className="flex gap-2 px-4 pb-2 pt-3" role="tablist" aria-label="Show">
          {(
            [
              ["songs", "Top songs"],
              ["artists", "Top artists"],
              ["playlists", "Playlists"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`rounded-full px-3 py-1 text-[13px] font-semibold transition-colors ${tab === id ? "bg-ink text-black" : "bg-hl text-ink hover:bg-hl-2"}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="scroll-area min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {empty ? (
            <div className="m-2 rounded-lg bg-elev-2 p-4">
              {tab === "playlists" ? (
                <>
                  <p className="font-bold">Make your first playlist</p>
                  <p className="mt-1 text-sm text-sub">Songs picked from your recommendations — you choose the style (Hidden Gems, Same Groove…) and how many.</p>
                  <Link href="/playlists" className="mt-4 inline-block rounded-full bg-ink px-4 py-1.5 text-sm font-bold text-black transition-transform hover:scale-105">
                    Create playlist
                  </Link>
                </>
              ) : (
                <>
                  <p className="font-bold">{tab === "songs" ? "Your top-rated songs appear here" : "Your top-rated artists appear here"}</p>
                  <p className="mt-1 text-sm text-sub">
                    {tab === "songs" ? "Rate songs 4–5★ as you discover." : "Rate artists directly, or rate their songs — artists you rate highly show up here."}
                  </p>
                  <Link href="/discover" className="mt-4 inline-block rounded-full bg-ink px-4 py-1.5 text-sm font-bold text-black transition-transform hover:scale-105">
                    Start discovering
                  </Link>
                </>
              )}
            </div>
          ) : (
            <ul>
              {tab === "songs" &&
                songs.map((r) => (
                  <Row
                    key={r.item.key}
                    href={hrefFor(r.item.kind, r.item.artist, r.item.title)}
                    image={r.item.image}
                    title={r.item.title}
                    sub={`${r.item.kind === "album" ? "Album" : "Song"} · ${r.item.artist}`}
                    right={<Stars n={r.rating} />}
                    kind={r.item.kind}
                  />
                ))}
              {tab === "artists" &&
                artists.map((a, i) => (
                  <Row
                    key={a.key}
                    href={artistHref(a.name)}
                    image={artistPics[i]?.image ?? a.image}
                    title={a.name}
                    sub={
                      a.rating
                        ? a.songCount
                          ? `Rated ${a.rating}★ · ${a.songCount} song${a.songCount > 1 ? "s" : ""} rated`
                          : `You rated ${a.rating}★`
                        : `${a.songCount} song${a.songCount > 1 ? "s" : ""} rated · avg ${a.songAvg?.toFixed(1)}★`
                    }
                    right={<Stars n={a.score} />}
                    kind="artist"
                    round
                  />
                ))}
              {tab === "playlists" &&
                p.playlists.map((pl) => (
                  <li key={pl.id}>
                    <Link href={`/playlist?id=${pl.id}`} className="flex items-center gap-3 rounded-md p-2 transition-colors hover:bg-hl">
                      <PlaylistCover pl={pl} className="size-12 shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-medium">{pl.name}</span>
                        <span className="block truncate text-sm text-sub">Playlist · {pl.tracks.length} songs</span>
                      </span>
                    </Link>
                  </li>
                ))}
            </ul>
          )}
        </div>
        <Link
          href="/ratings"
          className={`mx-3 mb-3 flex items-center justify-between rounded-md px-3 py-2 text-sm font-semibold transition-colors ${isActive(path, "/ratings") ? "bg-hl text-ink" : "text-sub hover:bg-hl hover:text-ink"}`}
        >
          All ratings &amp; taste profile
          <ChevronRight className="size-4" />
        </Link>
      </section>
    </aside>
  );
}

export function MobileNav() {
  const path = usePathname();
  const items = [
    { href: "/", label: "Home", icon: Home },
    { href: "/search", label: "Search", icon: Search },
    { href: "/discover", label: "Discover", icon: Compass },
    { href: "/playlists", label: "Playlists", icon: ListMusic },
    { href: "/ratings", label: "Ratings", icon: Star },
  ];
  return (
    <nav aria-label="Main" className="grid grid-cols-5 bg-gradient-to-t from-black via-black/95 to-black/80 pb-[env(safe-area-inset-bottom)] md:hidden">
      {items.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? path === "/" : isActive(path, href);
        return (
          <Link key={href} href={href} className={`flex flex-col items-center gap-1 py-2.5 text-[11px] ${active ? "text-ink" : "text-sub"}`}>
            <Icon className={`size-6 ${active && href === "/discover" ? "text-find" : ""}`} strokeWidth={active ? 2.6 : 2} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
