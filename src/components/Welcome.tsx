"use client";

import { ArrowRight, Check, ExternalLink, Loader2 } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { SpotifyStatus } from "@/app/api/spotify/status/route";
import { useKeyStatus } from "@/lib/client/data";
import { imported } from "@/lib/taste/imported";
import { LogoMark } from "./Logo";
import { SpotifyGlyph } from "./icons";
import { fetchStatus, SpotifySetupSteps, startSpotifyLogin } from "./SpotifySetup";

// First launch: a short guided setup, shown until it's finished or skipped once.
//   1. Last.fm key: only when the app has none (a copy shared by a friend has theirs built in).
//   2. Log in with Spotify: one click with a shared copy (the sharer's Spotify app); otherwise the
//      one-time developer-app setup first.
//   3. Your Spotify taste is imported automatically, so recommendations fit you right away.

const DONE_KEY = "spotifind:onboarded";
const noop = () => () => {};
function readDone() {
  try {
    return localStorage.getItem(DONE_KEY) === "1" || sessionStorage.getItem("spotifind:skipSetup") === "1";
  } catch {
    return false;
  }
}

type Step = "key" | "spotify" | "setup" | "waiting" | "importing" | "done";

export function Welcome() {
  const keys = useKeyStatus();
  const doneStored = useSyncExternalStore(noop, readDone, () => true);
  const [closed, setClosed] = useState(false);
  const [sp, setSp] = useState<SpotifyStatus | null>(null);
  const [stepChoice, setStep] = useState<Step | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const stopPoll = useRef<(() => void) | null>(null);

  useEffect(() => {
    let alive = true;
    fetchStatus()
      .then((s) => alive && setSp(s))
      .catch(() => {});
    return () => {
      alive = false;
      stopPoll.current?.();
    };
  }, []);

  if (doneStored || closed || !keys || !sp) return null;
  // Already set up (e.g. the person who built it): nothing to do.
  if (!stepChoice && keys.lastfm && sp.connected) return null;

  const step: Step = stepChoice ?? (keys.lastfm ? "spotify" : "key");
  const who = sp.sharedBy ?? "the person who sent you Spotifind";

  const finish = () => {
    try {
      localStorage.setItem(DONE_KEY, "1");
    } catch {}
    stopPoll.current?.();
    setClosed(true);
    window.location.reload();
  };

  const runImport = async () => {
    setStep("importing");
    try {
      const d = await imported.run();
      const artists = d.items.filter((x) => x.kind === "artist").length;
      setSummary(`Imported ${artists} artists and ${d.items.length - artists} songs you listen to.`);
    } catch (e) {
      setSummary(`Connected — but the taste import didn't work: ${(e as Error).message} You can try again later on My ratings.`);
    }
    setStep("done");
  };

  const login = () => {
    setError(null);
    setStep("waiting");
    stopPoll.current?.();
    stopPoll.current = startSpotifyLogin(
      "/",
      (s) => {
        setSp(s);
        void runImport();
      },
      () => {
        setStep("spotify");
        setError("No login arrived. If your browser showed an error, follow what it says, then try again.");
      },
    );
  };

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-base" role="dialog" aria-modal="true" aria-label="Welcome to Spotifind">
      <div className="mx-auto flex min-h-full max-w-lg flex-col justify-center px-6 py-12">
        <LogoMark size={36} id="sf-g-welcome" />
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">Welcome to Spotifind</h1>
        <p className="mt-1 text-sub">Find new music based on what you already like.</p>

        {step === "key" && <LastfmStep onSaved={() => setStep("spotify")} />}

        {(step === "spotify" || step === "setup") && (
          <div className="panel mt-8 p-5">
            <h2 className="text-[16px] font-semibold">Log in with Spotify</h2>
            <p className="mt-1 text-sm text-sub">
              Spotifind reads what you listen to so its recommendations fit you, and saves the playlists you make to your Spotify.
            </p>
            {!sp.configured || step === "setup" ? (
              <SpotifySetupSteps
                status={sp}
                purpose="connect your account"
                onSaved={async () => {
                  setSp(await fetchStatus());
                  setStep("spotify");
                }}
              />
            ) : (
              <>
                {sp.shared && (
                  <p className="mt-3 rounded-md border border-line bg-base p-3 text-[13px] text-sub">
                    Spotify only lets {who} share Spotifind with people they’ve added. If you haven’t yet, send {who} the email address of your
                    Spotify account.
                  </p>
                )}
                <button onClick={login} className="btn btn-primary btn-lg mt-4">
                  <SpotifyGlyph className="size-4" /> Log in with Spotify
                </button>
                <p className="mt-2 text-xs text-mute">Opens Spotify in your browser. Your login is stored only on this Mac.</p>
              </>
            )}
            {error && <p className="mt-3 text-sm text-danger">{error}</p>}
          </div>
        )}

        {step === "waiting" && (
          <div className="panel mt-8 p-5 text-sm text-sub">
            <p className="flex items-center gap-2 text-ink">
              <Loader2 className="size-4 animate-spin text-find" /> Waiting for you to approve Spotifind in your browser…
            </p>
            <p className="mt-2">Approve it there, then come back here.</p>
            <button
              onClick={() => {
                stopPoll.current?.();
                setStep("spotify");
              }}
              className="btn btn-ghost btn-sm mt-3"
            >
              Cancel
            </button>
          </div>
        )}

        {step === "importing" && (
          <div className="panel mt-8 p-5 text-sm text-sub">
            <p className="flex items-center gap-2 text-ink">
              <Check className="size-4 text-find" /> Connected as {sp.user?.display_name || sp.user?.id}
            </p>
            <p className="mt-2 flex items-center gap-2">
              <Loader2 className="size-4 animate-spin text-find" /> Learning your taste from your Spotify listening (up to a minute)…
            </p>
          </div>
        )}

        {step === "done" && (
          <div className="panel mt-8 p-5 text-sm text-sub">
            <p className="flex items-center gap-2 text-ink">
              <Check className="size-4 text-find" /> You’re all set
            </p>
            {summary && <p className="mt-2">{summary}</p>}
            <button onClick={finish} className="btn btn-primary btn-lg mt-5">
              <ArrowRight className="size-4" /> Start discovering
            </button>
          </div>
        )}

        {step !== "done" && step !== "importing" && (
          <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm">
            {step === "spotify" && sp.configured && (
              <button onClick={() => setStep("setup")} className="text-mute hover:text-sub">
                Use my own Spotify developer app
              </button>
            )}
            <button onClick={finish} className="text-mute hover:text-sub">
              {step === "key" ? "Skip — limited recommendations without Last.fm" : "Skip — use Spotifind without Spotify"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Only shown when the app has no Last.fm key built in (your own build without one). */
function LastfmStep({ onSaved }: { onSaved: () => void }) {
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  };
  return (
    <div className="panel mt-8 p-5">
      <h2 className="text-[16px] font-semibold">Add a free Last.fm API key</h2>
      <p className="mt-1 text-sm text-sub">Spotifind’s recommendations come from Last.fm’s listening data. A key is free and takes about two minutes.</p>
      <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-sub">
        <li>
          Open{" "}
          <a href="https://www.last.fm/api/account/create" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-ink underline underline-offset-2">
            last.fm/api/account/create <ExternalLink className="size-3" />
          </a>{" "}
          and log in (or sign up for free).
        </li>
        <li>
          Fill in <b className="text-ink">Application name</b> (e.g. “Spotifind”) and a short description, then submit.
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
        <button disabled={busy || !key.trim()} className="btn btn-primary btn-lg">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
          Continue
        </button>
      </form>
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
    </div>
  );
}
