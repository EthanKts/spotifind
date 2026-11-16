"use client";

import { Disc3, Mic2, Music2 } from "lucide-react";
import { useState } from "react";
import type { Kind } from "@/lib/types";
import { sizedImage } from "@/lib/img";

/** Display size in CSS px from Tailwind classes ("size-10", "md:size-24"); cards that fill their column ≈ 240. */
function displayPx(className: string) {
  const sizes = [...className.matchAll(/(?:^|\s)(?:[a-z]+:)?size-(\d+)/g)].map((m) => Number(m[1]) * 4);
  return sizes.length ? Math.max(...sizes) : 240;
}

// Deterministic placeholder colour from the title so empty artwork still looks intentional.
function hue(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

export function Artwork({
  src,
  alt,
  kind,
  className = "",
  rounded,
  priority = false,
}: {
  src?: string;
  alt: string;
  kind: Kind;
  className?: string;
  rounded?: boolean;
  /** Above-the-fold artwork: load immediately at high priority instead of lazily. */
  priority?: boolean;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<string | null>(null);
  const round = rounded ?? kind === "artist";
  const shape = round ? "rounded-full" : "rounded-md";
  if (src && failed !== src) {
    const px = displayPx(className);
    const h = hue(alt);
    return (
      // The wrapper holds the size and a colour placeholder; the image fades in over it once decoded.
      <span
        className={`${shape} block overflow-hidden ${className}`}
        style={{ background: `linear-gradient(135deg, hsl(${h} 30% 24%), hsl(${(h + 40) % 360} 25% 14%))`, aspectRatio: "1 / 1" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- remote art from several CDNs; next/image would need every host whitelisted */}
        <img
          src={sizedImage(src, px)}
          srcSet={`${sizedImage(src, px)} 1x, ${sizedImage(src, px * 2)} 2x`}
          alt={alt}
          width={px}
          height={px}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          fetchPriority={priority ? "high" : "auto"}
          // Already decoded before React attached onLoad (cached image on first paint): show it right away.
          ref={(el) => {
            if (el && el.complete && el.naturalWidth > 0 && loaded !== src) setLoaded(src);
          }}
          onLoad={() => setLoaded(src)}
          onError={() => setFailed(src)}
          className={`size-full object-cover transition-opacity duration-300 motion-reduce:transition-none ${loaded === src ? "opacity-100" : "opacity-0"}`}
        />
      </span>
    );
  }
  const Icon = kind === "artist" ? Mic2 : kind === "album" ? Disc3 : Music2;
  const h = hue(alt);
  return (
    <div
      role="img"
      aria-label={alt}
      className={`${shape} grid place-items-center ${className}`}
      style={{ background: `linear-gradient(135deg, hsl(${h} 35% 28%), hsl(${(h + 40) % 360} 30% 16%))` }}
    >
      <Icon className="w-1/3 h-1/3 text-white/50" strokeWidth={1.5} />
    </div>
  );
}
