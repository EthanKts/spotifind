"use client";

import { Check, ExternalLink, Loader2, LogOut, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SpotifyStatus } from "@/app/api/spotify/status/route";
import { taste, type Playlist } from "@/lib/taste/profile";
import { modeLabel } from "@/lib/client/playlist";
import { SpotifyGlyph } from "./icons";
import { fetchStatus, SpotifySetupSteps } from "./SpotifySetup";
import { SpotifyImport } from "./SpotifyImport";

type Phase = "idle" | "setup" | "connect" | "waiting" | "exporting" | "done" | "error";

/** "Save to Spotify" / "Update on Spotify" for a playlist, with the one-time setup built in. */
export function SpotifyExport({ pl }: { pl: Playlist }) {
  const [status, setStatus] = useState<SpotifyStatus | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isPublic, setIsPublic] = useState(false);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    const s = await fetchStatus().catch(() => null);
    if (s) setStatus(s);
    return s;
  }, []);

  useEffect(() => {
    let alive = true;
    fetchStatus()
      .then((s) => alive && setStatus(s))
      .catch(() => {});
    const timer = poll;
    return () => {
      alive = false;
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  const doExport = useCallback(async () => {
    setPhase("exporting");
    setError(null);
    try {
      const res = await fetch("/api/spotify/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: pl.name,
          description: `${modeLabel(pl.settings.mode)} from ${pl.seedLabel} — made with Spotifind, rated by you.`,
          isPublic,
          tracks: pl.tracks.map((t) => ({ artist: t.artist, title: t.title })),
          existingId: pl.spotify?.id,
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        if (j.needsLogin) {
          await refresh();
          setPhase("connect");
          return;
        }
        throw new Error(j.error ?? `Export failed (${res.status})`);
      }
      taste.updatePlaylist(pl.id, { spotify: { ...j, exportedAt: Date.now() } });
      setPhase("done");
    } catch (e) {
      setError((e as Error).message);
      setPhase("error");
    }
  }, [pl, isPublic, refresh]);

  const start = async () => {
    setError(null);
    const s = (await refresh()) ?? status;
    if (!s?.configured) setPhase("setup");
    else if (!s.connected) setPhase("connect");
    else void doExport();
  };

  const connect = () => {
    // The Mac app opens this in your default browser; afterwards we notice the login by polling.
    window.open(`/api/spotify/login?return=${encodeURIComponent(`/playlist?id=${pl.id}`)}`, "_blank");
    setPhase("waiting");
    if (poll.current) clearInterval(poll.current);
    const started = Date.now();
    poll.current = setInterval(async () => {
      const s = await fetchStatus().catch(() => null);
      if (s?.connected) {
        clearInterval(poll.current!);
        setStatus(s);
        void doExport();
      } else if (Date.now() - started > 5 * 60_000) {
        clearInterval(poll.current!);
        setPhase("connect");
      }
    }, 1500);
  };

  const disconnect = async () => {
    await fetch("/api/spotify/logout", { method: "POST" });
    await refresh();
    setPhase("idle");
  };

  const close = () => {
    if (poll.current) clearInterval(poll.current);
    setPhase("idle");
  };

  const exported = pl.spotify;

  return (
    <>
      <button
        onClick={start}
        disabled={phase === "exporting"}
        className="btn btn-primary"
      >
        {phase === "exporting" ? <Loader2 className="size-4 animate-spin" /> : <SpotifyGlyph className="size-4" />}
        {exported ? "Update on Spotify" : "Save to Spotify"}
      </button>
      {exported && (
        <a
          href={exported.url}
          target="_blank"
          rel="noreferrer"
          className="btn btn-secondary"
        >
          Open on Spotify <ExternalLink className="size-3.5" />
        </a>
      )}

      {phase !== "idle" && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Save to Spotify">
          <div className="relative w-full max-w-lg rounded-lg border border-line bg-elev p-5 shadow-xl">
            <button onClick={close} aria-label="Close" className="absolute right-3 top-3 rounded-full p-1.5 text-sub hover:bg-hl hover:text-ink">
              <X className="size-5" />
            </button>
            <h2 className="pr-8 text-base font-semibold">
              Save “{pl.name}” to Spotify
            </h2>

            {phase === "setup" && status && (
              <SpotifySetupSteps
                status={status}
                purpose="save playlists to your own account"
                onSaved={async () => {
                  await refresh();
                  setPhase("connect");
                }}
              />
            )}

            {phase === "connect" && (
              <div className="mt-4 space-y-4 text-sm text-sub">
                <p>Connect your Spotify account. Your browser opens Spotify’s page to approve saving playlists — then come back here.</p>
                <label className="flex items-center gap-2 text-ink">
                  <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} className="accent-[var(--color-find)]" />
                  Make the playlist public on my profile
                </label>
                <button onClick={connect} className="btn btn-primary">
                  <SpotifyGlyph className="size-4" /> Connect Spotify
                </button>
                <button onClick={() => setPhase("setup")} className="block text-xs text-mute hover:text-sub">
                  Use a different Client ID
                </button>
              </div>
            )}

            {phase === "waiting" && (
              <div className="mt-6 flex items-center gap-3 text-sm text-sub">
                <Loader2 className="size-5 animate-spin text-find" />
                Waiting for you to approve Spotifind in your browser…
              </div>
            )}

            {phase === "exporting" && (
              <div className="mt-6 flex items-center gap-3 text-sm text-sub">
                <Loader2 className="size-5 animate-spin text-find" />
                Finding {pl.tracks.length} songs on Spotify and {exported ? "updating" : "creating"} the playlist…
              </div>
            )}

            {phase === "done" && pl.spotify && (
              <div className="mt-4 space-y-3 text-sm text-sub">
                <p className="flex items-center gap-2 text-sm font-medium text-ink">
                  <Check className="size-5 text-find" /> {exported ? "On your Spotify" : "Saved"} — {pl.spotify.found} of {pl.tracks.length} songs
                </p>
                {pl.spotify.missing.length > 0 && (
                  <div>
                    <p>Not available on Spotify:</p>
                    <ul className="mt-1 list-disc pl-5 text-xs">
                      {pl.spotify.missing.map((m) => (
                        <li key={m}>{m}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <a
                  href={pl.spotify.url}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-primary"
                >
                  <SpotifyGlyph className="size-4" /> Open in Spotify
                </a>
                <div className="border-t border-line pt-3">
                  <SpotifyImport variant="compact" />
                </div>
              </div>
            )}

            {phase === "error" && (
              <div className="mt-4 space-y-3 text-sm">
                <p className="text-danger">{error}</p>
                <button onClick={() => void doExport()} className="btn btn-primary">
                  Try again
                </button>
              </div>
            )}

            {status?.connected && phase !== "waiting" && (
              <div className="mt-6 flex items-center justify-between border-t border-line pt-3 text-xs text-mute">
                <span>Connected as {status.user?.display_name || status.user?.id}</span>
                <button onClick={disconnect} className="flex items-center gap-1 hover:text-ink">
                  <LogOut className="size-3.5" /> Disconnect
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
