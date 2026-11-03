# Standalone Android edition

Android 9+ (API 28), ARM64 phones/tablets. The APK includes the React interface,
Node.js Mobile 18.20.4, a TCP/DHT torrent client and a 64 MiB bounded video-piece
RAM cache. It binds only to `127.0.0.1:11476`; no PC or hosted engine is needed.
Library, profiles and sync settings persist across APK updates. Android's back
button closes playback/details first, then offers to exit and stop the engine.
Playback pauses when the activity leaves the foreground. There is no background
playback/foreground service. Keep Android System WebView up to date.

The activity binds to an engine service in a separate private process. Native
library loading is guarded; engine failures display a copyable startup report
instead of terminating the interface. Reports include the device/Android
version, memory page size, engine exit reason and local engine errors. Native
stdout/stderr are kept in app-private `engine-native.log`, reset each startup.
No reports are uploaded automatically.
The build expands title-normalization Unicode property expressions into
explicit character ranges because the embedded runtime cannot parse them.

On phones, the interface uses four bottom tabs: Discover, Library, Live TV and
More. More opens Calendar, Progress, Extensions, device sync and profile
switching. Title details fill the screen, poster rows hint at the next card,
and mobile filters/source actions use larger touch targets. These refinements
are scoped to Android phone widths; desktop and TV retain their layouts.

The engine reuses the TV's online movie/series catalog adapter (Cinemeta), rather
than building the desktop IMDb database on the phone. Torrent playback uses the
WebView's codecs; FFmpeg conversion, desktop track inspection, Chromecast and
the IMDb people index are unavailable. MP4/H.264/AAC is the most compatible
source; MKV, HEVC, multiple embedded audio tracks and subtitles depend on device
support. External online subtitles remain available. Direct cleartext remote
HTTP media is blocked; HTTPS media and the loopback engine are allowed.
This is an initial Android implementation; device playback and updates need
user testing. The pinned upstream mobile Node runtime is older than desktop.
This APK targets Android 34 for direct GitHub distribution, not Play submission.

## Build locally

Install a JDK (17+), Android SDK platform/build-tools 34 and NDK 27.3.13750724.
Set `JAVA_HOME`, `ANDROID_HOME` and, if installed elsewhere, `ANDROID_NDK_HOME`.
The build uses SDK tools directly; Android Studio/Gradle are not required.

```powershell
npm ci
npm ci --prefix webos/service --omit=optional --ignore-scripts
npm run package:android
```

Output: `release/android/Hasimio-<version>-android-arm64.apk` and
`release/android/hasimio-android-update.json`. The runtime downloads to `.cache`
and its SHA-256 is pinned in the build script. No app is launched by packaging.
Copy the APK to the phone and open it to install, or use
`adb install -r <apk-path>` yourself.

The first local build creates a persistent signing key at
`.cache/android/signing/hasimio.jks` with its password in `local-key.json`.
Both are ignored by Git. Back up both files securely: losing the signing key
means future APKs cannot update this installation. All future builds and CI
must use that same key. Do not commit or upload signing files as release assets.
To use your own key, set `ANDROID_KEYSTORE`, `ANDROID_KEY_ALIAS`,
`ANDROID_KEYSTORE_PASSWORD` and `ANDROID_KEY_PASSWORD` before packaging.

## GitHub releases and updater

The **Android APK** workflow builds on demand. Configure these repository
Actions secrets before running it:

- `ANDROID_KEYSTORE_BASE64`: Base64 of the same JKS used for the first APK.
- `ANDROID_KEY_ALIAS`: `hasimio` for the generated local key.
- `ANDROID_KEYSTORE_PASSWORD`: `password` from the ignored local-key JSON.
- `ANDROID_KEY_PASSWORD`: the same password for the generated local key.

Commit/push the source, run the workflow on that branch, and enable **publish**
to create a separate `android-v<package.json version>` release. Build-only runs
keep the signed APK as an Actions artifact. No signing material is uploaded.
Increment the numeric `major.minor.patch` version before publishing another
Android version. Version code = major × 1,000,000 + minor × 1,000 + patch;
each component must be below 1,000 and the resulting code must increase.
Published Android releases are not marked as the repository's latest desktop
release. The updater scans up to 90 recent releases, ignores drafts/prereleases
and other platforms, and selects the highest Android version code.

Installed copies check GitHub after startup, on resume when six hours have
elapsed, and from Extensions → Hasimio → Check for updates. A newer APK downloads
in the background while the app remains open. Before offering installation the
updater checks SHA-256, package ID, version code/name and signing certificate
against the installed APK. Updates cannot downgrade or change publisher.
The download is private to the app. Installation requires a tap and Android's
system confirmation; allow **Install unknown apps → Hasimio** when prompted,
then return and tap Install update again. Cancelling installation keeps the
download ready. Closing Hasimio never installs updates silently.

Runtime integration follows the upstream [Node.js Mobile Android guide](https://nodejs-mobile.github.io/docs/guide/guide-android/getting-started/).
