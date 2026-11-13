#!/usr/bin/env bash
# Rebuilds the Rust core for Android and regenerates the Kotlin bindings.
set -euo pipefail
cd "$(dirname "$0")/../core"
export PATH="$HOME/.cargo/bin:$PATH"
export ANDROID_NDK_HOME="${ANDROID_NDK_HOME:-$HOME/Android/Sdk/ndk/27.2.12479018}"

cargo test
cargo ndk -t arm64-v8a -t armeabi-v7a -o ../app/src/main/jniLibs build --release

# UniFFI reads its metadata from symbols, so bind against an unstripped host build.
cargo build
out="$(mktemp -d)"
cargo run -q --bin uniffi-bindgen generate --no-format \
  --library target/debug/libtrack_core.so --language kotlin --out-dir "$out"
mkdir -p ../app/src/main/java/uniffi/track_core
cp "$out/uniffi/track_core/track_core.kt" ../app/src/main/java/uniffi/track_core/
echo "core built"
