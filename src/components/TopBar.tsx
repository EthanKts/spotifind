"use client";

import { ChevronLeft, ChevronRight, Link2, Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LogoMark } from "./Logo";

export function TopBar() {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const urlQ = path === "/search" ? (params.get("q") ?? "") : "";
  const [q, setQ] = useState(urlQ);
  const [lastUrlQ, setLastUrlQ] = useState(urlQ);
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the box in sync when the URL changes (back/forward, navigation away).
  if (urlQ !== lastUrlQ) {
    setLastUrlQ(urlQ);
    setQ(urlQ);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const go = (value: string, replace: boolean) => {
    const url = value.trim() ? `/search?q=${encodeURIComponent(value.trim())}` : "/search";
    if (replace && path === "/search") router.replace(url);
    else router.push(url);
  };

  const onChange = (v: string) => {
    setQ(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => go(v, true), 400);
  };

  const isLink = /open\.spotify\.com|spotify:/.test(q);

  return (
    <header className="sticky top-0 z-30 flex items-center gap-2 bg-base/85 px-4 py-3 backdrop-blur-md md:px-6">
      <Link href="/" className="md:hidden" aria-label="Home">
        <LogoMark size={30} id="sf-g-top" />
      </Link>
      <div className="hidden gap-2 md:flex">
        <button onClick={() => router.back()} aria-label="Go back" className="grid size-8 place-items-center rounded-full bg-black/70 text-sub hover:text-ink">
          <ChevronLeft className="size-5" />
        </button>
        <button onClick={() => router.forward()} aria-label="Go forward" className="grid size-8 place-items-center rounded-full bg-black/70 text-sub hover:text-ink">
          <ChevronRight className="size-5" />
        </button>
      </div>
      <form
        role="search"
        className="relative max-w-[560px] flex-1 md:ml-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (timer.current) clearTimeout(timer.current);
          go(q, false);
        }}
      >
        {isLink ? (
          <Link2 className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-brand" />
        ) : (
          <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-sub" />
        )}
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Find a song, album, artist — or paste a Spotify link"
          aria-label="Search songs, albums, artists, or paste a Spotify link"
          className="h-12 w-full rounded-full border border-transparent bg-elev-2 pl-12 pr-11 text-[15px] text-ink placeholder:text-mute transition-colors hover:border-hl-2 hover:bg-hl focus:border-ink focus:bg-hl focus:outline-none"
        />
        {q && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setQ("");
              inputRef.current?.focus();
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-sub hover:text-ink"
          >
            <X className="size-5" />
          </button>
        )}
      </form>
      <kbd className="ml-1 hidden rounded border border-line px-1.5 py-0.5 text-[11px] text-mute lg:block">⌘K</kbd>
    </header>
  );
}
