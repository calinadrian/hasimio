# Hasimio for LG webOS (standalone)

Target device: LG 75UP78003LB, webOS 6 / Chromium 79 / Node 8.12.
The app and its torrent service run on the TV. A PC is used to build and
sideload the package, and is not needed during playback.

## Build

From the project directory, with Node 22 or newer on the build PC:

```powershell
npm ci --ignore-scripts
npm ci --prefix webos/service --omit=optional --ignore-scripts
npm install -g @webos-tools/cli
npm run package:webos
```

Output: release/webos/app.hasimio.tv_<version>_all.ipk.
`npm run build:webos` prepares the same app and service without making an IPK.
On a nonstandard CLI installation, set HASIMIO_WEBOS_CLI to the absolute path
of @webos-tools/cli/bin/ares-package.js.

The build compiles the app and bundles dependencies; it does not run tests,
launch the app, or connect to the TV. TV playback and RAM usage still need
device validation. This is the initial standalone implementation.

## Install on the TV

1. Connect the TV and PC to the same home network.
2. On the TV, install Developer Mode from LG Apps and sign in with an LG
   developer account. Enable Dev Mode Status (the TV reboots), then Key Server.
3. On the PC, run `ares-setup-device`. Add the TV's IP address, port 9922,
   and SSH user `prisoner`.
4. Run `ares-novacom --device YOUR_TV --getkey` and enter the passphrase shown
   by the TV's Developer Mode app.
5. Install the IPK using `ares-install --device YOUR_TV PATH_TO_IPK`.
6. Launch with `ares-launch --device YOUR_TV app.hasimio.tv`, or select
   Hasimio from the TV home screen. The PC can now be turned off.

Keep Developer Mode's session renewed. LG removes sideloaded apps when
Developer Mode is disabled. No root or homebrew installation is required.

LG documentation:
- https://webostv.developer.lge.com/develop/getting-started/developer-mode-app
- https://webostv.developer.lge.com/develop/guides/js-service-basics

## Storage and RAM policy

- Completed torrent pieces: a strict 64 MiB in-memory store by default, with
  a 32 MiB option in Extensions > TV storage and memory.
- Eviction clears the corresponding WebTorrent availability bit and restores
  its piece state. A later seek requests missing pieces again from peers.
- Only one torrent is active, with up to eight peer connections and three
  native-player HTTP readers. Each reader selects about 4 MiB ahead and
  respects backpressure. Complete files are never selected for download.
- Maximum torrent piece size is 4 MiB; metadata is limited to 32,768 pieces
  and 1,000 files. Oversized torrents require a different source.
- Provider/metadata response cache: 4 MiB, with at most 1 MiB per cached item.
  HTTP responses are limited to 8 MiB decompressed, with two upstream fetches
  at a time. No video data or catalog databases are written to TV storage.
  The desktop per-show/intro caches are not retained separately. EZTV searches
  are limited to ten pages; very large result sets need another source.
- In-flight torrent blocks, response buffers, the UI, GPU and native decoder
  require additional memory. The piece-store cap is not a whole-app RAM cap.
  The Extensions panel displays the service RSS separately from cached bytes.
- The UI uses a 1280x720 graphics surface. Supported video can still use the
  native decoder's 4K resolution. Catalog pages are limited to 30 titles and
  explicit Next page replaces the old page instead of accumulating cards.
- Disposable persisted track and progress-metadata caches are limited to
  1 MiB each. Saved library, watch progress and pairing credentials are kept
  separately and are never evicted to make space for temporary cache.
- Leaving playback, hiding the TV app, closing it, or losing the player
  heartbeat clears the torrent. The service writes only its small buffer
  preference under /media/internal/app.hasimio.tv/settings.json.

## TV-specific behavior and limits

The existing React UI is built for Chromium 79 with API and dialog fallbacks,
directional remote navigation, Back handling and native HLS playback. The
on-TV service listens only on 127.0.0.1:11476 and rejects foreign origins.

The package includes the build PC's public Node TLS trust roots for the old
Node 8 HTTPS client. Certificate validation stays enabled; no private keys
or account credentials are bundled.

The TV uses online Cinemeta catalogs in place of the desktop IMDb database.
Kitsu, configured HTTP add-ons, existing torrent providers, subtitles, intro
markers and Live TV use the TV's network connection. Provider availability
and API rate limits still apply. The desktop people database is omitted.

WebTorrent 0.105.3 is isolated in webos/service because it supports Node 8.
The Windows engine keeps its existing WebTorrent version. The bundle excludes
native addons, filesystem torrent storage, seeding helpers and browser-only
rendering helpers. The build adds a guard before torrent-store allocation
and transpiles Unicode property regexes used by the existing providers.

Playback uses LG's native audio/video decoder and native embedded-track
selection. FFmpeg and desktop audio conversion are not included. An unsupported
codec needs another source; there is no promise of desktop codec parity.
Native track exposure varies with the TV and source. External text subtitles
remain available through the player. Seek outside buffered pieces needs peers
to supply data again. High-bitrate 4K sources leave less time in the same
buffer than 1080p; slow peers can still cause buffering.

No TV playback, manual checks, automated tests or visual verification have
been performed as part of this initial build.

## Update directly from the TV

Open Extensions > TV updates, select Check for updates, then Download update
and Restart Hasimio. The TV reads public GitHub releases in calinadrian/hasimio
whose tags start with webos-v. No GitHub sign-in or token is stored on the TV.

The initial IPK installs a small stable launcher and a pinned RSA public key.
Updates contain both the UI and the streaming-service code. The launcher loads
the selected verified copy from the app's own data directory; the TV does not
need permission to reinstall IPKs, root access, or a running PC for this flow.
Changing the installed launcher, app icon, app ID or OS-level permissions can
still require installing a new IPK once.

Each release has RSA-SHA256-signed metadata, a compressed payload hash and
individual SHA-256 file hashes. Downloads are capped at 2 MiB compressed, 6 MiB
of decoded update JSON, 4 MiB of installed code/assets and 64 files. Paths are
allowlisted before extraction. The TV stops torrents before downloading.

One previous downloaded version is retained, alongside the immutable copy in
the installed IPK. A new update is marked pending until its service starts.
An interrupted or failed startup falls back on the next app launch. Restore
previous version can also be selected in the update panel. Application code
copies use persistent TV storage (normally a few MiB per copy); this is separate
from the in-memory video cache. No movie data is included in updates.

## Publish a TV release to GitHub

After bumping package.json and committing the source, run:

```powershell
npm run release:webos
```

This rebuilds the IPK, creates signed update files, pushes the current branch
and its webos-v<version> tag, then publishes a GitHub release after all assets
are uploaded to a draft. TV releases are explicitly not marked latest, so the
Windows update channel continues using Windows releases.

The matching private signing key is stored only in the ignored local file
.cache/webos-update-signing-key.pem. Back it up securely. Other build PCs can
set HASIMIO_WEBOS_SIGNING_KEY_FILE to its location. Do not commit or upload it
as a release asset, and do not replace the public key trusted by installed TVs.
The signing-key setup script refuses to overwrite an existing public key.
