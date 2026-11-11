"use client";

import Link from "next/link";
import { RotateCcw, Star, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { taste, topRatedArtists, useDerivedTaste, useProfile, type Rating as RatingEntry } from "@/lib/taste/profile";
import { useSearchParams } from "next/navigation";
import { MODES } from "@/lib/recommend/score";
import { categorize } from "@/lib/recommend/tags";
import { EmptyState, PageHeader, SectionTitle } from "@/components/Cards";
import { Artwork } from "@/components/Artwork";
import { Rating } from "@/components/Actions";
import { QuickRateArtists } from "@/components/QuickRateArtists";
import { artistHref, hrefFor } from "@/lib/util";
import { imported as importedStore, useImported } from "@/lib/taste/imported";
import { SpotifyImport } from "@/components/SpotifyImport";
import { useEnriched } from "@/lib/client/data";
import type { ImportedItem, SpotifyRange } from "@/lib/types";

const RANGE_LABEL: Record<SpotifyRange, string> = { long_term: "all-time", medium_term: "last 6 months", short_term: "last 4 weeks" };

function ImportedRow({ it: raw }: { it: ImportedItem }) {
  const [it] = useEnriched(useMemo(() => [raw], [raw]));
  return (
    <li className="flex items-center gap-3 rounded-md border border-line bg-elev p-2 transition-colors hover:bg-hl">
      <Link href={hrefFor(it.kind, it.artist, it.title)} className="flex min-w-0 flex-1 items-center gap-3">
        <Artwork src={it.image} alt={it.title} kind={it.kind} rounded={it.kind === "artist"} className="size-10 shrink-0" />
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{it.title}</span>
          <span className="block truncate text-[13px] text-sub">
            {it.kind === "artist" ? "Artist" : `Song · ${it.artist}`}
          </span>
          <span className="block truncate text-xs text-mute">
            Top {it.kind === "artist" ? "artist" : "song"}: {it.ranges.map((r) => RANGE_LABEL[r]).join(", ")} · counts as {(it.weight * 4).toFixed(1)}★-ish
          </span>
        </span>
      </Link>
      <div className="shrink-0" title="Rate it yourself — your rating replaces the imported signal">
        <Rating item={it} tags={it.tags} size={14} />
      </div>
      <button
        onClick={() => void importedStore.remove(it.key)}
        aria-label={`Remove ${it.title} from imported taste`}
        title="Remove from imported taste"
        className="shrink-0 rounded-full p-1.5 text-mute hover:bg-hl-2 hover:text-ink"
      >
        <X className="size-4" />
      </button>
    </li>
  );
}

/** Spotify listening history: its own section, removable, always below your real ratings in weight. */
function ImportedSection() {
  const p = useProfile();
  const imp = useImported();
  const [all, setAll] = useState(false);
  // Real ratings always win: items you rated yourself leave this list.
  const items = imp.items.filter((it) => !p.ratings[it.key]);
  const overridden = imp.items.length - items.length;

  if (!imp.items.length) {
    return (
      <section id="imported" className="panel mx-4 mt-6 p-5 md:mx-8">
        <SpotifyImport variant="inline" />
      </section>
    );
  }
  const shown = all ? items : items.slice(0, 12);
  return (
    <section id="imported" aria-label="Imported from Spotify">
      <SectionTitle
        sub={`Your Spotify top artists and songs${imp.user ? ` (${imp.user})` : ""}, imported ${new Date(imp.importedAt).toLocaleDateString()}. They shape recommendations a little less than your own stars${overridden ? ` — ${overridden} you rated yourself use your rating instead` : ""}.`}
      >
        <span className="flex items-center gap-2">
          Imported from Spotify
          <span className="text-sm font-normal text-mute">{items.length}</span>
        </span>
      </SectionTitle>
      <div className="mb-3 flex flex-wrap items-center gap-2 px-4 md:px-8">
        <SpotifyImport variant="panel" />
        <button
          onClick={() => {
            if (window.confirm("Remove everything imported from Spotify? Your own ratings stay.")) void importedStore.removeAll();
          }}
          className="btn btn-danger"
        >
          <Trash2 className="size-4" /> Remove all imported
        </button>
      </div>
      <ul className="grid gap-1.5 px-4 md:px-8 xl:grid-cols-2">
        {shown.map((it) => (
          <ImportedRow key={it.key} it={it} />
        ))}
      </ul>
      {items.length > shown.length || all ? (
        <button onClick={() => setAll(!all)} className="btn btn-ghost btn-sm mx-4 mt-3 md:mx-8">
          {all ? "Show fewer" : `Show all ${items.length}`}
        </button>
      ) : null}
    </section>
  );
}

const GROUPS = [
  { stars: 5, title: "Love it" },
  { stars: 4, title: "Really like it" },
  { stars: 3, title: "It's okay" },
  { stars: 2, title: "Not really" },
  { stars: 1, title: "Not for me — hidden from recommendations" },
];

function modeLabel(id?: string) {
  return MODES.find((m) => m.id === id)?.label ?? id;
}

function RatedRow({ r }: { r: RatingEntry }) {
  // Older ratings were saved without artwork (or with Last.fm's); fetch the verified cover.
  const [it] = useEnriched(useMemo(() => [r.item], [r.item]));
  return (
    <li className="flex items-center gap-3 rounded-md border border-line bg-elev p-2 transition-colors hover:bg-hl">
      <Link href={hrefFor(it.kind, it.artist, it.title)} className="flex min-w-0 flex-1 items-center gap-3">
        <Artwork src={it.image} alt={it.title} kind={it.kind} className="size-10 shrink-0" />
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{it.title}</span>
          <span className="block truncate text-[13px] text-sub">
            <span className="capitalize">{it.kind === "track" ? "Song" : it.kind}</span>
            {it.kind !== "artist" && ` · ${it.artist}`}
          </span>
          {r.ctx?.seed && (
            <span className="block truncate text-xs text-mute">
              Found via {r.ctx.seed}
              {r.ctx.mode && ` · ${modeLabel(r.ctx.mode)}`}
            </span>
          )}
        </span>
      </Link>
      <div className="shrink-0">
        <Rating item={it} tags={r.tags} ctx={r.ctx} size={16} />
      </div>
    </li>
  );
}

export function RatingsView() {
  const p = useProfile();
  const d = useDerivedTaste();
  const imp = useImported();
  const sp = useSearchParams();
  const [tabChoice, setTab] = useState<"ratings" | "taste" | "spotify" | null>(null);
  const tab = tabChoice ?? ((sp.get("tab") as "ratings" | "taste" | "spotify" | null) || "ratings");
  const topArtists = useMemo(() => topRatedArtists(p).slice(0, 16), [p]);
  const all = useMemo(() => Object.values(p.ratings).sort((a, b) => b.at - a.at), [p.ratings]);

  // How good have recommendations been? Only ratings given to recommended items (they carry a mode).
  const quality = useMemo(() => {
    const recs = all.filter((r) => r.ctx?.mode);
    const byMode = new Map<string, { sum: number; n: number; hits: number }>();
    for (const r of recs) {
      const m = byMode.get(r.ctx!.mode!) ?? { sum: 0, n: 0, hits: 0 };
      m.sum += r.rating;
      m.n += 1;
      if (r.rating >= 4) m.hits += 1;
      byMode.set(r.ctx!.mode!, m);
    }
    const total = recs.reduce((s, r) => s + r.rating, 0);
    return {
      n: recs.length,
      avg: recs.length ? total / recs.length : 0,
      hitRate: recs.length ? recs.filter((r) => r.rating >= 4).length / recs.length : 0,
      modes: MODES.map((m) => ({ ...m, stats: byMode.get(m.id) })).filter((m) => m.stats),
    };
  }, [all]);

  const loves = Object.entries(d.tags).filter(([, w]) => w > 0).sort((a, b) => b[1] - a[1]).slice(0, 24);
  const avoids = Object.entries(d.tags).filter(([, w]) => w < 0).sort((a, b) => a[1] - b[1]).slice(0, 10);
  const maxW = loves[0]?.[1] ?? 1;

  const tabs = [
    { id: "ratings", label: "Ratings", count: all.length },
    { id: "taste", label: "Taste profile" },
    { id: "spotify", label: "From Spotify", count: imp.items.length },
  ] as const;

  return (
    <div>
      <PageHeader title="My ratings" description="4–5★ brings more music like it, 2★ less, and 1★ hides it. Click a rating again to clear it." />
      <div className="sticky top-14 z-20 border-b border-line bg-base px-4 md:px-8" role="tablist" aria-label="Sections">
        <div className="flex gap-5">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`-mb-px border-b-2 py-2.5 text-sm transition-colors ${tab === t.id ? "border-find text-ink" : "border-transparent text-sub hover:text-ink"}`}
            >
              {t.label}
              {"count" in t && t.count ? <span className="ml-1.5 text-mute tabular-nums">{t.count}</span> : null}
            </button>
          ))}
        </div>
      </div>

      {tab === "spotify" && (
        <div className="pt-2">
          <ImportedSection />
        </div>
      )}

      {tab === "taste" && (
        <div className="pt-2">
          {quality.n > 0 && (
            <section className="panel mx-4 mt-6 p-5 md:mx-8">
              <h2 className="label">How good are the recommendations?</h2>
              <div className="mt-3 flex flex-wrap gap-10">
                <div>
                  <p className="flex items-center gap-1 text-2xl font-semibold tabular-nums">
                    {quality.avg.toFixed(1)} <Star className="size-5 fill-find text-find" />
                  </p>
                  <p className="text-xs text-sub">average across {quality.n} rated recommendation{quality.n > 1 ? "s" : ""}</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold tabular-nums">{Math.round(quality.hitRate * 100)}%</p>
                  <p className="text-xs text-sub">rated 4★ or higher</p>
                </div>
              </div>
              {quality.modes.length > 0 && (
                <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {quality.modes.map((m) => (
                    <li key={m.id} className="flex items-center justify-between rounded-md border border-line bg-base px-3 py-2 text-sm">
                      <span>{m.label}</span>
                      <span className="tabular-nums text-sub">
                        <span className="text-ink">{(m.stats!.sum / m.stats!.n).toFixed(1)}★</span> · {m.stats!.n} rated
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          <SectionTitle sub={`Learned from your ratings${imp.items.length ? " and your Spotify listening" : ""}. Remove anything that doesn't fit.`}>
            What Spotifind thinks you like
          </SectionTitle>
          <div className="flex flex-wrap gap-1.5 px-4 md:px-8">
            {loves.length === 0 && <p className="text-sm text-sub">Rate something 4★ or 5★ to start building this.</p>}
            {loves.map(([t, w]) => {
              const cat = categorize(t);
              return (
                <span
                  key={t}
                  className="flex items-center gap-1.5 rounded-full border border-line bg-elev py-0.5 pl-2.5 pr-1 text-[13px]"
                  style={{ opacity: 0.6 + 0.4 * (w / maxW) }}
                  title={`${cat} · weight ${w.toFixed(2)}`}
                >
                  <Link href={`/genre/${encodeURIComponent(t)}`} className="hover:underline">
                    {t}
                  </Link>
                  <button onClick={() => taste.removeTag(t)} aria-label={`Remove ${t} from your tastes`} className="rounded-full p-0.5 text-mute hover:bg-hl hover:text-ink">
                    <X className="size-3" />
                  </button>
                </span>
              );
            })}
          </div>
          {avoids.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-1.5 px-4 md:px-8">
              <span className="mr-1 text-xs text-mute">Less of</span>
              {avoids.map(([t]) => (
                <span key={t} className="flex items-center gap-1 rounded-full border border-danger/30 py-0.5 pl-2.5 pr-1 text-xs text-danger">
                  {t}
                  <button onClick={() => taste.removeTag(t)} aria-label={`Stop avoiding ${t}`} className="rounded-full p-0.5 hover:text-ink">
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          {p.removedTags.length > 0 && (
            <button onClick={() => taste.restoreTags()} className="btn btn-ghost btn-sm mx-4 mt-3 md:mx-8">
              <RotateCcw className="size-3.5" /> Restore {p.removedTags.length} removed interest{p.removedTags.length > 1 ? "s" : ""}
            </button>
          )}

          <QuickRateArtists count={8} />
        </div>
      )}

      {tab === "ratings" &&
        (all.length === 0 ? (
          <EmptyState
            title="Nothing rated yet"
            action={
              <div className="flex gap-2">
                <Link href="/rapid" className="btn btn-primary">
                  Try Rapid-fire
                </Link>
                <button onClick={() => setTab("spotify")} className="btn btn-secondary">
                  Import from Spotify
                </button>
              </div>
            }
          >
            Rate recommendations with the stars on each card, or rate quickly in Rapid-fire.
          </EmptyState>
        ) : (
          <>
            {topArtists.length > 0 && (
              <>
                <SectionTitle>Top artists</SectionTitle>
                <ul className="flex flex-wrap gap-2 px-4 md:px-8">
                  {topArtists.map((a) => (
                    <li key={a.key}>
                      <Link href={artistHref(a.name)} className="flex items-center gap-2 rounded-full border border-line bg-elev py-1 pl-3 pr-2.5 text-[13px] hover:bg-hl">
                        {a.name}
                        <span className="tabular-nums text-sub">{Number.isInteger(a.score) ? a.score : a.score.toFixed(1)}★</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {GROUPS.map((g) => {
              const rows = all.filter((r) => r.rating === g.stars);
              if (!rows.length) return null;
              return (
                <section key={g.stars}>
                  <SectionTitle>
                    <span className="flex items-center gap-2">
                      <span className={`flex items-center gap-0.5 ${g.stars === 1 ? "text-danger" : "text-find"}`}>
                        {g.stars}
                        <Star className={`size-4 ${g.stars === 1 ? "fill-danger" : "fill-find"}`} />
                      </span>
                      {g.title}
                      <span className="text-sm font-normal text-mute">{rows.length}</span>
                    </span>
                  </SectionTitle>
                  <ul className="grid gap-1.5 px-4 md:px-8 xl:grid-cols-2">
                    {rows.map((r) => (
                      <RatedRow key={r.item.key} r={r} />
                    ))}
                  </ul>
                </section>
              );
            })}

            <div className="mt-12 flex items-center gap-3 px-4 md:px-8">
              <p className="text-xs text-mute">Your ratings and imported Spotify taste are stored only on this Mac.</p>
              <button
                onClick={() => {
                  if (window.confirm("Clear all ratings and history? Spotifind will forget your taste.")) taste.reset();
                }}
                className="btn btn-danger btn-sm ml-auto"
              >
                Reset ratings
              </button>
            </div>
          </>
        ))}
    </div>
  );
}
