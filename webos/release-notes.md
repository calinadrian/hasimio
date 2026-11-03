Fixes source requests and remote Back navigation on LG TVs.

- Preserve service class names when packaging: node-fetch checks the
  AbortSignal constructor name, and minification previously renamed it.
  Requests failed before contacting providers, leaving no playable sources.
- Back leaves the search field and dismisses the TV keyboard. Pressing Back
  again clears the search. Back also leaves other editable fields and returns
  from expanded catalog shelves.
- Add explicit TV layout bounds for the player, dialogs, navigation rail and
  overlays, plus spacing fallbacks for the older TV browser.
- Show native track information during playback instead of a track-inspection
  queue that never runs on the TV. Add the service's missing Array.at polyfill.

Build and packaging only; playback and remote interaction remain for user
testing. The memory cache limits and existing signing key are unchanged.

The v0.1.39 service has the same HTTP failure in its updater, so install this
IPK to restore source requests and GitHub update downloads.
