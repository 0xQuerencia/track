# Pulse Linux collector (X11)

Requires Node 22+, xprintidle and xdotool; optional xprop for local app category rules. Run in your own graphical X11 session, not as root. No window titles, raw process names, URLs, screenshots or keyboard content are sent. Without category rules even WM_CLASS is not read. Wayland is reported as unsupported, not silently misclassified. Sampling is conservative; unknown and idle gaps are not counted.

1. Create a dedicated **activity:write** token in Track Settings.
2. Put TRACK_PULSE_URL=https://your-track-host and TRACK_PULSE_TOKEN=... in a private environment file (0600); set TRACK_PULSE_ENABLED=1 only when you choose to collect.
3. Optionally set TRACK_PULSE_APP_MAP to a JSON map of WM_CLASS to Study, Coding, Media, Social, Games or Other, after category ingestion is available.
4. Run `node collector.mjs --dry-run` first; `node collector.mjs` runs the watcher. Stop with Ctrl+C.
5. A bounded local outbox in XDG_STATE_HOME/track-pulse/desktop.json (or ~/.local/state/track-pulse/) stores unsent intervals, not secrets. A lock prevents simultaneous writers; if a hard crash leaves a stale lock, verify that no collector is running before removing it. Revoke the token in Track to stop future ingestion.

Tests: `node --test collector.test.mjs`. Manual X11 session and offline recovery smoke tests remain required.
