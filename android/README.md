# Track Launcher

A fast Android home-screen launcher that doubles as the phone side of [Track](../web), a self-hosted life dashboard. Your priorities, exam countdown, habits and next chapter live on the home screen and sync with your own server. Works offline and catches up when you reconnect.

- **Kotlin + Jetpack Compose** shell: home screen, dock, searchable app drawer (long-press to hide, pin, uninstall), settings. No Material library, no image loader, no DI framework.
- **Rust core** (`core/`, exposed to Kotlin via UniFFI): local SQLite cache, an outbox of changes made offline, and the logic that builds the home screen. It does no networking; Kotlin moves JSON between your server and the core.
- Release APK is about 5 MB.

## Status

The launcher supports a home screen, dock, app drawer, and offline sync for tasks, habits, chapters and logged sessions. The phone timer is self-reported and does not monitor apps. A separate voluntary focus guard covers launches initiated from Track, not system-wide app use. Planned: reminders, per-app limits and Calendar sync.

## Build

You need JDK 21, the Android SDK (platform 37), the NDK, Rust with the Android targets and `cargo-ndk`.

```bash
rustup target add aarch64-linux-android armv7-linux-androideabi
cargo install cargo-ndk
export ANDROID_HOME=~/Android/Sdk JAVA_HOME=/path/to/jdk21

./scripts/build-core.sh          # tests, cross-compiles the core, generates Kotlin bindings
./gradlew :app:assembleRelease   # app/build/outputs/apk/release/app-release.apk
adb install -r app/build/outputs/apk/release/app-release.apk
```

The release build is signed with your local debug key, which is fine for sideloading.

## Connect it to Track

1. On your Track server set `TRACK_API_TOKEN` (24+ characters) and serve Track over HTTPS.
2. In the launcher, open Settings (the sliders icon), enter the bare HTTPS server address (no path) and the phone API token, and tap **Verify connection and sync**.
3. Settings → **Choose default home app** to make it your launcher. To go back, pick your old launcher in the same place.

Track checks an authenticated server snapshot before saving the connection or sending any offline edits. It stores the token encrypted with a key held in Android Keystore. Leave the token field blank to use the saved token, or enter a replacement after you rotate it on the same server.

The app uses one local cache and outbox for its server. To move to a different origin, first sync and back up any local work you want to keep, then deliberately clear Track's app storage from Android Settings and pair again. This also clears launcher and Pulse settings. Track never automatically resends that cache or outbox to another server.

If you're offline, changes remain queued. A transient response leaves them queued for the next sync. Track reports permanent refusals instead of labeling them synced. A malformed snapshot or acknowledgement cannot clear cached records or silently remove queued work.

## Layout

```
core/    Rust: store, sync outbox, home view logic, tests
app/     Android app (Compose UI, sync worker, app list)
scripts/ build-core.sh
```

## License

MIT (see the repo root). See `NOTICE.md` for font licenses.

## Optional Pulse activity tracking

Use a separate scoped activity:write token from web Settings, not the phone sync token. In launcher Settings, grant Android usage access, enter the HTTPS origin and activity token, then explicitly enable Pulse. Only closed observed activity intervals are uploaded; app/package names and content are never included. The WorkManager job samples recent usage history, persists a bounded offline queue and retries with stable IDs. No pre-enablement history is collected. Android may delay jobs, deny permission or omit events; missing time is unknown. Disabling clears local credentials and unsent data, not already-uploaded server records; revoke or erase those separately in Track. An in-flight request may finish before cancellation.

## Phone focus timer

Open **Phone focus timer** on the home screen and tap **Start 25 min** or **Start 50 min**. You can save completed whole minutes (capped at the planned duration) or discard the timer without logging anything. If offline, saving uses the local database and outbox; reconnecting syncs the same operation. The timer uses foreground-independent elapsed time for the lifetime of the launcher process and does not claim to measure task attention. Force-stopping the app or rebooting closes an unsaved timer. Already-saved offline entries persist.

## Android readiness check

The [CI workflow](../.github/workflows/android-verify.yml) runs Rust and Android JVM tests, assembles a debug APK and uploads an expiring `track-android-debug` artifact with a SHA-256 checksum. It's a sideload build, not a store release. Run the [Android device smoke checklist](../docs/android-launcher-smoke.md) before calling a build release-ready.
