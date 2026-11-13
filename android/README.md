# Track Launcher

A fast Android home-screen launcher that doubles as the phone side of [Track](https://github.com/0xQuerencia/track), a self-hosted life dashboard. Your priorities, exam countdown, habits and next chapter live on the home screen and sync with your own server. Works offline and catches up when you reconnect.

- **Kotlin + Jetpack Compose** shell: home screen, dock, searchable app drawer (long-press to hide, pin, uninstall), settings. No Material library, no image loader, no DI framework.
- **Rust core** (`core/`, exposed to Kotlin via UniFFI): local SQLite cache, an outbox of changes made offline, and the logic that builds the home screen. It does no networking; Kotlin moves JSON between your server and the core.
- Release APK is about 5 MB.

## Status

Early. Working: home screen, dock, drawer, offline-first sync of tasks, habits, chapters and focus/study logs. Planned: Study Mode with app blocking during sessions, per-app limits, reminders, Google Calendar sync, flashcards when you doomscroll.

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
2. In the launcher, open Settings (the sliders icon), enter the server address and the token, tap **Save and sync**.
3. Settings → **Choose default home app** to make it your launcher. To go back, pick your old launcher in the same place.

The token is stored encrypted with a key held in the Android Keystore.

## Layout

```
core/    Rust: store, sync outbox, home view logic, tests
app/     Android app (Compose UI, sync worker, app list)
scripts/ build-core.sh
```

## License

MIT. See `NOTICE.md` for font licenses.
