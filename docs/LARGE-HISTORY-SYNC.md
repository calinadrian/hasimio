# Large watched histories

Version 0.1.51 compresses large sync documents before encryption. The relay
continues to store the same opaque version-1 encrypted envelope; its 900,000
character ciphertext limit is unchanged. No relay migration is needed.
Small payloads retain the old plaintext JSON encoding inside encryption.
New clients can read both encodings. Update every paired PC/TV app to
0.1.51 or newer before sharing a large compressed history; older clients
cannot decode that compressed content. Hosted/web clients also need an
updated client build before participating in such groups.

The local sync cache also compresses its document and no longer saves an
additional complete observed-value map. Its comparison baseline is rebuilt
from validated document records when loading the cache. Legacy cache records
remain readable. Main library and playback-history storage are unchanged,
retaining their independent source data. No watched entries are removed.
Unchanged polling does not repeatedly compress/write the whole cache.

The client accepts up to 50,000 records, including library/settings records,
so a 10,000-entry watched history does not exceed the old 10,000-record guard.
Decoded JSON is limited to 16 MiB. Streaming decompression checks output size
in small input increments. The existing unfinished-bookmark cap still applies;
completed watched entries are retained. Large/incompressible documents can
still exceed the relay limit and will report an error rather than discard data.

Missing episode dates now display Release date unavailable, or Watched ·
Release date unavailable for watched entries. Missing metadata is not treated
as an announcement of a future release. Watched entries show no release
countdown. Metadata refreshes preserve known valid dates when a newer
provider response omits them; no dates are invented.

Build/type compilation and synthetic serialized-size calculations only.
No user history was read, no sync groups were created or modified, and no
authenticated pairing/playback tests were performed during development.
