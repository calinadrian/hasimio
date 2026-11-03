Hasimio can now run directly on LG webOS 6 TVs, without a PC during playback.

- Standalone on-TV torrent service and native TV video/audio playback.
- Remote navigation, online catalogs, existing playback providers, Live TV and external text subtitles.
- A 64 MiB video-piece RAM cache, with a 32 MiB option, plus a bounded 4 MiB metadata cache. No movie files or IMDb database are saved to TV storage.
- GitHub updates under Extensions > TV updates: check, download, restart and restore a previous copy. Releases use signed metadata, SHA-256 file verification and a stable fallback launcher.
- Updated public TLS trust roots for the TV's older Node runtime, with certificate validation enabled.

Download the IPK for the first installation. Subsequent interface and streaming-service updates can be downloaded directly from the TV. Developer Mode must remain enabled. Launcher/OS integration changes may require a new IPK installation.

Build and packaging completed. TV playback, total device RAM use and the on-device update/restart flow have not been tested. Supported codecs depend on the TV; desktop FFmpeg audio conversion and the IMDb people database are not included.
