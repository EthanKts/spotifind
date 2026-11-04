"use client";

import { Check, Copy, ExternalLink, Loader2, LogOut, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SpotifyStatus } from "@/app/api/spotify/status/route";
import { taste, type Playlist } from "@/lib/taste/profile";
import { modeLabel } from "@/lib/client/playlist";
import { SpotifyGlyph } from "./icons";

type Phase = "idle" | "setup" | "connect" | "waiting" | "exporting" | "done" | "error";

async function fetchStatus(): Promise<SpotifyStatus> {
  return fetch("/api/spotify/status", { cache: "no-store" }).then((r) => r.json());
}

/** "Save to Spotify" / "Update on Spotify" for a playlist, with the one-time setup built in. */
export function SpotifyExport({ pl }: { pl: Playlist }) {
  const [status, setStatus] = useState<SpotifyStatus | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [clientId, setClientId] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [copied, setCopied] = useState(false);
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

  const saveClientId = async () => {
    setError(null);
    const res = await fetch("/api/spotify/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId }),
    });
    const j = await res.json();
    if (!res.ok) return setError(j.error ?? "Couldn't save the Client ID");
    await refresh();
    setPhase("connect");
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

  const copyUri = async () => {
    if (!status) return;
    try {
      await navigator.clipboard.writeText(status.redirectUri);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const exported = pl.spotify;

  return (
    <>
      <button
        onClick={start}
        disabled={phase === "exporting"}
        className="flex items-center gap-2 rounded-full bg-find px-4 py-1.5 text-sm font-bold text-black transition-transform hover:scale-105 disabled:opacity-60"
      >
        {phase === "exporting" ? <Loader2 className="size-4 animate-spin" /> : <SpotifyGlyph className="size-4" />}
        {exported ? "Update on Spotify" : "Save to Spotify"}
      </button>
      {exported && (
        <a
          href={exported.url}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 rounded-full border border-mute px-4 py-1.5 text-sm font-bold transition-colors hover:border-ink"
        >
          Open on Spotify <ExternalLink className="size-3.5" />
        </a>
      )}

      {phase !== "idle" && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Save to Spotify">
          <div className="relative w-full max-w-lg rounded-2xl bg-elev-2 p-6 shadow-2xl animate-rise">
            <button onClick={close} aria-label="Close" className="absolute right-3 top-3 rounded-full p-1.5 text-sub hover:bg-hl hover:text-ink">
              <X className="size-5" />
            </button>
            <h2 className="flex items-center gap-2 text-xl font-bold">
              <SpotifyGlyph className="size-5 text-find" /> Save “{pl.name}” to Spotify
            </h2>

            {phase === "setup" && status && (
              <div className="mt-4 space-y-3 text-sm text-sub">
                <p>
                  One-time setup (about 3 minutes). Spotify lets personal apps save playlists to your own account once you register one.
                </p>
                <ol className="list-decimal space-y-2 pl-5">
                  <li>
                    Open{" "}
                    <a className="font-semibold text-find hover:underline" href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer">
                      developer.spotify.com/dashboard
                    </a>
                    , log in, and click <b className="text-ink">Create app</b>.
                  </li>
                  <li>
                    Name it <b className="text-ink">Spotifind</b>, write any description, and add this exact <b className="text-ink">Redirect URI</b>:
                    <span className="mt-1.5 flex items-center gap-2 rounded-md bg-black/40 px-3 py-2 font-mono text-xs text-ink">
                      <span className="flex-1 select-all break-all">{status.redirectUri}</span>
                      <button onClick={copyUri} className="shrink-0 rounded p-1 text-sub hover:text-ink" aria-label="Copy redirect URI">
                        {copied ? <Check className="size-4 text-find" /> : <Copy className="size-4" />}
                      </button>
                    </span>
                  </li>
                  <li>
                    Tick <b className="text-ink">Web API</b>, accept the terms and save.
                  </li>
                  <li>
                    Open the app’s <b className="text-ink">Settings</b>, copy the <b className="text-ink">Client ID</b> and paste it here:
                  </li>
                </ol>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void saveClientId();
                  }}
                  className="flex gap-2"
                >
                  <input
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    placeholder="Client ID (32 characters)"
                    aria-label="Spotify Client ID"
                    className="h-10 flex-1 rounded-full bg-black/40 px-4 font-mono text-sm text-ink placeholder:text-mute focus:outline-none focus:ring-2 focus:ring-find"
                  />
                  <button className="rounded-full bg-find px-5 font-bold text-black">Save</button>
                </form>
                <p className="text-xs text-mute">
                  Spotify only runs personal developer apps for accounts with Premium. No client secret is needed — your login stays on this Mac.
                </p>
              </div>
            )}

            {phase === "connect" && (
              <div className="mt-4 space-y-4 text-sm text-sub">
                <p>Connect your Spotify account. Your browser opens Spotify’s page to approve saving playlists — then come back here.</p>
                <label className="flex items-center gap-2 text-ink">
                  <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} className="accent-[var(--color-find)]" />
                  Make the playlist public on my profile
                </label>
                <button onClick={connect} className="flex items-center gap-2 rounded-full bg-find px-5 py-2.5 font-bold text-black transition-transform hover:scale-105">
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
                <p className="flex items-center gap-2 text-base font-semibold text-ink">
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
                  className="inline-flex items-center gap-2 rounded-full bg-find px-5 py-2.5 font-bold text-black transition-transform hover:scale-105"
                >
                  <SpotifyGlyph className="size-4" /> Open in Spotify
                </a>
              </div>
            )}

            {phase === "error" && (
              <div className="mt-4 space-y-3 text-sm">
                <p className="text-danger">{error}</p>
                <button onClick={() => void doExport()} className="rounded-full bg-find px-5 py-2 font-bold text-black">
                  Try again
                </button>
              </div>
            )}

            {error && phase === "setup" && <p className="mt-3 text-sm text-danger">{error}</p>}

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
