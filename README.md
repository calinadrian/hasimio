# Hasimio

A browser-first media library with discovery, an episode calendar, and Stremio-compatible HTTP extensions. React + TypeScript + Vite.

## Run

```powershell
npm install
npm run dev
```

Open the localhost URL printed by Vite. `npm run build` creates `dist/`; `npm run preview` serves the production build. `npm test` checks add-on routing, validation, filtering and episode date handling.

## Features

- Browse live movie/series catalogs from Cinemeta and anime catalogs from Anime Kitsu by default. Search across sources, select Anime, and load more titles from paginated catalogs. Existing installations receive missing default catalogs once, preserving disabled sources; subsequent removal stays respected.
- Search, filter by type and genre, view details and select episodes.
- Save a library on this browser. Every saved movie, series, and anime appears in Calendar automatically. Missing metadata loads on save and stale metadata refreshes at startup, on returning to the app, and during periodic checks while the app is open (six-hour cache for successful metadata). Refresh dates bypasses the cache. The tracked list shows the next known release or explains missing dates; the month grid includes movie releases, episodes, and specials. Removing a library item also removes its calendar entries, including when a metadata request is still running.
- Install add-ons with an HTTP(S) manifest URL. Configured add-on paths and query parameters are preserved. Toggle or remove installed extensions.
- Play HTTP video and HLS sources with native controls. Open Cinema includes Big Buck Bunny and Tears of Steel, Blender Foundation films under CC BY 3.0.
- The Pirate Bay is the first built-in playback extension. It searches the public APIBay index by IMDb ID or title/year and series episode, ranks video torrents by seeders, and displays quality and file size. Choose Play to buffer through the local WebTorrent engine; season packs allow manual video selection when the requested episode cannot be identified.
- Playback selection starts with a quality dropdown: only available 720p, 1080p, 2K/1440p, 4K/2160p, SD or unspecified tiers appear. Choose a source within that tier, sort by seeders or file size, and press Play. Long filenames remain available under Release details. Pirate Bay results retain up to eight sources per quality, so lower-seeded resolutions are not crowded out by a single tier.

## Desktop app

Hasimio for Windows is an Electron app (`electron/`). It runs Hasimio Engine in a utility process on `127.0.0.1:11475`, and the engine also serves the built UI, so the window is the same page as `npm run preview` with no CORS involved. Closing the window stops the engine and clears temporary torrent data. Port 11475 must be free: close the portable engine zip before starting the app. A hosted Hasimio site can use the app's engine too when its address is listed in `%APPDATA%\Hasimio\engine.json` (`{ "allowedOrigins": ["https://site"] }`).

- `npm run desktop` builds the UI and opens the app from source (no updates in this mode).
- `npm run package:app` builds `release/desktop/Hasimio-Setup-<version>.exe`: a one-click, per-user installer with no admin prompt, plus `latest.yml` for the updater. It is not code-signed, so Windows SmartScreen warns on first run.
- `npm run release` publishes a version like SaveMe does. It requires a clean, committed tree and `gh auth login`. It builds the installer, checks that `latest.yml` matches it, tags `v<version>`, uploads to a draft GitHub release on calinadrian/hasimio and then publishes it, with notes grouped from commit subjects (Add… → New, Fix… → Fixed, everything else → Improved). Bump `version` in package.json first.

Installed copies check GitHub 10 seconds after starting and every 6 hours, download new versions in the background, and show "Restart to update" on every page. Otherwise the update installs when Hasimio closes. Extensions → Hasimio shows the version, status and release notes, with Check for updates. `npm run icon` redraws `resources/icon.png` and `public/favicon.png`.

## Local torrent playback

Use `npm run dev`, or `npm run build` followed by `npm run preview`. Both include the local streaming API and use port 5176 with LAN binding. Hosting `dist/` on a static web server alone does not run this service. The streaming API accepts same-origin requests addressed to localhost or this PC's actual private IPv4 interfaces, rejecting public clients and foreign origins.

### Hasimio Engine (hosted UI)

`npm run engine` runs the streaming API on its own at `http://127.0.0.1:11475`, loopback only. Options: `--port <n>`, `--lan` (bind all IPv4 interfaces), and `--allow-origin <https://site>` (repeatable; also `HASIMIO_ALLOWED_ORIGINS`, comma-separated). Build a hosted UI with `VITE_ENGINE_URL=http://127.0.0.1:11475 npm run build`; each visitor's browser then calls the engine on their own PC. Unset, the UI uses its own origin as before. `VITE_ENGINE_DOWNLOAD_URL` sets the engine download link shown to visitors; without it the panel shows `npm run engine`.

`npm run engine -- --config engine.json` reads `{ "allowedOrigins": [...], "port": 11475, "lan": false }` from a file. Flags override the file, and allowed sites from the environment, file and flags combine.

### Windows portable engine

`npm run package:engine -- --allow-origin https://your-site` builds `release/Hasimio-Engine-<version>-win-x64.zip` (about 75 MB) on Windows. It holds `Hasimio Engine.cmd` (the launcher), `engine.json` (allowed sites, port, LAN), `README.txt` for users, `runtime/node.exe` copied from the Node.js running the script (x64, Node 22 or newer; `--node <path>` picks another), and `app/` with the engine's server files plus only the packages WebTorrent and ffmpeg-static need, including `ffmpeg.exe`. Users unzip it and double-click the launcher; closing its window or pressing Ctrl+C stops the engine and clears its temporary files. Without `--allow-origin`, users add the site to `engine.json` themselves. The launcher is not code-signed.

The UI checks `/api/streaming/health` on load. While the engine is missing, playback sources and the Extensions page show an install panel with Check again, and the check repeats every 10 seconds and on returning to the tab, so a newly started engine is picked up and sources reload. The health response carries `apiVersion` (`shared/engine-api.mjs`, bumped on breaking API changes) and `engineVersion` (from `package.json`); an engine older than the UI's API version shows an update panel instead.

Libraries are stored per site. Library → Export saves saved titles and installed extensions (not the built-in demo source) to a JSON file; Import on another site or device adds titles and extensions it does not already have and leaves existing ones unchanged. Exports can contain credentials included in add-on URLs.

An allowed site gets CORS headers and Chrome's private-network preflight answer. Host and client-address checks still apply, so the engine stays unreachable from other machines. Other sites are refused, except Origin-less `<video>` / HLS segment / subtitle reads of an existing session's random 36-character ID, and only when at least one site is allowed.

Temporary data lives in the per-user cache: `%LOCALAPPDATA%\Hasimio\cache` on Windows, `~/Library/Caches/Hasimio` on macOS, `$XDG_CACHE_HOME/hasimio` elsewhere; override with `HASIMIO_CACHE_DIR`.

## Access from another device

On the same home network, open `http://192.168.100.10:5176/` (the host PC's current Ethernet address). Include `http://` and the port; this is a LAN address, not an internet address. Keep Hasimio running on the host. Guest Wi-Fi or router client isolation may block devices from reaching the PC. No router port forwarding is required.

`scripts/Enable-LANAccess.ps1` installs a Windows administrator firewall rule restricted to Node.js, TCP 5176, Ethernet, local address 192.168.100.10 and remote subnet 192.168.100.0/24. It allows that subnet on either Windows Private or Public profile without changing the network profile. If DHCP changes the PC address or subnet, update the rule and device URL. Development and preview use strictPort so the URL cannot silently move to another port. Library storage is still local to each device/browser and origin.

The source uses `https://apibay.org/q.php` rather than embedding scripts or ads from the supplied Pirate Bay mirror. Its local Stremio-compatible manifest is `/api/extensions/piratebay/manifest.json`. The extension can be disabled or removed normally.

The torrent player shows peers and download progress, supports byte-range seeking, and stops the session when closed. Data is stored under `torrents/` in the per-user cache and removed on normal stop. Unattended sessions expire after three minutes without polling. A forced process termination can leave temporary files behind. Torrenting exchanges data with peers and exposes your network address. Source availability and listed seeder counts are not guarantees. Browser video codec support still varies; video transcoding is not included.

Torrent playback defaults to Compatible audio on all devices: the included FFmpeg binary copies the video and converts the selected audio track to stereo AAC in fragmented-MP4 HLS. This addresses unsupported audio formats that can otherwise produce silent video in Safari. Direct original playback remains optional; a direct-playback error automatically retries using compatible audio. The first segment must buffer before playback; seeking in this mode is limited to the video already prepared. Switching modes restarts playback. Use original audio retains the direct stream and full-range seeking. The Audio / dub dropdown reads embedded languages, titles and codecs from the selected torrent file. The Subtitles dropdown converts embedded text tracks (SRT/SubRip, ASS/SSA, WebVTT and MOV text) to WebVTT and adds timed cues to the native player as torrent data arrives; selecting subtitles does not restart video. Image-based PGS/DVD subtitle tracks are listed as unsupported. You can also load a UTF-8 SRT or VTT file (up to 5 MB), which stays in the browser. ASS styling is simplified during conversion. Visible torrent source rows automatically inspect file headers before playback, showing verified audio/subtitle languages and track counts directly on each card. Full codec and track-title information stays under Release details. Checks run two different torrent hashes at a time on a separate WebTorrent client, without stopping playback; changing quality or closing details cancels the current request. Missing peers or ambiguous episode packs show an explicit error with Retry track check. Verified results are cached by torrent hash and episode. Duplicate hashes share a scheduling lane to avoid duplicate torrent additions; cached cards appear immediately. MP4/MKV/MOV/WebM inspection uses a short 100 ms / 256 KiB media probe, with a full probe fallback when no audio is found. Network availability still controls metadata and file-header arrival time. Checks download some torrent data and connect to peers, then clear temporary inspection downloads. Selecting a track uses AAC compatibility playback on every device, including Safari. Switching dubs restarts playback; only tracks actually included in the file are available. Untagged languages appear as numbered audio tracks. Language discovery can be retried after buffering. Converted segments live under `compatible-audio/` in the per-user cache and are deleted, and FFmpeg stopped, when the session ends or the file changes.

`npm run test:audio` generates a short H.264/PCM fixture, transfers it over a local torrent connection, prepares it through the actual HLS API, decodes the AAC stereo result, verifies H.264 video is retained and checks converted-data cleanup. No public media is downloaded for this test.

`npm run test:streaming` checks real TCP torrent transfer and HTTP seeking with generated test data on loopback, then stops the session and removes its temporary data. It does not download copyrighted films or contact public torrent peers.

## Current limits

No accounts or cross-device sync. Library and add-on URLs are stored in localStorage, which may contain credentials supplied in configured add-on paths. Install only trusted add-ons. Remote endpoints must support browser CORS. Codec, authentication and DRM restrictions depend on each provider and browser. Torrent/info-hash playback requires the included Node.js local streaming service. No arbitrary extension JavaScript runs inside the app.

The calendar uses the device's local timezone. Provider schedules can be incomplete or change; unannounced dates are not estimated. Cinemeta and Anime Kitsu supply metadata, not playback streams. Catalog requests are limited to six eligible catalogs per extension; Load more is available for catalogs declaring skip support. Search queries supported remote catalogs; genre filtering applies to loaded results. Metadata refresh requires the app to be open, with no background service or notifications after closing it.

## Sources

Protocol: https://stremio.github.io/stremio-addon-sdk/protocol.html

Default metadata sources: https://v3-cinemeta.strem.io/manifest.json and https://anime-kitsu.strem.fun/manifest.json. Anime Kitsu is a community-operated Kitsu integration.

Starter artwork: MetaHub and TMDB. Open Cinema films and artwork: Blender Foundation (https://peach.blender.org/ and https://mango.blender.org/). Demo video hosting: W3C and Blender Foundation. Network assets and services may be unavailable independently of the application.

## Cinema player

The unified player places audio/dub, subtitles, download and playback settings inside the video stage. It includes a buffered seek bar, play/pause, ten-second skips, mute/volume, playback speed, fullscreen and picture-in-picture where the browser supports it. Controls fade during mouse-driven playback and remain available with keyboard focus or an open menu. Space/K toggles playback, left/right seek ten seconds, up/down adjust volume, M mutes, F toggles fullscreen, and C opens subtitle options. Subtitle size and timing offset can be adjusted in the subtitle menu.

For torrent sources, Download original file streams the selected file with attachment headers, retaining all embedded audio/subtitle tracks. Keep the player open until the download completes; closing playback stops the torrent and clears temporary files. Direct remote videos expose an Open video file action; the remote source and browser determine saving support. HLS-only direct sources have no standalone-file download. Audio compatibility, dub switching, prepared-video seeking and image-subtitle limitations described above still apply.
