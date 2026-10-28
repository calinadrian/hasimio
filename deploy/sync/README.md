# Deploy Hasimio device sync

This is a standalone relay and web UI. It stores encrypted library, playback progress, extension configuration, and player settings. It does not run the torrent engine or make the desktop engine public.

## Public deployment

You need a server with Node.js 24 or newer, a domain pointing to it, and an HTTPS reverse proxy such as Caddy or nginx. The relay has no npm dependencies.

1. Run `npm run package:sync` and copy `release/Hasimio-Sync-VERSION.zip` to the server. Unzip it.
2. Set `HASIMIO_SYNC_PUBLIC_URL=https://YOUR_DOMAIN`, `HASIMIO_SYNC_DATA_DIR` to a persistent folder, and `HASIMIO_SYNC_TRUST_PROXY=1`. Then run `npm start` under a process manager (for example a systemd service with `Restart=always`) so it restarts after crashes and reboots.
3. Point the HTTPS proxy at `127.0.0.1:8787`, and keep that port closed to the internet.
4. Open `https://YOUR_DOMAIN/api/sync/info`; it should return `version: 1` and your HTTPS app address.
5. For desktop distribution, set `VITE_SYNC_URL=https://YOUR_DOMAIN` when building the app once. The hosted web UI discovers its own service automatically. Users open **Sync devices → Start syncing** without entering an address or device name. For a custom installation, the address can be changed under **Advanced settings**.
6. Save the recovery key file privately. Choose **Connect another device** for a QR/link, or **Enter TV code** to approve a code shown under **Connect this device** on a TV.

The proxy handles TLS certificates; only it should be public. The package contains only the built web UI and the relay, static-file, and sync-protocol modules.

The app now includes the public Hasimio service at `https://hasimio-sync.aqualoom256.chatgpt.site`. The instructions above are for publishers who prefer their own relay. Normal users need no hosting setup.

## Development

Build the web UI with `npm run build`, then run `npm run sync:relay` from the repository root. It listens only on `127.0.0.1:8787` by default. Set `HASIMIO_SYNC_PUBLIC_URL=http://127.0.0.1:8787` for local QR links. HTTP works only on loopback during development because encryption requires a secure browser context. Use public HTTPS for phones and TVs.

Optional configuration:

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `8787` | Relay listening port |
| `HASIMIO_SYNC_HOST` | `127.0.0.1` | Bind address |
| `HASIMIO_SYNC_DATA_DIR` | `.sync-data` | Persistent encrypted state directory |
| `HASIMIO_SYNC_PUBLIC_URL` | unset | Canonical public HTTPS origin serving this UI and API |
| `HASIMIO_SYNC_UI_DIR` | `dist` | Built web UI directory |
| `HASIMIO_SYNC_TRUST_PROXY` | unset | Set to `1` only behind your trusted proxy; uses forwarded client IPs for rate limits |
| `VITE_SYNC_URL` | unset | Optional build-time default service address in the app |

Do not expose the relay port directly when proxy trust is enabled. With proxy trust, the relay rate-limits by the **last** `X-Forwarded-For` entry, which is the address your proxy appended. Your proxy must append the client address (Caddy and nginx `$proxy_add_x_forwarded_for` do). If more than one proxy sits in front, make the outermost one replace the header.

## Storage and recovery

`HASIMIO_SYNC_DATA_DIR` holds per-space JSON snapshots written with atomic replacement. Persist and back up this folder; deployments and relay restarts retain data. Pairing requests and QR invitations are intentionally memory-only, single-use/temporary, and expire in five minutes. A relay restart requires generating a new pairing code or link, without affecting already-linked devices.

Each space supports 20 devices; relay creation is rate limited and capped at 10,000 spaces. Each encrypted snapshot is capped at 900 KB, the same limit as the hosted service, so a space can move between them. Playback history is capped at 500 entries, and removal records expire after 90 days, which keeps snapshots well below that limit. The relay uses one process per data directory; do not run multiple replicas against the same JSON storage. Add a transactional shared database before horizontal scaling.

## Data and pairing

- AES-256-GCM encrypts sync snapshots on the client. The relay never receives the snapshot decryption key.
- Each device has a separate random bearer token; the relay stores its SHA-256 hash. Unlinking a TV revokes that token. A revoked device retains data it already downloaded; unlinking blocks further access. The space encryption key is not rotated on unlink, so a removed device that later obtains ciphertext (for example from a relay backup) could still read it. A device created with the recovery code keeps that code until a new space is started.
- QR links carry the decryption key in a URL fragment and a five-minute, single-use invitation. The fragment is removed from the address bar once opened. Treat the pairing QR/link as private.
- TV pairing uses a six-digit, rate-limited request code and a separate random polling token. An existing device previews the TV name and an 8-character security check derived from the TV's ephemeral public key, and the user approves only when it matches the one on the TV. Ephemeral P-256 ECDH encrypts the credential bundle to the requesting TV. The TV then shows a second check derived from the approving device's ephemeral key, which the approving device also shows, and it joins only after the user confirms that one too. Together, the two checks stop a relay from substituting its own key in either direction.
- The relay serves the web UI that reads pairing links. For browser users, end-to-end encryption therefore depends on the relay operator serving unmodified code. The desktop app bundles its own UI and does not depend on this.
- Recovery codes contain both the encryption key and a separate recovery credential. They are shown only on the creating/recovering device, not shared automatically to paired TVs. They grant full recovery access; protect them like a password.
- Offline changes use per-item timestamps with device tie-breaking and removal records kept for 90 days. A device that stays offline longer can restore items removed in the meantime. An old device does not restore a title simply because it refreshed metadata. Concurrent edits to different settings merge; the latest edit to the same item wins, including rewinding playback.
- Provider metadata caches, downloaded video, subtitles loaded from local files, engine network addresses, fullscreen state, and device tokens are not synced.

## Verification

`npm test` covers encryption/tampering, real client-to-relay flows, QR redemption, ephemeral TV pairing, code expiration, authorization, revocation, recovery, revision conflicts, restart persistence, and offline removal/progress merging. The relay tests use disposable files under `.cache/` and no public services.
