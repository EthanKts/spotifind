"use client";

import Link from "next/link";
import { AlertTriangle, Check, Loader2, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { SpotifyStatus } from "@/app/api/spotify/status/route";
import { imported, useImported, type ImportError } from "@/lib/taste/imported";
import { SpotifyGlyph } from "./icons";
import { fetchStatus, SpotifySetupSteps, startSpotifyLogin } from "./SpotifySetup";

type Phase = "idle" | "setup" | "connect" | "reconnect" | "waiting" | "importing" | "done" | "error";

/**
 * "Import my taste from Spotify": reads your top artists and tracks (with your permission) so recommendations
 * work before you've rated anything. Handles the one-time Spotify setup, a reconnect for older logins
 * (they lack the user-top-read permission), and Spotify's Premium / app-owner rule.
 *
 * variant: "inline" (a card section, e.g. onboarding), "compact" (one line, e.g. after saving a playlist),
 * "panel" (My Ratings: shows re-import when something is already imported).
 */
export function SpotifyImport({ variant = "inline" }: { variant?: "inline" | "compact" | "panel" }) {
  const imp = useImported();
  const [status, setStatus] = useState<SpotifyStatus | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const stopPoll = useRef<(() => void) | null>(null);

  useEffect(() => {
    let alive = true;
    fetchStatus()
      .then((s) => alive && setStatus(s))
      .catch(() => {});
    return () => {
      alive = false;
      stopPoll.current?.();
    };
  }, []);

  const run = async () => {
    setPhase("importing");
    setError(null);
    try {
      await imported.run();
      setPhase("done");
    } catch (e) {
      const err = e as Error & ImportError;
      setError(err.message);
      if (err.code === "login") setPhase("connect");
      else if (err.code === "reconnect") setPhase("reconnect");
      else setPhase("error");
    }
  };

  const start = async () => {
    setError(null);
    const s = (await fetchStatus().catch(() => null)) ?? status;
    if (s) setStatus(s);
    if (!s?.configured) setPhase("setup");
    else if (!s.connected) setPhase("connect");
    else if (!s.canImport) setPhase("reconnect");
    else void run();
  };

  const connect = () => {
    setPhase("waiting");
    stopPoll.current?.();
    stopPoll.current = startSpotifyLogin(
      "/ratings?tab=spotify",
      (s) => {
        setStatus(s);
        void run();
      },
      () => setPhase(status?.connected ? "reconnect" : "connect"),
    );
  };

  const count = imp.items.length;
  const artists = imp.items.filter((x) => x.kind === "artist").length;
  const busy = phase === "importing" || phase === "waiting";
  const label = count ? "Re-import from Spotify" : "Import my taste from Spotify";

  const button = (
    <button
      onClick={start}
      disabled={busy}
      className={
        variant === "compact" || (variant === "panel" && count)
          ? "btn btn-secondary"
          : "btn btn-primary"
      }
    >
      {busy ? <Loader2 className="size-4 animate-spin" /> : count ? <RefreshCw className="size-4" /> : <SpotifyGlyph className="size-4" />}
      {label}
    </button>
  );

  return (
    <div className="text-sm">
      {variant === "inline" && (
        <>
          <p className="font-medium text-ink">Import from Spotify</p>
          <p className="mt-0.5 max-w-2xl text-sub">
            Use your Spotify top artists and songs as a starting point. They count less than your own ratings and can be removed any time.
          </p>
          <div className="mt-3">{button}</div>
        </>
      )}
      {variant === "compact" && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sub">{count ? `${count} favourites imported from Spotify.` : "Let your Spotify listening teach Spotifind your taste."}</span>
          {button}
        </div>
      )}
      {variant === "panel" && button}

      {phase === "setup" && status && (
        <div className="mt-3 rounded-md border border-line bg-base p-4">
          <SpotifySetupSteps
            status={status}
            purpose="read your top artists and songs"
            onSaved={async () => {
              setStatus(await fetchStatus());
              setPhase("connect");
            }}
          />
        </div>
      )}

      {(phase === "connect" || phase === "reconnect") && (
        <div className="mt-3 space-y-3 rounded-md border border-line bg-base p-4 text-sub">
          <p>
            {phase === "reconnect"
              ? "Your Spotify login is from before taste import existed. Reconnect once so Spotifind may read your top artists and songs — your browser opens Spotify’s approval page."
              : "Connect your Spotify account. Your browser opens Spotify’s page to approve reading your top artists and songs — then come back here."}
          </p>
          <button onClick={connect} className="btn btn-primary">
            <SpotifyGlyph className="size-4" /> {phase === "reconnect" ? "Reconnect Spotify" : "Connect Spotify"}
          </button>
        </div>
      )}

      {phase === "waiting" && (
        <p className="mt-3 flex items-center gap-2 text-sub">
          <Loader2 className="size-4 animate-spin text-find" /> Waiting for you to approve Spotifind in your browser…
        </p>
      )}
      {phase === "importing" && (
        <p className="mt-3 flex items-center gap-2 text-sub">
          <Loader2 className="size-4 animate-spin text-find" /> Reading your top artists and songs, then matching them to Last.fm tags (up to a minute the first time)…
        </p>
      )}
      {phase === "done" && (
        <p className="mt-3 flex flex-wrap items-center gap-2 text-sub">
          <Check className="size-4 text-find" />
          <span>
            Imported <b className="text-ink">{artists} artists</b> and <b className="text-ink">{count - artists} songs</b> from Spotify.
          </span>
          {variant !== "panel" && (
            <Link href="/ratings?tab=spotify" className="text-ink underline underline-offset-2">
              Review on My Ratings
            </Link>
          )}
        </p>
      )}
      {phase === "error" && error && (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-danger/30 bg-danger/10 p-3 text-danger">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div>
            <p>{error}</p>
            <button onClick={() => void run()} className="mt-2 text-xs font-bold text-ink hover:underline">
              Try again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
