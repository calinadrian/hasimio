# Install Hasimio on an Apple Silicon Mac

This build targets Apple Silicon (`arm64`), including the M5 MacBook Air.
Hasimio runs its interface, torrent engine and audio conversion on the Mac.
The Mac needs internet access for catalogs and online playback, but no other
computer needs to stay on. This is a macOS app, not an iPad app.

## Run from source

For a ready-made installer, open the [GitHub releases](https://github.com/calinadrian/hasimio/releases),
download `Hasimio-<version>-mac-arm64.dmg`, open it and drag Hasimio into
Applications. The GitHub Mac installer workflow builds on an Apple Silicon
Mac and attaches installers to an existing release. The first published
0.1.51 Mac build used ad-hoc signing and was not Apple-notarized. The updated
workflow requires Developer ID signing and notarization; it cannot replace
that build until the publisher configures Apple credentials.

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

### Publisher setup for GitHub

An active [Apple Developer Program membership](https://developer.apple.com/programs/)
is required. On the Mac, create a **Developer ID Application** certificate
(not an Apple Development or Developer ID Installer certificate) and export
it together with its private key as a password-protected `.p12` using
Keychain Access. See [Apple's Developer ID instructions](https://developer.apple.com/help/account/certificates/create-developer-id-certificates/).

In the repository's **Settings → Secrets and variables → Actions**, add these
repository secrets. Do not paste certificates, private keys or passwords
into chat, commit them, or include them in issue comments.

| Secret | Value |
| --- | --- |
| `MAC_CSC_LINK` | Base64-encoded contents of the exported Developer ID Application `.p12`, including its private key. |
| `MAC_CSC_KEY_PASSWORD` | Password protecting the `.p12` export. |
| `APPLE_ID` | Apple Account email associated with the developer membership. |
| `APPLE_APP_SPECIFIC_PASSWORD` | An app-specific password generated for that account at account.apple.com. |
| `APPLE_TEAM_ID` | Developer team ID from the membership details. |

Run **Signed Mac installer** from GitHub Actions on the branch containing
the workflow. It builds the package version and attaches assets to the
existing `v<version>` release. The shipped application code must match that
tag. No new release is created and no Windows assets are replaced.

The workflow requires signing and notarization, verifies the Developer ID
signature and stapled ticket, and checks Gatekeeper acceptance before
uploading. Missing credentials or rejected notarization stop publication.
It publishes `latest-mac.yml` alongside the DMG and ZIP for Mac updates.
The first ad-hoc build must be replaced manually with the Developer ID build;
automatic updates from an ad-hoc build are not guaranteed.

## Current validation status

The initial ad-hoc installer was built successfully on GitHub's Mac runner.
Developer ID signing and notarization await publisher credentials. Mac
installation, torrent playback, media conversion and updates have not been
tested. Builds require native Mac dependencies; a Windows dependency folder
cannot be reused.
