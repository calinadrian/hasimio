Fixes the "TV service could not start" error on LG webOS 6 / Node 8.12.

The streaming-service bundle was compiled for Node 8, but its stable launcher
and update-verification helper were previously copied without compilation.
Node 8 rejected their optional catch-binding syntax before the service could
start. The packager now compiles both launcher files for Node 8 as well.

The TV's own parser confirmed the original syntax errors without launching
the app. Build and packaging complete; playback remains for user testing.

Install the v0.1.39 IPK once to replace the affected launcher. The v0.1.38
launcher cannot start its updater, so it cannot apply this fix from inside
the TV app. The existing signing key, cache settings and saved data are kept.
