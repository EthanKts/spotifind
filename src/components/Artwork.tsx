"use client";

import { Disc3, Mic2, Music2 } from "lucide-react";
import { useState } from "react";
import type { Kind } from "@/lib/types";

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
}: {
  src?: string;
  alt: string;
  kind: Kind;
  className?: string;
  rounded?: boolean;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const round = rounded ?? kind === "artist";
  const shape = round ? "rounded-full" : "rounded-md";
  if (src && failed !== src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- remote art from several CDNs; next/image would need every host whitelisted
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onError={() => setFailed(src)}
        className={`${shape} object-cover bg-hl ${className}`}
      />
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
