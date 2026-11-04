"use client";

import Link from "next/link";
import { ExternalLink, Loader2, Pause, Play, SkipBack, SkipForward, Volume1, Volume2, VolumeX } from "lucide-react";
import { player, usePlayer } from "@/lib/client/player";
import { Artwork } from "./Artwork";
import { formatDuration, hrefFor, spotifyOpenHref } from "@/lib/util";
import { SpotifyGlyph } from "./icons";
import { ArtistLine, Rating } from "./Actions";

function Range({ value, max, onChange, label }: { value: number; max: number; onChange: (v: number) => void; label: string }) {
  const pct = max ? (value / max) * 100 : 0;
  return (
    <input
      type="range"
      aria-label={label}
      min={0}
      max={max}
      step={max / 200}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="sf-range w-full"
      style={{ ["--range-pct" as string]: `${pct}%` }}
    />
  );
}

export function Player() {
  const s = usePlayer();
  const it = s.item;
  const playing = s.status === "playing";
  const canControl = s.status === "playing" || s.status === "paused";
  const VolIcon = s.volume === 0 ? VolumeX : s.volume < 0.5 ? Volume1 : Volume2;

  return (
    <footer className="shrink-0 md:h-[76px] md:px-2" aria-label="Player">
      {/* Mobile mini player */}
      {it && (
        <div className="mx-2 mb-1 flex items-center gap-3 rounded-md bg-hl-2/95 p-2 md:hidden">
          <Artwork src={it.image} alt={it.title} kind={it.kind} className="size-10 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{it.title}</p>
            <p className="truncate text-xs text-sub">
              {s.status === "unavailable" ? "No preview — open in Spotify" : `${it.artist}${canControl ? " · 30s preview" : ""}`}
            </p>
          </div>
          <a href={spotifyOpenHref(it.kind, it.artist, it.title)} target="_blank" rel="noreferrer" aria-label="Open in Spotify" className="p-1.5 text-sub">
            <SpotifyGlyph className="size-5" />
          </a>
          <button onClick={() => player.toggle()} disabled={!canControl} aria-label={playing ? "Pause" : "Play"} className="p-1.5 disabled:opacity-40">
            {s.status === "loading" ? <Loader2 className="size-6 animate-spin" /> : playing ? <Pause className="size-6 fill-ink" /> : <Play className="size-6 fill-ink" />}
          </button>
        </div>
      )}

      {/* Desktop bar */}
      <div className="hidden h-full grid-cols-[minmax(180px,1fr)_minmax(320px,2fr)_minmax(180px,1fr)] items-center gap-4 px-2 md:grid">
        <div className="flex min-w-0 items-center gap-3">
          {it ? (
            <>
              <Link href={hrefFor(it.kind, it.artist, it.title)} className="shrink-0">
                <Artwork src={it.image} alt={it.title} kind={it.kind} className="size-14" />
              </Link>
              <div className="min-w-0">
                <Link href={hrefFor(it.kind, it.artist, it.title)} className="block truncate text-sm font-semibold hover:underline">
                  {it.title}
                </Link>
                <ArtistLine name={it.artist} className="text-xs text-sub" />
              </div>
              <div className="ml-1 hidden shrink-0 lg:block">
                <Rating item={it} size={14} />
              </div>
            </>
          ) : (
            <p className="text-sm text-mute">Pick a song to preview it here</p>
          )}
        </div>

        <div className="flex flex-col items-center gap-1.5">
          <div className="flex items-center gap-5">
            <button onClick={() => player.prev()} disabled={!it} aria-label="Previous" className="text-sub hover:text-ink disabled:opacity-30">
              <SkipBack className="size-5 fill-current" />
            </button>
            <button
              onClick={() => player.toggle()}
              disabled={!canControl}
              aria-label={playing ? "Pause" : "Play"}
              className="grid size-9 place-items-center rounded-full bg-ink text-black transition-transform hover:scale-105 disabled:opacity-40 disabled:hover:scale-100"
            >
              {s.status === "loading" ? <Loader2 className="size-5 animate-spin" /> : playing ? <Pause className="size-5 fill-black" /> : <Play className="size-5 translate-x-px fill-black" />}
            </button>
            <button onClick={() => player.next()} disabled={!it || s.index >= s.queue.length - 1} aria-label="Next" className="text-sub hover:text-ink disabled:opacity-30">
              <SkipForward className="size-5 fill-current" />
            </button>
          </div>
          {s.status === "unavailable" && it ? (
            <p className="text-xs text-sub">
              No legal preview available for this {it.kind}.{" "}
              <a className="font-semibold text-brand hover:underline" href={spotifyOpenHref(it.kind, it.artist, it.title)} target="_blank" rel="noreferrer">
                Listen on Spotify
              </a>
            </p>
          ) : (
            <div className="flex w-full max-w-[560px] items-center gap-2 text-[11px] tabular-nums text-sub">
              <span className="w-9 text-right">{formatDuration(s.position) || "0:00"}</span>
              <Range label="Seek" value={Math.min(s.position, s.duration)} max={s.duration || 30} onChange={(v) => player.seek(v)} />
              <span className="w-9">{formatDuration(s.duration) || "0:30"}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3">
          {it && canControl && (
            <span className="hidden rounded-full border border-line px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sub xl:inline">30s preview · Deezer</span>
          )}
          {it && (
            <a
              href={spotifyOpenHref(it.kind, it.artist, it.title)}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-semibold text-sub hover:text-ink"
              title="Open in Spotify"
            >
              <SpotifyGlyph className="size-4" />
              <span className="hidden lg:inline">Open in Spotify</span>
              <ExternalLink className="size-3" />
            </a>
          )}
          <button onClick={() => player.setVolume(s.volume ? 0 : 0.8)} aria-label={s.volume ? "Mute" : "Unmute"} className="text-sub hover:text-ink">
            <VolIcon className="size-5" />
          </button>
          <div className="w-24">
            <Range label="Volume" value={s.volume} max={1} onChange={(v) => player.setVolume(v)} />
          </div>
        </div>
      </div>
    </footer>
  );
}
