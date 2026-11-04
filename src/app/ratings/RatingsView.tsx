"use client";

import Link from "next/link";
import { RotateCcw, Star, X } from "lucide-react";
import { useMemo } from "react";
import { taste, useDerivedTaste, useProfile, type Rating as RatingEntry } from "@/lib/taste/profile";
import { MODES } from "@/lib/recommend/score";
import { categorize } from "@/lib/recommend/tags";
import { EmptyState, SectionTitle } from "@/components/Cards";
import { Artwork } from "@/components/Artwork";
import { Rating } from "@/components/Actions";
import { QuickRateArtists } from "@/components/QuickRateArtists";
import { hrefFor } from "@/lib/util";

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
  const it = r.item;
  return (
    <li className="flex items-center gap-3 rounded-lg bg-elev p-2 transition-colors hover:bg-hl/70">
      <Link href={hrefFor(it.kind, it.artist, it.title)} className="flex min-w-0 flex-1 items-center gap-3">
        <Artwork src={it.image} alt={it.title} kind={it.kind} className="size-12 shrink-0" />
        <span className="min-w-0">
          <span className="block truncate font-semibold">{it.title}</span>
          <span className="block truncate text-sm text-sub">
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

  return (
    <div>
      <div className="bg-gradient-to-b from-find/20 to-transparent px-4 pb-6 pt-2 md:px-6">
        <p className="text-xs font-bold uppercase tracking-wider text-sub">Your taste profile</p>
        <h1 className="mt-1 text-4xl font-extrabold tracking-tight md:text-5xl">My Ratings</h1>
        <p className="mt-2 max-w-2xl text-sm text-sub">
          Stars are how Spotifind learns. 4–5★ brings more music like it, 2★ less, and 1★ hides it from recommendations. Click a rating again to
          clear it.
        </p>
      </div>

      {all.length === 0 ? (
        <EmptyState
          title="Nothing rated yet"
          action={
            <Link href="/discover" className="rounded-full bg-ink px-6 py-2.5 font-bold text-black transition-transform hover:scale-105">
              Start discovering
            </Link>
          }
        >
          Rate recommendations with the stars on each card. Every rating sharpens what Spotifind finds for you next.
        </EmptyState>
      ) : (
        <>
          {quality.n > 0 && (
            <section className="mx-4 rounded-xl border border-find/20 bg-gradient-to-br from-find/[0.08] via-elev to-elev p-5 md:mx-6">
              <h2 className="text-sm font-bold uppercase tracking-wider text-find">How good are the recommendations?</h2>
              <div className="mt-3 flex flex-wrap gap-8">
                <div>
                  <p className="flex items-center gap-1 text-3xl font-extrabold tabular-nums">
                    {quality.avg.toFixed(1)} <Star className="size-6 fill-find text-find" />
                  </p>
                  <p className="text-xs text-sub">average across {quality.n} rated recommendation{quality.n > 1 ? "s" : ""}</p>
                </div>
                <div>
                  <p className="text-3xl font-extrabold tabular-nums">{Math.round(quality.hitRate * 100)}%</p>
                  <p className="text-xs text-sub">rated 4★ or higher</p>
                </div>
              </div>
              {quality.modes.length > 0 && (
                <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {quality.modes.map((m) => (
                    <li key={m.id} className="flex items-center justify-between rounded-lg bg-black/30 px-3 py-2 text-sm">
                      <span className="font-semibold">{m.label}</span>
                      <span className="tabular-nums text-sub">
                        <span className="font-bold text-ink">{(m.stats!.sum / m.stats!.n).toFixed(1)}★</span> · {m.stats!.n} rated
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          <QuickRateArtists count={8} />

          <SectionTitle sub="Learned from your ratings. Remove anything that doesn't fit — it stops influencing recommendations.">
            What Spotifind thinks you like
          </SectionTitle>
          <div className="flex flex-wrap gap-2 px-4 md:px-6">
            {loves.length === 0 && <p className="text-sm text-sub">Rate something 4★ or 5★ to start building this.</p>}
            {loves.map(([t, w]) => {
              const cat = categorize(t);
              return (
                <span
                  key={t}
                  className="flex items-center gap-1.5 rounded-full bg-hl py-1 pl-3 pr-1.5 text-sm font-semibold"
                  style={{ opacity: 0.55 + 0.45 * (w / maxW) }}
                  title={`${cat} · weight ${w.toFixed(2)}`}
                >
                  <span className={`size-2 rounded-full ${cat === "mood" ? "bg-ink" : cat === "groove" ? "bg-brand" : "bg-mute"}`} />
                  <Link href={`/genre/${encodeURIComponent(t)}`} className="hover:underline">
                    {t}
                  </Link>
                  <button onClick={() => taste.removeTag(t)} aria-label={`Remove ${t} from your tastes`} className="rounded-full p-0.5 text-mute hover:bg-hl-2 hover:text-ink">
                    <X className="size-3.5" />
                  </button>
                </span>
              );
            })}
          </div>
          {avoids.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2 px-4 md:px-6">
              <span className="text-xs font-bold uppercase tracking-wider text-mute">Less of</span>
              {avoids.map(([t]) => (
                <span key={t} className="flex items-center gap-1 rounded-full border border-danger/30 py-0.5 pl-3 pr-1 text-xs text-danger">
                  {t}
                  <button onClick={() => taste.removeTag(t)} aria-label={`Stop avoiding ${t}`} className="rounded-full p-0.5 hover:text-ink">
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          {p.removedTags.length > 0 && (
            <button onClick={() => taste.restoreTags()} className="mt-3 flex items-center gap-1.5 px-4 text-xs font-semibold text-sub hover:text-ink md:px-6">
              <RotateCcw className="size-3.5" /> Restore {p.removedTags.length} removed interest{p.removedTags.length > 1 ? "s" : ""}
            </button>
          )}

          {GROUPS.map((g) => {
            const rows = all.filter((r) => r.rating === g.stars);
            if (!rows.length) return null;
            return (
              <section key={g.stars}>
                <SectionTitle>
                  <span className="flex items-center gap-2">
                    <span className={`flex items-center gap-0.5 text-lg ${g.stars === 1 ? "text-danger" : "text-find"}`}>
                      {g.stars}
                      <Star className={`size-5 ${g.stars === 1 ? "fill-danger" : "fill-find"}`} />
                    </span>
                    {g.title}
                    <span className="text-base font-medium text-mute">{rows.length}</span>
                  </span>
                </SectionTitle>
                <ul className="grid gap-2 px-4 md:px-6 xl:grid-cols-2">
                  {rows.map((r) => (
                    <RatedRow key={r.item.key} r={r} />
                  ))}
                </ul>
              </section>
            );
          })}

          <div className="mt-12 flex items-center gap-3 px-4 md:px-6">
            <p className="text-xs text-mute">Your ratings are stored only on this Mac.</p>
            <button
              onClick={() => {
                if (window.confirm("Clear all ratings and history? Spotifind will forget your taste.")) taste.reset();
              }}
              className="ml-auto rounded-full border border-danger/40 px-4 py-1.5 text-xs font-bold text-danger hover:bg-danger/10"
            >
              Reset everything
            </button>
          </div>
        </>
      )}
    </div>
  );
}
