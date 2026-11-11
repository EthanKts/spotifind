// Spotifind mark: a "finder" lens whose rim is an open sound-ring, with a four-point discovery spark
// inside and a handle — music + search. Intentionally unlike Spotify's three-arc circle.

export function LogoMark({ size = 32, className = "", id = "sf-g" }: { size?: number; className?: string; id?: string }) {
  // Each instance needs its own gradient id: a copy inside a display:none container breaks url(#id) lookups.
  const g = `url(#${id})`;
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="6" y1="4" x2="34" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#3be477" />
          <stop offset="1" stopColor="#1db954" />
        </linearGradient>
      </defs>
      {/* lens rim, broken like a waveform gap */}
      <path
        d="M27.5 11.2A11 11 0 1 0 29 22.4"
        fill="none"
        stroke={g}
        strokeWidth="3.6"
        strokeLinecap="round"
      />
      {/* small echo dot closing the ring */}
      <circle cx="29.6" cy="16.6" r="1.9" fill={g} />
      {/* handle */}
      <path d="M26.2 26.2 34 34" stroke={g} strokeWidth="4.2" strokeLinecap="round" />
      {/* discovery spark */}
      <path
        d="M18.5 10.5c.5 3.6 1.9 5 5.5 5.5-3.6.5-5 1.9-5.5 5.5-.5-3.6-1.9-5-5.5-5.5 3.6-.5 5-1.9 5.5-5.5Z"
        fill="#fff"
      />
    </svg>
  );
}

export function Logo({ compact = false, id }: { compact?: boolean; id?: string }) {
  return (
    <span className="flex items-center gap-2 select-none">
      <LogoMark size={compact ? 24 : 24} id={id} />
      {!compact && (
        <span className="text-[17px] font-semibold tracking-tight leading-none">
          Spoti<span className="text-find">find</span>
        </span>
      )}
    </span>
  );
}
