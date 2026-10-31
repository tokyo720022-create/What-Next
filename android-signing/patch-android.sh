#!/usr/bin/env bash
# Run from the repo root after "npx cap add android". Usage: patch-android.sh VERSION_NAME VERSION_CODE
# 1) sets the app version, and stops with a clear message if the number could not be set
# 2) signs every build with android-signing/debug.keystore, set explicitly in build.gradle, so a new APK installs over the old one
set -euo pipefail
NAME="${1:?version name}"; CODE="${2:?version code}"; G=android/app/build.gradle
fail(){ echo "::error::$1"; exit 1; }
[ -f "$G" ] || fail "$G was not found. Run 'npx cap add android' first."
[ -f android-signing/debug.keystore ] || fail "android-signing/debug.keystore is missing. Upload it again, or every build gets a new key and cannot update the old one."
sed -E -i "s/versionCode[ =]+[0-9]+/versionCode $CODE/; s/versionName[ =]+\"[^\"]*\"/versionName \"$NAME\"/" "$G"
grep -Eq "versionCode[ =]+$CODE([^0-9]|$)" "$G" || fail "Could not set versionCode $CODE in $G, so Android may refuse to update the app. The Capacitor template may have changed."
grep -Fq "versionName \"$NAME\"" "$G" || fail "Could not set versionName $NAME in $G."
cp android-signing/debug.keystore android/app/shared-debug.keystore
mkdir -p "$HOME/.android" && cp android-signing/debug.keystore "$HOME/.android/debug.keystore"   # the default place too
if ! grep -q "shared-debug.keystore" "$G"; then
cat >> "$G" <<'GRADLE'

// Every build is signed with the same key (android-signing/debug.keystore), so a new APK installs over the old one.
android {
    signingConfigs {
        debug {
            storeFile file("shared-debug.keystore")
            storePassword "android"
            keyAlias "androiddebugkey"
            keyPassword "android"
        }
    }
}
GRADLE
fi
echo "Version $NAME (code $CODE), signed with the shared key."
