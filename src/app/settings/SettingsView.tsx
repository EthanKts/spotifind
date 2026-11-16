"use client";

import { Check, Loader2, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import type { SettingsStatus } from "@/app/api/settings/route";
import type { SpotifyStatus } from "@/app/api/spotify/status/route";
import { PageHeader, SectionTitle } from "@/components/Cards";
import { fetchStatus } from "@/components/SpotifySetup";
import { SpotifyImport } from "@/components/SpotifyImport";
import { Coverage } from "./Coverage";

const SOURCE_LABEL = { own: "Your own key", "built-in": "Built in (shared by whoever sent you Spotifind)", missing: "Not set" } as const;

function KeyRow({
  name,
  title,
  hint,
  source,
  onSaved,
}: {
  name: "LASTFM_API_KEY" | "DISCOGS_TOKEN";
  title: string;
  hint: React.ReactNode;
  source: keyof typeof SOURCE_LABEL;
  onSaved: () => void;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const save = async (v: string) => {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, value: v }) });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg({ ok: false, text: j.error ?? "Couldn't save" });
    setValue("");
    setMsg({ ok: true, text: v ? "Saved" : "Removed" });
    onSaved();
  };
  return (
    <div className="panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">{title}</p>
        <span className={`text-xs ${source === "missing" ? "text-mute" : "text-find"}`}>{SOURCE_LABEL[source]}</span>
      </div>
      <p className="mt-1 text-xs text-sub">{hint}</p>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) void save(value);
        }}
      >
        <input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={source === "own" ? "Paste a new value to replace yours" : "Paste your own"}
          aria-label={title}
          autoComplete="off"
          spellCheck={false}
          className="input flex-1 font-mono placeholder:font-sans"
        />
        <button disabled={busy || !value.trim()} className="btn btn-primary">
          {busy ? <Loader2 className="size-4 animate-spin" /> : "Save"}
        </button>
        {source === "own" && (
          <button type="button" onClick={() => void save("")} className="btn btn-ghost" title="Remove your own value (the built-in one is used, if any)">
            Remove
          </button>
        )}
      </form>
      {msg && <p className={`mt-2 flex items-center gap-1.5 text-xs ${msg.ok ? "text-find" : "text-danger"}`}>{msg.ok && <Check className="size-3.5" />}{msg.text}</p>}
    </div>
  );
}

export function SettingsView() {
  const [status, setStatus] = useState<SettingsStatus | null>(null);
  const [sp, setSp] = useState<SpotifyStatus | null>(null);
  const load = () => {
    fetch("/api/settings", { cache: "no-store" })
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => {});
    fetchStatus().then(setSp).catch(() => {});
  };
  useEffect(load, []);

  return (
    <div>
      <PageHeader title="Settings" description="Your keys and connections, and how much Spotifind knows about your music." />

      <SectionTitle sub="Saved only on this Mac, in ~/Library/Application Support/Spotifind/config.env.">Keys</SectionTitle>
      <div className="grid gap-3 px-4 md:px-8 lg:grid-cols-2">
        {status ? (
          <>
            <KeyRow
              name="LASTFM_API_KEY"
              title="Last.fm API key"
              hint={<>Similar songs and artists, and listener tags. Free at last.fm/api/account/create.</>}
              source={status.keys.LASTFM_API_KEY}
              onSaved={load}
            />
            <KeyRow
              name="DISCOGS_TOKEN"
              title="Discogs token (optional)"
              hint={<>Precise genres and styles for albums. Free at discogs.com/settings/developers → Generate token.</>}
              source={status.keys.DISCOGS_TOKEN}
              onSaved={load}
            />
          </>
        ) : (
          <div className="panel h-32 animate-pulse" />
        )}
      </div>

      <SectionTitle>Spotify</SectionTitle>
      <div className="mx-4 grid gap-3 md:mx-8 lg:grid-cols-2">
        <div className="panel p-4 text-sm">
          {sp?.connected ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                Connected as <b className="font-medium">{sp.user?.display_name || sp.user?.id}</b>
                <span className="block text-xs text-mute">{sp.shared ? `Through ${sp.sharedBy ?? "the shared"} Spotify app` : "Through your own Spotify developer app"}</span>
              </span>
              <button
                onClick={async () => {
                  await fetch("/api/spotify/logout", { method: "POST" });
                  load();
                }}
                className="btn btn-ghost btn-sm"
              >
                <LogOut className="size-4" /> Disconnect
              </button>
            </div>
          ) : (
            <p className="text-sub">Not connected. Connect from the setup guide (Help → Setup Guide) or below.</p>
          )}
        </div>
        <div className="panel p-4">
          <SpotifyImport variant="compact" />
        </div>
      </div>

      <Coverage />
    </div>
  );
}
