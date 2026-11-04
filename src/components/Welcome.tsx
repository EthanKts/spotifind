"use client";

import { ArrowRight, ExternalLink, Loader2 } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { useKeyStatus } from "@/lib/client/data";
import { LogoMark } from "./Logo";

const SKIP_KEY = "spotifind:skipSetup";
const noop = () => () => {};
function readSkip() {
  try {
    return sessionStorage.getItem(SKIP_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * First-launch screen: shown until a Last.fm API key is set up. Each person uses their own free key,
 * so a copy of Spotifind shared with friends works without anyone else's credentials.
 */
export function Welcome() {
  const status = useKeyStatus();
  const skippedStored = useSyncExternalStore(noop, readSkip, () => false);
  const [skipped, setSkipped] = useState(false);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!status || status.lastfm || skipped || skippedStored) return null;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/setup/lastfm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Couldn't save the key");
      window.location.reload();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-black" role="dialog" aria-modal="true" aria-label="Welcome to Spotifind">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_60%_at_20%_0%,rgb(30_215_96/0.18),transparent_60%)]" />
      <div className="relative mx-auto flex min-h-full max-w-xl flex-col justify-center px-6 py-12">
        <LogoMark size={64} id="sf-g-welcome" />
        <h1 className="mt-6 text-4xl font-extrabold tracking-tight">Welcome to Spotifind</h1>
        <p className="mt-2 text-lg text-sub">Spotify is where you listen. Spotifind is where you discover music you’ll love.</p>

        <div className="mt-8 rounded-2xl bg-elev p-6">
          <h2 className="text-lg font-bold">One step first: your free Last.fm API key</h2>
          <p className="mt-1 text-sm text-sub">
            Spotifind’s recommendations come from Last.fm’s listening data. A key is free and takes about two minutes.
          </p>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-sub">
            <li>
              Open{" "}
              <a href="https://www.last.fm/api/account/create" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-find hover:underline">
                last.fm/api/account/create <ExternalLink className="size-3" />
              </a>{" "}
              and log in (or sign up for a free Last.fm account).
            </li>
            <li>
              Fill in <b className="text-ink">Application name</b> (e.g. “Spotifind”) and a short description. Leave the callback URL empty, then submit.
            </li>
            <li>
              Copy the <b className="text-ink">API key</b> (not the “Shared secret”) and paste it below.
            </li>
          </ol>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
            className="mt-5 flex flex-col gap-2 sm:flex-row"
          >
            <input
              value={key}
              onChange={(e) => setKey(e.target.value)}
              autoFocus
              placeholder="Your Last.fm API key"
              aria-label="Last.fm API key"
              spellCheck={false}
              className="h-12 flex-1 rounded-full bg-black/50 px-5 font-mono text-sm text-ink placeholder:font-sans placeholder:text-mute focus:outline-none focus:ring-2 focus:ring-find"
            />
            <button
              disabled={busy || !key.trim()}
              className="flex h-12 items-center justify-center gap-2 rounded-full bg-find px-6 font-bold text-black transition-transform hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
            >
              {busy ? <Loader2 className="size-5 animate-spin" /> : <ArrowRight className="size-5" />}
              Start discovering
            </button>
          </form>
          {error && <p className="mt-3 text-sm text-danger">{error}</p>}
          <p className="mt-4 text-xs text-mute">
            The key is saved only on this Mac. Want to save playlists straight to Spotify? You’ll be guided through that the first time you press
            “Save to Spotify” on a playlist.
          </p>
        </div>

        <button
          onClick={() => {
            try {
              sessionStorage.setItem(SKIP_KEY, "1");
            } catch {}
            setSkipped(true);
          }}
          className="mt-6 self-start text-sm text-mute hover:text-sub"
        >
          Skip for now — limited recommendations without similarity scores
        </button>
      </div>
    </div>
  );
}
