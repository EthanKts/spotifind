"use client";

import Link from "next/link";
import { RotateCcw, Star, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { taste, topRatedArtists, useDerivedTaste, useProfile, type Rating as RatingEntry } from "@/lib/taste/profile";
import { useSearchParams } from "next/navigation";
import { MODES } from "@/lib/recommend/score";
import { categorize } from "@/lib/recommend/tags";
import { EmptyState, PageHeader, SectionTitle, TrackRow } from "@/components/Cards";
import { Artwork } from "@/components/Artwork";
import { artistItem, Rating } from "@/components/Actions";
import { QuickRateArtists } from "@/components/QuickRateArtists";
import { artistHref, hrefFor } from "@/lib/util";
import { imported as importedStore, useImported } from "@/lib/taste/imported";
import { SpotifyImport } from "@/components/SpotifyImport";
import { useEnriched } from "@/lib/client/data";
import type { ImportedItem, SpotifyRange } from "@/lib/types";
import { usePref } from "@/lib/client/prefs";
import { FilterChips, LibrarySearch, matches, SortSelect, ViewToggle, type LibraryView } from "@/components/LibraryControls";

const RANGE_LABEL: Record<SpotifyRange, string> = { short_term: "last 4 weeks", medium_term: "last 6 months", long_term: "all-time" };
const RANGES: { id: "all" | SpotifyRange; label: string }[] = [
  { id: "all", label: "All" },
  { id: "short_term", label: "Last 4 weeks" },
  { id: "medium_term", label: "Last 6 months" },
  { id: "long_term", label: "All-time" },
];

/** One imported artist: rank, photo, name, and on hover your stars + remove. */
function ImportedArtist({ it, rank, image }: { it: ImportedItem; rank?: number; image?: string }) {
  return (
    <li className="group relative rounded-lg border border-line bg-elev p-3 text-center transition-colors hover:bg-hl">
      {rank != null && <span className="absolute left-2 top-2 text-xs tabular-nums text-mute">{rank}</span>}
      <button
        onClick={() => void importedStore.remove(it.key)}
        aria-label={`Remove ${it.title} from imported taste`}
        title="Remove from imported taste"
        className="absolute right-1.5 top-1.5 rounded p-1 text-mute opacity-0 transition-opacity hover:bg-hl-2 hover:text-ink group-hover:opacity-100 focus:opacity-100"
      >
        <X className="size-3.5" />
      </button>
      <Link href={artistHref(it.artist)} className="mx-auto block w-3/4">
        <Artwork src={image ?? it.image} alt={it.title} kind="artist" className="aspect-square w-full" />
      </Link>
      <p className="mt-2 truncate text-sm font-medium">{it.title}</p>
      <p className="truncate text-[11px] text-mute">{it.ranges.map((r) => RANGE_LABEL[r]).join(" · ")}</p>
      <div className="mt-1.5 flex justify-center" title="Rate it yourself — your rating replaces the imported signal">
        <Rating item={it} tags={it.tags} size={14} />
      </div>
    </li>
  );
}

const IMPORT_SORTS = ["most", "title", "artist"] as const;
const byText = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });

function RemoveImported({ it, className = "" }: { it: ImportedItem; className?: string }) {
  return (
    <button
      onClick={() => void importedStore.remove(it.key)}
      aria-label={`Remove ${it.title} from imported taste`}
      title="Remove from imported taste"
      className={`rounded p-1 text-mute transition-opacity hover:bg-hl-2 hover:text-ink ${className}`}
    >
      <X className="size-3.5" />
    </button>
  );
}

function ImportedArtistRow({ it, rank, image }: { it: ImportedItem; rank?: number; image?: string }) {
  return (
    <li className="group flex items-center gap-3 rounded-md border border-line bg-elev p-2 transition-colors hover:bg-hl">
      {rank != null && <span className="w-6 shrink-0 text-right text-xs tabular-nums text-mute">{rank}</span>}
      <Link href={artistHref(it.artist)} className="flex min-w-0 flex-1 items-center gap-3">
        <Artwork src={image ?? it.image} alt={it.title} kind="artist" className="size-10 shrink-0" />
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{it.title}</span>
          <span className="block truncate text-xs text-mute">{it.ranges.map((r) => RANGE_LABEL[r]).join(" · ")}</span>
        </span>
      </Link>
      <Rating item={it} tags={it.tags} size={14} />
      <RemoveImported it={it} className="opacity-100 focus:opacity-100 md:opacity-0 md:group-hover:opacity-100" />
    </li>
  );
}

function ImportedSongCard({ it }: { it: ImportedItem }) {
  const [e] = useEnriched(useMemo(() => [it], [it]));
  return (
    <li className="group relative rounded-lg border border-line bg-elev p-3 transition-colors hover:bg-hl">
      <RemoveImported it={it} className="absolute right-1.5 top-1.5 z-10 bg-elev/80 opacity-0 focus:opacity-100 group-hover:opacity-100" />
      <Link href={hrefFor(it.kind, it.artist, it.title)} className="block">
        <Artwork src={e.image ?? it.image} alt={it.title} kind="track" className="aspect-square w-full" />
        <span className="mt-2 block truncate text-sm font-medium">{it.title}</span>
        <span className="block truncate text-xs text-sub">{it.artist}</span>
      </Link>
      <div className="mt-1.5">
        <Rating item={it} tags={it.tags} size={14} />
      </div>
    </li>
  );
}

/** Spotify listening history: Top artists / Top songs, by period. Always weaker than your own stars. */
function ImportedSection() {
  const p = useProfile();
  const imp = useImported();
  const [view, setView] = useState<"artist" | "track">("artist");
  const [range, setRange] = useState<"all" | SpotifyRange>("all");
  const [all, setAll] = useState(false);
  const [q, setQ] = useState("");
  const [sort, setSort] = usePref("spotify.sort", "most", IMPORT_SORTS);
  const [artistView, setArtistView] = usePref<LibraryView>("spotify.artistView", "grid", ["grid", "list"] as const);
  const [songView, setSongView] = usePref<LibraryView>("spotify.songView", "list", ["list", "grid"] as const);
  const layout = view === "artist" ? artistView : songView;

  // Real ratings always win: items you rated yourself leave this list.
  const items = useMemo(() => imp.items.filter((it) => !p.ratings[it.key]), [imp.items, p.ratings]);
  const overridden = imp.items.length - items.length;
  const inRange = useMemo(() => items.filter((it) => range === "all" || it.ranges.includes(range)), [items, range]);
  const list = useMemo(() => {
    const l = inRange.filter((it) => it.kind === view && matches(q, it.title, it.artist, it.album));
    const most = (a: ImportedItem, b: ImportedItem) => b.weight - a.weight;
    if (sort === "title") return l.sort((a, b) => byText(a.title, b.title));
    if (sort === "artist") return l.sort((a, b) => byText(a.artist, b.artist) || most(a, b));
    return l.sort(most);
  }, [inRange, view, q, sort]);
  const counts = { artist: inRange.filter((x) => x.kind === "artist").length, track: inRange.filter((x) => x.kind === "track").length };
  const shown = all || q ? list : list.slice(0, view === "artist" ? 18 : 25);
  const pics = useEnriched(useMemo(() => (view === "artist" ? shown.map((a) => artistItem(a.artist)) : []), [shown, view]));

  if (!imp.items.length) {
    return (
      <section id="imported" className="panel mx-4 mt-6 p-5 md:mx-8">
        <SpotifyImport variant="inline" />
      </section>
    );
  }

  return (
    <section id="imported" aria-label="Imported from Spotify">
      <SectionTitle
        sub={`What you play most on Spotify${imp.user ? ` (${imp.user})` : ""}, imported ${new Date(imp.importedAt).toLocaleDateString()}. It shapes recommendations a little less than your own stars${overridden ? `; ${overridden} you rated yourself use your rating instead` : ""}.`}
        actions={
          <>
            <SpotifyImport variant="panel" />
            <button
              onClick={() => {
                if (window.confirm("Remove everything imported from Spotify? Your own ratings stay.")) void importedStore.removeAll();
              }}
              className="btn btn-danger"
            >
              <Trash2 className="size-4" /> Remove all
            </button>
          </>
        }
      >
        Your Spotify favourites
      </SectionTitle>

      <div className="flex flex-wrap items-center gap-3 px-4 md:px-8">
        <div className="flex gap-0.5 rounded-md border border-line bg-base p-0.5" role="tablist" aria-label="Show">
          {(["artist", "track"] as const).map((k) => (
            <button
              key={k}
              role="tab"
              aria-selected={view === k}
              onClick={() => {
                setView(k);
                setAll(false);
              }}
              className={`rounded px-3 py-1.5 text-[13px] transition-colors ${view === k ? "bg-hl text-ink" : "text-sub hover:text-ink"}`}
            >
              {k === "artist" ? "Top artists" : "Top songs"} <span className="tabular-nums text-mute">{counts[k]}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Period">
          {RANGES.map((r) => (
            <button
              key={r.id}
              role="radio"
              aria-checked={range === r.id}
              onClick={() => {
                setRange(r.id);
                setAll(false);
              }}
              className="option rounded-full px-3 py-1 text-[13px]"
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <LibrarySearch value={q} onChange={setQ} placeholder={view === "artist" ? "Search top artists" : "Search top songs"} />
          <SortSelect
            value={view === "artist" && sort === "artist" ? "title" : sort}
            onChange={setSort}
            options={[
              { id: "most" as const, label: "Most played" },
              { id: "title" as const, label: view === "artist" ? "Name A–Z" : "Title A–Z" },
              ...(view === "track" ? [{ id: "artist" as const, label: "Artist A–Z" }] : []),
            ]}
          />
          <ViewToggle value={layout} onChange={view === "artist" ? setArtistView : setSongView} views={view === "artist" ? ["grid", "list"] : ["list", "grid"]} />
        </div>
      </div>

      {list.length === 0 ? (
        <p className="px-4 pt-4 text-sm text-sub md:px-8">{q ? `Nothing matches “${q}”.` : "Nothing here for this period."}</p>
      ) : layout === "list" && view === "artist" ? (
        <ul className="mt-3 grid gap-1.5 px-4 md:px-8 xl:grid-cols-2">
          {shown.map((it, i) => (
            <ImportedArtistRow key={it.key} it={it} rank={sort === "most" ? i + 1 : undefined} image={pics[i]?.image} />
          ))}
        </ul>
      ) : layout === "grid" && view === "track" ? (
        <ul className="mt-4 grid grid-cols-2 gap-2 px-4 sm:grid-cols-3 md:px-8 lg:grid-cols-4 xl:grid-cols-6">
          {shown.map((it) => (
            <ImportedSongCard key={it.key} it={it} />
          ))}
        </ul>
      ) : view === "artist" ? (
        <ul className="mt-4 grid grid-cols-2 gap-2 px-4 sm:grid-cols-3 md:px-8 lg:grid-cols-4 xl:grid-cols-6">
          {shown.map((it, i) => (
            <ImportedArtist key={it.key} it={it} rank={sort === "most" ? i + 1 : undefined} image={pics[i]?.image} />
          ))}
        </ul>
      ) : (
        <div className="mt-3 md:px-4">
          {shown.map((it, i) => (
            <TrackRow
              key={it.key}
              item={it}
              index={sort === "most" ? i + 1 : undefined}
              queue={shown}
              showAlbum
              extra={
                <button
                  onClick={() => void importedStore.remove(it.key)}
                  aria-label={`Remove ${it.title} from imported taste`}
                  title="Remove from imported taste"
                  className="rounded p-1.5 text-mute opacity-100 transition-opacity hover:bg-hl hover:text-ink md:opacity-0 md:group-hover:opacity-100"
                >
                  <X className="size-4" />
                </button>
              }
            />
          ))}
        </div>
      )}
      {list.length > shown.length || all ? (
        <button onClick={() => setAll(!all)} className="btn btn-ghost btn-sm mx-4 mt-3 md:mx-8">
          {all ? "Show fewer" : `Show all ${list.length}`}
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

function RatedRow({ r, view }: { r: RatingEntry; view: LibraryView }) {
  // Older ratings were saved without artwork (or with Last.fm's); fetch the verified cover.
  const [it] = useEnriched(useMemo(() => [r.item], [r.item]));
  const kind = it.kind === "track" ? "Song" : it.kind === "album" ? "Album" : "Artist";
  if (view === "grid") {
    return (
      <li className="rounded-lg border border-line bg-elev p-3 transition-colors hover:bg-hl">
        <Link href={hrefFor(it.kind, it.artist, it.title)} className="block">
          <Artwork src={it.image} alt={it.title} kind={it.kind} className="aspect-square w-full" />
          <span className="mt-2 block truncate text-sm font-medium">{it.title}</span>
          <span className="block truncate text-xs text-sub">
            {kind}
            {it.kind !== "artist" && ` · ${it.artist}`}
          </span>
        </Link>
        <div className="mt-1.5">
          <Rating item={it} tags={r.tags} ctx={r.ctx} size={14} />
        </div>
      </li>
    );
  }
  if (view === "compact") {
    return (
      <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-line px-2 py-1.5 text-[13px] transition-colors last:border-0 hover:bg-hl sm:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_5rem_auto_6rem]">
        <Link href={hrefFor(it.kind, it.artist, it.title)} className="truncate font-medium hover:underline">
          {it.title}
        </Link>
        <span className="hidden truncate text-sub sm:block">{it.kind !== "artist" ? it.artist : ""}</span>
        <span className="hidden text-sub sm:block">{kind}</span>
        <Rating item={it} tags={r.tags} ctx={r.ctx} size={14} />
        <span className="hidden text-right tabular-nums text-mute sm:block">{new Date(r.at).toLocaleDateString()}</span>
      </li>
    );
  }
  return (
    <li className="flex items-center gap-3 rounded-md border border-line bg-elev p-2 transition-colors hover:bg-hl">
      <Link href={hrefFor(it.kind, it.artist, it.title)} className="flex min-w-0 flex-1 items-center gap-3">
        <Artwork src={it.image} alt={it.title} kind={it.kind} className="size-10 shrink-0" />
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{it.title}</span>
          <span className="block truncate text-[13px] text-sub">
            {kind}
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

const KINDS = ["all", "track", "artist", "album"] as const;
const SORTS = ["recent", "high", "low", "title", "artist", "stars"] as const;
type SortId = (typeof SORTS)[number];
const SORT_LABEL: Record<SortId, string> = {
  recent: "Recently rated",
  high: "Rating: high to low",
  low: "Rating: low to high",
  title: "Title A–Z",
  artist: "Artist A–Z",
  stars: "Grouped by stars",
};
const VIEWS = ["list", "compact", "grid"] as const;
const PAGE = 60;

function RatedList({ rows, view }: { rows: RatingEntry[]; view: LibraryView }) {
  const cls =
    view === "grid"
      ? "grid grid-cols-2 gap-2 px-4 sm:grid-cols-3 md:px-8 lg:grid-cols-4 xl:grid-cols-6"
      : view === "compact"
        ? "mx-4 rounded-md border border-line bg-elev md:mx-8"
        : "grid gap-1.5 px-4 md:px-8 xl:grid-cols-2";
  return (
    <ul className={cls}>
      {rows.map((r) => (
        <RatedRow key={r.item.key} r={r} view={view} />
      ))}
    </ul>
  );
}

/** Your ratings like Spotify's library: Songs / Artists / Albums, search, sort and list, compact or grid. */
function RatingsLibrary({ all }: { all: RatingEntry[] }) {
  const [kind, setKind] = usePref("ratings.kind", "all", KINDS);
  const [sort, setSort] = usePref<SortId>("ratings.sort", "recent", SORTS);
  const [view, setView] = usePref<LibraryView>("ratings.view", "list", VIEWS);
  const [q, setQ] = useState("");
  const [showAll, setShowAll] = useState(false);

  const counts = useMemo(() => {
    const c = { all: all.length, track: 0, artist: 0, album: 0 };
    for (const r of all) c[r.item.kind] += 1;
    return c;
  }, [all]);
  const rows = useMemo(() => {
    const list = all.filter((r) => (kind === "all" || r.item.kind === kind) && matches(q, r.item.title, r.item.artist, r.item.album));
    const recent = (a: RatingEntry, b: RatingEntry) => b.at - a.at;
    const sorters: Record<SortId, (a: RatingEntry, b: RatingEntry) => number> = {
      recent,
      high: (a, b) => b.rating - a.rating || recent(a, b),
      low: (a, b) => a.rating - b.rating || recent(a, b),
      title: (a, b) => byText(a.item.title, b.item.title),
      artist: (a, b) => byText(a.item.artist, b.item.artist) || byText(a.item.title, b.item.title),
      stars: (a, b) => b.rating - a.rating || recent(a, b),
    };
    return list.sort(sorters[sort]);
  }, [all, kind, q, sort]);
  const shown = showAll || q ? rows : rows.slice(0, PAGE);

  return (
    <section aria-label="Your ratings">
      <div className="mt-6 flex flex-wrap items-center gap-3 px-4 md:px-8">
        <FilterChips
          label="Show"
          value={kind}
          onChange={(k) => {
            setKind(k);
            setShowAll(false);
          }}
          options={[
            { id: "all", label: "All", count: counts.all },
            { id: "track", label: "Songs", count: counts.track },
            { id: "artist", label: "Artists", count: counts.artist },
            { id: "album", label: "Albums", count: counts.album },
          ].filter((o) => o.id === "all" || o.count > 0) as { id: (typeof KINDS)[number]; label: string; count: number }[]}
        />
        <div className="ml-auto flex items-center gap-2">
          <LibrarySearch value={q} onChange={setQ} placeholder="Search in My ratings" />
          <SortSelect value={sort} onChange={setSort} options={SORTS.map((id) => ({ id, label: SORT_LABEL[id] }))} />
          <ViewToggle value={view} onChange={setView} />
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="px-4 pt-6 text-sm text-sub md:px-8">{q ? `Nothing in your ratings matches “${q}”.` : "Nothing rated here yet."}</p>
      ) : sort === "stars" ? (
        GROUPS.map((g) => {
          const group = shown.filter((r) => r.rating === g.stars);
          if (!group.length) return null;
          return (
            <section key={g.stars}>
              <SectionTitle>
                <span className="flex items-center gap-2">
                  <span className={`flex items-center gap-0.5 ${g.stars === 1 ? "text-danger" : "text-find"}`}>
                    {g.stars}
                    <Star className={`size-4 ${g.stars === 1 ? "fill-danger" : "fill-find"}`} />
                  </span>
                  {g.title}
                  <span className="text-sm font-normal text-mute">{rows.filter((r) => r.rating === g.stars).length}</span>
                </span>
              </SectionTitle>
              <RatedList rows={group} view={view} />
            </section>
          );
        })
      ) : (
        <div className="mt-4">
          {view === "compact" && (
            <div className="mx-4 hidden grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_5rem_auto_6rem] gap-3 px-2 pb-1.5 text-xs text-mute sm:grid md:mx-8">
              <span>Title</span>
              <span>Artist</span>
              <span>Type</span>
              <span className="w-[86px]">Rating</span>
              <span className="text-right">Rated</span>
            </div>
          )}
          <RatedList rows={shown} view={view} />
        </div>
      )}
      {rows.length > PAGE && !q && (
        <button onClick={() => setShowAll(!showAll)} className="btn btn-ghost btn-sm mx-4 mt-3 md:mx-8">
          {showAll ? "Show fewer" : `Show all ${rows.length}`}
        </button>
      )}
    </section>
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
            <RatingsLibrary all={all} />

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
