"use client";

import { genreNames, resolveGenre } from "@/lib/recommend/genres";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, ListMusic, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { Kind } from "@/lib/types";
import { MODES, type Mode } from "@/lib/recommend/score";
import { taste, useProfile, useTasteInput, type PlaylistSettings, type PlaylistSource } from "@/lib/taste/profile";
import { useImported } from "@/lib/taste/imported";
import { basisLabel, defaultName, generatePlaylist, LENGTH_CHOICES, modeLabel, newId, PLAYLIST_LENGTH, playlistSeeds, seedName, tasteSeeds } from "@/lib/client/playlist";
import { BasisPicker, ShapeControls, type Basis, type Picked } from "@/components/BuildControls";
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
  const preGenre = sp.get("genre");
  // ?from=<Spotify playlist link> opens "A Spotify playlist" with that link loaded.
  const preLink = sp.get("from") ?? undefined;
  const [basisChoice, setBasis] = useState<Basis | null>(preLink ? "playlist" : preGenre ? "genre" : prefill ? "seed" : null);
  const [source, setSource] = useState<PlaylistSource | null>(null);
  const basis: Basis = basisChoice ?? (mySeeds.length ? "taste" : "seed");
  const [picked, setPicked] = useState<Picked[]>(prefill ? [{ s: prefill }] : []);
  // ?genre= takes subgenre ids or names, several separated by "|".
  const [genres, setGenres] = useState<string[]>(() => (preGenre ? [...new Set(preGenre.split("|").filter(Boolean).map((g) => resolveGenre(g).id))].slice(0, 5) : []));
  const [energy, setEnergy] = useState<number | null>(null);
  const [instruments, setInstruments] = useState<string[]>([]);
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

  // For a genre, your favourites are the bridge into it.
  const seeds = useMemo(
    () => (basis === "seed" ? picked.map((x) => x.s) : basis === "playlist" ? (source ? playlistSeeds(source) : []) : mySeeds),
    [basis, picked, source, mySeeds],
  );
  const ready = basis === "genre" ? genres.length > 0 : basis === "playlist" ? !!source && seeds.length > 0 : seeds.length > 0;
  const pct = Math.round(adventure * 100);

  async function create() {
    setError(null);
    const settings: PlaylistSettings = {
      basis, seeds, mode, adventure, perArtist: oneEach ? 1 : 2, skipRated, previewsOnly, length,
      genres: basis === "genre" ? genres : undefined,
      source: basis === "playlist" && source ? source : undefined,
      energy, instruments,
    };
    try {
      setBusy("Starting…");
      const res = await generatePlaylist(settings, tasteInput, new Set(Object.keys(p.ratings)), setBusy);
      if (res.tracks.length < Math.min(5, length)) throw new Error("Only found a few songs for this combination — try a different style or seed.");
      if (res.tracks.length < length || res.note) {
        setBusy(res.note ?? `Found ${res.tracks.length} of ${length} songs that fit — saving those.`);
        await new Promise((r) => setTimeout(r, res.note ? 2500 : 1200));
      }
      const id = newId();
      taste.savePlaylist({
        id,
        name: defaultName(settings),
        createdAt: Date.now(),
        settings,
        seedLabel: basisLabel(settings),
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
        <BasisPicker
          basis={basis}
          setBasis={setBasis}
          mySeeds={mySeeds}
          picked={picked}
          setPicked={setPicked}
          genres={genres}
          setGenres={setGenres}
          tasteTags={tasteInput.tags}
          source={source}
          setSource={setSource}
          initialLink={preLink}
        />

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

        <ShapeControls energy={energy} setEnergy={setEnergy} instruments={instruments} setInstruments={setInstruments} />

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
                title="Left: songs closest to what you picked. Right: further away, with artists you probably don’t know yet."
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
            disabled={!ready || !!busy}
            className="btn btn-primary btn-lg"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <ListMusic className="size-4" />}
            Create {length}-song playlist
          </button>
          {busy && <p className="text-sm text-sub">{busy}</p>}
          {!busy && ready && (
            <p className="text-sm text-sub">
              {modeLabel(mode)} · from{" "}
              {basis === "genre"
                ? `${genreNames(genres)}, matched to your taste`
                : basis === "playlist" && source
                  ? `${source.name} (new songs only, built from ${seeds.length} of its songs)`
                  : seeds.map(seedName).join(", ")}
              {energy != null && ` · energy ${Math.round(energy * 100)}`}
              {instruments.length > 0 && ` · ${instruments.length} instrument${instruments.length > 1 ? "s" : ""}`}
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
