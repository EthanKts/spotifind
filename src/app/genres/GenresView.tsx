"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ListMusic, Zap } from "lucide-react";
import { useDerivedTaste } from "@/lib/taste/profile";
import { categorize } from "@/lib/recommend/tags";
import { PageHeader, SectionTitle } from "@/components/Cards";
import { FAMILIES, SUBGENRES, resolveGenre } from "@/lib/recommend/genres";

function GenreTile({ tag, id, name, color, note }: { tag: string; id?: string; name?: string; color?: string; note?: string }) {
  const g = id ?? resolveGenre(tag).id;
  const label = name ?? tag;
  return (
    <li className="group flex items-center gap-3 rounded-md border border-line bg-elev px-3 py-2.5 transition-colors hover:bg-hl">
      <span className="size-2.5 shrink-0 rounded-full" style={{ background: color ?? "var(--color-mute)" }} aria-hidden />
      <Link href={`/genre/${encodeURIComponent(tag.toLowerCase())}`} className={`min-w-0 flex-1 truncate text-sm ${name ? "" : "capitalize"}`}>
        {label}
        {note && <span className="ml-1.5 text-xs normal-case text-mute">{note}</span>}
      </Link>
      <Link
        href={`/rapid?genre=${encodeURIComponent(g)}`}
        title={`Rapid-fire ${label}, matched to your taste`}
        aria-label={`Rapid-fire ${label}`}
        className="rounded p-1 text-mute opacity-0 transition-opacity hover:bg-hl-2 hover:text-ink group-hover:opacity-100 focus:opacity-100"
      >
        <Zap className="size-3.5" />
      </Link>
      <Link
        href={`/playlists?genre=${encodeURIComponent(g)}`}
        title={`Make a ${label} playlist matched to your taste`}
        aria-label={`Make a ${label} playlist`}
        className="rounded p-1 text-mute opacity-0 transition-opacity hover:bg-hl-2 hover:text-ink group-hover:opacity-100 focus:opacity-100"
      >
        <ListMusic className="size-3.5" />
      </Link>
    </li>
  );
}

export function GenresView() {
  const d = useDerivedTaste();
  const yours = useMemo(
    () =>
      Object.entries(d.tags)
        .filter(([t, w]) => w > 0 && categorize(t) !== "mood" && categorize(t) !== "production" && categorize(t) !== "vocal")
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([t]) => t),
    [d.tags],
  );
  const strong = useMemo(
    () => new Set(Object.entries(d.tags).filter(([, w]) => w > 0).sort((a, b) => b[1] - a[1]).slice(0, 40).map(([t]) => t)),
    [d.tags],
  );
  return (
    <div>
      <PageHeader title="Genres" description="Browse a genre, or let Spotifind find songs you’d like in one you don’t usually listen to." />
      {yours.length > 0 && (
        <>
          <SectionTitle sub="Learned from your ratings and Spotify listening.">Your genres</SectionTitle>
          <ul className="grid grid-cols-2 gap-2 px-4 sm:grid-cols-3 md:px-8 lg:grid-cols-4">
            {yours.map((t) => (
              <GenreTile key={t} tag={t} color="var(--color-find)" />
            ))}
          </ul>
        </>
      )}
      {FAMILIES.map((f) => (
        <section key={f.id}>
          <SectionTitle sub={f.id === FAMILIES[0].id ? "Hover a genre for Rapid-fire or a playlist matched to your taste. To combine several, use Playlists." : undefined}>
            {f.name}
          </SectionTitle>
          <ul className="grid grid-cols-2 gap-2 px-4 sm:grid-cols-3 md:px-8 lg:grid-cols-4">
            {SUBGENRES.filter((s) => s.family === f.id).map((s) => (
              <GenreTile
                key={s.id}
                tag={s.lastfm[0]}
                id={s.id}
                name={s.name}
                color={s.lastfm.some((t) => strong.has(t)) ? "var(--color-find)" : undefined}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
