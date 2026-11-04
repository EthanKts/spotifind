# Spotifind build progress

The Claude Code status line shows the percentage of checked boxes in this file.

## Foundation
- [x] Install Node.js and scaffold Next.js + TypeScript + Tailwind
- [x] Data sources: Last.fm, Deezer, MusicBrainz, Spotify
- [x] Recommendation engine: candidates, scoring, modes, slider, explanations
- [x] API routes: recommend, search, enrich, year, preview, open, album, artist, tags, tag
- [x] Taste profile (likes, dislikes, saves, ratings, learning)
- [x] Client data hooks and audio player store
- [x] Theme, logo and artwork component

## Interface
- [x] Sidebar and mobile navigation
- [x] Top search bar
- [x] Bottom player
- [x] App shell layout
- [x] Cards, shelves, track rows and action buttons
- [x] Discovery panel (modes and slider) and recommendation grid
- [x] Home page with shelves and onboarding
- [x] Search page
- [x] Discover page
- [x] Track page
- [x] Album page
- [x] Artist page
- [x] Library pages (overview, liked, albums, recently discovered)
- [x] Genre page

## Finish
- [x] Build and lint pass
- [x] Browser test at desktop and phone width
- [x] README with setup instructions

## Mac app + ratings-only (round 2)
- [x] Fix duplicate-key console errors and review code
- [x] Ratings-only taste profile with migration
- [x] Remove like, save and dislike UI and library pages
- [x] My Ratings page and Recently Discovered move
- [x] Home onboarding and shelves driven by ratings
- [x] Standalone server build config
- [x] Swift app shell (window, server lifecycle, menus)
- [x] Spotify desktop deep links
- [x] App icon and build/install script
- [x] Verify the installed app end to end

## Playlists, quick artist rating, speed, green (round 3)
- [x] Measure where the time goes
- [x] Persistent API cache that survives relaunch
- [x] Faster recommendations (instant first results, fewer API calls)
- [x] Faster album and artist pages
- [x] Prefetch on hover so clicks feel instant
- [x] Spotify green accent everywhere (UI, logo, icon)
- [x] Sidebar: top rated songs and top rated artists
- [x] Rate artists from anywhere + quick-rate panel
- [x] 15-song playlist builder (style, seeds, swap songs)
- [x] Playlist pages and sidebar list
- [x] Rebuild the app and test end to end

## Save playlists to Spotify (round 4)
- [x] Spotify login (PKCE) with token stored on this Mac
- [x] Export: match songs on Spotify, create/update the playlist
- [x] In-app setup: paste Client ID, connect, disconnect
- [x] "Save to Spotify" / "Update on Spotify" on playlist pages
- [x] Mac app opens Spotify login in your browser
- [x] Rebuild app and test

## Playlist length (round 5)
- [x] Choose playlist length (10–50 songs)
- [x] Rebuild app and test

## Share with friends (round 6)
- [x] Commit work to git
- [x] First-launch screen for each person's Last.fm key
- [x] Shareable .dmg / .zip with setup guide, no keys inside
- [x] Private GitHub repo
