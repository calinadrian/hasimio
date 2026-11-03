Add FileList account access and private torrent sources to desktop and LG TV.

Connect your FileList username and API passkey in Extensions. FileList is
enabled after a successful API check and contributes matching movie/episode
sources. Playback downloads private torrent metadata directly from FileList,
retains authenticated tracker information and adds no public trackers. Private
sources do not trigger automatic track-inspection downloads.

On TV this works without the PC. Its existing piece and codec limits remain.
Credentials stay with each device's service and are not synced or included
in source results. Account access and tracker client acceptance need checking
with the user's credentials; no authenticated playback has been tested.

Hasimio deletes data after playback and does not provide persistent seeding.
The account panel explains this limitation. See docs/FILELIST.md for details.
