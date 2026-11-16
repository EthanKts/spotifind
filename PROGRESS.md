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

## Rapid-fire rating (round 7)
- [x] Rapid-fire page: seed picker, queue from recommendation pipeline
- [x] One-track view, auto-play preview, keyboard shortcuts
- [x] Skip unplayable/rated/hidden; refill queue with updated taste
- [x] Summary + playlist from 4–5★; sidebar entry and ⌘7
- [x] Test in dev and rebuild the Mac app

## Spotify taste import (round 8)
- [x] user-top-read scope + reconnect prompt
- [x] Fetch top artists/tracks, map to Last.fm tags
- [x] Imported signals in taste profile at lower weight
- [x] Import UI (connect flow, My Ratings, first launch) + remove
- [x] Premium / owner-rule error handling
- [x] Test in dev and rebuild the Mac app

## Accuracy + clean redesign (round 9)
- [x] Recent Spotify listening weighs most in imports
- [x] Verify recommendations exist on Spotify; hide the ones that don't
- [x] Spotify cover art first; fix blank covers and same-name artists
- [x] Clean visual style (no gradients, glows, scaling, badges)
- [x] Simpler navigation: one grouped sidebar, tabbed My ratings
- [x] Rebuild the Mac app and test

## Artwork accuracy (round 10)
- [x] Every card, song row and playlist cover uses verified artwork
- [x] Deezer first, Spotify fallback, Last.fm album covers last
- [x] Respect Spotify rate limits (stop asking until Retry-After)
- [x] Retry failed lookups instead of caching blanks
- [x] Artist matching: "The" prefix, non-Latin names, namesakes
- [x] Rebuild the Mac app and test

## One-click setup for friends (round 11)
- [x] Shared copy carries your Last.fm key + Spotify Client ID (never tokens/secrets)
- [x] First launch: Log in with Spotify → taste imported automatically
- [x] Clear message for friends you haven't added yet
- [x] New setup guide + packaging script with leak checks
- [x] Fix invisible headings (text-base clashed with the "base" color)
- [x] Rebuild app + share package and test

## Guided install for friends (round 12)
- [x] Styled download window with 1-2-3 instructions
- [x] "Move to Applications" prompt on first launch
- [x] Login errors reported back to the app (not-approved friends)
- [x] Step-by-step setup wizard with progress and quick tour
- [x] Help menu: Setup Guide + Report a problem
- [x] Guide, README, rebuild and test

## Energy, instruments, genres + organised Spotify tab (round 13)
- [x] Real audio features (ReccoBeats) with cache + rate limits
- [x] Energy bar + instrument filter (shape layer)
- [x] Explore a genre matched to my taste
- [x] Controls in Playlists + Rapid-fire; genre page buttons
- [x] From Spotify tab: top artists / top songs, by period
- [x] Build from several songs/albums/artists at once (up to 5)
- [x] Docs, rebuild app + share package, test

## Big upgrade (round 14)
- [x] Phase 1: speed + image loading (right-sized images, /api/img proxy, parallel enrichment)
- [x] Phase 2: grouped collapsible sidebar, ⌘K palette, ? shortcuts, Settings, Genres, error states
- [x] Phase 3: ListenBrainz + Discogs + audio in pipeline, weights.ts, eval script, data coverage
- [x] Phase 4: Vibe Dial
- [x] Phase 4: Time Machine
- [x] Phase 4: Trail + Saved trails
- [x] Phase 4: Smooth flow playlists
- [x] Phase 5: docs + share package

## Trim + precise genres + better playlists (round 15)
- [x] Remove Vibe Dial, Time Machine and Trails
- [x] Playlists like before: extra ranking components off, no ListenBrainz-only artists
- [x] Variety: one per album, no long runs of one genre tag, more similar artists for sparse songs
- [x] Precise subgenres (Discogs styles + Last.fm tags) with membership checks
- [x] Up to 5 genres per playlist / Rapid-fire, balanced; family picker with search; Genres page
- [x] My ratings: Spotify-style chips, search, sort, list/compact/grid (Ratings + From Spotify)
- [x] Docs, rebuild app + share package, test

