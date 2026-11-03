# Install Hasimio on an Apple Silicon Mac

This build targets Apple Silicon (`arm64`), including the M5 MacBook Air.
Hasimio runs its interface, torrent engine and audio conversion on the Mac.
The Mac needs internet access for catalogs and online playback, but no other
computer needs to stay on. This is a macOS app, not an iPad app.

## Run from source

For a ready-made installer, open the [GitHub releases](https://github.com/calinadrian/hasimio/releases),
download `Hasimio-<version>-mac-arm64.dmg`, open it and drag Hasimio into
Applications. The GitHub Mac installer workflow builds on an Apple Silicon
Mac and attaches installers to an existing release. These builds use ad-hoc
signing, not Apple notarization; see the security instructions below.

The following steps are only needed to build or run from source.

1. Install the current Node.js LTS release for **macOS ARM64** from
   [nodejs.org](https://nodejs.org/en/download).
2. Copy the Hasimio project folder to the Mac, or clone the repository if
   your GitHub account has access. Do not copy `node_modules`, `dist` or
   `release` from Windows: dependencies include platform-specific programs.
3. Open Terminal in the project folder and run:

   ```sh
   npm ci
   npm run desktop
   ```

This opens the desktop app with its own engine. Source runs do not update
automatically. Keep the app open while watching; quitting stops its engine.

## Build an installer

From the same folder **on the Mac**, run:

```sh
npm run package:mac
```

This builds Apple Silicon DMG and ZIP files under `release/desktop/`, named
`Hasimio-<version>-mac-arm64.dmg` and `.zip`. Open the DMG, drag Hasimio into
Applications, eject the disk image and open Hasimio from Applications.

The packaging command does not publish a release. The existing `npm run
release` command is for Windows; it does not publish Mac builds.

## Signing and updates

For distribution without macOS security warnings, the publisher must sign
and notarize the app with Apple credentials. Those credentials are not
included in the project. Locally built copies may show a security warning;
use Apple's documented **Privacy & Security → Open Anyway** procedure only
for a build you trust:
[Open a Mac app from an unknown developer](https://support.apple.com/guide/mac-help/mh40616/mac).

The ZIP target is included for the Mac updater. Automatic updates require
signed Mac releases and matching `latest-mac.yml` metadata published to the
configured GitHub repository. Until that is set up, rebuild and replace the
app manually; do not assume the Windows release feed supplies Mac updates.

## Current validation status

Mac installation, torrent playback, media conversion and updates have not
been tested on macOS. The installer must be built on a Mac with its native
dependencies installed; a Windows dependency folder cannot be reused.
