"use client";

import { ArrowLeft, ArrowRight, Check, Copy, Compass, ExternalLink, ListMusic, Loader2, Star, Zap } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { SpotifyStatus } from "@/app/api/spotify/status/route";
import { useEnriched, useKeyStatus } from "@/lib/client/data";
import { imported, useImported } from "@/lib/taste/imported";
import { artistItem } from "./Actions";
import { Artwork } from "./Artwork";
import { LogoMark } from "./Logo";
import { SpotifyGlyph } from "./icons";
import { fetchStatus, SpotifySetupSteps, startSpotifyLogin } from "./SpotifySetup";

// First-launch setup wizard. Steps (some only when needed):
//   welcome → access (shared copy: ask the owner to add you) → lastfm (no key built in) → spotify → taste → tour
// Progress is remembered, so quitting mid-setup resumes at the same step. Help → Setup Guide… (/?setup=1)
// opens it again later.

const DONE_KEY = "spotifind:onboarded";
const STEP_KEY = "spotifind:onboarding-step";
const noop = () => () => {};

function read(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string | null) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {}
}
const readDone = () => read(DONE_KEY) === "1";
const readForced = () => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("setup") === "1";
const readSavedStep = () => read(STEP_KEY);

type StepId = "welcome" | "access" | "lastfm" | "spotify" | "taste" | "tour";

export function Welcome() {
  const keys = useKeyStatus();
  const done = useSyncExternalStore(noop, readDone, () => true);
  const forced = useSyncExternalStore(noop, readForced, () => false);
  const saved = useSyncExternalStore(noop, readSavedStep, () => null);
  const [sp, setSp] = useState<SpotifyStatus | null>(null);
  const [stepChoice, setStepChoice] = useState<StepId | null>(null);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchStatus()
      .then((s) => alive && setSp(s))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const steps = useMemo<StepId[]>(() => {
    if (!keys || !sp) return [];
    return [
      "welcome",
      ...(sp.shared && !sp.connected ? (["access"] as const) : []),
      ...(!keys.lastfm ? (["lastfm"] as const) : []),
      "spotify",
      "taste",
      "tour",
    ];
  }, [keys, sp]);

  if (closed || !keys || !sp || !steps.length) return null;
  // Already set up (e.g. the person who built it) and not asked for: nothing to do.
  if (!forced && (done || (keys.lastfm && sp.connected && !stepChoice && !saved))) return null;

  const step: StepId = stepChoice ?? (saved && steps.includes(saved as StepId) ? (saved as StepId) : "welcome");
  const index = steps.indexOf(step);
  const go = (s: StepId) => {
    write(STEP_KEY, s);
    setStepChoice(s);
  };
  const next = () => go(steps[Math.min(steps.length - 1, index + 1)]);
  const back = index > 0 ? () => go(steps[index - 1]) : undefined;
  const finish = (to = "/") => {
    write(DONE_KEY, "1");
    write(STEP_KEY, null);
    setClosed(true);
    window.location.href = to;
  };
  const who = sp.sharedBy ?? "the person who sent you Spotifind";

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-base" role="dialog" aria-modal="true" aria-label="Set up Spotifind">
      <div className="mx-auto flex min-h-full max-w-lg flex-col justify-center px-6 py-10">
        <div className="flex items-center justify-between">
          <LogoMark size={28} id="sf-g-welcome" />
          <p className="text-xs text-mute" aria-live="polite">
            Step {index + 1} of {steps.length}
          </p>
        </div>
        <div className="mt-3 flex gap-1" aria-hidden>
          {steps.map((s, i) => (
            <span key={s} className={`h-1 flex-1 rounded-full ${i <= index ? "bg-find" : "bg-hl"}`} />
          ))}
        </div>

        <div className="mt-8">
          {step === "welcome" && <WelcomeStep onNext={next} />}
          {step === "access" && <AccessStep who={who} onNext={next} />}
          {step === "lastfm" && <LastfmStep onNext={next} />}
          {step === "spotify" && <SpotifyStep sp={sp} setSp={setSp} who={who} onNext={next} />}
          {step === "taste" && <TasteStep sp={sp} onNext={next} />}
          {step === "tour" && <TourStep onFinish={finish} />}
        </div>

        <div className="mt-6 flex items-center justify-between text-sm">
          {back ? (
            <button onClick={back} className="btn btn-ghost btn-sm -ml-3">
              <ArrowLeft className="size-4" /> Back
            </button>
          ) : (
            <span />
          )}
          {step !== "tour" && (
            <button onClick={() => finish()} className="text-mute hover:text-sub">
              Skip setup
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ steps

function StepTitle({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {children && <p className="mt-1.5 text-sub">{children}</p>}
    </>
  );
}

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <>
      <StepTitle title="Welcome to Spotifind">
        Find new music based on what you already like: songs with the same groove or mood, hidden gems, and playlists you can save to Spotify.
      </StepTitle>
      <ul className="mt-5 space-y-2 text-sm text-sub">
        <li className="flex gap-2">
          <Check className="mt-0.5 size-4 shrink-0 text-find" /> Setup takes about a minute.
        </li>
        <li className="flex gap-2">
          <Check className="mt-0.5 size-4 shrink-0 text-find" /> You only need your Spotify account. Premium isn’t required.
        </li>
        <li className="flex gap-2">
          <Check className="mt-0.5 size-4 shrink-0 text-find" /> Everything stays on this Mac.
        </li>
      </ul>
      <button onClick={onNext} className="btn btn-primary btn-lg mt-6">
        Get started <ArrowRight className="size-4" />
      </button>
    </>
  );
}

function CopyMessage({ who }: { who: string }) {
  const [email, setEmail] = useState("");
  const [copied, setCopied] = useState(false);
  const name = who.split(" ")[0];
  const message = `Hi ${name}! Can you add me to Spotifind? My Spotify email is ${email.trim() || "…"}`;
  return (
    <div className="mt-4 rounded-md border border-line bg-elev p-4">
      <label className="label" htmlFor="sf-email">
        Your Spotify account’s email
      </label>
      <input
        id="sf-email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        className="input mt-1.5 w-full"
      />
      <p className="mt-3 rounded-md bg-base px-3 py-2 text-[13px] text-sub">{message}</p>
      <button
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(message);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {}
        }}
        disabled={!email.includes("@")}
        className="btn btn-secondary btn-sm mt-3"
      >
        {copied ? <Check className="size-4 text-find" /> : <Copy className="size-4" />}
        {copied ? `Copied — paste it in a message to ${name}` : "Copy message"}
      </button>
      <p className="mt-2 text-xs text-mute">Find your email in the Spotify app: your profile picture → Settings → Account.</p>
    </div>
  );
}

function AccessStep({ who, onNext }: { who: string; onNext: () => void }) {
  const [added, setAdded] = useState(false);
  return (
    <>
      <StepTitle title={`Ask ${who} to add you`}>
        Spotify only lets {who} share Spotifind with people they’ve added (up to 5). Send them the email of your Spotify account.
      </StepTitle>
      <CopyMessage who={who} />
      <label className="mt-4 flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" checked={added} onChange={(e) => setAdded(e.target.checked)} className="size-4 accent-[var(--color-find)]" />
        {who} has added me
      </label>
      <button onClick={onNext} className="btn btn-primary btn-lg mt-5">
        {added ? "Continue" : "Continue anyway"} <ArrowRight className="size-4" />
      </button>
      {!added && <p className="mt-2 text-xs text-mute">You can try logging in now. If you’re not added yet, Spotifind tells you.</p>}
    </>
  );
}

function SpotifyStep({
  sp,
  setSp,
  who,
  onNext,
}: {
  sp: SpotifyStatus;
  setSp: (s: SpotifyStatus) => void;
  who: string;
  onNext: () => void;
}) {
  const [phase, setPhase] = useState<"idle" | "waiting" | "setup">(sp.configured ? "idle" : "setup");
  const [failure, setFailure] = useState<{ message: string; notApproved: boolean } | null>(null);
  const stop = useRef<(() => void) | null>(null);
  useEffect(() => () => stop.current?.(), []);

  const login = () => {
    setFailure(null);
    setPhase("waiting");
    stop.current?.();
    stop.current = startSpotifyLogin(
      "/",
      (s) => {
        setSp(s);
        setPhase("idle");
        onNext();
      },
      () => {
        setPhase("idle");
        setFailure({ message: "No login arrived. Try again, and approve Spotifind in the browser window that opens.", notApproved: false });
      },
      (e) => {
        setPhase("idle");
        setFailure(e);
      },
    );
  };

  if (sp.connected) {
    return (
      <>
        <StepTitle title="Spotify is connected" />
        <p className="mt-3 flex items-center gap-2 text-sm text-ink">
          <Check className="size-4 text-find" /> Logged in as {sp.user?.display_name || sp.user?.id}
        </p>
        <button onClick={onNext} className="btn btn-primary btn-lg mt-6">
          Continue <ArrowRight className="size-4" />
        </button>
      </>
    );
  }

  if (phase === "setup") {
    return (
      <>
        <StepTitle title="Connect your Spotify developer app" />
        <SpotifySetupSteps
          status={sp}
          purpose="connect your account"
          onSaved={async () => {
            setSp(await fetchStatus());
            setPhase("idle");
          }}
        />
      </>
    );
  }

  return (
    <>
      <StepTitle title="Log in with Spotify">
        Spotifind reads what you listen to so its suggestions fit you, and saves the playlists you make to your Spotify.
      </StepTitle>
      <ol className="mt-5 space-y-2 text-sm text-sub">
        <li>
          <b className="text-ink">1.</b> Click the button: your browser opens Spotify.
        </li>
        <li>
          <b className="text-ink">2.</b> Log in if asked, then click <b className="text-ink">Agree</b>.
        </li>
        <li>
          <b className="text-ink">3.</b> Come back here: Spotifind continues by itself.
        </li>
      </ol>

      {phase === "waiting" ? (
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <p className="flex items-center gap-2 text-sm text-ink">
            <Loader2 className="size-4 animate-spin text-find" /> Waiting for you to click Agree in your browser…
          </p>
          <button
            onClick={() => {
              stop.current?.();
              setPhase("idle");
            }}
            className="btn btn-ghost btn-sm"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button onClick={login} className="btn btn-primary btn-lg mt-6">
          <SpotifyGlyph className="size-4" /> {failure ? "Try again" : "Log in with Spotify"}
        </button>
      )}

      {failure && (
        <div className="mt-5 rounded-md border border-danger/30 bg-danger/10 p-4 text-sm">
          {failure.notApproved ? (
            <>
              <p className="font-medium text-ink">{who} hasn’t added you yet</p>
              <p className="mt-1 text-sub">Send them your Spotify email. Once they’ve added you, click Try again.</p>
              <CopyMessage who={who} />
            </>
          ) : (
            <p className="text-danger">{failure.message}</p>
          )}
        </div>
      )}

      {phase !== "waiting" && (
        <button onClick={() => setPhase("setup")} className="mt-5 block text-xs text-mute hover:text-sub">
          Use my own Spotify developer app instead
        </button>
      )}
    </>
  );
}

function TasteStep({ sp, onNext }: { sp: SpotifyStatus; onNext: () => void }) {
  const imp = useImported();
  const [state, setState] = useState<"running" | "done" | "failed">("running");
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current || !sp.connected) return;
    started.current = true;
    // Already imported (e.g. reopening the guide): reuse it instead of asking Spotify again.
    fetch("/api/spotify/import", { cache: "no-store" })
      .then((r) => r.json() as Promise<{ items?: unknown[] }>)
      .catch(() => ({ items: [] }))
      .then((j) => (j.items?.length ? undefined : imported.run().then(() => undefined)))
      .then(() => setState("done"))
      .catch((e: Error) => {
        setError(e.message);
        setState("failed");
      });
  }, [sp.connected]);

  const artists = useMemo(() => imp.items.filter((x) => x.kind === "artist"), [imp.items]);
  const top = useMemo(() => artists.slice(0, 3), [artists]);
  const pics = useEnriched(useMemo(() => top.map((a) => artistItem(a.artist)), [top]));

  if (!sp.connected) {
    return (
      <>
        <StepTitle title="Learning your taste">Connect Spotify first, or skip this step and rate a few artists instead.</StepTitle>
        <button onClick={onNext} className="btn btn-primary btn-lg mt-6">
          Continue <ArrowRight className="size-4" />
        </button>
      </>
    );
  }

  return (
    <>
      <StepTitle title="Learning your taste">Spotifind looks at the artists and songs you play most on Spotify.</StepTitle>
      {state === "running" && (
        <p className="mt-6 flex items-center gap-2 text-sm text-ink">
          <Loader2 className="size-4 animate-spin text-find" /> Reading your listening… this can take up to a minute.
        </p>
      )}
      {state === "done" && (
        <>
          <p className="mt-6 flex items-center gap-2 text-sm text-ink">
            <Check className="size-4 text-find" /> Found {artists.length} artists and {imp.items.length - artists.length} songs you love.
          </p>
          {top.length > 0 && (
            <div className="mt-4 flex gap-4">
              {top.map((a, i) => (
                <div key={a.key} className="w-20 text-center">
                  <Artwork src={pics[i]?.image ?? a.image} alt={a.artist} kind="artist" className="size-20" />
                  <p className="mt-1.5 truncate text-xs text-sub">{a.artist}</p>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {state === "failed" && (
        <p className="mt-6 rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
          Couldn’t read your listening: {error} You can try again later on My ratings → From Spotify.
        </p>
      )}
      <button onClick={onNext} disabled={state === "running"} className="btn btn-primary btn-lg mt-6">
        Continue <ArrowRight className="size-4" />
      </button>
    </>
  );
}

const TOUR = [
  { icon: Zap, title: "Rapid-fire", key: "⌘7", text: "Songs one at a time with a preview. Press 1–5 to rate; every rating sharpens what comes next." },
  { icon: Compass, title: "Discover", key: "⌘3", text: "Pick any song, album or artist and find music that sounds like it." },
  { icon: ListMusic, title: "Playlists", key: "⌘4", text: "Build a playlist in the style you want and save it to your Spotify." },
  { icon: Star, title: "My ratings", key: "⌘6", text: "Everything you rated and what Spotifind learned about your taste." },
];

function TourStep({ onFinish }: { onFinish: (to?: string) => void }) {
  return (
    <>
      <StepTitle title="You’re all set">Here’s where things are. Everything is also in the sidebar on the left.</StepTitle>
      <ul className="mt-5 grid gap-2">
        {TOUR.map(({ icon: Icon, title, key, text }) => (
          <li key={title} className="flex gap-3 rounded-md border border-line bg-elev p-3">
            <Icon className="mt-0.5 size-4 shrink-0 text-find" />
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {title} <span className="ml-1 text-xs font-normal text-mute">{key}</span>
              </p>
              <p className="text-[13px] text-sub">{text}</p>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-6 flex flex-wrap gap-2">
        <button onClick={() => onFinish("/rapid")} className="btn btn-primary btn-lg">
          <Zap className="size-4" /> Start with Rapid-fire
        </button>
        <button onClick={() => onFinish("/")} className="btn btn-secondary btn-lg">
          Go to Home
        </button>
      </div>
      <p className="mt-3 text-xs text-mute">You can open this guide again from the Help menu.</p>
    </>
  );
}

// ------------------------------------------------------------------ Last.fm (only when no key is built in)

function LastfmStep({ onNext }: { onNext: () => void }) {
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
      onNext();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  };
  return (
    <>
      <StepTitle title="Add a free Last.fm API key">
        Spotifind’s recommendations come from Last.fm’s listening data. A key is free and takes about two minutes.
      </StepTitle>
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
    </>
  );
}
