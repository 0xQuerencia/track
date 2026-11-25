# Install the collectors

Use the build artifacts from the **Package Pulse collectors** workflow. Verify the SHA-256 manifest first with `sha256sum -c SHA256SUMS`. These are CI artifacts, not signed browser store releases.

## Browser
Unzip the Chromium artifact, open the extensions page, enable developer mode and load the unpacked folder. Firefox: open about:debugging, This Firefox, Load Temporary Add-on, choose manifest.json. Temporary Firefox installation does not persist across browser restarts. Pair each browser with its own token from Activity → Pair and manage devices. Enable site rules or blocking only when you want them.

## Linux X11
Install Node 22+, xprintidle, xdotool and (for optional categorization) xprop using your OS package manager. From the extracted Linux collector folder:

```sh
install -d -m 700 ~/.local/share/track-pulse ~/.config/track-pulse ~/.config/systemd/user
install -m 600 collector.mjs queue.mjs activitywatch.mjs editor.mjs ~/.local/share/track-pulse/
install -m 600 track-pulse.service ~/.config/systemd/user/
# Do not replace an existing credential file.
test -e ~/.config/track-pulse/env || install -m 600 env.example ~/.config/track-pulse/env
systemctl --user daemon-reload
```

Edit the private environment file, set the HTTPS origin, dedicated activity-only token and TRACK_PULSE_ENABLED=1. The graphical session needs DISPLAY, XAUTHORITY (if used) and XDG_SESSION_TYPE in its systemd user environment. Import the variables from your X11 session as appropriate. Verify with `node ~/.local/share/track-pulse/collector.mjs --dry-run`, then start with `systemctl --user enable --now track-pulse.service`. Inspect errors via `journalctl --user -u track-pulse.service`. No root service is needed. Wayland requires supported ActivityWatch observations; the X11 collector deliberately does not guess Wayland activity.

Stop and disable with `systemctl --user disable --now track-pulse.service`, revoke the token in Track, and remove local files if desired. Removing the state directory discards unsynced events; erasing server activity is a separate choice. Never remove another live collector's lock file.

Android is built separately from the Android project and requires explicit Usage Access permission. Windows/macOS native watchers are not included; the browser and explicit editor adapter are cross-platform where supported.
