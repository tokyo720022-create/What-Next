#!/usr/bin/env bash
# Run after the build. Usage: verify-apk.sh APK VERSION_CODE VERSION_NAME
# Fails if the APK is not signed with the shared key, or does not carry the version we meant to build.
set -euo pipefail
APK="${1:?apk}"; CODE="${2:?version code}"; NAME="${3:?version name}"
fail(){ echo "::error::$1"; exit 1; }
[ -f "$APK" ] || fail "$APK was not built."
SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
find_tool(){ local t="$1"; if [ -n "$SDK" ] && ls "$SDK"/build-tools/*/"$t" >/dev/null 2>&1; then ls -d "$SDK"/build-tools/*/"$t" | sort -V | tail -1; else command -v "$t" || true; fi; }
APKSIGNER="${APKSIGNER:-$(find_tool apksigner)}"; AAPT2="${AAPT2:-$(find_tool aapt2)}"
if [ -z "$APKSIGNER" ]; then echo "::warning::apksigner was not found, so the signing key was not checked."; else
  OUT="$("$APKSIGNER" verify --print-certs "$APK")" || fail "The APK signature is not valid."
  GOT="$(printf '%s\n' "$OUT" | awk '/certificate SHA-256 digest/ && !d {print $NF; d=1}' | tr 'A-F' 'a-f')"
  WANT="$(tr -d ' \n' < android-signing/fingerprint.txt | tr 'A-F' 'a-f')"
  echo "Signing certificate SHA-256: $GOT"
  [ -n "$GOT" ] || fail "Could not read the signing certificate of the APK."
  [ "$GOT" = "$WANT" ] || fail "The APK is signed with a different key ($GOT) than the one in android-signing/fingerprint.txt ($WANT). It would not install over the previous build."
fi
if [ -z "$AAPT2" ]; then echo "::warning::aapt2 was not found, so the version was not checked."; else
  ALL="$("$AAPT2" dump badging "$APK")" || fail "aapt2 could not read the APK."
  B="$(printf '%s\n' "$ALL" | awk '/^package:/ && !d {print; d=1}')"; echo "$B"
  printf '%s\n' "$B" | grep -q "versionCode='$CODE'" || fail "The APK does not have versionCode $CODE, so Android may treat it as a downgrade."
  printf '%s\n' "$B" | grep -q "versionName='$NAME'" || fail "The APK does not have versionName $NAME."
fi
echo "APK checked: same signing key as every other build, version $NAME (code $CODE)."
