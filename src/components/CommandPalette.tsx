"use client";

// ⌘K command palette (jump to any page, start a mode, search artists/songs) and the "?" keyboard-shortcut sheet.

import { useRouter } from "next/navigation";
import { CornerDownLeft, Download, Keyboard, ListMusic, Search, Zap } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Item } from "@/lib/types";
import type { SearchResponse } from "@/app/api/search/route";
import { hrefFor } from "@/lib/util";
import { Artwork } from "./Artwork";
import { NAV_GROUPS, SETTINGS_NAV } from "./Sidebar";

type Entry = { id: string; label: string; hint?: string; icon?: typeof Search; item?: Item; run: () => void };

const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
};

const SHORTCUTS: { group: string; keys: [string, string][] }[] = [
  {
    group: "Anywhere",
    keys: [
      ["⌘K", "Command palette: jump anywhere, search"],
      ["/", "Focus the search box"],
      ["?", "This list"],
      ["⌘1–⌘7", "Home, Search, Discover, Playlists, History, My ratings, Rapid-fire"],
      ["⌘,", "Settings"],
      ["⌘[ / ⌘]", "Back / forward"],
      ["⌘R", "Reload"],
    ],
  },
  {
    group: "Rapid-fire",
    keys: [
      ["1–5", "Rate and go to the next song"],
      ["→ or Space", "Skip"],
      ["←", "Back"],
      ["Esc", "Finish"],
    ],
  },
];

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [results, setResults] = useState<Item[]>([]);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setHelp(false);
        setOpen((o) => !o);
      } else if (e.key === "?" && !isTyping(e.target)) {
        e.preventDefault();
        setOpen(false);
        setHelp((h) => !h);
      } else if (e.key === "Escape") {
        setOpen(false);
        setHelp(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Debounced live search (artists, songs, albums).
  useEffect(() => {
    const term = q.trim();
    if (!open || term.length < 2) return;
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: ctl.signal })
        .then((r) => r.json() as Promise<SearchResponse>)
        .then((d) => setResults([...(d.top ? [d.top] : []), ...d.artists.slice(0, 3), ...d.tracks.slice(0, 4), ...d.albums.slice(0, 2)].filter((it, i, a) => a.findIndex((x) => x.key === it.key) === i).slice(0, 7)))
        .catch(() => {});
    }, 250);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q, open]);

  const close = () => {
    setOpen(false);
    setQ("");
    setResults([]);
    setSel(0);
  };
  const go = (href: string) => {
    close();
    router.push(href);
  };

  const entries = useMemo<Entry[]>(() => {
    const term = q.trim().toLowerCase();
    const pages: Entry[] = [...NAV_GROUPS.flatMap((g) => g.items), SETTINGS_NAV].map((n) => ({
      id: n.href,
      label: n.label,
      hint: n.key || "Page",
      icon: n.icon,
      run: () => go(n.href),
    }));
    const actions: Entry[] = [
      { id: "a-rapid", label: "Start Rapid-fire from my taste", hint: "Mode", icon: Zap, run: () => go("/rapid") },
      { id: "a-playlist", label: "Make a playlist", hint: "Action", icon: ListMusic, run: () => go("/playlists") },
      { id: "a-import", label: "Import my taste from Spotify", hint: "Action", icon: Download, run: () => go("/ratings?tab=spotify") },
      { id: "a-help", label: "Keyboard shortcuts", hint: "?", icon: Keyboard, run: () => (close(), setHelp(true)) },
    ];
    const local = [...pages, ...actions].filter((e) => !term || e.label.toLowerCase().includes(term));
    const found: Entry[] = term.length >= 2
      ? [
          ...results.map((it) => ({
            id: `r-${it.key}`,
            label: it.title,
            hint: it.kind === "artist" ? "Artist" : `${it.kind === "track" ? "Song" : "Album"} · ${it.artist}`,
            item: it,
            run: () => go(hrefFor(it.kind, it.artist, it.title)),
          })),
          { id: "r-all", label: `Search for “${q.trim()}”`, hint: "All results", icon: Search, run: () => go(`/search?q=${encodeURIComponent(q.trim())}`) },
        ]
      : [];
    return [...local, ...found];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, results]);

  if (help) return <ShortcutSheet onClose={() => setHelp(false)} />;
  if (!open) return null;
  const active = Math.min(sel, Math.max(0, entries.length - 1));

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center bg-black/60 px-4 pt-[12vh]" onMouseDown={close} role="dialog" aria-modal="true" aria-label="Command palette">
      <div className="panel w-full max-w-xl overflow-hidden shadow-xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-line px-3">
          <Search className="size-4 text-mute" aria-hidden />
          <input
            ref={input}
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setSel(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSel((s) => Math.min(entries.length - 1, s + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSel((s) => Math.max(0, s - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                entries[active]?.run();
              }
            }}
            placeholder="Go to a page, start a mode, or search an artist or song…"
            aria-label="Command"
            className="h-12 flex-1 bg-transparent text-sm text-ink placeholder:text-mute focus:outline-none"
          />
          <kbd className="rounded border border-line px-1 text-[10px] text-mute">esc</kbd>
        </div>
        <ul className="max-h-[50vh] overflow-y-auto p-1.5" role="listbox" aria-label="Results">
          {entries.length === 0 && <li className="px-3 py-6 text-center text-sm text-mute">{q.trim().length >= 2 ? "Searching…" : "No matches"}</li>}
          {entries.map((e, i) => {
            const Icon = e.icon;
            return (
              <li key={e.id} role="option" aria-selected={i === active}>
                <button
                  onMouseEnter={() => setSel(i)}
                  onClick={e.run}
                  className={`flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left text-sm ${i === active ? "bg-hl text-ink" : "text-sub"}`}
                >
                  {e.item ? <Artwork src={e.item.image} alt={e.item.title} kind={e.item.kind} className="size-7 shrink-0" /> : Icon ? <Icon className="size-4 shrink-0" aria-hidden /> : null}
                  <span className="min-w-0 flex-1 truncate">{e.label}</span>
                  <span className="shrink-0 text-xs text-mute">{e.hint}</span>
                  {i === active && <CornerDownLeft className="size-3.5 shrink-0 text-mute" aria-hidden />}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function ShortcutSheet({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 px-4" onMouseDown={onClose} role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
      <div className="panel w-full max-w-lg p-5 shadow-xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Keyboard shortcuts</h2>
          <button onClick={onClose} className="btn btn-ghost btn-sm" autoFocus>
            Close
          </button>
        </div>
        {SHORTCUTS.map((g) => (
          <div key={g.group} className="mt-4">
            <p className="label">{g.group}</p>
            <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              {g.keys.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt>
                    <kbd className="rounded border border-line bg-elev px-1.5 py-0.5 text-xs text-ink">{k}</kbd>
                  </dt>
                  <dd className="text-sub">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </div>
  );
}
