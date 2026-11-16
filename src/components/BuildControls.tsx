"use client";

// Controls shared by Playlists and Rapid-fire: what to build from (your taste, up to 5 picks, or a genre)
// and the "shape" (energy bar + instruments).

import { Heart, Search, Shapes, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { Item, TagVector } from "@/lib/types";
import type { SearchResponse } from "@/app/api/search/route";
import type { PlaylistSettings } from "@/lib/taste/profile";
import { useJson } from "@/lib/client/data";
import { seedName } from "@/lib/client/playlist";
import { INSTRUMENTS } from "@/lib/recommend/tags";
import { FAMILIES, SUBGENRES, resolveGenre } from "@/lib/recommend/genres";
import { Artwork } from "./Artwork";
import { Loader2 } from "lucide-react";

export type SeedT = PlaylistSettings["seeds"][number];
export type Picked = { s: SeedT; image?: string };
export type Basis = PlaylistSettings["basis"];
export const MAX_PICKS = 5;
export const MAX_GENRES = 5;

export function SeedSearch({ onPick, placeholder }: { onPick: (s: SeedT, image?: string) => void; placeholder?: string }) {
  const [q, setQ] = useState("");
  const [submitted, setSubmitted] = useState("");
  const { data, loading } = useJson<SearchResponse>(submitted ? `/api/search?q=${encodeURIComponent(submitted)}` : null);
  const results: Item[] = data
    ? [...(data.top ? [data.top] : []), ...data.tracks.slice(0, 4), ...data.artists.slice(0, 3), ...data.albums.slice(0, 3)].filter(
        (it, i, arr) => arr.findIndex((x) => x.key === it.key) === i,
      )
    : [];
  return (
    <div>
      <form
        className="relative"
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(q.trim());
        }}
      >
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-sub" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder ?? "Search a song, album or artist, then press Enter"}
          aria-label="Search for a song, album or artist to build from"
          className="input h-10 w-full pl-9"
        />
      </form>
      {loading && (
        <p className="mt-2 flex items-center gap-2 text-xs text-sub">
          <Loader2 className="size-3.5 animate-spin" /> Searching…
        </p>
      )}
      {results.length > 0 && (
        <ul className="mt-2 grid gap-1 sm:grid-cols-2">
          {results.map((it) => (
            <li key={it.key}>
              <button
                onClick={() => {
                  onPick({ kind: it.kind, artist: it.artist, title: it.title }, it.image);
                  setQ("");
                  setSubmitted("");
                }}
                className="flex w-full items-center gap-3 rounded-md p-1.5 text-left transition-colors hover:bg-hl"
              >
                <Artwork src={it.image} alt={it.title} kind={it.kind} className="size-10 shrink-0" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{it.title}</span>
                  <span className="block truncate text-xs capitalize text-sub">
                    {it.kind === "track" ? "Song" : it.kind}
                    {it.kind !== "artist" && ` · ${it.artist}`}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const sameSeed = (a: SeedT, b: SeedT) => a.kind === b.kind && a.artist.toLowerCase() === b.artist.toLowerCase() && a.title.toLowerCase() === b.title.toLowerCase();

export function BasisPicker({
  basis,
  setBasis,
  mySeeds,
  picked,
  setPicked,
  genres,
  setGenres,
  tasteTags,
}: {
  basis: Basis;
  setBasis: (b: Basis) => void;
  mySeeds: SeedT[];
  picked: Picked[];
  setPicked: (p: Picked[]) => void;
  genres: string[];
  setGenres: (g: string[]) => void;
  tasteTags: TagVector;
}) {
  const options: { id: Basis; icon: typeof Heart; title: string; hint: string; disabled?: boolean }[] = [
    {
      id: "taste",
      icon: Heart,
      title: "From my taste",
      hint: mySeeds.length ? `Blends your favourites: ${mySeeds.map(seedName).join(", ")}` : "Rate a few things 4–5★ or import your Spotify taste first.",
      disabled: !mySeeds.length,
    },
    { id: "seed", icon: Search, title: "Songs, albums or artists", hint: `Pick 1 to ${MAX_PICKS}. Songs several of them lead to rank higher.` },
    { id: "genre", icon: Shapes, title: "Genres, matched to my taste", hint: `Pick 1 to ${MAX_GENRES} precise genres, even ones you don’t usually listen to.` },
  ];

  return (
    <div>
      <h2 className="label">Based on</h2>
      <div className="mt-2 grid gap-2 md:grid-cols-3" role="radiogroup" aria-label="Based on">
        {options.map(({ id, icon: Icon, title, hint, disabled }) => (
          <button
            key={id}
            role="radio"
            aria-checked={basis === id}
            disabled={disabled}
            onClick={() => setBasis(id)}
            className="option p-3.5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              <Icon className="size-4 text-sub" /> {title}
            </span>
            <span className="mt-1 block text-xs text-sub">{hint}</span>
          </button>
        ))}
      </div>

      {basis === "seed" && (
        <div className="mt-3 rounded-md border border-line bg-base p-3">
          {picked.length > 0 && (
            <ul className="mb-3 flex flex-wrap gap-2">
              {picked.map((p) => (
                <li key={`${p.s.kind}|${p.s.artist}|${p.s.title}`} className="flex items-center gap-2 rounded-md border border-line bg-elev py-1 pl-1 pr-1.5">
                  <Artwork src={p.image} alt={seedName(p.s)} kind={p.s.kind} className="size-7 shrink-0" />
                  <span className="max-w-[180px] truncate text-[13px]">
                    {seedName(p.s)}
                    {p.s.kind !== "artist" && <span className="text-mute"> · {p.s.artist}</span>}
                  </span>
                  <button
                    onClick={() => setPicked(picked.filter((x) => x !== p))}
                    aria-label={`Remove ${seedName(p.s)}`}
                    className="rounded p-0.5 text-mute hover:bg-hl hover:text-ink"
                  >
                    <X className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {picked.length < MAX_PICKS ? (
            <SeedSearch
              placeholder={picked.length ? "Add another song, album or artist" : undefined}
              onPick={(s, image) => !picked.some((p) => sameSeed(p.s, s)) && setPicked([...picked, { s, image }])}
            />
          ) : (
            <p className="text-xs text-mute">That’s {MAX_PICKS}, the most you can combine. Remove one to add another.</p>
          )}
        </div>
      )}

      {basis === "genre" && <GenrePicker genres={genres} setGenres={setGenres} tasteTags={tasteTags} />}
    </div>
  );
}

/** Two levels: a family (Jazz, Electronic…), then its subgenres. Search finds any subgenre. Up to 5. */
export function GenrePicker({ genres, setGenres, tasteTags }: { genres: string[]; setGenres: (g: string[]) => void; tasteTags: TagVector }) {
  const [family, setFamily] = useState(() => (genres[0] ? resolveGenre(genres[0]).family : "") || "jazz");
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const shown = useMemo(
    () =>
      query
        ? SUBGENRES.filter((s) => s.name.toLowerCase().includes(query) || s.lastfm.some((t) => t.includes(query)) || s.hint?.toLowerCase().includes(query)).slice(0, 24)
        : SUBGENRES.filter((s) => s.family === family),
    [query, family],
  );
  const full = genres.length >= MAX_GENRES;
  const toggle = (id: string) => setGenres(genres.includes(id) ? genres.filter((g) => g !== id) : full ? genres : [...genres, id]);
  // Only your strongest tags count, so one faint tag from your Spotify history doesn't mark a whole genre.
  const strong = useMemo(
    () => new Set(Object.entries(tasteTags).filter(([, w]) => w > 0).sort((a, b) => b[1] - a[1]).slice(0, 40).map(([t]) => t)),
    [tasteTags],
  );
  const listened = (id: string) => resolveGenre(id).lastfm.some((t) => strong.has(t));
  const exact = query && SUBGENRES.some((s) => s.name.toLowerCase() === query || s.lastfm.includes(query));

  return (
    <div className="mt-3 rounded-md border border-line bg-base p-3">
      {genres.length > 0 && (
        <ul className="mb-3 flex flex-wrap gap-2" aria-label="Chosen genres">
          {genres.map((id) => {
            const g = resolveGenre(id);
            return (
              <li key={id} className="flex items-center gap-1.5 rounded-full border border-line bg-elev py-1 pl-3 pr-1.5 text-[13px]">
                {g.name}
                {g.family && <span className="text-mute">· {FAMILIES.find((f) => f.id === g.family)?.name.split(/[ ,&]/)[0]}</span>}
                <button onClick={() => toggle(id)} aria-label={`Remove ${g.name}`} className="rounded-full p-0.5 text-mute hover:bg-hl hover:text-ink">
                  <X className="size-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-sub" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search genres, e.g. hard bop, dub techno, highlife"
          aria-label="Search genres"
          className="input h-10 w-full pl-9"
        />
      </div>

      {!query && (
        <div className="mt-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Genre families">
          {FAMILIES.map((f) => {
            const n = genres.filter((id) => resolveGenre(id).family === f.id).length;
            return (
              <button
                key={f.id}
                role="tab"
                aria-selected={family === f.id}
                data-on={family === f.id}
                onClick={() => setFamily(f.id)}
                className="option rounded-full px-3 py-1 text-[13px]"
              >
                {f.name}
                {n > 0 && <span className="ml-1 tabular-nums text-find">{n}</span>}
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-3 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3" role="group" aria-label="Genres">
        {shown.map((s) => {
          const on = genres.includes(s.id);
          return (
            <button
              key={s.id}
              role="checkbox"
              aria-checked={on}
              disabled={!on && full}
              onClick={() => toggle(s.id)}
              className="option px-3 py-2 text-left disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[13px] font-medium">{s.name}</span>
                {listened(s.id) && <span className="shrink-0 text-[11px] text-mute">You listen to this</span>}
              </span>
              {s.hint && <span className="mt-0.5 block truncate text-xs text-sub">{query ? `${FAMILIES.find((f) => f.id === s.family)?.name} · ` : ""}{s.hint}</span>}
            </button>
          );
        })}
        {query && !exact && (
          <button
            onClick={() => {
              if (!full && !genres.includes(query)) setGenres([...genres, query]);
              setQ("");
            }}
            disabled={full}
            className="option px-3 py-2 text-left disabled:opacity-50"
          >
            <span className="block truncate text-[13px] font-medium">Use “{q.trim()}”</span>
            <span className="mt-0.5 block text-xs text-sub">As a Last.fm listener tag</span>
          </button>
        )}
      </div>

      <p className="mt-3 text-xs text-mute">
        {full
          ? `That’s ${MAX_GENRES}, the most you can combine. Remove one to add another.`
          : "Songs only count when their artist really belongs to the genre: in Discogs’ albums for that style, or the genre is one of the artist’s main Last.fm tags. Songs that fit several of your genres rank higher."}
      </p>
    </div>
  );
}

export function ShapeControls({
  energy,
  setEnergy,
  instruments,
  setInstruments,
}: {
  energy: number | null;
  setEnergy: (e: number | null) => void;
  instruments: string[];
  setInstruments: (i: string[]) => void;
}) {
  const [last, setLast] = useState(0.6);
  const on = energy != null;
  const pct = Math.round((energy ?? last) * 100);
  const word = pct < 25 ? "Very calm" : pct < 45 ? "Calm" : pct < 60 ? "Medium" : pct < 80 ? "Energetic" : "Very energetic";
  return (
    <div className="grid gap-5">
      <div>
        <div className="flex items-center justify-between gap-3">
          <h2 className="label">Energy</h2>
          <button
            role="switch"
            aria-checked={on}
            onClick={() => setEnergy(on ? null : last)}
            className="flex items-center gap-2 text-xs text-sub hover:text-ink"
          >
            <span className={`flex h-4 w-7 items-center rounded-full p-0.5 transition-colors ${on ? "bg-find" : "bg-hl-2"}`}>
              <span className={`size-3 rounded-full bg-white transition-transform ${on ? "translate-x-3" : ""}`} />
            </span>
            {on ? "On" : "Any energy"}
          </button>
        </div>
        <label className={`mt-2 block ${on ? "" : "opacity-50"}`}>
          <div className="flex justify-between text-xs text-sub">
            <span>Calm</span>
            <span className="tabular-nums text-ink">{on ? `${word} · ${pct}` : "Any"}</span>
            <span>Energetic</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={pct}
            onChange={(e) => {
              const v = Number(e.target.value) / 100;
              setLast(v);
              setEnergy(v);
            }}
            aria-label="Energy: from calm to energetic"
            className="sf-range always-thumb mt-2 w-full"
            style={{ ["--range-pct" as string]: `${pct}%`, ["--range-fill" as string]: on ? "var(--color-find)" : "var(--color-mute)" }}
          />
        </label>
        <p className="mt-1.5 text-xs text-mute">Measured from each song’s audio. The first time, measuring takes a little longer.</p>
      </div>

      <div>
        <div className="flex items-center justify-between gap-3">
          <h2 className="label">Instruments</h2>
          {instruments.length > 0 && (
            <button onClick={() => setInstruments([])} className="text-xs text-sub hover:text-ink">
              Clear
            </button>
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Instruments">
          {INSTRUMENTS.map((i) => {
            const sel = instruments.includes(i.id);
            return (
              <button
                key={i.id}
                aria-pressed={sel}
                data-on={sel}
                onClick={() => setInstruments(sel ? instruments.filter((x) => x !== i.id) : [...instruments, i.id])}
                className="option rounded-full px-3 py-1 text-[13px]"
              >
                {i.label}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-xs text-mute">
          {instruments.length ? "Songs featuring any of these, based on listener tags." : "Any instruments."}
        </p>
      </div>
    </div>
  );
}
