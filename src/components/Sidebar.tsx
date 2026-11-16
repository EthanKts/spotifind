"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronsLeft, ChevronsRight, Clock3, Compass, Home, ListMusic, Plus, Search, Settings, Shapes, Star, Zap } from "lucide-react";
import { Logo } from "./Logo";
import { useProfile, type Playlist } from "@/lib/taste/profile";
import { Artwork } from "./Artwork";
import { useEnriched } from "@/lib/client/data";
import { useMemo, useSyncExternalStore } from "react";

// One navigation column: what you do (Discover), what you've kept (Library), then your playlists, with Settings
// pinned at the bottom. It collapses to an icon rail (remembered between launches).
export const NAV_GROUPS = [
  {
    label: "Discover",
    items: [
      { href: "/", label: "Home", icon: Home, key: "⌘1" },
      { href: "/search", label: "Search", icon: Search, key: "⌘2" },
      { href: "/discover", label: "Discover", icon: Compass, key: "⌘3" },
      { href: "/rapid", label: "Rapid-fire", icon: Zap, key: "⌘7" },
      { href: "/genres", label: "Genres", icon: Shapes, key: "" },
    ],
  },
  {
    label: "Library",
    items: [
      { href: "/ratings", label: "My ratings", icon: Star, key: "⌘6" },
      { href: "/playlists", label: "Playlists", icon: ListMusic, key: "⌘4" },
      { href: "/recent", label: "History", icon: Clock3, key: "⌘5" },
    ],
  },
];
export const SETTINGS_NAV = { href: "/settings", label: "Settings", icon: Settings, key: "⌘," };

const COLLAPSED_KEY = "spotifind:sidebar-collapsed";
const collapsedListeners = new Set<() => void>();
function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}
function setCollapsed(v: boolean) {
  try {
    localStorage.setItem(COLLAPSED_KEY, v ? "1" : "0");
  } catch {}
  collapsedListeners.forEach((l) => l());
}

function isActive(path: string, href: string) {
  if (href === "/") return path === "/";
  if (href === "/playlists") return path === "/playlists";
  return path === href || path.startsWith(href + "/");
}

export function PlaylistCover({ pl, className = "" }: { pl: Playlist; className?: string }) {
  // Playlists keep the artwork from when they were made; refresh it with verified covers.
  const tracks = useEnriched(useMemo(() => pl.tracks.slice(0, 8), [pl.tracks]));
  const arts = tracks.map((t) => t.image).filter(Boolean).slice(0, 4) as string[];
  if (arts.length < 4) return <Artwork src={arts[0]} alt={pl.name} kind="album" className={className} />;
  return (
    <div className={`grid grid-cols-2 overflow-hidden rounded ${className}`} role="img" aria-label={pl.name}>
      {arts.map((src, i) => (
        // eslint-disable-next-line @next/next/no-img-element -- remote art from several CDNs
        <img key={i} src={src} alt="" className="aspect-square size-full object-cover" loading="lazy" />
      ))}
    </div>
  );
}

function NavLink({ href, label, icon: Icon, shortcut, active, collapsed }: { href: string; label: string; icon: typeof Home; shortcut: string; active: boolean; collapsed: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      title={collapsed ? `${label}${shortcut ? ` (${shortcut})` : ""}` : undefined}
      className={`group flex h-8 items-center gap-2.5 rounded-md text-sm transition-colors ${collapsed ? "justify-center px-0" : "px-2"} ${active ? "bg-hl font-medium text-ink" : "text-sub hover:bg-elev hover:text-ink"}`}
    >
      <Icon className={`size-4 shrink-0 ${active ? "text-find" : ""}`} strokeWidth={2} aria-hidden />
      {collapsed ? <span className="sr-only">{label}</span> : label}
      {!collapsed && shortcut && <span className="ml-auto text-[11px] text-mute opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">{shortcut}</span>}
    </Link>
  );
}

export function Sidebar() {
  const path = usePathname();
  const sp = useSearchParams();
  const p = useProfile();
  const openPlaylist = path === "/playlist" ? sp.get("id") : null;
  const collapsed = useSyncExternalStore(
    (l) => {
      collapsedListeners.add(l);
      return () => collapsedListeners.delete(l);
    },
    readCollapsed,
    () => false,
  );

  return (
    <aside className={`hidden shrink-0 flex-col border-r border-line bg-void transition-[width] duration-200 motion-reduce:transition-none md:flex ${collapsed ? "w-[60px]" : "w-[232px]"}`}>
      <div className={`flex h-14 items-center ${collapsed ? "justify-center" : "justify-between pl-5 pr-2"}`}>
        {!collapsed && (
          <Link href="/" aria-label="Spotifind home">
            <Logo id="sf-g-side" />
          </Link>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="btn btn-ghost btn-sm !px-1.5"
        >
          {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
        </button>
      </div>
      <nav className={collapsed ? "px-2" : "px-3"} aria-label="Main">
        {NAV_GROUPS.map((g) => (
          <div key={g.label} className="mt-4 first:mt-1">
            {collapsed ? <div className="mx-2 mb-1 border-t border-line first:hidden" /> : <p className="px-2 pb-1 text-[11px] font-medium text-mute">{g.label}</p>}
            <ul>
              {g.items.map(({ href, label, icon, key }) => (
                <li key={href}>
                  <NavLink href={href} label={label} icon={icon} shortcut={key} active={isActive(path, href)} collapsed={collapsed} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {collapsed ? (
        <div className="flex-1" />
      ) : (
        <>
      <div className="mt-5 flex items-center justify-between px-5 pb-1">
        <p className="text-[11px] font-medium text-mute">Your playlists</p>
        <Link href="/playlists" className="rounded p-0.5 text-mute hover:bg-hl hover:text-ink" aria-label="New playlist" title="New playlist">
          <Plus className="size-3.5" />
        </Link>
      </div>
      <div className="scroll-area min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {p.playlists.length === 0 ? (
          <p className="px-2 py-1 text-[13px] text-mute">None yet.</p>
        ) : (
          <ul>
            {p.playlists.map((pl) => (
              <li key={pl.id}>
                <Link
                  href={`/playlist?id=${pl.id}`}
                  className={`flex items-center gap-2.5 rounded-md p-1.5 transition-colors ${openPlaylist === pl.id ? "bg-hl" : "hover:bg-elev"}`}
                >
                  <PlaylistCover pl={pl} className="size-8 shrink-0" />
                  <span className="min-w-0">
                    <span className={`block truncate text-[13px] ${openPlaylist === pl.id ? "text-ink" : "text-sub"}`}>{pl.name}</span>
                    <span className="block truncate text-[11px] text-mute">{pl.tracks.length} songs</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
        </>
      )}
      <div className={`border-t border-line py-2 ${collapsed ? "px-2" : "px-3"}`}>
        <NavLink href={SETTINGS_NAV.href} label={SETTINGS_NAV.label} icon={SETTINGS_NAV.icon} shortcut={SETTINGS_NAV.key} active={isActive(path, SETTINGS_NAV.href)} collapsed={collapsed} />
      </div>
    </aside>
  );
}

export function MobileNav() {
  const path = usePathname();
  const items = [
    { href: "/", label: "Home", icon: Home },
    { href: "/discover", label: "Discover", icon: Compass },
    { href: "/rapid", label: "Rapid-fire", icon: Zap },
    { href: "/playlists", label: "Playlists", icon: ListMusic },
    { href: "/ratings", label: "Ratings", icon: Star },
  ];
  return (
    <nav aria-label="Main" className="grid grid-cols-6 border-t border-line bg-void pb-[env(safe-area-inset-bottom)] md:hidden">
      {items.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? path === "/" : isActive(path, href);
        return (
          <Link key={href} href={href} className={`flex flex-col items-center gap-1 py-2.5 text-[11px] ${active ? "text-ink" : "text-sub"}`}>
            <Icon className={`size-5 ${active ? "text-find" : ""}`} strokeWidth={2} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
