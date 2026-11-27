# Android launcher device smoke

Use a test Android device or emulator supported by the APK (arm64-v8a / armeabi-v7a) and a disposable HTTPS Track instance. Use only synthetic data and a test phone API token. No production account or default launcher change is needed for most checks.

1. Download the exact **track-android-debug** artifact for the commit, and check `sha256sum -c SHA256SUMS`. Install it with `adb -s <test-device-serial> install -r track-android-debug.apk`. If Android rejects a signing-key mismatch, use a separate test device/profile. Do not uninstall an existing install that has offline changes you need.
2. Open Track from Apps. Confirm the home screen, drawer and settings open (including with TalkBack), and Back closes only an open drawer or settings. Where supported, try font size 200% and rotate the screen. Launch an unrelated installed app from the drawer.
3. Try an unpaired install with a wrong token. It should return **Token rejected** and leave pairing unchanged. Enter the synthetic server origin and correct token. The home view should show its sample task. From Settings, retry with a wrong replacement token, then leave the token blank and verify the original saved connection still works. A different origin must be refused before sending any local record.
4. Turn on airplane mode. Add a clearly synthetic task and complete a sample habit. Start the phone focus timer, wait at least one full minute, then explicitly save. Verify the home view shows the local changes. Force-stop and reopen with airplane mode still on: saved records should still be visible. Start and discard a second timer and verify its time was not logged.
5. Restore network, open Settings and verify/sync (or wait for WorkManager). Confirm the disposable web account has the new task and focus entry exactly once and the launcher no longer shows queued edits. Switch away and return. Re-sync and confirm no duplicate entry.
6. On a test profile, optionally grant Usage access and check permission loss. Verify optional local launch protection can be ended instantly and that app links/notifications are not claimed as blocked. Do not enable this on someone's day-to-day device for a smoke test.

Record the exact source SHA and artifact checksum, Android version/ABI, each passing case, and the first observed failure. A successful Gradle assemble alone is not a device smoke.
