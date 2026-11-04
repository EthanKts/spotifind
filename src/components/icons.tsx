// Generic "external music service" glyph used next to "Open in Spotify" text.
// We deliberately don't reproduce Spotify's logo; the text label names the destination.
export function SpotifyGlyph({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <path d="M10 8.5v7l5.5-3.5L10 8.5Z" fill="currentColor" stroke="none" />
    </svg>
  );
}
