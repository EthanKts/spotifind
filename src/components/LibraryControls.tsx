"use client";

// Library-style controls (like Spotify's "Your Library"): filter chips, search, sort and view.

import { AlignJustify, LayoutGrid, List, Search, X } from "lucide-react";
import { useState } from "react";

export function FilterChips<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { id: T; label: string; count?: number }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} role="radio" aria-checked={value === o.id} onClick={() => onChange(o.id)} className="option rounded-full px-3 py-1 text-[13px]">
          {o.label}
          {o.count != null && <span className="ml-1.5 tabular-nums text-mute">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** A search icon that opens into a field, like Spotify's library search. */
export function LibrarySearch({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const [open, setOpen] = useState(false);
  if (!open && !value) {
    return (
      <button onClick={() => setOpen(true)} aria-label={placeholder} title={placeholder} className="btn btn-ghost btn-sm px-2">
        <Search className="size-4" />
      </button>
    );
  }
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-sub" />
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => !value && setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            onChange("");
            setOpen(false);
          }
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        className="input h-8 w-52 pl-8 pr-7 text-[13px]"
      />
      {value && (
        <button
          onClick={() => {
            onChange("");
            setOpen(false);
          }}
          aria-label="Clear search"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-mute hover:text-ink"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

export function SortSelect<T extends string>({ options, value, onChange }: { options: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <label className="flex items-center gap-2 text-[13px] text-sub">
      Sort
      <select value={value} onChange={(e) => onChange(e.target.value as T)} aria-label="Sort by" className="input h-8 py-0 pl-2 pr-7 text-[13px] text-ink">
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export type LibraryView = "list" | "compact" | "grid";
const VIEW_ICON = { list: List, compact: AlignJustify, grid: LayoutGrid } as const;
const VIEW_LABEL = { list: "List", compact: "Compact", grid: "Grid" } as const;

export function ViewToggle({ value, onChange, views = ["list", "compact", "grid"] }: { value: LibraryView; onChange: (v: LibraryView) => void; views?: LibraryView[] }) {
  return (
    <div className="flex gap-0.5 rounded-md border border-line bg-base p-0.5" role="radiogroup" aria-label="View">
      {views.map((v) => {
        const Icon = VIEW_ICON[v];
        return (
          <button
            key={v}
            role="radio"
            aria-checked={value === v}
            onClick={() => onChange(v)}
            title={VIEW_LABEL[v]}
            aria-label={VIEW_LABEL[v]}
            className={`rounded p-1.5 transition-colors ${value === v ? "bg-hl text-ink" : "text-sub hover:text-ink"}`}
          >
            <Icon className="size-4" />
          </button>
        );
      })}
    </div>
  );
}

/** Case- and accent-insensitive match on any of the given fields. */
export function matches(q: string, ...fields: (string | undefined)[]) {
  const n = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
  const needle = n(q.trim());
  return !needle || fields.some((f) => f && n(f).includes(needle));
}
