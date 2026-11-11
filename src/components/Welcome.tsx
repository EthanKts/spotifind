"use client";

import { ArrowRight, ExternalLink, Loader2 } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { useKeyStatus } from "@/lib/client/data";
import { LogoMark } from "./Logo";
import { SpotifyImport } from "./SpotifyImport";

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
  const [keySaved, setKeySaved] = useState(false);

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
      setKeySaved(true); // step 2 (optional): import your taste from Spotify
      setBusy(false);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-black" role="dialog" aria-modal="true" aria-label="Welcome to Spotifind">
      
      <div className="relative mx-auto flex min-h-full max-w-xl flex-col justify-center px-6 py-12">
        <LogoMark size={40} id="sf-g-welcome" />
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">Welcome to Spotifind</h1>
        <p className="mt-1 text-sub">Find new music based on what you already like.</p>

        {keySaved ? (
          <div className="panel mt-8 p-5">
            <p className="text-xs text-mute">Step 2 of 2 · optional</p>
            <h2 className="mt-1 text-base font-semibold">Start with your Spotify taste</h2>
            <p className="mt-1 text-sm text-sub">
              Skip the cold start: import your top artists and songs from Spotify so recommendations fit you from the first click. You can also do this
              later on My Ratings.
            </p>
            <div className="mt-4">
              <SpotifyImport variant="panel" />
            </div>
            <button
              onClick={() => window.location.reload()}
              className="btn btn-primary btn-lg mt-6"
            >
              <ArrowRight className="size-4" /> Start discovering
            </button>
          </div>
        ) : (
        <div className="panel mt-8 p-5">
          <p className="text-xs text-mute">Step 1 of 2</p>
          <h2 className="mt-1 text-base font-semibold">Add a free Last.fm API key</h2>
          <p className="mt-1 text-sm text-sub">
            Spotifind’s recommendations come from Last.fm’s listening data. A key is free and takes about two minutes.
          </p>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-sub">
            <li>
              Open{" "}
              <a href="https://www.last.fm/api/account/create" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-ink underline underline-offset-2">
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
              className="input h-10 flex-1 font-mono placeholder:font-sans"
            />
            <button
              disabled={busy || !key.trim()}
              className="btn btn-primary btn-lg"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
              Start discovering
            </button>
          </form>
          {error && <p className="mt-3 text-sm text-danger">{error}</p>}
          <p className="mt-4 text-xs text-mute">
            The key is saved only on this Mac. Next you can import your taste from Spotify (optional).
          </p>
        </div>
        )}

        {!keySaved && <button
          onClick={() => {
            try {
              sessionStorage.setItem(SKIP_KEY, "1");
            } catch {}
            setSkipped(true);
          }}
          className="mt-6 self-start text-sm text-mute hover:text-sub"
        >
          Skip for now — limited recommendations without similarity scores
        </button>}
      </div>
    </div>
  );
}
