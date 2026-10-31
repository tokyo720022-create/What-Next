import sys, json, time
from harness import *
import harness
R = []
def check(n, c, d=""): R.append(bool(c)); print(("PASS " if c else "FAIL ") + n + ((" :: " + str(d)) if d and not c else ""))
def main(page, out):
    TS = harness.TS; t = lambda s: page.inner_text(s)
    page.evaluate("window.__tsGap = 3; window.__opened = []; window.open = u => { window.__opened.push(u); return null; }")
    store = lambda: page.evaluate("JSON.parse(localStorage.getItem('wn_ts') || '{}')")
    mem = lambda k: page.evaluate("JSON.parse(localStorage.getItem('wn_ts_state_%s') || '{}')" % k)
    def done(): page.wait_for_function("!document.querySelector('#syncNow').disabled && document.querySelector('#syncLog').textContent.length > 0", timeout=20000); page.wait_for_timeout(120)
    def run(kind="anime", choice=None):
        page.click("#syncNow" if kind == "anime" else "#syncNowManga")
        if choice:
            page.wait_for_selector(".dsheet .dopt"); page.click('.dsheet .dopt:has-text("%s")' % choice)
        done(); return t("#syncLog")
    def go(): page.evaluate("showTab('set-sync')"); page.wait_for_selector("#setSync:not([hidden])")
    # ---------- the Advanced gate ----------
    page.evaluate("showTab('settings')"); page.wait_for_selector("#settings:not([hidden])")
    check("Triple Sync is hidden in Settings until Advanced features are on", not page.locator("#rowSync").is_visible())
    page.evaluate("showTab('set-sync')"); page.wait_for_timeout(150)
    check("opening it by any other route still lands on Settings", page.locator("#settings").is_visible() and not page.locator("#setSync").is_visible())
    page.evaluate("showTab('set-app')"); page.wait_for_selector("#appAdvanced")
    check("App Settings has an Advanced features switch, off by default, with a warning", not page.is_checked("#appAdvanced") and "changes data on those accounts" in t("#setApp"))
    page.check("#appAdvanced"); page.wait_for_timeout(100)
    check("turning it on is saved", page.evaluate("JSON.parse(localStorage.getItem('wn_app')).advanced") is True)
    page.evaluate("showTab('settings')")
    check("Settings now shows AniList Triple Sync, and no Discord Sync", page.locator("#rowSync").is_visible() and "AniList Triple Sync" in t("#rowSync") and "Discord" not in t("#settings"))
    page.click("#rowSync"); page.wait_for_selector("#setSync:not([hidden])")
    check("the page is called AniList Triple Sync and has no Discord webhooks", "AniList Triple Sync" in t("#setSync h2") and page.locator("#cfgHook, #cfgMangaHook, #cfgVipHook").count() == 0 and "webhook" not in t("#setSync").lower())
    # ---------- nothing connected ----------
    page.click("#syncNow"); page.wait_for_timeout(150)
    check("syncing with nothing connected explains what to do", "Connect a target AniList account" in t("#syncLog"), t("#syncLog"))
    # ---------- target AniList ----------
    page.fill("#tsAlId", "4242"); page.fill("#tsAlSecret", "alsecret"); page.click("#tsAlOpen"); page.wait_for_timeout(100)
    op = page.evaluate("window.__opened")
    check("AniList login link has the client ID, the pin redirect and code response", op and op[-1] == "https://anilist.co/api/v2/oauth/authorize?client_id=4242&redirect_uri=https%3A%2F%2Fanilist.co%2Fapi%2Fv2%2Foauth%2Fpin&response_type=code", op)
    page.fill("#tsAlCode", "nope"); page.click("#tsAlConnect"); page.wait_for_function("document.querySelector('#syncLog').textContent.includes('connect')")
    check("a wrong code gives a clear message and connects nothing", "Couldn't connect" in t("#syncLog") and not store().get("al", {}).get("token"), t("#syncLog"))
    page.fill("#tsSource", "TargetUser"); page.fill("#tsAlCode", "alcode123"); page.click("#tsAlConnect"); page.wait_for_function("document.querySelector('#syncLog').textContent.includes('same account')")
    check("the target cannot be the same account as the source", not store().get("al", {}).get("token"), t("#syncLog"))
    page.fill("#tsSource", ""); page.fill("#tsAlCode", "alcode123"); page.click("#tsAlConnect"); page.wait_for_function("document.querySelector('#tsAlState').textContent.includes('TargetUser')")
    check("connected: token exchanged with the client ID, secret, pin redirect and code", store()["al"]["token"] == "TARGETTOK" and TS["al_tok"][-1]["client_secret"] == "alsecret" and TS["al_tok"][-1]["code"] == "alcode123", TS["al_tok"][-1])
    check("status shows the target account and a Disconnect button", "Connected as TargetUser." in t("#tsAlState") and page.locator("#tsAlForget").is_visible() and "AniList (TargetUser)" in t("#syncStatus"))
    check("the code box is cleared after connecting", page.input_value("#tsAlCode") == "")
    # ---------- MyAnimeList ----------
    page.fill("#tsMalId", "malid"); page.fill("#tsMalSecret", "malsecret"); page.fill("#tsMalRedirect", "http://localhost"); page.click("#tsMalOpen"); page.wait_for_timeout(100)
    pend = store()["mal"]["pending"]; url = page.evaluate("window.__opened")[-1]
    check("MyAnimeList login link: PKCE (plain), client ID, redirect and state", url.startswith("https://myanimelist.net/v1/oauth2/authorize?") and "response_type=code" in url and "client_id=malid" in url and "code_challenge=" + pend["verifier"] in url and "code_challenge_method=plain" in url and "state=" + pend["state"] in url and "redirect_uri=http%3A%2F%2Flocalhost" in url and len(pend["verifier"]) == 64, url)
    page.fill("#tsMalCode", "http://localhost/?code=malcode123&state=WRONG"); page.click("#tsMalConnect"); page.wait_for_function("document.querySelector('#syncLog').textContent.includes('belong')")
    check("a link from a different login attempt is refused", not store()["mal"].get("access"), t("#syncLog"))
    page.fill("#tsMalCode", "http://localhost/?code=malcode123&state=" + pend["state"]); page.click("#tsMalConnect"); page.wait_for_function("document.querySelector('#tsMalState').textContent.includes('MalTester')")
    f = TS["mal_tok"][-1]
    check("connected: code exchanged with the verifier, client ID, secret and redirect", f["code_verifier"] == pend["verifier"] and f["client_secret"] == "malsecret" and f["client_id"] == "malid" and f["redirect_uri"] == "http://localhost", f)
    check("MyAnimeList tokens and name are kept on the device, the pending login is cleared", store()["mal"]["access"] == "MALTOK1" and store()["mal"]["refresh"] == "MALREF1" and store()["mal"]["user"] == "MalTester" and not store()["mal"].get("pending"))
    check("status line lists both targets", "Targets: AniList (TargetUser), MyAnimeList (MalTester)" in t("#syncStatus"), t("#syncStatus"))
    # ---------- first run: ask how to start ----------
    page.click("#syncNow"); page.wait_for_selector(".dsheet .dopt")
    sheet = t(".dsheet")
    check("first sync asks how to start, naming both targets", "First sync to target AniList and MyAnimeList" in sheet and "Copy my whole list" in sheet and "Only send changes from now on" in sheet, sheet)
    page.click('.dsheet .dopt:has-text("Only send changes")'); done(); log = t("#syncLog")
    check("'only changes' remembers the list and sends nothing", "sending nothing" in log and TS["al_saved"] == [] and [c for c in TS["mal_calls"] if c[0] in ("PUT", "DELETE")] == [] and len(mem("anime")["media"]) == 6, (log, len(TS["al_saved"])))
    check("the source list was read for the logged-in user", ("ANIME", "Tester") in TS["src_reads"], TS["src_reads"])
    check("status line shows the run", "6 titles remembered" in t("#syncStatus"), t("#syncStatus"))
    # ---------- later runs send only what changed ----------
    src = TS["src"]["ANIME"]; src[0]["progress"] = 5; src[0]["score"] = 90
    src.append({**src[0], "mediaId": 2007, "status": "CURRENT", "progress": 1, "score": 0, "startedAt": {"year": None, "month": None, "day": None}, "media": {"id": 2007, "idMal": 5007, "title": {"romaji": "Src 2007", "english": "Source Title 2007"}}})
    log = run()
    check("no question the second time, and only the 2 changed or new titles are sent", not page.locator(".dsheet").count() and "2 to send" in log and [v["mediaId"] for v in TS["al_saved"]] == [2001, 2007], (log, [v["mediaId"] for v in TS["al_saved"]]))
    puts = {c[2]: c[4] for c in TS["mal_calls"] if c[0] == "PUT"}
    check("MyAnimeList got the same two with the right fields", set(puts) == {5001, 5007} and puts[5001]["status"] == "watching" and puts[5001]["num_watched_episodes"] == "5" and puts[5001]["score"] == "9" and puts[5001]["start_date"] == "2026-01-05" and puts[5001]["is_rewatching"] == "false", puts)
    check("AniList got the full entry (status, progress, score, dates, notes, privacy)", TS["al_saved"][0]["status"] == "CURRENT" and TS["al_saved"][0]["progress"] == 5 and TS["al_saved"][0]["scoreRaw"] == 90 and TS["al_saved"][0]["startedAt"] == {"year": 2026, "month": 1, "day": 5} and TS["al_saved"][0]["private"] is False, TS["al_saved"][0])
    check("summary line counts what was sent", "2 sent to AniList" in t("#syncLog") and "2 sent to MyAnimeList" in t("#syncLog") and "0 failed" in t("#syncLog"), t("#syncLog"))
    n = len(TS["al_saved"]); log = run()
    check("running again with no changes sends nothing", "Nothing to send" in log and len(TS["al_saved"]) == n, log)
    # a title with no MyAnimeList page
    src[2]["progress"] = 4; n = len(TS["al_saved"]); m = len([c for c in TS["mal_calls"] if c[0] == "PUT"]); log = run()
    check("a title with no MyAnimeList page goes to AniList only and is counted", len(TS["al_saved"]) == n + 1 and len([c for c in TS["mal_calls"] if c[0] == "PUT"]) == m and "1 have no MyAnimeList page" in log, log)
    # ---------- per-target tracking ----------
    page.uncheck("#tsSendMal"); page.click("#tsSave"); src[1]["score"] = 70; n = len(TS["al_saved"]); m = len([c for c in TS["mal_calls"] if c[0] == "PUT"]); log = run()
    check("with MyAnimeList switched off only AniList is sent to", len(TS["al_saved"]) == n + 1 and len([c for c in TS["mal_calls"] if c[0] == "PUT"]) == m and "sent to MyAnimeList" not in log, log)
    page.check("#tsSendMal"); page.click("#tsSave"); log = run()
    check("switching it back on catches MyAnimeList up without resending to AniList", [c[2] for c in TS["mal_calls"] if c[0] == "PUT"][-1] == 5002 and len(TS["al_saved"]) == n + 1 and "1 sent to MyAnimeList" in log, log)
    # ---------- reset and copy everything ----------
    page.click("#tsReset"); check("reset memory forgets the list", not mem("anime").get("media"))
    TS["al_saved"].clear(); TS["mal_calls"].clear(); log = run(choice="Copy my whole list")
    puts = [c for c in TS["mal_calls"] if c[0] == "PUT"]; p404 = [c for c in TS["mal_calls"] if c[0] == "PUT404"]
    check("'copy my whole list' sends every title to AniList", sorted(v["mediaId"] for v in TS["al_saved"]) == [2001, 2002, 2003, 2004, 2005, 2006, 2007], sorted(v["mediaId"] for v in TS["al_saved"]))
    check("and to MyAnimeList for those that have a page there (a missing page is not a failure)", sorted(c[2] for c in puts) == [5001, 5002, 5004, 5007] and [c[2] for c in p404] == [5005] and "0 failed" in log, (sorted(c[2] for c in puts), p404, log))
    d = {v["mediaId"]: v for v in TS["al_saved"]}
    check("statuses, repeats, notes and dates travel with each title", d[2004]["status"] == "REPEATING" and d[2004]["repeat"] == 1 and d[2002]["notes"] == "great" and d[2002]["completedAt"] == {"year": 2025, "month": 3, "day": 20} and d[2005]["status"] == "DROPPED" and d[2005]["scoreRaw"] == 45)
    mp = {c[2]: c[4] for c in puts}
    check("MyAnimeList: repeating shows as rewatching, dropped and completed map over", mp[5004]["is_rewatching"] == "true" and mp[5004]["status"] == "watching" and mp[5002]["status"] == "completed" and mp[5002]["finish_date"] == "2025-03-20" and mp[5002]["score"] == "7", mp)
    # ---------- leave titles that are not on the target alone ----------
    page.uncheck("#tsAdd"); page.click("#tsSave"); page.click("#tsReset")
    TS["al_saved"].clear(); TS["al_found"].clear(); TS["al_db"] = {2001: 11001}; TS["mal"] = {("anime", 5001): {"status": "watching"}}; TS["mal_calls"].clear()
    log = run(choice="Copy my whole list")
    check("with 'add titles' off, only titles already on AniList are updated", [v["mediaId"] for v in TS["al_saved"]] == [2001] and len(TS["al_found"]) == 7, ([v["mediaId"] for v in TS["al_saved"]], TS["al_found"]))
    check("and only titles already on MyAnimeList are updated", [c[2] for c in TS["mal_calls"] if c[0] == "PUT"] == [5001] and "left alone" in log, ([c for c in TS["mal_calls"] if c[0] == "PUT"], log))
    page.check("#tsAdd"); page.click("#tsSave")
    # ---------- removals ----------
    page.click("#tsReset"); run(choice="Copy my whole list"); TS["al_deleted"].clear(); TS["mal_calls"].clear()
    gone = [src.pop(5), src.pop(3)]   # 2006 (no MAL page) and 2004
    run(); check("a title removed from the source is NOT removed from the targets by default, but is forgotten", TS["al_deleted"] == [] and not [c for c in TS["mal_calls"] if c[0] == "DELETE"] and len(mem("anime")["media"]) == 5, (TS["al_deleted"], len(mem("anime")["media"])))
    page.check("#tsRemove"); page.click("#tsSave"); gone2 = [src.pop(3), src.pop(1)]   # 2005 (MAL 404) and 2002
    log = run(); dels = [c for c in TS["mal_calls"] if c[0] == "DELETE"]
    check("with 'also remove' on, they are deleted from the target AniList account", sorted(TS["al_deleted"]) == [11002, 11005] or sorted(TS["al_deleted"]) == [9002, 9005], TS["al_deleted"])
    check("and from MyAnimeList, where an already-missing entry is fine", sorted(c[2] for c in dels) == [5002, 5005] and "2 removed" in log and "0 failed" in log, (dels, log))
    full = list(TS["src"]["ANIME"]); TS["src"]["ANIME"] = []; TS["al_deleted"].clear(); log = run()
    check("an empty list from AniList is treated as an error and nothing is touched", "returned an empty list" in log and TS["al_deleted"] == [] and len(mem("anime")["media"]) >= 2, log)
    TS["src"]["ANIME"] = full; page.uncheck("#tsRemove"); page.click("#tsSave")
    # ---------- manga ----------
    TS["al_saved"].clear(); TS["mal_calls"].clear(); log = run("manga", "Copy my whole list")
    ms = {v["mediaId"]: v for v in TS["al_saved"]}; mm = {(c[1], c[2]): c[4] for c in TS["mal_calls"] if c[0] == "PUT"}
    check("manga: all three go to AniList with volumes, and the private flag", sorted(ms) == [3001, 3002, 3003] and ms[3001]["progressVolumes"] == 2 and ms[3002]["private"] is True and ms[3002]["progressVolumes"] == 9, ms)
    check("manga: MyAnimeList manga paths, chapters and volumes", mm[("manga", 6001)]["num_chapters_read"] == "20" and mm[("manga", 6001)]["num_volumes_read"] == "2" and mm[("manga", 6001)]["status"] == "reading" and mm[("manga", 6003)]["status"] == "plan_to_read" and "is_rereading" in mm[("manga", 6001)], mm)
    check("manga has its own memory, separate from anime", len(mem("manga")["media"]) == 3 and "Manga:" in t("#syncStatus"))
    # ---------- MyAnimeList token refresh ----------
    TS["mal_expire_first"] = True; TS["src"]["MANGA"][0]["progress"] = 25; TS["mal_calls"].clear(); log = run("manga")
    check("an expired MyAnimeList token is refreshed once and the update goes through", [c[3] for c in TS["mal_calls"] if c[0] == "PUT"] == ["MALTOK2"] and store()["mal"]["access"] == "MALTOK2" and store()["mal"]["refresh"] == "MALREF2" and "0 failed" in log, (TS["mal_calls"], store()["mal"]))
    TS["mal_expire_first"] = False
    # ---------- failures ----------
    TS["al_fail"] = {2001}; TS["src"]["ANIME"][0]["progress"] = 8; TS["src"]["ANIME"][1]["progress"] = 11; TS["al_saved"].clear(); log = run()
    check("one failing title is reported and the others still go through", "Failed: Source Title 2001 (Boom for 2001)" in log and "1 failed" in log and 2001 not in [v["mediaId"] for v in TS["al_saved"]] and len(TS["al_saved"]) >= 1, log)
    TS["al_fail"] = set(); TS["al_saved"].clear(); log = run()
    check("a failed title is retried on the next run", [v["mediaId"] for v in TS["al_saved"]] == [2001] and "0 failed" in log, (log, [v["mediaId"] for v in TS["al_saved"]]))
    TS["al_invalid"] = True; TS["src"]["ANIME"][0]["progress"] = 9; log = run(); TS["al_invalid"] = False
    check("an expired target AniList login stops the run with a clear message", "target AniList login has expired" in log and "Stopped" in log, log)
    TS["al_saved"].clear(); run(); check("after reconnecting the same change is sent", [v["mediaId"] for v in TS["al_saved"]] == [2001])
    # ---------- stop ----------
    page.evaluate("window.__tsGap = 120"); page.click("#tsReset"); TS["al_saved"].clear()
    page.click("#syncNow"); page.wait_for_selector(".dsheet .dopt"); page.click('.dsheet .dopt:has-text("Copy my whole list")'); page.wait_for_selector("#syncStop:not([hidden])"); page.wait_for_timeout(300); page.click("#syncStop"); done(); log = t("#syncLog")
    check("Stop ends the run early and says so", "Stopped" in log and 0 < len(TS["al_saved"]) < 3 and page.locator("#syncStop").is_hidden(), (log, len(TS["al_saved"])))
    page.evaluate("window.__tsGap = 3"); log = run()
    check("the next run finishes what was left", sorted(set(v["mediaId"] for v in TS["al_saved"])) == [2001, 2003, 2007], (log, [v["mediaId"] for v in TS["al_saved"]]))
    # ---------- auto sync ----------
    page.check("#tsAuto"); page.click("#tsSave"); TS["src"]["ANIME"][0]["progress"] = 10; TS["al_saved"].clear()
    page.evaluate("(() => { const s = JSON.parse(localStorage.getItem('wn_ts_state_anime')); s.last_run = Date.now() - 4 * 3600 * 1000; localStorage.setItem('wn_ts_state_anime', JSON.stringify(s)); })()")
    page.evaluate("maybeAutoSync()"); page.wait_for_function("document.querySelector('#syncLog').textContent.length > 0 && !document.querySelector('#syncNow').disabled", timeout=15000)
    check("auto sync runs a delta sync when the last run is over 3 hours old", [v["mediaId"] for v in TS["al_saved"]] == [2001], [v["mediaId"] for v in TS["al_saved"]])
    TS["al_saved"].clear(); TS["src"]["ANIME"][0]["progress"] = 11; page.evaluate("maybeAutoSync()"); page.wait_for_timeout(500)
    check("but not again within 3 hours", TS["al_saved"] == [])
    page.evaluate("(() => { const s = JSON.parse(localStorage.getItem('wn_ts_state_anime')); s.last_run = Date.now() - 4 * 3600 * 1000; localStorage.setItem('wn_ts_state_anime', JSON.stringify(s)); setApp({ advanced: false }); })()")
    page.evaluate("maybeAutoSync()"); page.wait_for_timeout(500)
    check("auto sync does nothing when Advanced features are off", TS["al_saved"] == [])
    page.evaluate("showTab('set-sync')"); page.wait_for_timeout(150); check("and the page can no longer be opened", page.locator("#settings").is_visible() and not page.locator("#rowSync").is_visible())
    page.evaluate("setApp({ advanced: true })"); page.evaluate("localStorage.removeItem('wn_ts_state_anime')"); page.evaluate("maybeAutoSync()"); page.wait_for_timeout(500)
    check("auto sync never starts a first run by itself", TS["al_saved"] == [])
    # ---------- disconnect ----------
    go(); page.click("#tsAlForget"); page.click("#tsMalForget"); page.wait_for_timeout(100)
    check("Disconnect clears both logins but keeps the client IDs", not store()["al"]["token"] and not store()["mal"]["access"] and store()["al"]["clientId"] == "4242" and "Not connected." in t("#tsAlState") and "Not connected." in t("#tsMalState") and "none connected yet" in t("#syncStatus"), store())
    page.click("#syncNow"); page.wait_for_timeout(150); check("with nothing connected a sync explains again", "Connect a target AniList account" in t("#syncLog"))
    check("narrow width: nothing sticks out sideways", page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"))
out = run(main, viewport=(360, 780))
real = [c for c in out["console"] if "ERR_INTERNET" not in c[1] and "status of 400" not in c[1] and "status of 404" not in c[1] and "status of 401" not in c[1]]   # the fake services answer 400 and 404 on purpose
check("no console errors", not real and not out["errors"], (real[:2], out["errors"][:2]))
print("\n%d checks, %d failed" % (len(R), R.count(False))); sys.exit(1 if False in R else 0)
