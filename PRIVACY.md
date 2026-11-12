# What Next? Privacy Policy

_Last updated: November 2026. This page describes what the app does with your data. It was written from what the app's code does; the developer should review it before relying on it as a legal document._

**What Next?** is an Android app by Tokyo Brotherhood that helps you pick what to watch or read next from your AniList lists. It has no servers of its own, no accounts of its own, no ads, no analytics and no crash reporting.

## What stays on your phone
- Your AniList login token and username, so you stay signed in. On Android the token is kept in the phone's encrypted storage (protected by a key in the Android Keystore) when your build includes the secure add-on; the release text and the bug report say whether it does. Otherwise it is kept in the app's own storage.
- Saved copies of what the app loaded (your lists, profile and statistics, titles and pages you opened, the airing calendar), so screens open quickly and work offline. These delete themselves: cards and pages after 3 days, the calendar after 7 days, and your lists and profile after 14 days.
- Your settings, hidden titles, daily counts, recent chat searches, and changes that are waiting to sync. Each waiting change remembers which AniList account it belongs to, so it is never sent to a different account.
- If you choose one, the background picture for your Anime and Manga lists (shrunk and kept only on the phone; it is removed when you log out).
- If you turn on **Triple Sync**: the AniList and MyAnimeList keys and tokens you enter, and an optional Discord webhook address.

None of this is sent to the developer. The app keeps itself out of Android backups and phone-to-phone transfers, so your login and keys are not copied that way. The bug report you can copy from About lists the app build, the screen size, recent errors and the last 30 steps (which screens you opened and, for each AniList request, only its name and status number). It is only text you copy yourself; it never contains your login, list contents or request details. If you do not open the app for 14 days, it signs you out and removes your account data from the phone. **Log out** removes it at once. Uninstalling the app removes everything.

## Who the app talks to
- **AniList** (anilist.co, graphql.anilist.co): you log in on AniList's own page; the app then reads and changes your lists and settings on your behalf. Titles and pictures come from AniList. AniList's own terms and privacy policy apply to that data.
- **GitHub** (api.github.com): only when you tap **Check for updates** or **What's new**, to read the latest release of this app.
- **MyAnimeList** and **Discord**: only if you set up Triple Sync, and only with the details you entered.
- **YouTube / Dailymotion**: only when you tap a trailer link; it opens in your browser.

## Your choices
You can log out, clear saved data (Settings > Account), or uninstall the app at any time. To remove the app's access to your AniList account, remove it in AniList's settings under Apps.

## Contact
Open an issue at https://github.com/tokyo720022-create/What-Next/issues
