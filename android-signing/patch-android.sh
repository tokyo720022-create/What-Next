#!/usr/bin/env bash
# Run from the repo root after "npx cap add android". Usage: patch-android.sh VERSION_NAME VERSION_CODE
# 1) sets the app version, and stops with a clear message if the number could not be set
# 2) signs every build with YOUR secret key, so a new APK installs over the old one. The key is NOT in the repo: it comes from two
#    GitHub Secrets (Settings > Secrets and variables > Actions), passed in as environment variables:
#      ANDROID_KEYSTORE_BASE64    the key file as one line of base64
#      ANDROID_KEYSTORE_PASSWORD  its password (the key inside uses the same one)
set -euo pipefail
NAME="${1:?version name}"; CODE="${2:?version code}"; G=android/app/build.gradle; ALIAS=whatnext
fail(){ echo "::error::$1"; exit 1; }
[ -f "$G" ] || fail "$G was not found. Run 'npx cap add android' first."
[ -n "${ANDROID_KEYSTORE_BASE64:-}" ] || fail "The GitHub secret ANDROID_KEYSTORE_BASE64 is missing. Add it in the repo: Settings > Secrets and variables > Actions > New repository secret."
[ -n "${ANDROID_KEYSTORE_PASSWORD:-}" ] || fail "The GitHub secret ANDROID_KEYSTORE_PASSWORD is missing. Add it in the repo: Settings > Secrets and variables > Actions > New repository secret."
sed -E -i "s/versionCode[ =]+[0-9]+/versionCode $CODE/; s/versionName[ =]+\"[^\"]*\"/versionName \"$NAME\"/" "$G"
grep -Eq "versionCode[ =]+$CODE([^0-9]|$)" "$G" || fail "Could not set versionCode $CODE in $G, so Android may refuse to update the app. The Capacitor template may have changed."
grep -Fq "versionName \"$NAME\"" "$G" || fail "Could not set versionName $NAME in $G."
KS=android/app/release.keystore
printf '%s' "$ANDROID_KEYSTORE_BASE64" | tr -d ' \r\n' | base64 -d > "$KS" 2>/dev/null || fail "ANDROID_KEYSTORE_BASE64 is not valid base64. Paste the secret again, all on one line."
[ -s "$KS" ] || fail "ANDROID_KEYSTORE_BASE64 is empty after decoding."
if command -v keytool >/dev/null 2>&1; then
  LIST="$(keytool -list -v -keystore "$KS" -storepass:env ANDROID_KEYSTORE_PASSWORD -alias "$ALIAS" 2>&1)" || fail "The signing key could not be opened. Either ANDROID_KEYSTORE_PASSWORD is wrong, or the key inside is not named '$ALIAS'."
  GOT="$(printf '%s\n' "$LIST" | awk '/SHA256:/ && !d {print $2; d=1}' | tr -d ':' | tr 'A-F' 'a-f')"
  WANT="$(tr -d ' \n' < android-signing/fingerprint.txt | tr 'A-F' 'a-f')"
  [ "$GOT" = "$WANT" ] || fail "The key in your GitHub secrets (SHA-256 $GOT) is not the key this repo expects ($WANT, in android-signing/fingerprint.txt). A different key could not update the installed app. Fix the secrets, or put the new fingerprint in that file if you changed the key on purpose."
fi
if ! grep -q "signingConfigs.shared" "$G"; then
cat >> "$G" <<'GRADLE'

// Every build is signed with the secret key from GitHub Secrets (never stored in the repo), so a new APK installs over the old one.
android {
    signingConfigs {
        shared {
            storeFile file("release.keystore")
            storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")
            keyAlias "whatnext"
            keyPassword System.getenv("ANDROID_KEYSTORE_PASSWORD")
        }
    }
    buildTypes {
        debug { signingConfig signingConfigs.shared }
        release { signingConfig signingConfigs.shared }
    }
}
GRADLE
fi
echo "Version $NAME (code $CODE), signed with the secret key."
