# IPTV-org channel checks

Live TV uses `server/iptv-org-verified.mjs`, a snapshot of English and Romanian
IPTV-org entries that passed a playback check. The source is the main playlist,
intersected by stream URL with IPTV-org's official `languages/eng.m3u` and
`languages/ron.m3u` playlists. A channel keeps only the streams IPTV-org
classifies in one of those languages, and reports them in its `language` field
(`eng`, `ron` or `eng+ron`). Language classification comes from IPTV-org;
programs are not transcribed.

To download fresh playlists, check every English and Romanian entry, and replace
the snapshot:

```powershell
node scripts/audit-iptv-org.mjs --download --apply
```

The checker requests playlists, keys, and segments through Hasimio's proxy and
uses FFmpeg to decode two seconds of H.264 video and available audio. Each stream
has a 25-second limit. Unsupported formats, other video codecs, unavailable
streams, and streams blocked on this connection are excluded. This is a short
sample check, not a guarantee of uninterrupted playback or browser compatibility.

Progress and failure details are saved in `.cache/iptv-org-audit/report.json`.
To resume against the same downloaded playlists after an interruption:

```powershell
node scripts/audit-iptv-org.mjs --resume --apply
```

Rebuild and install the app after replacing the snapshot. The catalog does not
automatically admit new, unchecked streams. The existing Cool-eTv channels are
separate from this filter.
