"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import type { SpotifyStatus } from "@/app/api/spotify/status/route";

export async function fetchStatus(): Promise<SpotifyStatus> {
  return fetch("/api/spotify/status", { cache: "no-store" }).then((r) => r.json());
}

/**
 * Open Spotify's login in the browser (the Mac app hands it to your default browser), then poll until it lands.
 * Stops early with onFailed when the browser login failed (e.g. not approved by the app's owner yet).
 */
export function startSpotifyLogin(
  returnTo: string,
  onConnected: (s: SpotifyStatus) => void,
  onTimeout: () => void,
  onFailed?: (e: NonNullable<SpotifyStatus["loginError"]>) => void,
) {
  window.open(`/api/spotify/login?return=${encodeURIComponent(returnTo)}`, "_blank");
  const started = Date.now();
  const timer = setInterval(async () => {
    const s = await fetchStatus().catch(() => null);
    // A reconnect replaces an existing login, so wait for one that has the new scope.
    if (s?.connected && s.canImport) {
      clearInterval(timer);
      onConnected(s);
    } else if (s?.loginError && onFailed && Date.now() - started > 1500) {
      clearInterval(timer);
      onFailed(s.loginError);
    } else if (Date.now() - started > 5 * 60_000) {
      clearInterval(timer);
      onTimeout();
    }
  }, 1500);
  return () => clearInterval(timer);
}

/** One-time setup: create a Spotify developer app and paste its Client ID. */
export function SpotifySetupSteps({ status, purpose, onSaved }: { status: SpotifyStatus; purpose: string; onSaved: () => void | Promise<void> }) {
  const [clientId, setClientId] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    const res = await fetch("/api/spotify/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId }),
    });
    const j = await res.json();
    if (!res.ok) return setError(j.error ?? "Couldn't save the Client ID");
    await onSaved();
  };

  const copyUri = async () => {
    try {
      await navigator.clipboard.writeText(status.redirectUri);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <div className="mt-4 space-y-3 text-sm text-sub">
      <p>One-time setup (about 3 minutes). Spotify lets personal apps {purpose} once you register one.</p>
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
          void save();
        }}
        className="flex gap-2"
      >
        <input
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          placeholder="Client ID (32 characters)"
          aria-label="Spotify Client ID"
          className="input flex-1 font-mono"
        />
        <button className="btn btn-primary">Save</button>
      </form>
      {error && <p className="text-sm text-danger">{error}</p>}
      <p className="text-xs text-mute">
        Spotify only runs personal developer apps for accounts with Premium. No client secret is needed — your login stays on this Mac.
      </p>
    </div>
  );
}
