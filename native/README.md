# Native add-on (Kotlin)

`kotlin/WnSecurePlugin.kt` is a small Capacitor plugin called **WnSecure**. It keeps the AniList login token in Android's
encrypted storage (a key held in the Android Keystore) instead of the app's plain `localStorage`.

A second part of the add-on, **WnNotify** (`kotlin/WnNotifyPlugin.kt` and `kotlin/WnPollWorker.kt`), checks AniList for new notifications about every
30 minutes with Android WorkManager and shows a phone notification for each new one (a sequel added, a title on your list changed or merged, optionally
likes, replies and follows). It reads the login from the same encrypted store, only reads (it never marks anything read), and its first run only
remembers the time, so old notifications never flood the phone. Tapping an alert opens `whatnext://notifications`, which the app turns into its
Notifications screen. `python3 native/apply-addon.py android --secure-only` applies only the login storage: the workflow uses that when the build with
the alerts fails, so a mistake in the alert code can never cost you the secure login. **Release reminders do not use this add-on**: they use the official
`@capacitor/local-notifications` plugin (see the main README), so they keep working even when the add-on is missing.

**WnImage** (`kotlin/WnImagePlugin.kt`) shares, copies or saves the taste report picture: share and copy write one PNG to the app's cache and hand out a `content://` address through Capacitor's own FileProvider (`<applicationId>.fileprovider`); save inserts the picture into MediaStore under Pictures/What Next.

**WnLock** (`kotlin/WnLockPlugin.kt`) supports the Triple Sync lock: `available` and `unlock` show Android's own fingerprint, face or screen-lock prompt (androidx.biometric; screen lock is allowed from Android 11), and `secure` turns FLAG_SECURE on or off so the page is hidden from screenshots and the recent-apps view. The PIN itself is handled by the app.

**Widgets** (`kotlin/WnWidgetPlugin.kt`, `WnWidgetStore.kt`, `WnWidgetKit.kt` and the five providers `WnAiringWidget`, `WnContinueWidget`, `WnUpdatesWidget`, `WnStreakWidget`, `WnPickWidget`, with `widgets/res` for their layouts, drawables, provider infos and strings, and `widgets/manifest-receivers.xml` for the manifest). The app calls `WnWidget.update({ json })` with a snapshot; the store keeps it in SharedPreferences and `refreshAll` redraws every widget. Each provider draws on a background thread (`goAsync`), looks resources up by name (no dependency on the generated R class) and decides how many rows, tiles or covers to show from the widget's size. The add-on script copies `widgets/res` into `app/src/main/res` and inserts the receivers before `</application>`; with `--secure-only` none of it is added.

It is **optional**. The GitHub build runs `python3 native/apply-addon.py android` after `cap sync`. If that script, or the
Gradle build that follows, fails, the workflow builds again **without** the add-on and says so in the release text
("Native add-on: no"). The app detects the plugin at start (`secureStore()` in `js/core/auth.js`); without it the login
stays in `localStorage`, exactly as before. The bug report (About) shows "Secure login storage: on/off".

Files: `kotlin/WnSecurePlugin.kt` (the login storage plugin), `kotlin/WnNotifyPlugin.kt` and `kotlin/WnPollWorker.kt` (background alerts), `android-res/drawable/ic_stat_whatnext.xml` (the small bell in the status bar, copied by the workflow), `apply-addon.py` (adds it to the generated Android project; checks
everything first and writes nothing if a check fails), `tests/unit/native-addon.test.js` (tests the script on sample
projects and checks the Kotlin file).

The Kotlin code cannot be compiled or run in the test setup here, so the GitHub build is its real test.
