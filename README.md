# What Next?

**Version 2.1.1** · Company: Tokyo Brotherhood · Creator: Hariharasuthan Karunakaran · Contributor: Claude (AI)

A phone-friendly web app that picks what to watch or read next from your [AniList](https://anilist.co), based on how much time you have.

The web version is plain HTML, CSS and JavaScript with no build step and no dependencies: a thin `index.html` loads the rest of the files. Host it on GitHub Pages and add it to your home screen, or build the Android app (APK) with the included GitHub workflow.

There are six tabs along the bottom: **Pick**, **Anime**, **Manga**, **Discover**, **Schedule**, and **Profile** (Stats, Chat, and Settings live inside Profile).

## Features

- **Pick for me:** choose Watch, Read, or Either, then how much time you have (15 min, 30 min, 1 hour, 2 hours). It suggests something from your Watching, Reading, Repeating, and Planning lists that fits, and tells you which episodes or chapters to do. Titles that are not released yet are never suggested, and for a show that is still airing it only offers episodes that have already aired.
- **Something new for my taste:** a button under Surprise me and Build a lineup. It picks an anime or manga that suits your taste report (your top genres and strongest themes) and is **not on any of your lists**; AniList filters out everything you already have, and unreleased titles are skipped. It follows the Watch/Read, time, genre and 18+ filters, with Another, Hide, and Add to Planning.
- **Genre filter:** the genre chips are built from what's actually in your list.
- **18+ filter:** show everything, only 18+ titles, or hide 18+ titles.
- **Discover tab:** one search box that searches by itself as you type (no Find button). Pick what to search with the chips: Anime, Manga, Characters, Staff, Studios, or Users. With the box empty, the same list is **Explore**: a ranked list for that type (popularity for titles, favourites for people). The filter button has every option: sort, genres, tags, year, season, format, status, country, source, on or off your list, and 18+ (hidden by default). Four tiles sit under the search box:
  - **Seasonal:** the seasonal chart for any year and season, grouped by format, with sort and order, and Hide or Only series on your list.
  - **Calendar:** a month grid of posters (up to four a day, then +N), like a TV guide. Tap a day for the week list: a day strip, then cards with the air time, title, episode and your list status. A tick button marks an aired episode as watched when it is the next one you can watch. Chips filter to Premieres (episode 1) or Finales; the filter button limits to your Watching and Planning list, the current season, or shows adult content. Tap the month to jump, the date button for today, and the grid button to switch views.
  - **For you:** trending titles in your favourite genres that are not on your list.
  - **Rediscover:** your paused and dropped titles, best rated first.
  Titles on your list show their real status, and + Planning only appears for titles that are not on your list.
- **Taste report:** a card on the Pick screen opens your taste report, for anime or manga. It compares your list with the most popular titles on AniList (the "average fan") and shows: an **archetype** from your strongest theme (for example *The Portal Hopper* for Isekai), a **theme index** of what you like far more or far less than the average fan, a four-letter **personality type** from four sliders (Niche or Mainstream, Retro or Fresh, Diverse or Specialized, Contrarian or Aligned) with hidden gems, newer or older picks, a genre mix and your biggest rating gaps with other fans, five **vibe** sliders (Grim or Wholesome, Heart or Brain, Dreamers or Schemers, Scrappy or Destined, Competitive or Loyal), and a Share button. The Contrarian slider needs at least 8 rated titles, and the report needs at least 8 started or finished titles. Adult titles count in the maths but never show as covers. The sample of popular titles is kept on your device for a week.
- **Mark as done:** save your progress to AniList straight from a pick. It marks a title Completed when you finish it, and moves a Planning title to Current.
- **Blur covers:** hides cover art when you're in public.
- **Anime and Manga lists:** your full AniList lists with status tabs, search, a filter sheet (sort, format, status, country, year, length, score, genres include/exclude) and list customisation (grid or list, columns, hide score or progress). Tap a card for quick view with +1 / -1 progress. If you use custom lists on AniList, a **Custom lists** button next to Search, Filter, and Customise opens a sheet with each list and how many titles it holds; pick one to see only its titles (it combines with the status tabs and search).
- **Swipe down to refresh:** pull down at the top of Pick, Anime, Manga, Discover, Seasonal, Calendar, Schedule, Stats, Taste report, or Profile to reload that screen from AniList.
- **Trending:** trending anime and manga carousels on the Pick screen.
- **Media pages:** tap any title for a full page with score, favourites, genres, synopsis, characters, info, tags with spoiler toggle, where to watch, staff, relations, and recommendations. Relations and recommendations open their own pages.
- **Character, staff, and studio pages:** tap a character, staff member, studio, or producer on a media page to open its own page, with Set as Favorite, voice actors, series or media, roles, and See more. Tapping a title inside those pages opens it, and the back button walks back through every page.
- **List editor:** status, progress stepper, score slider, start and finish dates, rewatches, priority, custom lists, notes, private, favourite, and remove. Reaching the last episode completes the entry and sets dates automatically.
- **People:** on your Profile, tap Following or Followers for the list (a Mutual badge marks people who follow you back; the three-dot menu can follow, unfollow, or open AniList). Tap anyone to open their profile: banner, avatar, counts, an affinity score from the scores you both gave to the same titles (needs 5 or more shared scores), their statistics, View Detail Statistics with the same charts as yours, Follow, and Message.
- **Profile:** your AniList banner and avatar (ring uses your AniList profile colour), a View on AniList button, anime, manga, following and followers counts, your anime and manga statistics, and your bio, with Stats, Chat, and Settings as tiles at the very bottom, under Tendencies. The banner and avatar are read from AniList; the AniList API does not let apps change them. It also has **Tendencies** (Anime or Manga: what you seem to love and hate, tags you like, favourite release years, the year you started, and your completion rate, worked out from your AniList stats) and **Favourites** with filters for Anime, Manga, Characters, Staff, and Studios (tap one to open it; Show more loads the rest).
- **Settings:** App Settings, AniList Triple Sync (only when Advanced features are on), account, and three pages that follow the AniList apps:
  - **App Settings** (this app only): a theme picker with eight anime themes (Sakura Flowers, One Piece, Naruto, Gintama, Dragon Ball, Bleach, Rent-a-Girlfriend, Attack on Titan; Sakura Flowers has soft petals and Gintama has Edo wave patterns), One Piece being the default; round or square profile pictures; text size; the opening logo screen; where "All" sits in the status chips; relative or exact air times; how titles from Japan, Korea, China and Taiwan are shown (Follow AniList, Romaji, English, Native); privacy (blur covers, hidden titles); and a reset.
  - **AniList Settings** (saved on your account, with a Save Changes bar): bio, profile colour, title language, staff and character naming, activity merge time, 18+ content, airing notifications, and only getting messages from people you follow.
  - **Account Settings:** who you are signed in as, buttons that open the right AniList pages (profile, account, import, app access, delete account), waiting changes, clearing saved lists and pictures, copying app info, and **Log out** (tap twice to confirm).
- **Login screen:** the logo over a soft animated background, what the app does, Log in or Create account, and a note that you log in on anilist.co and the app never sees your password.
- **AniList Triple Sync (advanced):** copies your list (the source: the account you are logged in with, or any AniList username) to a **second AniList account** and to **MyAnimeList**, for anime and manga. It is locked: it only appears in Settings, and only runs, when **App Settings > Advanced features** is switched on.
  - You bring your own keys. For the target AniList account, make an API client at anilist.co/settings/developer with the Redirect URL `https://anilist.co/api/v2/oauth/pin`, type its **client ID and client secret**, log in with the account to copy to, and paste the code AniList shows. For MyAnimeList, make an API app at myanimelist.net/apiconfig, type its **client ID** (and secret if it has one) and the same **redirect URL**, log in, and paste the link or code you are sent back with. Secrets and tokens stay on this device. MyAnimeList refuses requests from websites, so it works in the Android app only (the app uses native requests, see `CapacitorHttp` in `capacitor.config.json`). AniList's own token step may be blocked in a browser too, so use the Android app to connect.
  - What is sent: status, progress, volumes, score, rewatches, start and finish dates, notes and privacy (AniList) or the matching MyAnimeList fields. Titles need a MyAnimeList ID to go to MyAnimeList; those without one only go to AniList and are counted.
  - The first run to each target asks how to start: **copy my whole list** (overwrites matching titles there) or **only send changes from now on**. After that a fingerprint of each title is remembered per target, so only changed titles are sent, and a failed title is retried next time. Options: add titles that aren't on the target yet, also remove titles from the targets when you remove them here (off by default; a sudden mass disappearance is never mirrored), and sync when the app opens every 3 hours (never for a first run). There is a Stop button, and AniList and MyAnimeList are paced to stay within their rate limits.
  - It is the same logic as the AniList to MyAnimeList delta engines in the Anilist-triple-sync repository (`mal_sync_engine.py`, `mal_manga_sync_engine.py`) and its AniList write-back, moved into the app. The Discord webhook posting that the old Discord Sync page had was removed.
- **Schedule:** a countdown to the next episode of every airing anime on your list.
- **Stats:** two tabs. **Overview** shows your AniList statistics with anime and manga side by side (totals, genres, status, demographics, formats, tags, score spread). **Progress** shows today's goal ring and streak, a last 7 days chart, a Continue list with +1 buttons, and your backlog. The daily count includes episodes and chapters you update on AniList or other apps, read from your AniList activity (if you turned off list activity on AniList, only this app's updates count).
- **List Settings:** the same options as AniList's list settings page, saved to your account with Save Changes: scoring system and advanced scoring, default list order, split Completed by format, which list activity to stop creating, custom anime and manga lists (add or remove), and the section order (Start Reorder uses the up and down buttons). Removing a custom list also removes it from every title that uses it.
- **Relation map:** on a title's page, Relations > Relation map draws the whole franchise as a graph (source above, prequels above, sequels and side stories below). Toggle Core, Related, and Character links, zoom with the buttons or two fingers, tap a label or use Branches to fold a branch, switch to List view, and add titles to Planning straight from the map. Big franchises stop at about 90 titles (140 with Character links).
- **Offline:** installs to your home screen and shows your last saved list when you have no connection.
- **Chat:** one-to-one private messages with other AniList users, using AniList's own message system.
- **Login required:** you must log in with your AniList account. There is no guest mode.

## How picks work

- Anime episodes use the show's real episode length (24 minutes if AniList doesn't list one).
- Manga chapters are estimated at 6 minutes each. Change `MIN_PER_CHAPTER` in `js/core/core.js` if that doesn't suit you.
- Airing shows only offer episodes that have already aired.
- Titles you're already in the middle of are favoured over Planning ones, and higher-rated titles are favoured a little. There's some randomness, so **Show me another** gives you different picks.

## Setup

### 1. Host it

1. Upload `index.html`, `boot.js`, `config.js`, `sw.js`, `manifest.webmanifest`, and the `assets/`, `css/`, `js/`, and `views/` folders to the root of a GitHub repo (`sw.js`, the manifest, and `assets/` enable offline and home-screen install). From a phone, see *Getting the files into your repo from a phone* below.
2. Go to **Settings → Pages**, set the source to **Deploy from a branch**, choose `main` and `/ (root)`, and save.
3. Wait about a minute, then open your site at `https://<your-username>.github.io/<repo-name>/`.

### 2. AniList login (one time, for the developer)
Login works like other AniList apps: the Client ID is built in, so users just tap **Login**, AniList opens in the browser, and they come back to the app signed in. Create two clients at [anilist.co/settings/developer](https://anilist.co/settings/developer):

- **Website client:** Redirect URL is your site address, for example `https://<your-username>.github.io/<repo-name>/`.
- **Android client:** Redirect URL is `whatnext://auth`.

Put the two Client IDs in `config.js` (`clientWeb` and `clientApp`). Client IDs are public, not secrets.

The Android app falls back to a built-in default client ID, so its login works even without `config.js`. The website version needs `clientWeb` set; without it the login screen tells the user to use the Android app or add a website client.

### 3. Log in
Tap **Log in with AniList** and approve. On the website you come back to the page signed in; in the Android app the browser returns you to the app automatically.

## Logo and splash screen

The logo is `assets/logo-512.png` (and smaller copies). When the app opens it shows an opening screen for at least a second: a deep purple glow, the logo, the name "What Next?", a short tagline, a loading bar that fills as the app's files load, and a footer line (see `#boot` in `index.html`, the `#boot` styles in `css/base.css`, and `SPLASH_MS` in `boot.js`; the screen can be switched off in App Settings). The logo is also shown in the header, and on the login screen. The Android launcher icon and native splash are generated during the APK build from the pictures in `resources/` (step "Generate app icon and splash screen" in `.github/workflows/build-apk.yml`).

## Builds and releases

Every build of `.github/workflows/build-apk.yml` creates its own GitHub release (tag `v<app version>-b<build number>`, for example `v2.1.1-b14`) with the APK attached, so the newest build is always the newest release.

**Why a new APK installs over the old one (and what to do when it says "conflict").** Android only updates an app when the new APK has the same signing key and a higher version code. The build makes sure of both, and keeps the key secret:

- **Same key every time, kept in GitHub Secrets, never in the repo.** This repo is public, so a key stored in it (or protected by a well-known password such as `android`) would let anyone sign an APK that Android accepts as an update to this app. The key therefore lives in two repository secrets: `ANDROID_KEYSTORE_BASE64` (the key file as one line of base64) and `ANDROID_KEYSTORE_PASSWORD`. `android-signing/patch-android.sh` decodes the key during the build, checks that it opens and is the key this repo expects, and sets it as the signing config in `build.gradle` reading the password from the environment, so the password is never written to a file. `android-signing/fingerprint.txt` holds the key's SHA-256, which is public and is not a secret. `.gitignore` and a test keep key files from ever being committed again.
- **Version code that only goes up.** It is the number of minutes since 2023-11-14, taken from the clock, so it keeps rising even if the workflow's run counter is ever reset (a lower version code is treated as a downgrade and refused).
- **Checked before it is released.** `android-signing/verify-apk.sh` reads the finished APK with `apksigner` and `aapt2` and fails the build if its signing key is not the one in `fingerprint.txt` or its version is not the one meant. The build log prints `Signing certificate SHA-256: ...`, and every release says which key and version code it has, so two builds can be compared at a glance.

To set the secrets up (once): in the repo open **Settings > Secrets and variables > Actions > New repository secret**, add `ANDROID_KEYSTORE_PASSWORD` and `ANDROID_KEYSTORE_BASE64`, and make sure `android-signing/fingerprint.txt` matches the key. To make a new key yourself instead, run `bash android-signing/generate-key.sh` on any computer with Java: it prints both secret values and the fingerprint, and saves nothing in the repo. Keep a private backup of the key file outside GitHub: without it the next APK cannot update the installed one.

If you change the key, or an app on your phone was installed from a build signed with a different key, uninstall it once; after that every build installs over the previous one and keeps your data. The `latest-apk` release from earlier builds is not used any more and can be deleted.

When you upload `site.zip`, only the unpack workflow runs at first; it then starts the APK build, so one upload makes one release.

## Privacy

- Everything runs in your browser. There is no server and no analytics.
- Your login token and Client ID are stored in your browser's local storage on your own device, and are only sent to AniList.
- Log out to clear the saved token.
- The login wall is part of the page, so it controls what the app shows but isn't strong security by itself. Your private data stays protected by AniList and your account's token.

## Notes

- This is an unofficial app and isn't affiliated with AniList.
- 18+ features are for adults only. Content shown is whatever AniList lists as adult, and your AniList account settings apply.
- Discover only links to AniList pages. It doesn't link to streaming or reading sites.

## Built with

Plain HTML, CSS, and JavaScript, using the [AniList GraphQL API](https://docs.anilist.co/).

## Project structure (where to edit)

The app is split into folders, so one problem area can be fixed without touching the rest.

```
index.html              thin shell: splash, #screens, #overlays
boot.js                 loads the views and scripts in order; holds REV
config.js               AniList client IDs
sw.js                   offline support (service worker)
manifest.webmanifest    home-screen install
capacitor.config.json   Android app settings (Capacitor)
package.json            Capacitor plugins and the app version
assets/                 logo, app icons and the splash-screen image
resources/              Android icon and splash sources (used only by the APK build)
android-signing/        the key's public fingerprint and the scripts that sign, check and make the key (the key itself is in GitHub Secrets)
css/                    base, components, screens, login, trending, media, anistats, refresh, profile, themes,
                        listset, relmap, users, progress, discover, taste, utilities
views/
  shell/                header, tab bar
  screens/              login, pick, discover, seasonal, taste, calendar, chat, schedule,
                        stats, lists, profile
  settings/             menu, app, anilist, lists, sync (AniList Triple Sync), account, about
  sheets/               filter, customise, overlays (media page and editor), relmap, user
js/
  core/                 compat, diagnostics, core and Pick engine, tabs, auth,
                        tracker, theme, start
  features/             discover, seasonal, taste (screen), taste-math (the maths), pick-taste (new picks), refresh (swipe down), profile-extra (tendencies, favourites), calendar, lists, media page, entity pages
                        (character/staff/studio), editor, relation map, users, profile,
                        stats, list settings, app settings, settings, sync (AniList Triple Sync) and triple-math (its maths),
                        chat, trending, and so on
tests/                  structure check, unit tests, and real-browser screen tests
.github/workflows/      tests.yml, unpack-site.yml, build-apk.yml
```

If you add a new screen or script file, add it to the lists inside `boot.js` and `sw.js`.

**Releasing a change:** whenever any file changes, change `REV` in `boot.js` and the matching name in `sw.js` (for example `2.1.1-r5` and `wn-2.1.1-r5`). That makes every phone fetch the new files together instead of mixing old and new ones. `node tests/check-structure.js` fails if the two do not match.

## Tracking (one place for every change)

Every change to a list entry goes through `js/core/tracker.js`: the +1 buttons on the lists, the media page, Pick's "Mark as done", the list editor, and adding to Planning.

- Status and dates follow the same rules everywhere: +1 on a Planning, Paused, or Dropped title starts it and fills the start date; reaching the last episode completes it and fills the finish date; finishing a rewatch completes it and adds one rewatch; lowering a completed title reopens it; starting a rewatch resets progress to 0.
- The screen updates instantly. AniList is updated right after, one request per title at a time, and a failed save is rolled back with a message.
- With no connection the change is kept on the device and sent when you are back online.
- Scores follow your AniList score format (100 point, 10 point decimal, 10 point, 5 star, or smiley).

## Tests

```
node tests/check-structure.js        files, lists, ids, CSS, versions
node tests/unit/rules.test.js        tracking rules and score formats
node tests/unit/taste.test.js        taste report maths
node tests/unit/triple.test.js       AniList Triple Sync maths
node tests/unit/apk-signing.test.js  APK signing scripts, and that no key file is committed
python tests/e2e/run_all.py          real-browser tests against a fake AniList (needs: pip install playwright && playwright install chromium)
```

The `Tests` workflow (`.github/workflows/tests.yml`) runs all three on every push.


## Getting the files into your repo from a phone

GitHub's phone upload can't take folders. Upload the single file `site.zip` to the repo root instead. The `Unpack site.zip` workflow (`.github/workflows/unpack-site.yml`) unzips it into the folders above, deletes the zip, and commits. In the APK repo it also starts the APK build.

## Credits

- Company: Tokyo Brotherhood
- Creator: Hariharasuthan Karunakaran
- Contributor: Claude (AI)
