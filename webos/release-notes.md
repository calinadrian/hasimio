Fix large-history sync and misleading episode-date labels.

Large sync documents are compressed before encryption and in the local sync
cache. The duplicated saved comparison snapshot is removed. Completed watched
history is retained, and the record guard allows 10,000 watched entries plus
library/settings records. The relay's storage limit is unchanged.

Update every paired app to v0.1.51 or newer for compressed large histories.
Existing uncompressed data remains readable. Main library/history storage is
kept unchanged; no watched entries are deleted by this update.

Episodes with missing dates show Release date unavailable. Watched episodes
show Watched · Release date unavailable and no upcoming-release countdown.
Metadata refreshes preserve known valid dates when providers omit them.

Builds and synthetic size calculations only; user pairing/navigation testing
was not performed. See docs/LARGE-HISTORY-SYNC.md for compatibility details.
