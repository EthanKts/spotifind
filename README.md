# Spotifind

**Spotify is where you listen. Spotifind is where you discover music you'll love.**

A music discovery app with a Spotify-style interface. Pick a song, album or artist and Spotifind recommends music that matches it, using real listening-similarity data and community tags. Every recommendation explains why it was picked.

## Mac app

Spotifind is installed at **~/Applications/Spotifind.app**. Open it like any other app.

- It runs its own bundled server on `127.0.0.1:47320`, which stops when you quit.
- **Open in Spotify** opens the Spotify desktop app directly.
- API keys live in `~/Library/Application Support/Spotifind/config.env`. To edit them, use **Spotifind › API Keys…** (⌘,), then quit and reopen.
- Server log: `~/Library/Logs/Spotifind/server.log`.
- Shortcuts: ⌘1 Home, ⌘2 Search, ⌘3 Discover, ⌘4 Playlists, ⌘5 History, ⌘6 My Ratings, ⌘7 Rapid-fire; ⌘[ / ⌘] back and forward; ⌘R reload; ⌘K search.

To rebuild and reinstall after changing the code:

```sh
bash macos/scripts/build-app.sh
```

The script builds the Next.js standalone server, the Swift shell (`macos/Sources`) and the icon, bundles Node from `~/.local/node`, then installs the app. Only Command Line Tools are needed, not Xcode.

## Share with friends

```sh
bash macos/scripts/package-share.sh
```

Creates `macos/dist/Spotifind.dmg` and `Spotifind.zip` (app + **How to set up Spotifind.html**). Friends don't have to set anything up:

- The shared copy has **your Last.fm API key and your Spotify app's Client ID** built in (`Contents/Resources/shared.env`). Both are public identifiers, not passwords. It never contains your Spotify login, client secret, ratings or imported taste: the script checks the bundle and refuses to package if any of them slip in.
- On first launch a friend clicks **Log in with Spotify**, approves in their browser, and Spotifind imports their taste automatically. They can also skip Spotify, or switch to their own Spotify developer app.
- A friend's own settings (`config.env`) always override the built-in ones.

**Your part: approve each friend.** Spotify's rules for personal ("development mode") apps: at most 5 people including you, and each one must be added by the owner. Spotify accepts the login of anyone you haven't added but refuses all their requests. Spotifind then tells them to send you their Spotify email. To add someone:

1. Open https://developer.spotify.com/dashboard → your Spotifind app → **User Management**.
2. Add their name and the email address of their Spotify account. Friends don't need Premium; you, as the owner, do.
3. Check that **Settings → Redirect URIs** contains `http://127.0.0.1:47320/api/spotify/callback`.

Everyone shares your app's Spotify request quota, so Spotifind uses Spotify sparingly (Deezer first for artwork) and backs off when Spotify asks it to. Friends need an Apple silicon Mac with macOS 14+. The app is ad-hoc signed (no paid Apple Developer ID), so the first launch needs **System Settings → Privacy & Security → Open Anyway**. The guide explains this.

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
- **Spotify**: checks that every recommended song and album really exists on Spotify, and supplies its cover art (see *Accurate artwork and availability* below). Its audio-features and recommendations endpoints are closed to new apps, so no Spotify data affects ranking.

### Accurate artwork and availability

Last.fm's album lists include compilations, "- Single"/"- EP" re-releases and "[Enhanced]" uploads that aren't on any streaming service, and its own artwork is often missing. Every card, song row and playlist cover therefore goes through `/api/enrich`:

1. **Deezer** (no key, generous limits): an exact artist + title match gives the cover and the preview.
2. **Spotify**, only for what Deezer can't find: confirms the item is on Spotify and gives its cover. Spotify's quota for personal developer apps is small, so lookups are cached for a week. When Spotify answers "rate limited, retry in N hours", Spotifind stops asking until then.
3. **Last.fm album cover**, for songs neither service has.

Recommendations (Discover, Home, Playlists, Rapid-fire, genre pages) leave out anything Spotify says it doesn't have, and anything no catalogue recognises. Failed lookups are retried, so a temporary error doesn't leave a blank cover. Artists who share a name resolve to the best-known one ("Pond" the Australian band). "The Parcels" and "Parcels" are treated as the same artist. Names in Japanese and other non-Latin scripts are matched to their romanised listing (杏里 → Anri).

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

## Rapid-fire

**Rapid-fire** (⌘7) is for rating fast. Pick *From my taste* or a song, album or artist, plus a style and the Very Similar ↔ More Adventurous slider (Discover's **Rapid-fire rate these** button fills these in). Spotifind then shows one song at a time with big artwork, the "why it matches" line, and its 30-second preview playing automatically.

| Key | Action |
|---|---|
| 1–5 | Rate and go to the next song |
| → or Space | Skip |
| ← | Back |
| Esc | Finish |

The queue comes from the same pipeline as Discover and Playlists (`candidates.ts` → `score.ts` → `explain.ts`; see `src/lib/client/rapid.ts`). It leaves out songs with no preview, songs you've already rated (including 1★-hidden ones), and your imported Spotify top songs, and plays at most 3 songs per artist. When only a few songs are left, it quietly fetches more by re-ranking the pool with your updated taste. Songs you rate 4–5★ also become extra seeds, so your ratings change what comes next. When you finish, a summary shows how many songs you rated, your average stars and your top new artists, with a button that turns your 4–5★ songs into a playlist.

## Import your taste from Spotify

To avoid starting from nothing, choose **Import my taste from Spotify**. It's offered on the first-launch screen, in the Home onboarding, after saving a playlist to Spotify, and on My Ratings. Spotifind reads your top artists and top tracks for the all-time, last 6 months and last 4 weeks ranges, then maps them to Last.fm tags through the usual cache.

- Imported items are **not** star ratings. They feed the taste profile (`deriveTaste` in `src/lib/taste/profile.ts`) at about a 4★ strength at most. Recent listening counts most: the last 4 weeks ×1.0, the last 6 months ×0.8, all-time ×0.6. Position in the top-50 scales each one from 1.0 down to 0.5. Imported items never hide anything.
- A real rating of the same song or artist always replaces the imported signal.
- My Ratings has an **Imported from Spotify** section. You can remove single items (a re-import keeps them out) or **Remove all imported**.
- This needs the `user-top-read` permission. Logins made before this feature don't have it, so Spotifind asks you to **Reconnect Spotify** once.
- If Spotify refuses (for example, the developer app's owner has no Premium, or your account isn't on the app's user list under Spotify's February 2026 rules), the error is shown in place and nothing else breaks.
- Stored only in `~/Library/Application Support/Spotifind/spotify-import.json` (readable only by you). The browser only keeps a copy in memory.

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

## Interface

One sidebar with two groups: **Discover** (Home, Search, Discover, Rapid-fire) and **Library** (Playlists, My ratings, History), then your playlists. Every page starts with the same plain header. **My ratings** has three tabs: *Ratings* (including top artists), *Taste profile* (recommendation quality, learned tastes, quick artist rating) and *From Spotify* (imported taste). Shared button, panel and input styles live in `src/app/globals.css` (`.btn`, `.panel`, `.option`, `.input`).

## Layout

```
src/app/            pages (home, search, discover, rapid, track, album, artist, genre, recent, ratings) and api/* routes
src/components/     Sidebar, TopBar, Player, Cards, Discovery (panel + grid), SeedHeader, Actions (stars), Logo
macos/              Swift shell (WKWebView + server lifecycle), Info.plist, icon + build scripts
src/lib/sources/    lastfm, deezer, musicbrainz, spotify, http (rate limits + cache)
src/lib/recommend/  candidates, score, explain, tags
src/lib/taste/      profile store (ratings) + imported Spotify taste
src/lib/client/     data hooks (enrichment, years, JSON cache), player store
```
