#!/usr/bin/env bash
# Makes a brand new signing key for the app. Run it on any computer that has Java (keytool).
# It prints the two values for GitHub Secrets and the fingerprint for android-signing/fingerprint.txt.
# Nothing is saved inside the repo. Delete the printed key file once you have pasted the values.
set -eu
command -v keytool >/dev/null 2>&1 || { echo "keytool (part of Java) is needed."; exit 1; }
DIR="$(mktemp -d)"; KS="$DIR/whatnext-release.p12"
PASS="$(head -c 96 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 32)"
keytool -genkeypair -alias whatnext -keyalg RSA -keysize 4096 -validity 36500 -storetype PKCS12 -keystore "$KS" -storepass "$PASS" -keypass "$PASS" -dname "CN=What Next, O=What Next, C=US" >/dev/null 2>&1
FP="$(keytool -list -v -keystore "$KS" -storepass "$PASS" 2>/dev/null | awk '/SHA256:/ && !d {print $2; d=1}' | tr -d ':' | tr 'A-F' 'a-f')"
echo "1. GitHub secret ANDROID_KEYSTORE_PASSWORD:"; echo "$PASS"; echo
echo "2. GitHub secret ANDROID_KEYSTORE_BASE64 (one line):"; base64 < "$KS" | tr -d '\n'; echo; echo
echo "3. Put this in android-signing/fingerprint.txt (it is public, not a secret):"; echo "$FP"; echo
echo "The key file is at $KS. Keep a private backup of it somewhere safe, then delete it from this folder."
