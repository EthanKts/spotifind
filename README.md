# Spotifind

**Spotify is where you listen. Spotifind is where you discover music you'll love.**

A music discovery app with a Spotify-style interface. Pick a song, album or artist and Spotifind recommends music that matches it, using real listening-similarity data and community tags. Every recommendation explains why it was picked.

## Mac app

Spotifind is installed at **~/Applications/Spotifind.app**. Open it like any other app.

- It runs its own bundled server on `127.0.0.1:47320`, which stops when you quit.
- **Open in Spotify** opens the Spotify desktop app directly.
- API keys live in `~/Library/Application Support/Spotifind/config.env`. To edit them, use **Spotifind › API Keys…** (⌘,), then quit and reopen.
- Server log: `~/Library/Logs/Spotifind/server.log`.
- Shortcuts: ⌘1 Home, ⌘2 Search, ⌘3 Discover, ⌘4 Playlists, ⌘5 Recently Discovered, ⌘6 Ratings; ⌘[ / ⌘] back and forward; ⌘R reload; ⌘K search.

To rebuild and reinstall after changing the code:

```sh
bash macos/scripts/build-app.sh
```

The script builds the Next.js standalone server, the Swift shell (`macos/Sources`) and the icon, bundles Node from `~/.local/node`, then installs the app. Only Command Line Tools are needed, not Xcode.

## Run in a browser (development)

```sh
export PATH="$HOME/.local/node/bin:$PATH"
npm run dev        # http://localhost:3000 (use "localhost", not 127.0.0.1: Next 16 blocks dev assets on other hosts)
```

## API keys (`.env.local` for development; config.env for the app)

| Key | Needed? | What it adds |
|---|---|---|
| `LASTFM_API_KEY` | Recommended | Similarity scores, tags, Groove/Mood modes, play counts. Free at https://www.last.fm/api/account/create |
| `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` | Optional | Exact "Open in Spotify" links (otherwise a Spotify search link opens). Free app at https://developer.spotify.com/dashboard |

MusicBrainz, Cover Art Archive and Deezer need no keys. Restart the server after editing `.env.local`.

## Where the data comes from

- **Last.fm**: `track.getSimilar` and `artist.getSimilar` provide the % similarity shown on cards. They're based on what real listeners play together. Top tags describe genre, instrumentation, mood and vocals. Play counts identify deep cuts and hidden gems.
- **Deezer**: artwork, search, and the **real 30-second previews** played in the bottom player. With no Last.fm key, Deezer's related-artist graph is the fallback.
- **MusicBrainz**: original release years and studio discographies.
- **Spotify**: only for exact links. Its audio-features and recommendations endpoints are closed to new apps, so no Spotify data affects ranking.

### Honest limitations
- No free API analyses the audio itself (groove, bassline, harmony). Spotifind approximates "how it sounds" with listener co-play similarity plus curated tag groups (`src/lib/recommend/tags.ts`).
- Last.fm has no tags for many individual songs. Those songs use their album's or artist's tags, and the UI says so.
- Previews exist only where Deezer has one. Otherwise the player says so and offers Open in Spotify.

## How recommendations work

1. `src/lib/recommend/candidates.ts` (server) collects a candidate pool for the seed: similar tracks, top tracks and albums of similar artists, deep cuts, and second-hop neighbours, each with its real Last.fm scores and tags.
2. `src/lib/recommend/score.ts` (browser) ranks that pool. It combines Last.fm similarity, tag similarity (overall, groove-only or mood-only), your taste profile, and how obscure each item is compared with the rest of the pool. Each **mode** sets those weights differently, and the **Very Similar → More Adventurous** slider shifts the balance from similarity toward novelty. Re-ranking happens instantly.
3. `src/lib/recommend/explain.ts` writes the "why it matches" line from the actual shared tags and match source.

## Playlists

**Playlists** (⌘4) builds a playlist of 10–50 songs (15 by default) from Spotifind's most relevant recommendations:

1. **Based on:** *From my taste* (blends your 3 top-rated songs/artists — songs suggested by several of them rank higher) or one song, album or artist. Discover's "Make a 15-song playlist from this" button pre-fills it with the current style.
2. **Style:** Closest Match, Deep Cuts, Hidden Gems, Same Groove, Same Mood or Explore Further, plus the Very Similar ↔ More Adventurous slider.
3. **Options:** one song per artist (tops up with second songs if there aren't 15 artists), skip songs you've already rated, previewable songs only.

**Save to Spotify** creates the playlist in your Spotify account (later, **Update on Spotify** syncs swaps and regenerations into the same Spotify playlist). One-time setup, guided inside the app:

1. Create an app at https://developer.spotify.com/dashboard with Redirect URI `http://127.0.0.1:47320/api/spotify/callback` and *Web API* ticked.
2. Paste its **Client ID** into Spotifind (no client secret needed — it uses Spotify's PKCE login).
3. Click **Connect Spotify**: your browser opens Spotify's approval page; Spotifind picks up the login automatically.

Spotify requires the developer app's owner to have **Premium** (Spotify's February 2026 rules). The login is stored only on this Mac (`~/Library/Application Support/Spotifind/spotify-auth.json`, readable only by you); Disconnect removes it. Songs are matched on Spotify by artist + title; any that Spotify doesn't have are listed after saving. Once connected, "Open in Spotify" buttons also jump to the exact song instead of a search.

Each song shows why it's there and its real Last.fm similarity. **Swap** replaces a song with the next-best one; **Regenerate** rebuilds with the same settings; **Copy song list** copies "Artist – Title" lines. Stars you give inside a playlist count toward that style's score on the ratings page. 

## Speed

- **Disk cache** (`~/Library/Caches/Spotifind/api-cache.sqlite`): everything fetched once is instant afterwards, across relaunches.
- **Two-pass recommendations:** a quick similarity-only pass shows results in ~0.3–1 s; the detailed pass (tags, deep cuts, second hop) replaces it a few seconds later.
- **Priority lanes:** the detailed pass runs in a background lane that always leaves request capacity for your clicks.
- **Hover prefetch:** pausing on a card or row starts loading its page.
- Slow upstream requests are logged as `[slow]` in the server log.

## Ratings, the only feedback signal

Spotifind has no library, no likes and no saves, because Spotify already does that. Instead, you rate recommendations from 1 to 5 stars:

| Stars | Effect |
|---|---|
| 5★ / 4★ | More music with this sound, and more from this artist |
| 3★ | Neutral |
| 2★ | Less like this |
| 1★ | Hidden from recommendations. Rating an *artist* 1★ hides that artist |

**Rate artists fast:** hover any artist name (cards, song rows, the player) for inline stars, rate artist cards directly, or use the *Rate artists in seconds* panel on Home — it lines up artists from songs you've rated, music you explored, and artists similar to your favourite. The sidebar shows **Top songs**, **Top artists** (rated directly, or by the average of their songs you rated) and **Playlists**.

Your taste profile (tag weights + artist affinity) is always **derived from your ratings** (`src/lib/taste/profile.ts`), so changing or clearing a rating never leaves stale effects behind. Each rating also remembers the seed and discovery mode it came from. **My Ratings** shows:

- your average stars and hit rate per mode, so you can see how good the recommendations really are
- the tastes it learned, any of which you can remove
- every rating, which you can edit

## Layout

```
src/app/            pages (home, search, discover, track, album, artist, genre, recent, ratings) and api/* routes
src/components/     Sidebar, TopBar, Player, Cards, Discovery (panel + grid), SeedHeader, Actions (stars), Logo
macos/              Swift shell (WKWebView + server lifecycle), Info.plist, icon + build scripts
src/lib/sources/    lastfm, deezer, musicbrainz, spotify, http (rate limits + cache)
src/lib/recommend/  candidates, score, explain, tags
src/lib/taste/      profile store
src/lib/client/     data hooks (enrichment, years, JSON cache), player store
```
