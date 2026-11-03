# FileList sources (desktop and LG TV)

Open **Extensions > FileList account**. Enter your FileList username and API
passkey from your FileList profile, then choose **Connect FileList**. This
checks API access and enables the FileList extension. Your website password
is not used. API access must be available for your account. Disconnect removes
the saved account, disables the extension and stops its active playback.

Movie and episode source searches include FileList results after connection.
Choose a FileList source in the normal source picker. Episode searches include
matching episode releases and season packs. Only IMDb-based movies/series
are supported; Kitsu-only anime IDs are not yet mapped to FileList.

Each installation has its own credentials, kept in the local service's account
file, outside the application package. They are not stored in extension URLs,
synced, exported with libraries, or returned in source results. The passkey is
sent only to FileList's HTTPS API/download endpoint. Source results contain a
FileList torrent ID; the service downloads and validates its private torrent
metadata only when playback is requested. Private playback disables DHT and
local peer discovery and adds no public trackers. No automatic inspection
downloads are started for FileList sources. Tracker failures use generic
messages rather than exposing authenticated tracker URLs.

On TV this runs directly on the television with the PC off. The existing
32/64 MiB piece cache, maximum 4 MiB pieces, maximum 32,768 pieces and native
codec restrictions still apply. FileList search results have a separate
128 KiB, 12-query cache and five-minute expiry; API calls are limited locally
to 70 per hour per service instance. FileList's own account limits still apply.

Hasimio is a temporary streaming client, not a persistent seedbox. Both editions
delete playback data when stopping; the TV also evicts older buffered pieces.
Neither edition keeps seeding afterward. Check your current FileList rules and
allowed clients before using this mode. Do not assume that partial streaming
satisfies the account's ratio or minimum seed-time requirements.

No account credentials or authenticated playback were used in development.
Builds and packaging do not establish API access, tracker client acceptance,
or successful playback for your account. Connect and check these on your device.

Reference implementation for the API protocol:
[Prowlarr FileList](https://github.com/Prowlarr/Prowlarr/tree/develop/src/NzbDrone.Core/Indexers/Definitions/FileList).
