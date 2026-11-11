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
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-base px-4 md:px-8">
      <Link href="/" className="md:hidden" aria-label="Home">
        <LogoMark size={24} id="sf-g-top" />
      </Link>
      <div className="hidden gap-0.5 md:flex">
        <button onClick={() => router.back()} aria-label="Go back" title="Back (⌘[)" className="btn btn-ghost btn-sm !px-1.5">
          <ChevronLeft className="size-4" />
        </button>
        <button onClick={() => router.forward()} aria-label="Go forward" title="Forward (⌘])" className="btn btn-ghost btn-sm !px-1.5">
          <ChevronRight className="size-4" />
        </button>
      </div>
      <form
        role="search"
        className="relative max-w-[520px] flex-1 md:ml-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (timer.current) clearTimeout(timer.current);
          go(q, false);
        }}
      >
        {isLink ? (
          <Link2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-find" />
        ) : (
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-mute" />
        )}
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Search songs, albums, artists or paste a Spotify link"
          aria-label="Search songs, albums, artists, or paste a Spotify link"
          className="input h-9 w-full bg-elev pl-9 pr-16"
        />
        {q && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setQ("");
              inputRef.current?.focus();
            }}
            className="absolute right-10 top-1/2 -translate-y-1/2 text-sub hover:text-ink"
          >
            <X className="size-4" />
          </button>
        )}
        <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-line px-1 text-[10px] text-mute md:block">⌘K</kbd>
      </form>
      
    </header>
  );
}
