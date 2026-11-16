"use client";

import { genreNames, resolveGenre } from "@/lib/recommend/genres";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, ListMusic, Loader2, Star, Zap } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Kind } from "@/lib/types";
import { MODES, type Mode, type TasteInput } from "@/lib/recommend/score";
import { taste, useProfile, useTasteInput, type PlaylistSettings, type Profile } from "@/lib/taste/profile";
import { useImported } from "@/lib/taste/imported";
import { basisLabel, modeLabel, newId, seedName, tasteSeeds } from "@/lib/client/playlist";
import { RapidQueue, type RapidCard } from "@/lib/client/rapid";
import { player, usePlayer } from "@/lib/client/player";
import { Artwork } from "@/components/Artwork";
import { sizedImage } from "@/lib/img";
import { ArtistLine } from "@/components/Actions";
import { BasisPicker, ShapeControls, type Basis, type Picked } from "@/components/BuildControls";
import { PageHeader } from "@/components/Cards";
import { norm } from "@/lib/util";

type SeedT = PlaylistSettings["seeds"][number];
type Phase = "setup" | "loading" | "rating" | "summary";

const LABELS = ["", "Not for me", "Not really", "It's okay", "Really like it", "Love it"];
/** Top up the queue when this few songs are left. */
const LOW_WATER = 4;
const BATCH = 8;

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-grid min-w-5 place-items-center rounded border border-line bg-elev px-1 py-px font-sans text-[11px] text-sub">
      {children}
    </kbd>
  );
}

export function RapidView() {
  const router = useRouter();
  const sp = useSearchParams();
  const p = useProfile();
  const imp = useImported();
  const tasteInput = useTasteInput();
  const ps = usePlayer();
  const mySeeds = useMemo(() => tasteSeeds(p, 3, imp.items), [p, imp]);

  // Prefill from Discover ("Rapid-fire this"): ?kind=&artist=&title=&mode=&adventure=
  const preKind = sp.get("kind") as Kind | null;
  const preArtist = sp.get("artist");
  const prefill = preKind && preArtist ? { kind: preKind, artist: preArtist, title: sp.get("title") ?? preArtist } : null;

  const preGenre = sp.get("genre");
  const [basisChoice, setBasis] = useState<Basis | null>(preGenre ? "genre" : prefill ? "seed" : null);
  const basis: Basis = basisChoice ?? (mySeeds.length ? "taste" : "seed");
  const [picked, setPicked] = useState<Picked[]>(prefill ? [{ s: prefill }] : []);
  // ?genre= takes subgenre ids or names, several separated by "|".
  const [genres, setGenres] = useState<string[]>(() => (preGenre ? [...new Set(preGenre.split("|").filter(Boolean).map((g) => resolveGenre(g).id))].slice(0, 5) : []));
  const [energy, setEnergy] = useState<number | null>(null);
  const [instruments, setInstruments] = useState<string[]>([]);
  const [mode, setMode] = useState<Mode>((sp.get("mode") as Mode) || "closest");
  const [adventure, setAdventure] = useState(Number(sp.get("adventure") ?? 0.3));
  // For a genre, your favourites are the bridge into it.
  const seeds = basis === "seed" ? picked.map((x) => x.s) : mySeeds;
  const ready = basis === "genre" ? genres.length > 0 : seeds.length > 0;
  const pct = Math.round(adventure * 100);

  // ------------------------------------------------------------------ session
  const [phase, setPhase] = useState<Phase>("setup");
  const [error, setError] = useState<string | null>(null);
  const [cards, setCards] = useState<RapidCard[]>([]);
  const [index, setIndex] = useState(0);
  const [fetching, setFetching] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const [rated, setRated] = useState<Record<string, { card: RapidCard; stars: number }>>({});
  const [skippedKeys, setSkippedKeys] = useState<Set<string>>(new Set());
  const [flash, setFlash] = useState<string | null>(null);
  const [relaxed, setRelaxed] = useState<string | null>(null);
  const [session, setSession] = useState<{
    seeds: SeedT[];
    label: string;
    basis: Basis;
    genres?: string[];
    energy: number | null;
    instruments: string[];
    mode: Mode;
    adventure: number;
    knownArtists: Set<string>;
  } | null>(null);

  const queue = useRef<RapidQueue | null>(null);
  const tasteRef = useRef<TasteInput>(tasteInput);
  const profileRef = useRef<Profile>(p);
  const importedKeys = useMemo(() => new Set(imp.items.filter((x) => x.kind === "track").map((x) => x.key)), [imp]);
  useEffect(() => {
    tasteRef.current = tasteInput;
    profileRef.current = p;
  }, [tasteInput, p]);

  /** Songs to leave out: anything rated (any stars, so 1★-hidden too) and your imported Spotify top songs. */
  const known = useCallback(() => new Set([...Object.keys(profileRef.current.ratings), ...importedKeys]), [importedKeys]);

  const topUp = useCallback(async () => {
    const q = queue.current;
    if (!q) return;
    setFetching(true);
    try {
      const more = await q.next(BATCH, tasteRef.current, known());
      if (queue.current !== q) return; // a newer session started
      if (!more.length) setExhausted(true);
      else setCards((c) => [...c, ...more]);
      setRelaxed(q.relaxedNote);
    } finally {
      if (queue.current === q) setFetching(false);
    }
  }, [known]);

  async function start() {
    if (!ready) return;
    setError(null);
    setPhase("loading");
    const g = basis === "genre" ? genres : undefined;
    const q = new RapidQueue({ seeds, mode, adventure, genres: g, shape: { energy, instruments } });
    queue.current = q;
    setCards([]);
    setIndex(0);
    setRated({});
    setSkippedKeys(new Set());
    setExhausted(false);
    setRelaxed(null);
    setSession({
      seeds,
      label: basisLabel({ basis, seeds, genres: g }),
      basis,
      genres: g,
      energy,
      instruments,
      mode,
      adventure,
      knownArtists: new Set([...Object.values(p.ratings).map((r) => norm(r.item.artist)), ...imp.items.map((x) => norm(x.artist))]),
    });
    try {
      await q.start(tasteRef.current);
      const first = await q.next(BATCH, tasteRef.current, known());
      if (queue.current !== q) return;
      if (!first.length) throw new Error("No previewable songs found for this seed and style — try another style or seed.");
      setCards(first);
      setRelaxed(q.relaxedNote);
      setPhase("rating");
    } catch (e) {
      setError((e as Error).message);
      setPhase("setup");
    }
  }

  const finish = useCallback(() => {
    if (player.state().status === "playing") player.toggle();
    setPhase("summary");
  }, []);

  const current = phase === "rating" ? cards[index] : undefined;

  // Auto-play each song's preview as it comes up (only that song, so the player doesn't run ahead of you).
  const playingKey = useRef<string | null>(null);
  useEffect(() => {
    if (!current || playingKey.current === current.item.key) return;
    playingKey.current = current.item.key;
    player.play(current.item, [current.item]);
  }, [current]);
  useEffect(() => {
    if (phase !== "rating") playingKey.current = null;
  }, [phase]);

  // Quietly top up when the queue runs low; your newest ratings re-rank what's fetched.
  useEffect(() => {
    if (phase !== "rating" || fetching || exhausted) return;
    if (cards.length - index <= LOW_WATER) void topUp();
  }, [phase, cards.length, index, fetching, exhausted, topUp]);

  // Ran past the end: wait for the top-up, or finish when there's nothing more.
  const pastEnd = phase === "rating" && index >= cards.length;
  const waitingForMore = pastEnd && !(exhausted && !fetching);
  const ranOut = pastEnd && exhausted && !fetching;
  useEffect(() => {
    if (ranOut && player.state().status === "playing") player.toggle();
  }, [ranOut]);

  /** Move forward, silently passing songs you rated elsewhere since they were queued (e.g. from the player bar). */
  const advance = useCallback(
    (sessionRated: Record<string, unknown>) =>
      setIndex((i) => {
        let j = i + 1;
        while (j < cards.length && profileRef.current.ratings[cards[j].item.key] && !sessionRated[cards[j].item.key]) j++;
        return j;
      }),
    [cards],
  );

  const say = (msg: string) => {
    setFlash(msg);
    window.setTimeout(() => setFlash((f) => (f === msg ? null : f)), 1200);
  };

  const rate = useCallback(
    (n: number) => {
      if (!current || !session) return;
      const prev = profileRef.current.ratings[current.item.key]?.rating;
      // Rating again with the same stars would clear it (that's how the star control works) — here it just moves on.
      if (prev !== n) taste.rate(current.item, n, current.tags, { seed: session.label, mode: session.mode });
      const nextRated = { ...rated, [current.item.key]: { card: current, stars: n } };
      setRated(nextRated);
      if (n >= 4) queue.current?.addSeeds([{ kind: "track", artist: current.item.artist, title: current.item.title }]);
      say(n === 1 ? "Hidden" : n >= 4 ? `${n}★ — more like this` : `${n}★`);
      advance(nextRated);
    },
    [current, session, rated, advance],
  );

  const skip = useCallback(() => {
    if (!current) return;
    if (!rated[current.item.key]) setSkippedKeys((s) => new Set(s).add(current.item.key));
    advance(rated);
  }, [current, rated, advance]);

  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  // Keyboard: 1–5 rate + next · → / Space skip · ← back · Esc finish
  useEffect(() => {
    if (phase !== "rating") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return; // ⌘1–⌘7 still navigate
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (/^[1-5]$/.test(e.key)) {
        e.preventDefault();
        rate(Number(e.key));
      } else if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        skip();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        back();
      } else if (e.key === "Escape") {
        e.preventDefault();
        finish();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, rate, skip, back, finish]);

  // Leaving the page ends the session's preview.
  useEffect(
    () => () => {
      queue.current = null;
    },
    [],
  );

  // A song you skipped and later rated counts as rated, not skipped.
  const skipped = [...skippedKeys].filter((k) => !rated[k]).length;

  // ------------------------------------------------------------------ summary numbers
  const summary = useMemo(() => {
    const list = Object.values(rated);
    const loved = list.filter((x) => x.stars >= 4);
    const avg = list.length ? list.reduce((s, x) => s + x.stars, 0) / list.length : 0;
    const byArtist = new Map<string, { name: string; n: number; sum: number }>();
    for (const x of loved) {
      const k = norm(x.card.item.artist);
      if (session?.knownArtists.has(k)) continue; // new to you = not rated or imported before this session
      const a = byArtist.get(k) ?? { name: x.card.item.artist, n: 0, sum: 0 };
      a.n += 1;
      a.sum += x.stars;
      byArtist.set(k, a);
    }
    const newArtists = [...byArtist.values()].sort((a, b) => b.n - a.n || b.sum / b.n - a.sum / a.n).slice(0, 5);
    return { count: list.length, avg, loved, newArtists };
  }, [rated, session]);

  function makePlaylist() {
    if (!session || !summary.loved.length) return;
    const tracks = [...summary.loved].sort((a, b) => b.stars - a.stars).map((x) => x.card.item).slice(0, 50);
    const reasons: Record<string, string> = {};
    const scores: Record<string, number> = {};
    for (const x of summary.loved) {
      reasons[x.card.item.key] = `You rated it ${x.stars}★ in Rapid-fire · ${x.card.reason}`;
      if (x.card.score?.label === "Last.fm similarity") scores[x.card.item.key] = x.card.score.value;
    }
    const id = newId();
    taste.savePlaylist({
      id,
      name: `Rapid-fire: ${session.basis === "taste" ? "My picks" : session.label}`,
      createdAt: Date.now(),
      settings: {
        basis: session.basis,
        seeds: session.seeds,
        genres: session.genres,
        energy: session.energy,
        instruments: session.instruments,
        mode: session.mode,
        adventure: session.adventure,
        perArtist: 2,
        skipRated: true,
        previewsOnly: true,
        length: Math.max(5, Math.min(50, tracks.length)),
      },
      seedLabel: session.label,
      tracks,
      alternates: [],
      reasons,
      scores,
    });
    router.push(`/playlist?id=${id}`);
  }

  // ------------------------------------------------------------------ render
  const header = <PageHeader title="Rapid-fire" description="One song at a time with its preview. Press 1–5 to rate and move on; your ratings shape what comes next." />;

  if (phase === "setup" || phase === "loading") {
    return (
      <div>
        {header}
        <section className="panel mx-4 grid gap-6 p-5 md:mx-8" aria-label="Rapid-fire settings">
          <BasisPicker
            basis={basis}
            setBasis={setBasis}
            mySeeds={mySeeds}
            picked={picked}
            setPicked={setPicked}
            genres={genres}
            setGenres={setGenres}
            tasteTags={tasteInput.tags}
          />

          <div>
            <h2 className="label">Style</h2>
            <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-3" role="radiogroup" aria-label="Discovery mode">
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
            <label className="mt-4 block">
              <div className="flex justify-between text-xs text-sub">
                <span>Very similar</span>
                <span className="tabular-nums text-ink">
                  {pct < 34 ? "Close" : pct < 67 ? "Balanced" : "Adventurous"} · {pct}
                </span>
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
          </div>

          <ShapeControls energy={energy} setEnergy={setEnergy} instruments={instruments} setInstruments={setInstruments} />

          <div className="flex flex-wrap items-center gap-4">
            <button
              onClick={start}
              disabled={!ready || phase === "loading"}
              className="btn btn-primary btn-lg"
            >
              {phase === "loading" ? <Loader2 className="size-4 animate-spin" /> : <Zap className="size-4" />}
              {phase === "loading" ? (energy != null ? "Measuring energy…" : "Lining up songs…") : "Start"}
            </button>
            {ready && phase !== "loading" && (
              <p className="text-sm text-sub">
                {modeLabel(mode)} · from {basis === "genre" ? `${genreNames(genres)}, matched to your taste` : seeds.map(seedName).join(", ")}
                {energy != null && ` · energy ${Math.round(energy * 100)}`}
                {instruments.length > 0 && ` · ${instruments.length} instrument${instruments.length > 1 ? "s" : ""}`}
              </p>
            )}
            {error && <p className="text-sm text-danger">{error}</p>}
          </div>
        </section>
      </div>
    );
  }

  if (phase === "summary" || ranOut) {
    return (
      <div>
        {header}
        <section className="panel mx-4 max-w-3xl p-5 md:mx-8" aria-label="Session summary">
          <h2 className="text-lg font-semibold tracking-tight">Session summary</h2>
          <div className="mt-4 flex flex-wrap gap-8">
            <div>
              <p className="text-2xl font-semibold tabular-nums">{summary.count}</p>
              <p className="text-xs text-sub">songs rated{skipped ? ` · ${skipped} skipped` : ""}</p>
            </div>
            <div>
              <p className="flex items-center gap-1 text-2xl font-semibold tabular-nums">
                {summary.count ? summary.avg.toFixed(1) : "–"} <Star className="size-5 fill-find text-find" />
              </p>
              <p className="text-xs text-sub">average stars</p>
            </div>
            <div>
              <p className="text-2xl font-semibold tabular-nums">{summary.loved.length}</p>
              <p className="text-xs text-sub">rated 4–5★</p>
            </div>
          </div>

          <h3 className="label mt-6">Top new artists</h3>
          {summary.newArtists.length ? (
            <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
              {summary.newArtists.map((a) => (
                <li key={a.name} className="flex items-center justify-between gap-3 rounded-md border border-line bg-base px-3 py-2">
                  <ArtistLine name={a.name} className="text-sm font-medium" />
                  <span className="shrink-0 text-xs tabular-nums text-sub">
                    {a.n} song{a.n > 1 ? "s" : ""} · {(a.sum / a.n).toFixed(1)}★
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-sub">No new artists rated 4★ or higher this time.</p>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              onClick={makePlaylist}
              disabled={!summary.loved.length}
              className="btn btn-primary"
            >
              <ListMusic className="size-4" />
              {summary.loved.length ? `Make a playlist from ${summary.loved.length} 4–5★ song${summary.loved.length > 1 ? "s" : ""}` : "No 4–5★ songs for a playlist yet"}
            </button>
            {!exhausted || index < cards.length ? (
              <button onClick={() => setPhase("rating")} className="btn btn-secondary">
                Keep going
              </button>
            ) : null}
            <button onClick={() => setPhase("setup")} className="btn btn-ghost">
              New session
            </button>
            <Link href="/ratings" className="btn btn-ghost">
              See all ratings
            </Link>
          </div>
        </section>
      </div>
    );
  }

  // ------------------------------------------------------------------ rating
  const it = current?.item;
  const myStars = it ? (rated[it.key]?.stars ?? p.ratings[it.key]?.rating ?? 0) : 0;
  return (
    <div className="flex min-h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 md:px-8">
        <p className="text-sm">
          <span className="font-medium">Rapid-fire</span>
          <span className="text-sub"> · {session?.label} · {modeLabel(session?.mode ?? "closest")}</span>
        </p>
        <p className="text-xs tabular-nums text-sub">
          {summary.count} rated · {skipped} skipped
          {fetching && <Loader2 className="ml-2 inline size-3 animate-spin text-find" aria-label="Finding more songs" />}
        </p>
        <button onClick={finish} className="btn btn-secondary btn-sm">
          Finish
        </button>
      </div>

      {!it ? (
        <div className="grid flex-1 place-items-center p-8 text-sub">
          <p className="flex items-center gap-2">
            <Loader2 className="size-5 animate-spin text-find" />
            {waitingForMore ? "Finding more songs with your latest ratings…" : "Loading…"}
          </p>
        </div>
      ) : (
        <div key={it.key} className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center px-4 pb-6 pt-4 text-center animate-fade-in">
          <Artwork src={it.image} alt={`${it.title} by ${it.artist}`} kind="track" priority className="aspect-square w-full max-w-[min(340px,36vh)]" />
          <h2 className="mt-5 line-clamp-2 text-2xl font-semibold tracking-tight">{it.title}</h2>
          <div className="mt-1 flex max-w-full justify-center text-[16px] text-sub">
            <ArtistLine name={it.artist} />
          </div>
          <p className="mt-2 max-w-lg text-sm text-sub">
            {current!.score && (
              <span className="mr-1.5 rounded border border-line px-1.5 py-0.5 text-xs text-ink">{Math.round(current!.score.value * 100)}%</span>
            )}
            {current!.reason}
          </p>
          {relaxed && <p className="mt-1 text-xs text-mute">{relaxed}</p>}
          {ps.item?.key === it.key && ps.status === "unavailable" && <p className="mt-1 text-xs text-danger">Preview didn’t load — press → to skip.</p>}

          <div className="mt-5 flex items-center gap-1" role="radiogroup" aria-label={`Rate ${it.title}`}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                role="radio"
                aria-checked={myStars === n}
                aria-label={`${n} star${n > 1 ? "s" : ""}: ${LABELS[n]}`}
                title={`${LABELS[n]} (press ${n})`}
                onClick={(e) => {
                  e.currentTarget.blur();
                  rate(n);
                }}
                className="group flex flex-col items-center gap-1 rounded-md px-2 py-1 hover:bg-elev"
              >
                <Star className={`size-8 ${n <= myStars ? (myStars === 1 ? "fill-danger text-danger" : "fill-find text-find") : "text-mute group-hover:text-sub"}`} />
                <Kbd>{n}</Kbd>
              </button>
            ))}
          </div>
          <p aria-live="polite" className="mt-1 h-5 text-sm text-sub">
            {flash}
          </p>

          <div className="mt-2 flex items-center gap-3">
            <button
              onClick={back}
              disabled={index === 0}
              className="btn btn-ghost btn-sm"
            >
              <ArrowLeft className="size-4" /> Back
            </button>
            <button onClick={skip} className="btn btn-ghost btn-sm">
              Skip <ArrowRight className="size-4" />
            </button>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-sub" aria-label="Keyboard shortcuts">
            <span className="flex items-center gap-1.5">
              <Kbd>1</Kbd>–<Kbd>5</Kbd> rate &amp; next
            </span>
            <span className="flex items-center gap-1.5">
              <Kbd>→</Kbd>/<Kbd>Space</Kbd> skip
            </span>
            <span className="flex items-center gap-1.5">
              <Kbd>←</Kbd> back
            </span>
            <span className="flex items-center gap-1.5">
              <Kbd>Esc</Kbd> finish
            </span>
          </div>
          {/* Warm the next three covers (at the size shown) so each appears instantly. */}
          {cards.slice(index + 1, index + 4).map((c) =>
            c.item.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={c.item.key} src={sizedImage(c.item.image, 720)} alt="" className="hidden" aria-hidden />
            ) : null,
          )}
        </div>
      )}
    </div>
  );
}
