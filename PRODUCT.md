# Hasimio

<!-- impeccable:product-schema 1 -->

## Platform
web

## Stack
React and TypeScript, approved by the user. Browser first; desktop packaging can follow.

## Product Purpose
A personal media application similar to Stremio: discover movies, series, and anime, maintain a library, follow release dates in a calendar, and install Stremio-compatible HTTP add-ons.

## Capabilities and Constraints
Support add-on manifests, catalogs, metadata and browser-playable stream URLs. Hasimio Titles (our own IMDb-dataset index with Wikipedia movie posters and TVmaze series data) and Hasimio Anime provide default live discovery catalogs, including posters and metadata. Adding any title to the library automatically tracks it in the calendar and fetches missing release metadata. Watched tracking is manual per movie and episode, with mark-unwatched, mark-all and mark-all-previous actions that share playback history and device sync. Checking an episode offers to catch up earlier unwatched episodes. A Progress tab summarizes episodes and movies watched, series started and finished, remaining episodes, watch time and recent activity from that same history. Time watched includes the full runtime of completed movies and episodes, including manual watched marks, and saved positions for unfinished playback. Prefer measured file duration, then individual episode runtime, then a series’ usual episode length. Missing runtimes are excluded and identified; totals display minutes, hours and days. Movie release dates and episode dates come from providers; titles without announced dates remain visible in the tracked list. Refresh stale metadata automatically, retaining known dates on network failure. The user requested The Pirate Bay as the first playback extension; it searches APIBay and uses the included localhost WebTorrent service for torrent video buffering and seeking. Normal stop clears temporary downloads. Playback depends on peers, codecs, CORS and installed sources; video transcoding is outside scope. Login-free device sync uses an optional standalone HTTPS relay, with client-side encryption, QR pairing, TV codes, per-device revocation, recovery codes, and offline merging. Demo content must be labeled.

## Brand Commitments
The user requests a neutral grey/black app throughout: charcoal navigation and grey surfaces, white/grey controls and focus indicators, readable text, and pure black player backgrounds and top/bottom bars. Keep poster artwork and video in their original colors. Playback is quality-first: choose an available resolution, then choose a source. Supported labels include 720p, 1080p, 2K (1440p) and 4K (2160p), only when supplied; unknown resolution must remain explicit. All torrent playback uses AAC-stereo HLS compatibility by default to address silent audio on Mac and other browsers, preserving original video. Direct playback remains optional with automatic recovery on a playback error. The player supports selection of embedded audio tracks with language/title/codec labels, using AAC compatibility playback for the selected dub. Embedded text subtitles and local SRT/VTT files are supported; image subtitle tracks are identified as unsupported. Source cards automatically check visible torrent files for actual audio/subtitle tracks before playback, with verified counts and languages directly on each card, progress, retryable failures and cached results. Four distinct hashes are inspected concurrently. MP4/MKV/MOV/WebM checks read container track headers without packet analysis, selecting small moving torrent ranges and falling back to a full probe when needed. Untagged languages stay explicitly unspecified. Inspections use a separate torrent client and never stop active playback. Missing dubs cannot be added by the selector. Prepared-video seeking and playback restart on audio changes must remain explicit. Working name: Hasimio, from the project folder.

## Live TV

Live TV has a dedicated sidebar entry with one Cartoon Network channel from Cool-eTv. A labeled server selector offers Server 1 and Server 2, the alternative, sourced from `https://www.cool-etv.net/ch/cartoon.htm` and `https://www.cool-etv.net/ch/cartoon-s2.htm`. Watch channel plays only the channel video in Hasimio, using native HLS where supported or hls.js. The local service resolves the source without executing provider scripts and proxies bounded, allowlisted playlists and segments. Provider pages and advertising scripts are not embedded. Switching servers, Reload and Stop remain available. Both supplied pages currently resolve to the same stream. Live TV does not record watch progress; provider availability can change.

## Unified Player

A Stremio-inspired cinema player owns the playback controls and in-player audio, subtitle, download and settings menus. Support keyboard controls, buffered seeking, ten-second skips, volume/mute, playback speed, subtitle size/delay, fullscreen and browser-supported picture-in-picture. Torrent downloads save the original selected file with all embedded tracks and require the session to remain open until finished. Direct remote sources expose the original URL without promising forced downloading or HLS export. Retain the existing AAC, subtitle and source inspection behavior.

Integration policy: implement integrations ourselves rather than bundling third-party add-ons. Anime Kitsu and Cinemeta have been replaced by our own Hasimio Anime and Hasimio Titles integrations; manual extension installation, including Cinemeta, remains available.

## Cast and actor discovery

Title details show main cast names and character roles for IMDb-indexed movies and series. Clicking a cast member opens their movie/TV-series credits, with category filtering and scroll pagination. Discover search includes actor-name results as well as title matches. A separate cached IMDb principals/name index supplies actor identities and credits for titles in Hasimio’s catalog; this is not an exhaustive worldwide filmography. Its large one-time download runs independently of title browsing and playback, with visible preparation/retry states.
