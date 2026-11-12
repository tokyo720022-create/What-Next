# Native add-on (Kotlin)

`kotlin/WnSecurePlugin.kt` is a small Capacitor plugin called **WnSecure**. It keeps the AniList login token in Android's
encrypted storage (a key held in the Android Keystore) instead of the app's plain `localStorage`.

It is **optional**. The GitHub build runs `python3 native/apply-addon.py android` after `cap sync`. If that script, or the
Gradle build that follows, fails, the workflow builds again **without** the add-on and says so in the release text
("Native add-on: no"). The app detects the plugin at start (`secureStore()` in `js/core/auth.js`); without it the login
stays in `localStorage`, exactly as before. The bug report (About) shows "Secure login storage: on/off".

Files: `kotlin/WnSecurePlugin.kt` (the plugin), `apply-addon.py` (adds it to the generated Android project; checks
everything first and writes nothing if a check fails), `tests/unit/native-addon.test.js` (tests the script on sample
projects and checks the Kotlin file).

The Kotlin code cannot be compiled or run in the test setup here, so the GitHub build is its real test.
