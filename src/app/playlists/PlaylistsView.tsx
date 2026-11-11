"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Heart, ListMusic, Loader2, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { Item, Kind } from "@/lib/types";
import type { SearchResponse } from "../api/search/route";
import { MODES, type Mode } from "@/lib/recommend/score";
import { taste, useProfile, useTasteInput, type PlaylistSettings } from "@/lib/taste/profile";
import { useJson } from "@/lib/client/data";
import { useImported } from "@/lib/taste/imported";
import { defaultName, generatePlaylist, LENGTH_CHOICES, modeLabel, newId, PLAYLIST_LENGTH, seedName, tasteSeeds } from "@/lib/client/playlist";
import { Artwork } from "@/components/Artwork";
import { PlaylistCover } from "@/components/Sidebar";
import { PageHeader } from "@/components/Cards";

export function Toggle({ on, set, label, hint }: { on: boolean; set: (v: boolean) => void; label: string; hint: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={() => set(!on)}
      className="option flex items-start gap-3 p-3 aria-checked:border-line aria-checked:bg-base"
    >
      <span className={`mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors ${on ? "bg-find" : "bg-hl-2"}`}>
        <span className={`size-4 rounded-full bg-white shadow transition-transform ${on ? "translate-x-4" : ""}`} />
      </span>
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-sub">{hint}</span>
      </span>
    </button>
  );
}

export function SeedSearch({ onPick }: { onPick: (s: PlaylistSettings["seeds"][number], image?: string) => void }) {
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
          placeholder="Search a song, album or artist, then press Enter"
          aria-label="Search for a playlist seed"
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
                onClick={() => onPick({ kind: it.kind, artist: it.artist, title: it.title }, it.image)}
                className="flex w-full items-center gap-3 rounded-md p-1.5 text-left transition-colors hover:bg-hl"
              >
                <Artwork src={it.image} alt={it.title} kind={it.kind} className="size-10 shrink-0" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{it.title}</span>
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

export function PlaylistsView() {
  const router = useRouter();
  const sp = useSearchParams();
  const p = useProfile();
  const tasteInput = useTasteInput();
  const imp = useImported();
  const mySeeds = useMemo(() => tasteSeeds(p, 3, imp.items), [p, imp]);

  // Prefill from Discover ("Make a playlist from this"): ?kind=&artist=&title=&mode=&adventure=
  const preKind = sp.get("kind") as Kind | null;
  const preArtist = sp.get("artist");
  const prefill = preKind && preArtist ? { kind: preKind, artist: preArtist, title: sp.get("title") ?? preArtist } : null;

  // Ratings load from storage just after the first render, so the default ("my taste" when you have
  // top-rated music) is derived, not frozen into state on that first render.
  const [basisChoice, setBasis] = useState<"taste" | "seed" | null>(prefill ? "seed" : null);
  const basis = basisChoice ?? (mySeeds.length ? "taste" : "seed");
  const [seed, setSeed] = useState<{ s: PlaylistSettings["seeds"][number]; image?: string } | null>(prefill ? { s: prefill } : null);
  const [mode, setMode] = useState<Mode>((sp.get("mode") as Mode) || "closest");
  const [adventure, setAdventure] = useState(Number(sp.get("adventure") ?? 0.3));
  const [length, setLength] = useState(() => {
    const n = Number(sp.get("length"));
    return LENGTH_CHOICES.includes(n) ? n : PLAYLIST_LENGTH;
  });
  const [oneEach, setOneEach] = useState(true);
  const [skipRated, setSkipRated] = useState(true);
  const [previewsOnly, setPreviewsOnly] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const seeds = basis === "taste" ? mySeeds : seed ? [seed.s] : [];
  const pct = Math.round(adventure * 100);

  async function create() {
    setError(null);
    const settings: PlaylistSettings = { basis, seeds, mode, adventure, perArtist: oneEach ? 1 : 2, skipRated, previewsOnly, length };
    try {
      setBusy("Starting…");
      const res = await generatePlaylist(settings, tasteInput, new Set(Object.keys(p.ratings)), setBusy);
      if (res.tracks.length < Math.min(5, length)) throw new Error("Only found a few songs for this combination — try a different style or seed.");
      if (res.tracks.length < length) {
        setBusy(`Found ${res.tracks.length} of ${length} songs that fit — saving those.`);
        await new Promise((r) => setTimeout(r, 1200));
      }
      const id = newId();
      taste.savePlaylist({
        id,
        name: defaultName(settings),
        createdAt: Date.now(),
        settings,
        seedLabel: basis === "taste" ? "your taste" : seedName(seeds[0]),
        ...res,
      });
      router.push(`/playlist?id=${id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  return (
    <div>
      <PageHeader title="Playlists" description="Build a playlist from your recommendations in the style and length you choose." />

      <section className="panel mx-4 grid gap-6 p-5 md:mx-8" aria-label="Playlist settings">
        {/* 1. Based on */}
        <div>
          <h2 className="label">Based on</h2>
          <div className="mt-2 grid gap-3 md:grid-cols-2">
            <button
              onClick={() => setBasis("taste")}
              disabled={!mySeeds.length}
              data-on={basis === "taste"}
                className="option p-3.5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                <Heart className="size-4 text-sub" /> From my taste
              </span>
              <span className="mt-1 block text-sm text-sub">
                {mySeeds.length
                  ? `Blends your favourites: ${mySeeds.map(seedName).join(", ")}`
                  : "Rate a few songs or artists 4–5★ first, or import your taste from Spotify on My Ratings."}
              </span>
            </button>
            <div data-on={basis === "seed"} className="option p-3.5 hover:bg-base">
              <button onClick={() => setBasis("seed")} className="flex w-full items-center gap-2 text-left text-sm font-medium">
                <Search className="size-4 text-sub" /> A song, album or artist
              </button>
              {basis === "seed" &&
                (seed ? (
                  <div className="mt-2 flex items-center gap-3 rounded-md border border-line bg-elev p-2">
                    <Artwork src={seed.image} alt={seedName(seed.s)} kind={seed.s.kind} className="size-10 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{seedName(seed.s)}</span>
                      <span className="block truncate text-xs capitalize text-sub">
                        {seed.s.kind === "track" ? "Song" : seed.s.kind}
                        {seed.s.kind !== "artist" && ` · ${seed.s.artist}`}
                      </span>
                    </span>
                    <button onClick={() => setSeed(null)} aria-label="Change seed" className="rounded-full p-1.5 text-sub hover:bg-hl hover:text-ink">
                      <X className="size-4" />
                    </button>
                  </div>
                ) : (
                  <div className="mt-2">
                    <SeedSearch onPick={(s, image) => setSeed({ s, image })} />
                  </div>
                ))}
              {basis !== "seed" && <p className="mt-1 text-sm text-sub">Start from one thing you love.</p>}
            </div>
          </div>
        </div>

        {/* 2. Style */}
        <div>
          <h2 className="label">Style</h2>
          <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-3" role="radiogroup" aria-label="Playlist style">
            {MODES.map((m) => (
              <button
                key={m.id}
                role="radio"
                aria-checked={mode === m.id}
                onClick={() => setMode(m.id)}
                className="option relative p-3"
              >
                {mode === m.id && <Check className="absolute right-2.5 top-2.5 size-4 text-find" />}
                <span className="block text-sm font-medium">{m.label}</span>
                <span className="mt-0.5 block text-xs text-sub">{m.hint}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 3. Length */}
        <div>
          <h2 className="label">Length</h2>
          <div className="mt-2 flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Number of songs">
            {LENGTH_CHOICES.map((n) => (
              <button
                key={n}
                role="radio"
                aria-checked={length === n}
                onClick={() => setLength(n)}
                className="option min-w-12 px-3 py-1.5 text-center text-sm tabular-nums"
              >
                {n}
              </button>
            ))}
            <span className="ml-1 text-xs text-sub">songs · about {Math.round((length * 4) / 5) * 5} min</span>
          </div>
        </div>

        {/* 4. Fine-tune */}
        <div>
          <h2 className="label">Options</h2>
          <label className="mt-3 block">
            <div className="flex justify-between text-xs text-sub">
              <span>Very similar</span>
              <span className="tabular-nums text-ink">{pct < 34 ? "Close" : pct < 67 ? "Balanced" : "Adventurous"} · {pct}</span>
              <span>More adventurous</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={pct}
              onChange={(e) => setAdventure(Number(e.target.value) / 100)}
              aria-label="Adventurousness"
              className="sf-range always-thumb mt-2 w-full"
              style={{ ["--range-pct" as string]: `${pct}%`, ["--range-fill" as string]: "var(--color-find)" }}
            />
          </label>
          <div className="mt-3 grid gap-2 md:grid-cols-3">
            <Toggle
              on={oneEach}
              set={setOneEach}
              label="One song per artist"
              hint={oneEach ? `${length} different artists when possible` : "Up to 2 songs per artist"}
            />
            <Toggle on={skipRated} set={setSkipRated} label="Only new-to-me songs" hint="Skip songs you've already rated" />
            <Toggle on={previewsOnly} set={setPreviewsOnly} label="Previewable songs only" hint="Every song plays a 30s preview here" />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <button
            onClick={create}
            disabled={!seeds.length || !!busy}
            className="btn btn-primary btn-lg"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <ListMusic className="size-4" />}
            Create {length}-song playlist
          </button>
          {busy && <p className="text-sm text-sub">{busy}</p>}
          {!busy && seeds.length > 0 && (
            <p className="text-sm text-sub">
              {modeLabel(mode)} · from {seeds.map(seedName).join(", ")}
            </p>
          )}
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      </section>

      {p.playlists.length > 0 && (
        <section className="mt-8 px-4 md:px-8">
          <h2 className="text-lg font-semibold tracking-tight">Your playlists</h2>
          <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {p.playlists.map((pl) => (
              <li key={pl.id}>
                <Link href={`/playlist?id=${pl.id}`} className="block rounded-lg p-2.5 transition-colors hover:bg-elev">
                  <PlaylistCover pl={pl} className="aspect-square w-full" />
                  <p className="mt-2.5 truncate text-sm font-medium">{pl.name}</p>
                  <p className="truncate text-sm text-sub">
                    {pl.tracks.length} songs · {modeLabel(pl.settings.mode)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
