import sys
from harness import *
import harness
R = []
def check(n, c, d=""): R.append(bool(c)); print(("PASS " if c else "FAIL ") + n + ((" :: " + str(d)) if d and not c else ""))
def main(page, out):
    t = lambda sel: page.inner_text(sel)
    # ================= App Settings =================
    page.evaluate("showTab('set-app')"); page.wait_for_selector("#setApp #themeGrid .thm")
    body = t("#setApp").lower()
    check("App Settings has Theme, Appearance, Lists, Titles and Privacy", all(x in body for x in ("theme", "appearance", "lists", "titles", "privacy")))
    check("no push notification or memory saver clutter", "push" not in body and "memory saver" not in body)
    names = [x.strip().split("\n")[0] for x in page.locator("#themeGrid .thm .thn").all_inner_texts()]
    check("eight anime themes, in order", names == ["Sakura Flowers", "One Piece", "Naruto", "Gintama", "Dragon Ball", "Bleach", "Rent-a-Girlfriend", "Attack on Titan"], names)
    check("the old themes and colour pickers are gone", all(x not in body for x in ("sakura night", "midnight blue", "amoled", "reset colours")) and page.locator("#colorA, #themeMode, #themePresets").count() == 0)
    page.click('#themeGrid .thm:has-text("Naruto")'); page.wait_for_timeout(150)
    check("choosing a theme saves it, marks it and recolours the app", page.evaluate("JSON.parse(localStorage.getItem('wn_theme')).id") == "naruto" and page.get_attribute('#themeGrid .thm:has-text("Naruto")', "aria-pressed") == "true" and page.evaluate("getComputedStyle(document.body).backgroundColor") == "rgb(13, 10, 7)")
    # appearance
    check("profile pictures are round by default", page.evaluate("document.documentElement.dataset.avatar") == "circle")
    page.click("#setApp label:has-text('Round profile pictures')"); check("turning round pictures off makes them rounded squares", page.evaluate("document.documentElement.dataset.avatar") == "square" and page.evaluate("JSON.parse(localStorage.getItem('wn_app')).avatar") == "square")
    page.click("#appSize [data-v='l']"); check("Large text size scales the app", page.evaluate("document.documentElement.style.fontSize") == "17.5px")
    page.click("#appSize [data-v='m']"); check("Normal size resets it", page.evaluate("document.documentElement.style.fontSize") == "")
    page.click("#setApp label:has-text('logo screen')"); check("the logo screen can be switched off", page.evaluate("JSON.parse(localStorage.getItem('wn_app')).splash") is False)
    # lists
    page.select_option("#appAllAnime", "bottom"); page.click('#tabs [data-v="anime"]'); page.wait_for_selector("#listBody .lcard")
    chips = page.evaluate("[...document.querySelectorAll('#listStatus .chip, #statusChips .chip, #listChips .chip')].map(c => c.textContent.trim())")
    if not chips: chips = page.evaluate("[...document.querySelectorAll('#listBody')][0].parentElement.querySelectorAll('.row .chip').length and [...document.querySelectorAll('.row .chip')].map(c => c.textContent.trim())")
    check("'All' can move to the bottom of the status chips", any(c.startswith("All") for c in chips[-1:]) and not chips[0].startswith("All"), chips)
    page.evaluate("showTab('set-app')"); page.select_option("#appAllAnime", "top")
    page.click("#setApp label:has-text('relative dates')"); check("relative dates can be turned off", page.evaluate("JSON.parse(localStorage.getItem('wn_app')).relative") is False)
    # titles per country
    page.select_option("#appNameJP", "NATIVE"); page.select_option("#appNameKR", "ROMAJI")
    got = page.evaluate("(() => { const m = c => ({ title: { romaji: 'R', english: 'E', native: 'N' }, countryOfOrigin: c }); return [tt(m('JP')), tt(m('KR')), tt(m('CN')), tt(m(null))]; })()")
    check("titles follow the per-country choice, others follow AniList (English here)", got == ["N", "R", "E", "E"], got)
    page.select_option("#appNameJP", "")
    check("privacy controls are still there", page.locator("#blurBtn").count() == 1 and page.locator("#hideClear").count() == 1)
    page.click("#appReset"); check("reset asks first", "again" in t("#appReset") and page.evaluate("JSON.parse(localStorage.getItem('wn_app')).avatar") == "square")
    page.click("#appReset"); page.wait_for_timeout(200)
    check("second tap resets everything", page.evaluate("JSON.stringify(JSON.parse(localStorage.getItem('wn_app')))") == "{}" and page.evaluate("document.documentElement.dataset.avatar") == "circle" and page.evaluate("document.querySelector('#appNameKR').value") == "")
    check("App Settings: nothing sticks out sideways", page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"))

    # ================= AniList Settings =================
    page.evaluate("showTab('set-anilist')"); page.wait_for_selector("#aniForm .lssec")
    form = t("#aniForm").lower()
    check("AniList Settings has about, title language, staff naming, merge time, 18+, notifications, messages", all(x in form for x in ("about you", "title language", "staff and character naming", "activity merge time", "18+ content", "notifications", "messages")), form[:200])
    check("current values are loaded", page.input_value("#aniForm textarea") == "Hello there" and page.evaluate("[...document.querySelectorAll('#aniForm select')].map(s => s.value)") == ["blue", "ROMAJI", "ROMAJI_WESTERN", "360"], page.evaluate("[...document.querySelectorAll('#aniForm select')].map(s => s.value)"))
    check("score format moved to List Settings", "score" not in form.replace("list settings", "") or "score format, custom lists" in form)
    check("Save bar is hidden until something changes", page.locator("#aniBar").is_hidden())
    page.select_option("#aniForm select >> nth=1", "ENGLISH"); page.select_option("#aniForm select >> nth=3", "1440"); page.select_option("#aniForm select >> nth=0", "pink")
    page.fill("#aniForm textarea", "My new bio"); page.click("#aniForm label:has-text('only receive messages from people I follow')")
    check("Save bar appears with a note", page.locator("#aniBar").is_visible() and "unsaved" in t("#aniMsg"))
    harness.ANIUPD.clear(); page.click("#aniSave"); page.wait_for_function("document.querySelector('#aniBar').hidden"); page.wait_for_timeout(300)
    up = harness.ANIUPD[-1] if harness.ANIUPD else {}
    check("only the changed settings are sent", up == {"tl": "ENGLISH", "mt": 1440, "pc": "pink", "about": "My new bio", "rm": True}, up)
    check("title language is applied in the app straight away", page.evaluate("localStorage.getItem('wn_tlang')") == "ENGLISH")
    check("the form reloads with the saved values", page.input_value("#aniForm textarea") == "My new bio" and page.evaluate("document.querySelector('#aniForm select').value") == "pink")
    page.fill("#aniForm textarea", "Another"); harness.NET["updateerr"] = True; page.click("#aniSave"); page.wait_for_timeout(500)
    check("a failed save keeps the changes and shows why", "Boom" in t("#aniMsg") and page.locator("#aniSave").is_enabled(), t("#aniMsg")); harness.NET["updateerr"] = False
    check("AniList Settings: nothing sticks out sideways", page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"))

    # ================= Account Settings =================
    page.evaluate("showTab('set-account')"); page.wait_for_selector("#setAccount .rowlink")
    acc = t("#setAccount")
    check("account page shows who is signed in", t("#acName") == "Tester" and "Signed in with AniList" in acc)
    check("AniList account links", all(x in acc for x in ("Update Profile", "Update Account", "Import Lists", "Manage app access", "Delete Account")))
    check("no Twitter option", "twitter" not in acc.lower())
    page.evaluate("window.__opened = []; window.openExternal = u => window.__opened.push(u); 0")
    page.click("#setAccount .rowlink:has-text('Import Lists')"); page.click("#appsLink")
    check("the rows open the right AniList pages", page.evaluate("window.__opened") == ["https://anilist.co/settings/import", "https://anilist.co/settings/apps"], page.evaluate("window.__opened"))
    page.evaluate("window.__opened = []"); page.click("#acDelete"); check("Delete Account asks for a second tap", page.evaluate("window.__opened.length") == 0 and "again" in t("#acDeleteHint"))
    page.click("#acDelete"); check("second tap opens the account page", page.evaluate("window.__opened") == ["https://anilist.co/settings/account"])
    page.evaluate("localStorage.setItem('wn_cache', 'x'); localStorage.setItem('wn_tagcol', 'x'); localStorage.setItem('wn_hide', '[1]')"); page.click("#clearCache")
    check("Clear cache removes saved lists but keeps your hidden titles and login", page.evaluate("localStorage.getItem('wn_cache')") is None and page.evaluate("localStorage.getItem('wn_tagcol')") is None and page.evaluate("localStorage.getItem('wn_hide')") == "[1]" and page.evaluate("!!localStorage.getItem('wn_token')"))
    page.click("#acSyncNow"); check("Sync button says when nothing is waiting", "Nothing is waiting" in t("#acMsg"), t("#acMsg"))
    page.click("#copyInfo"); page.wait_for_timeout(300); check("Copy app info reports back", "copied" in t("#acMsg").lower() or "What Next?" in t("#acMsg"), t("#acMsg"))
    check("Log out is at the bottom", page.locator("#logout").is_visible() and t("#logout") == "Log out")
    check("Account Settings: nothing sticks out sideways", page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"))
out = run(main, viewport=(360, 780))
real = [c for c in out["console"] if "ERR_INTERNET" not in c[1] and "status of 5" not in c[1]]
check("no console errors", not real and not out["errors"], (real[:2], out["errors"][:2]))
print("%d checks, %d failed" % (len(R), R.count(False))); sys.exit(1 if False in R else 0)
