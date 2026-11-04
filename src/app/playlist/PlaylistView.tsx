"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, ClipboardCopy, Loader2, Pencil, RefreshCw, Shuffle, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { taste, useProfile, useTasteInput } from "@/lib/taste/profile";
import { generatePlaylist, modeLabel, seedName } from "@/lib/client/playlist";
import { useEnriched } from "@/lib/client/data";
import { EmptyState, TrackRow } from "@/components/Cards";
import { PlayButton } from "@/components/Actions";
import { SpotifyExport } from "@/components/SpotifyExport";
import { PlaylistCover } from "@/components/Sidebar";
import { formatDuration } from "@/lib/util";

export function PlaylistView() {
  const id = useSearchParams().get("id") ?? "";
  const router = useRouter();
  const p = useProfile();
  const tasteInput = useTasteInput();
  const pl = p.playlists.find((x) => x.id === id);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Fills artwork/preview info for swapped-in songs (stored without it).
  const tracks = useEnriched(useMemo(() => pl?.tracks ?? [], [pl]));

  if (!pl) {
    return (
      <EmptyState
        title="Playlist not found"
        action={
          <Link href="/playlists" className="rounded-full bg-ink px-6 py-2.5 font-bold text-black">
            Make a playlist
          </Link>
        }
      />
    );
  }

  const playable = tracks.filter((t) => t.hasPreview !== false);
  const totalSec = pl.tracks.reduce((s, t) => s + (t.durationSec ?? 0), 0);
  const ctx = { seed: `Playlist: ${pl.name}`, mode: pl.settings.mode };

  const swap = (key: string) => {
    const inList = new Set(pl.tracks.map((t) => t.key));
    const next = pl.alternates.find((a) => !inList.has(a.key));
    if (!next) return;
    taste.updatePlaylist(pl.id, {
      tracks: pl.tracks.map((t) => (t.key === key ? next : t)),
      alternates: pl.alternates.filter((a) => a.key !== next.key),
    });
  };

  const regenerate = async () => {
    try {
      setBusy("Rebuilding…");
      const res = await generatePlaylist(pl.settings, tasteInput, new Set(Object.keys(p.ratings)), setBusy);
      taste.updatePlaylist(pl.id, res);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const copy = async () => {
    const text = pl.tracks.map((t, i) => `${i + 1}. ${t.artist} – ${t.title}`).join("\n");
    try {
      await navigator.clipboard.writeText(`${pl.name}\n\n${text}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <div>
      <header className="relative flex flex-col gap-5 bg-gradient-to-b from-brand-deep/40 via-brand-deep/10 to-transparent px-4 pb-6 pt-2 sm:flex-row sm:items-end md:px-6">
        <PlaylistCover pl={pl} className="mx-auto size-48 shrink-0 shadow-[0_12px_48px_rgb(0_0_0/0.6)] sm:mx-0 md:size-56" />
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider text-sub">Spotifind playlist · {modeLabel(pl.settings.mode)}</p>
          {editing ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (name.trim()) taste.updatePlaylist(pl.id, { name: name.trim() });
                setEditing(false);
              }}
              className="mt-1 flex items-center gap-2"
            >
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={(e) => e.currentTarget.form?.requestSubmit()}
                aria-label="Playlist name"
                className="w-full max-w-xl rounded-md bg-black/40 px-2 py-1 text-3xl font-extrabold tracking-tight focus:outline-none focus:ring-2 focus:ring-find md:text-5xl"
              />
              <button aria-label="Save name" className="rounded-full p-2 text-find hover:bg-hl">
                <Check className="size-6" />
              </button>
            </form>
          ) : (
            <button
              onClick={() => {
                setName(pl.name);
                setEditing(true);
              }}
              className="group mt-1 flex items-center gap-3 text-left"
              title="Rename"
            >
              <h1 className="line-clamp-2 text-4xl font-extrabold leading-tight tracking-tight md:text-6xl">{pl.name}</h1>
              <Pencil className="size-5 shrink-0 text-sub opacity-0 transition-opacity group-hover:opacity-100" />
            </button>
          )}
          <p className="mt-3 text-sm text-sub">
            Built from {pl.settings.basis === "taste" ? `your taste (${pl.settings.seeds.map(seedName).join(", ")})` : pl.seedLabel} · {pl.tracks.length}{" "}
            songs{(pl.settings.length ?? 15) > pl.tracks.length ? ` (asked for ${pl.settings.length} — that's all that fit ${modeLabel(pl.settings.mode)})` : ""}
            {totalSec ? `, about ${Math.round(totalSec / 60)} min` : ""} · Spotify plays full songs, previews here are 30s
          </p>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3 px-4 pb-4 md:px-6">
        {playable[0] && <PlayButton item={playable[0]} queue={playable} size="lg" />}
        <SpotifyExport pl={pl} />
        <button
          onClick={regenerate}
          disabled={!!busy}
          className="flex items-center gap-2 rounded-full border border-mute px-4 py-1.5 text-sm font-bold transition-colors hover:border-ink disabled:opacity-50"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          {busy ?? "Regenerate"}
        </button>
        <button onClick={copy} className="flex items-center gap-2 rounded-full border border-mute px-4 py-1.5 text-sm font-bold transition-colors hover:border-ink">
          {copied ? <Check className="size-4 text-find" /> : <ClipboardCopy className="size-4" />}
          {copied ? "Copied" : "Copy song list"}
        </button>
        <button
          onClick={() => {
            if (window.confirm(`Delete “${pl.name}”?`)) {
              taste.deletePlaylist(pl.id);
              router.push("/playlists");
            }
          }}
          className="ml-auto flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold text-sub hover:text-danger"
        >
          <Trash2 className="size-4" /> Delete
        </button>
      </div>

      <div className="mb-1 hidden grid-cols-[auto_minmax(0,1fr)_auto] gap-3 border-b border-line px-6 pb-2 text-xs uppercase tracking-wider text-sub md:mx-2 md:grid">
        <span className="w-8 text-center">#</span>
        <span>Title · why it&apos;s here</span>
        <span className="pr-2">Rate · Duration</span>
      </div>
      <div className="md:px-2">
        {tracks.map((t, i) => (
          <TrackRow
            key={t.key}
            item={t}
            index={i + 1}
            queue={playable}
            ratingCtx={ctx}
            highlight={
              pl.reasons[t.key] ? <span className="mt-0.5 line-clamp-1 block text-[12px] text-mute">{pl.reasons[t.key]}</span> : undefined
            }
            extra={
              <>
                {pl.scores[t.key] != null && (
                  <span className="hidden rounded-full bg-black/40 px-2 py-0.5 text-[11px] font-bold tabular-nums text-find lg:inline" title="Last.fm similarity">
                    {Math.round(pl.scores[t.key] * 100)}%
                  </span>
                )}
                <button
                  onClick={() => swap(t.key)}
                  disabled={!pl.alternates.some((a) => !pl.tracks.some((x) => x.key === a.key))}
                  title="Swap for the next-best song"
                  aria-label={`Swap ${t.title}`}
                  className="rounded-full p-1.5 text-sub transition-colors hover:text-ink disabled:opacity-30 md:opacity-0 md:group-hover:opacity-100"
                >
                  <Shuffle className="size-4" />
                </button>
              </>
            }
          />
        ))}
      </div>
      {pl.spotify && (
        <p className="px-4 pt-4 text-xs text-mute md:px-6">
          Saved to Spotify {new Date(pl.spotify.exportedAt).toLocaleDateString()} — after swapping or regenerating, press “Update on Spotify” to sync.
        </p>
      )}
      <p className="px-4 pt-4 text-xs text-mute md:px-6">
        {pl.alternates.length} more songs ready to swap in. Ratings you give here count toward “How good are the recommendations?” for{" "}
        {modeLabel(pl.settings.mode)}. Total {formatDuration(totalSec) || "—"}.
      </p>
    </div>
  );
}
