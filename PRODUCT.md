# Hasimio

<!-- impeccable:product-schema 1 -->

## Platform
web

## Stack
React and TypeScript, approved by the user. Browser first; desktop packaging can follow.

## Product Purpose
A personal media application similar to Stremio: discover movies, series, and anime, maintain a library, follow release dates in a calendar, and install Stremio-compatible HTTP add-ons.

## Capabilities and Constraints
Support add-on manifests, catalogs, metadata and browser-playable stream URLs. Cinemeta and Anime Kitsu provide default live discovery catalogs, including posters and metadata. Adding any title to the library automatically tracks it in the calendar and fetches missing release metadata. Movie release dates and episode dates come from providers; titles without announced dates remain visible in the tracked list. Refresh stale metadata automatically, retaining known dates on network failure. The user requested The Pirate Bay as the first playback extension; it searches APIBay and uses the included localhost WebTorrent service for torrent video buffering and seeking. Normal stop clears temporary downloads. Playback depends on peers, codecs, CORS and installed sources; video transcoding and account sync are outside scope. Demo content must be labeled.

## Brand Commitments
The user requests a neutral grey/black app throughout: charcoal navigation and grey surfaces, white/grey controls and focus indicators, readable text, and pure black player backgrounds and top/bottom bars. Keep poster artwork and video in their original colors. Playback is quality-first: choose an available resolution, then choose a source. Supported labels include 720p, 1080p, 2K (1440p) and 4K (2160p), only when supplied; unknown resolution must remain explicit. All torrent playback uses AAC-stereo HLS compatibility by default to address silent audio on Mac and other browsers, preserving original video. Direct playback remains optional with automatic recovery on a playback error. The player supports selection of embedded audio tracks with language/title/codec labels, using AAC compatibility playback for the selected dub. Embedded text subtitles and local SRT/VTT files are supported; image subtitle tracks are identified as unsupported. Source cards automatically check visible torrent files for actual audio/subtitle tracks before playback, with verified counts and languages directly on each card, progress, retryable failures and cached results. Two distinct hashes are inspected concurrently, using short probes for header-based media formats. Untagged languages stay explicitly unspecified. Inspections use a separate torrent client and never stop active playback. Missing dubs cannot be added by the selector. Prepared-video seeking and playback restart on audio changes must remain explicit. Working name: Hasimio, from the project folder.

## Unified Player

A Stremio-inspired cinema player owns the playback controls and in-player audio, subtitle, download and settings menus. Support keyboard controls, buffered seeking, ten-second skips, volume/mute, playback speed, subtitle size/delay, fullscreen and browser-supported picture-in-picture. Torrent downloads save the original selected file with all embedded tracks and require the session to remain open until finished. Direct remote sources expose the original URL without promising forced downloading or HLS export. Retain the existing AAC, subtitle and source inspection behavior.
