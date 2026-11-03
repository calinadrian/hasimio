Adds diagnostics for a lightweight PC monitor.

- Run TV Monitor.cmd on Windows to watch the TV's buffer cap, fresh download
  bytes, video reads, evictions, peers, memory and cleanup after stopping.
- Add a small TV heartbeat and an in-memory record of service/provider/UI
  errors, video stalls, read timeouts and cleanup faults. No diagnostic files
  are written to the TV; its event history is capped at 40 entries.
- Keep rotating logs and downloadable reports on the PC. Monitoring uses the
  existing Developer Mode SSH connection and does not start test downloads.
- Prevent requests already in flight when caches are cleared from filling
  the metadata cache again with their old results.

The PC dashboard includes an explicit Clear buffers & stop playback button.
Ordinary polling does not alter playback. Native decoder memory cannot be
inspected, and monitoring cannot guarantee that the app has no bugs.
