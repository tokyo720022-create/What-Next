# AniList Triple Sync: the fixes (accounts, protect mode, rejections, removals, Discord, preview, rate limits, settings).
import sys, time
from harness import *
import harness
R = []
def check(n, c, d=""): R.append(bool(c)); print(("PASS " if c else "FAIL ") + n + ((" :: " + str(d)) if d and not c else ""))
def main(page, out):
    TS = harness.TS; t = lambda s: page.inner_text(s)
    page.evaluate("window.__tsGap = 2; window.__opened = []; window.open = u => { window.__opened.push(u); return null; }")
    store = lambda: page.evaluate("JSON.parse(localStorage.getItem('wn_ts') || '{}')")
    mem = lambda k: page.evaluate("JSON.parse(localStorage.getItem('wn_ts_state_%s') || '{}')" % k)
    fails = lambda k: page.evaluate("JSON.parse(localStorage.getItem('wn_ts_fail_%s') || '[]')" % k)
    cfg = lambda: page.evaluate("tsCfg()")
    def fresh(extra=None):
        harness.ts_reset()
        page.evaluate("for(const k of Object.keys(localStorage)) if(k.startsWith('wn_ts')) localStorage.removeItem(k)")
        c = {"al": {"clientId": "4242", "clientSecret": "alsecret", "token": "TARGETTOK", "user": "TargetUser", "userId": 777},
             "mal": {"clientId": "malid", "clientSecret": "malsecret", "redirect": "http://localhost", "access": "MALTOK1", "refresh": "MALREF1", "expires": int(time.time() * 1000) + 9 * 10**9, "user": "MalTester", "userId": 31337}}
        c.update(extra or {})
        page.evaluate("(c) => { setApp({ advanced: true }); LSset('wn_ts', c); showTab('set-sync'); tsFill(); tsRenderStatus(); $('#syncLog').textContent = ''; $('#syncLog').hidden = true; }", c)
        page.wait_for_selector("#setSync:not([hidden])")
    def wait_done(): page.wait_for_function("!document.querySelector('#syncNow').disabled && document.querySelector('#syncLog').textContent.length > 0", timeout=25000); page.wait_for_timeout(120)
    def go(btn="#syncNow", choice=None):
        page.click(btn)
        if choice: page.wait_for_selector(".dsheet .dopt"); page.click('.dsheet .dopt:has-text("%s")' % choice)
        wait_done(); return t("#syncLog")
    src = lambda: TS["src"]["ANIME"]
    puts = lambda: [c for c in TS["mal_calls"] if c[0] == "PUT"]

    # ================= settings: everything in one place, saved as you change it =================
    fresh()
    body = t("#setSync").lower()   # the labels are shown in capitals
    check("the page has every setting: AniList client ID and secret, MyAnimeList client ID, secret and redirect, a Discord webhook, and the options", all(x.lower() in body for x in ("AniList client ID", "AniList client secret", "MyAnimeList client ID", "MyAnimeList client secret", "Redirect URL", "Log report webhook link", "Anime webhook link", "Manga webhook link", "Lists that get their own thread", "Protect the targets", "Add titles that aren't on the target yet", "Sync when the app opens")))
    d = cfg(); ui = lambda i: page.is_checked(i)
    check("a fresh install shows the defaults, and the engine uses the same ones", [ui("#tsSendAl"), ui("#tsSendMal"), ui("#tsProtect"), ui("#tsAdd"), ui("#tsRemove"), ui("#tsSkipAdultMal"), ui("#tsAuto"), ui("#tsDcOn"), ui("#tsDcQuiet"), ui("#tsDcTitles")] == [d["sendAl"], d["sendMal"], d["protect"], d["add"], d["remove"], d["skipAdultMal"], d["auto"], d["dcOn"], d["dcQuiet"], d["dcTitles"]] == [True, True, True, True, False, False, False, True, True, False] and page.input_value("#tsAutoHours") == "3" and d["autoHours"] == 3, (d, [ui("#tsAdd"), ui("#tsProtect")]))
    page.uncheck("#tsSendMal")
    check("a change is saved at once, without tapping Save", store()["sendMal"] is False)
    log = go(choice="Copy my whole list")
    check("and the next sync uses it (MyAnimeList is left out)", puts() == [] and len(TS["al_saved"]) == 6 and "sent to MyAnimeList" not in log, (log, len(TS["al_saved"])))
    page.fill("#tsMalId", "newid"); page.press("#tsMalId", "Tab")
    check("typed settings are saved when you leave the box", store()["mal"]["clientId"] == "newid" and store()["mal"]["access"] == "MALTOK1")
    page.select_option("#tsAutoHours", "6"); check("the auto-sync interval is saved", cfg()["autoHours"] == 6)

    # ================= accounts: the memory belongs to them =================
    fresh(); page.uncheck("#tsProtect"); go(choice="Copy my whole list")
    check("first copy sends the list to both targets", len(TS["al_saved"]) == 6 and len(puts()) == 3, (len(TS["al_saved"]), len(puts())))
    TS["al_saved"].clear(); TS["mal_calls"].clear(); page.evaluate("tsPatch('al', { userId: 888, user: 'OtherTarget' })")
    page.click("#syncNow"); page.wait_for_selector(".dsheet .dopt"); sheet = t(".dsheet")
    check("connecting a different target AniList account asks how to start again, for that target only", "First sync to target AniList" in sheet and "MyAnimeList" not in sheet.split("\n")[0], sheet)
    page.click('.dsheet .dopt:has-text("Copy my whole list")'); wait_done(); log = t("#syncLog")
    check("everything counts as new for the new account, and MyAnimeList is not resent", "A different AniList account is connected now" in log and len(TS["al_saved"]) == 6 and puts() == [], (log, len(TS["al_saved"]), len(puts())))
    page.check("#tsRemove"); page.fill("#tsSource", "othersrc"); page.press("#tsSource", "Tab"); TS["al_deleted"].clear(); TS["mal_calls"].clear()
    page.click("#syncNow"); page.wait_for_selector(".dsheet .dopt"); sheet = t(".dsheet")
    check("changing the source asks how to start for both targets", "First sync to target AniList and MyAnimeList" in sheet, sheet)
    page.click('.dsheet .dopt:has-text("Only send changes")'); wait_done(); log = t("#syncLog")
    check("the old memory is cleared instead of being treated as removed titles", "The source account changed" in log and TS["al_deleted"] == [] and not [c for c in TS["mal_calls"] if c[0] == "DELETE"] and mem("anime")["src"] == "othersrc" and len(mem("anime")["media"]) == 6, log)
    TS["al_saved"].clear(); page.evaluate("tsPatch('al', { userId: 999 })"); page.evaluate("(() => { const s = JSON.parse(localStorage.getItem('wn_ts_state_anime')); s.last_run = Date.now() - 9 * 3600 * 1000; localStorage.setItem('wn_ts_state_anime', JSON.stringify(s)); tsPatch('x', {}); const c = JSON.parse(localStorage.getItem('wn_ts')); c.auto = true; localStorage.setItem('wn_ts', JSON.stringify(c)); })()")
    page.evaluate("maybeAutoSync()"); page.wait_for_timeout(500)
    check("auto sync never starts a first copy to a newly connected account by itself", TS["al_saved"] == [] and not page.locator(".dsheet").count())

    # ================= protect mode: never overwrite a target that is further along =================
    fresh()
    e = lambda **o: dict({"status": "CURRENT", "progress": 0, "progressVolumes": 0, "repeat": 0, "private": False, "notes": "", "score": 0, "startedAt": {"year": None, "month": None, "day": None}, "completedAt": {"year": None, "month": None, "day": None}}, **o)
    TS["al_seed"] = {2001: e(status="COMPLETED", progress=12, score=95, notes="mine"), 2002: e(progress=4, notes="their note", startedAt={"year": 2024, "month": 1, "day": 2}), 2003: e(status="CURRENT", progress=0, score=85),
                     2006: e(status="PAUSED", progress=1)}
    src()[3]["score"] = 0
    TS["mal"] = {("anime", 5001): {"status": "completed", "num_watched_episodes": "12", "score": "9"}, ("anime", 5002): {"status": "watching", "num_watched_episodes": "4", "score": "0", "start_date": "2024-01-02", "num_times_rewatched": "1"}, ("anime", 5004): {"status": "watching", "num_watched_episodes": "2", "score": "8"}}
    log = go(choice="Copy my whole list"); saved = {v["mediaId"]: v for v in TS["al_saved"]}
    check("a title that is completed on each target is left alone (one on AniList, one on MyAnimeList), and an identical one is not written again", 2001 not in saved and 2006 not in saved and "2 left alone (the target is further along)" in log and "1 already up to date" in log, (sorted(saved), log))
    check("AniList: titles that are behind are updated and missing ones are added", sorted(saved) == [2002, 2003, 2004, 2005] and saved[2002]["progress"] == 12 and saved[2002]["status"] == "COMPLETED", sorted(saved))
    check("AniList: an update keeps a score the source doesn't have, and a note, and gives the source's own score priority", saved[2003]["scoreRaw"] == 85 and saved[2002]["scoreRaw"] == 100 and saved[2002]["notes"] == "great" and saved[2002]["startedAt"] == {"year": 2025, "month": 3, "day": 1}, saved.get(2003))
    check("every title was checked on the target before writing", sorted(set(TS["al_found"])) == [2001, 2002, 2003, 2004, 2005, 2006], TS["al_found"])
    pm = {c[2]: c[4] for c in puts()}
    check("MyAnimeList: a title that is completed there is left alone", 5001 not in pm and 5001 in [c[2] for c in TS["mal_calls"] if c[0] == "GET"], pm.keys())
    check("MyAnimeList: behind titles are updated, keeping a score the source doesn't have and the rewatch count", pm[5004]["score"] == "8" and pm[5004]["num_watched_episodes"] == "5" and pm[5002]["num_times_rewatched"] == "1" and pm[5002]["num_watched_episodes"] == "12" and pm[5002]["score"] == "10", pm)
    page.uncheck("#tsProtect"); TS["al_saved"].clear(); TS["al_seed"] = {2001: e(status="COMPLETED", progress=12, score=95)}; TS["al_state"].pop(2001, None); TS["al_db"].pop(2001, None)
    src()[0]["progress"] = 4; log = go()
    check("with protect switched off the source simply wins (the old behaviour)", [v["mediaId"] for v in TS["al_saved"]] == [2001] and TS["al_saved"][0]["progress"] == 4 and TS["al_saved"][0]["scoreRaw"] == 80, TS["al_saved"])

    # ================= rejected and failed titles =================
    fresh(); TS["mal_reject"] = {5002}; log = go(choice="Copy my whole list")
    check("a title MyAnimeList rejects is reported with its reason", "Rejected by MyAnimeList: Source Title 2002 (MyAnimeList 400: num_watched_episodes is out of range)" in log and "1 rejected" in log and "0 failed" in log, log)
    check("everything else still went through", len(TS["al_saved"]) == 6 and sorted(c[2] for c in puts()) == [5001, 5004], (len(TS["al_saved"]), sorted(c[2] for c in puts())))
    check("the Problems card lists it, and it is remembered", page.locator("#syncProblems").is_visible() and "Source Title 2002" in t("#syncProblemList") and "rejected" in t("#syncProblemList") and len(fails("anime")) == 1 and fails("anime")[0]["kind"] == "rejected", t("#syncProblems"))
    n = len([c for c in TS["mal_calls"] if c[0] == "PUT400"]); log = go()
    check("it is not retried while it stays unchanged", "Nothing to send" in log and len([c for c in TS["mal_calls"] if c[0] == "PUT400"]) == n, log)
    TS["mal_reject"] = set(); page.click("#syncRetry"); page.wait_for_timeout(100)
    check("'Try the rejected ones again' clears the list", page.locator("#syncProblems").is_hidden() and fails("anime") == [], t("#syncLog"))
    log = go()
    check("and the next sync sends it", "1 to send" in log and ("anime", 5002) in TS["mal"] and "1 sent to MyAnimeList" in log, log)
    TS["mal_reject"] = {5002}; src()[1]["progress"] = 13; go()
    check("changing a rejected title makes it get tried again", len(fails("anime")) == 1 and len([c for c in TS["mal_calls"] if c[0] == "PUT400"]) == n + 1, fails("anime"))
    TS["mal_reject"] = set(); TS["al_fail"] = {2001}; src()[0]["progress"] = 9; log = go()
    check("a temporary failure is marked 'will retry' and the title is retried next time", "Failed: Source Title 2001" in log and any(p["kind"] == "failed" for p in fails("anime")) and "will retry" in t("#syncProblemList"), log)
    TS["al_fail"] = set(); TS["al_saved"].clear(); go()
    check("once it works the problem disappears", [v["mediaId"] for v in TS["al_saved"]] == [2001] and not any(p["id"] == "2001" or p["id"] == 2001 for p in fails("anime")), fails("anime"))
    if page.locator("#syncProblems").is_visible():
        page.click("#syncProblemsClear")
        check("Clear list empties the problems", page.locator("#syncProblems").is_hidden() and fails("anime") == [] and fails("manga") == [])

    # ================= removals: remembered until done, with a guard against mass removal =================
    fresh(); page.check("#tsRemove"); page.uncheck("#tsProtect"); go(choice="Copy my whole list")
    TS["src"]["ANIME"] = src()[:4]; TS["al_delete_fail"] = {11006}; TS["al_deleted"].clear(); log = go()
    check("a title removed from the source is deleted from the targets", 11005 in TS["al_deleted"] and ("DELETE", "anime", 5005, "MALTOK1") in [c[:4] for c in TS["mal_calls"]], (TS["al_deleted"], log))
    check("a delete that failed is reported and the title stays remembered", "Couldn't remove #2006" in log and "2006" in mem("anime")["media"] and "2005" not in mem("anime")["media"], log)
    log = go()
    check("the next sync tries again and succeeds", 11006 in TS["al_deleted"] and "2006" not in mem("anime")["media"] and "1 removed" in log, (TS["al_deleted"], log))
    big = lambda: TS["src"]["ANIME"].extend(harness._ts_entry(2100 + i, None, "COMPLETED", 12, 80) for i in range(14))
    fresh(); page.check("#tsRemove"); page.uncheck("#tsProtect"); big(); go(choice="Copy my whole list"); TS["src"]["ANIME"] = src()[:6]; TS["al_deleted"].clear(); log = go()
    check("14 of 20 titles vanishing at once is not mirrored, and says so", "disappeared from the source at once" in log and TS["al_deleted"] == [], log)
    check("the page offers to remove or keep them", page.locator("#syncPending").is_visible() and "Anime: 14 titles" in t("#syncPending") and len(mem("anime")["pend"]) == 14, t("#syncPending"))
    page.click('#syncPending .chip:has-text("Remove them")'); page.wait_for_timeout(100)
    check("'Remove them' asks to be tapped twice", "Tap again" in t("#syncPending") and TS["al_deleted"] == [])
    page.click('#syncPending .chip:has-text("Tap again")'); wait_done(); page.wait_for_function("document.querySelector('#syncPending').hidden", timeout=10000)
    check("the second tap removes them from the targets", len(TS["al_deleted"]) == 14 and mem("anime")["pend"] == [], (len(TS["al_deleted"]), mem("anime").get("pend")))
    fresh(); page.check("#tsRemove"); page.uncheck("#tsProtect"); big(); go(choice="Copy my whole list"); TS["src"]["ANIME"] = src()[:6]; TS["al_deleted"].clear(); go()
    page.click('#syncPending .chip:has-text("Keep them")'); page.wait_for_timeout(150)
    check("'Keep them' leaves the targets alone and forgets those titles", TS["al_deleted"] == [] and page.locator("#syncPending").is_hidden() and not any(k.startswith("21") for k in mem("anime")["media"]) and mem("anime")["pend"] == [])

    # ================= smaller fixes =================
    fresh(); page.uncheck("#tsProtect"); go(choice="Copy my whole list"); TS["al_saved"].clear(); src()[0]["startedAt"] = {"year": 2026, "month": None, "day": None}; go()
    check("a year-only start date is noticed as a change", [v["mediaId"] for v in TS["al_saved"]] == [2001] and TS["al_saved"][0]["startedAt"] == {"year": 2026, "month": None, "day": None}, TS["al_saved"])
    fresh(); page.uncheck("#tsProtect"); go(choice="Copy my whole list")
    check("rewatch counts reach MyAnimeList", {c[2]: c[4] for c in puts()}[5004]["num_times_rewatched"] == "1")
    fresh(); page.evaluate("window.__tsGap = 150"); page.click("#syncNow"); page.wait_for_selector(".dsheet .dopt"); page.click('.dsheet .dopt:has-text("Copy my whole list")'); page.wait_for_selector("#syncStop:not([hidden])")
    page.evaluate("tsStart(['anime'])"); busy = t("#syncLog")
    check("starting a sync while one runs says so instead of doing nothing", "A sync is already running" in busy, busy)
    page.click("#syncStop"); wait_done(); page.evaluate("window.__tsGap = 2")
    fresh({"mal": {"clientId": "malid", "clientSecret": "malsecret", "redirect": "http://localhost"}}); page.fill("#tsMalRedirect", "http://localhost"); page.click("#tsMalOpen"); pend = store()["mal"]["pending"]
    page.fill("#tsMalRedirect", "http://changed"); page.press("#tsMalRedirect", "Tab"); page.fill("#tsMalCode", "http://localhost/?code=malcode123&state=" + pend["state"]); page.click("#tsMalConnect"); page.wait_for_function("document.querySelector('#tsMalState').textContent.includes('MalTester')", timeout=8000)
    check("finishing the MyAnimeList login uses the redirect from when it was opened, even if the box was edited", store()["mal"]["access"] == "MALTOK1" and TS["mal_tok"][-1]["redirect_uri"] == "http://localhost" and store()["mal"]["userId"] == 31337, TS["mal_tok"][-1])
    fresh(); TS["mal_dead"] = True; log = go(choice="Copy my whole list")
    check("MyAnimeList refusing the login again after a refresh stops the run once, not title by title", "refused the login" in log and "Stopped" in log and log.count("Failed") <= 1 and len(TS["al_saved"]) <= 2, log)
    fresh({"source": "someoneelse"}); TS["src_404"] = True; log = go(choice="Copy my whole list")
    check("a list that can't be read gives an honest message, not just 'User not found'", "Couldn't read someoneelse's anime list" in log and "Private lists" in log and "User not found" not in log, log)
    fresh(); page.uncheck("#tsProtect"); go(choice="Copy my whole list"); before = mem("anime")["last_run"]; page.wait_for_timeout(1100); TS["al_invalid"] = True; src()[0]["progress"] = 9; go()
    check("a run that was stopped does not count as synced", mem("anime")["last_run"] == before, (before, mem("anime")["last_run"]))
    fresh(); page.fill("#tsSource", "TargetUser"); page.press("#tsSource", "Tab"); page.uncheck("#tsProtect"); log = go(choice="Copy my whole list")
    check("the target AniList account is skipped when it is the same as the source, MyAnimeList still runs", "Skipping the target AniList: it is the same account as the source" in log and TS["al_saved"] == [] and len(puts()) == 3, log)
    fresh(); page.evaluate("window.__wl = { req: 0, rel: 0 }; Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async () => { window.__wl.req++; return { release: async () => { window.__wl.rel++; } }; } } });")
    go(choice="Copy my whole list"); wl = page.evaluate("window.__wl")
    check("the screen is kept awake during a sync and released afterwards", wl == {"req": 1, "rel": 1}, wl)
    fresh(); page.uncheck("#tsProtect"); TS["rl"] = {"remaining": 2, "reset_in": 0.4}; t0 = time.time(); go(choice="Copy my whole list"); took = time.time() - t0
    check("when AniList says the limit is close, the sync waits for it to reset (and still finishes)", took >= 0.85 and len(TS["al_saved"]) == 6, (round(took, 2), len(TS["al_saved"])))
    fresh(); src()[3]["adult"] = True; src()[3]["media"]["isAdult"] = True; TS["mal_forbid"] = {5001}; page.check("#tsSkipAdultMal"); log = go(choice="Copy my whole list")
    check("adult titles can be kept off MyAnimeList but still go to AniList", 5004 not in [c[2] for c in puts()] and 2004 in [v["mediaId"] for v in TS["al_saved"]] and "1 adult titles skipped" in log, log)
    check("a title MyAnimeList forbids is reported as age-restricted, not as 'no page'", "Rejected by MyAnimeList: Source Title 2001 (MyAnimeList refused this title (it may be age-restricted))" in log and "no MyAnimeList page" in log, log)

    # ================= Discord =================
    fresh(); page.fill("#tsDcUrl", "https://example.com/x"); page.press("#tsDcUrl", "Tab")
    check("a link that isn't a Discord webhook is refused", "isn't a Discord webhook link" in t("#syncLog") and cfg()["dcUrl"] == "", t("#syncLog"))
    hook = "https://discord.com/api/webhooks/123456789/abcDEF-token_1"; page.fill("#tsDcUrl", hook); page.press("#tsDcUrl", "Tab"); page.uncheck("#tsProtect")
    check("a real webhook link is saved", cfg()["dcUrl"] == hook)
    page.click("#tsDcTest"); page.wait_for_function("document.querySelector('#syncLog').textContent.includes('Test message')", timeout=8000)
    check("the test button posts a message", TS["discord"][-1]["embeds"][0]["title"] == "AniList Triple Sync" and TS["discord"][-1]["username"] == "AniList Triple Sync" and "Test message sent" in t("#syncLog"), TS["discord"])
    n = len(TS["discord"]); log = go(choice="Copy my whole list"); emb = TS["discord"][-1]["embeds"][0]; fv = {f["name"]: f["value"] for f in emb["fields"]}
    check("after a sync a report is posted with the counts", len(TS["discord"]) == n + 1 and emb["title"] == "AniList Triple Sync · Anime" and fv["Sent to AniList"] == "6" and fv["Sent to MyAnimeList"] == "3" and fv["Source"] == "Tester" and "Report sent to Discord" in log and "Titles sent" not in fv, (emb, log))
    n = len(TS["discord"]); go()
    check("a sync where nothing happened posts nothing (quiet)", len(TS["discord"]) == n)
    page.uncheck("#tsDcQuiet"); go()
    check("unless 'skip when nothing happened' is switched off", len(TS["discord"]) == n + 1 and "0 update(s) sent" in TS["discord"][-1]["embeds"][0]["description"], TS["discord"][-1])
    page.check("#tsDcTitles"); src()[0]["progress"] = 5; go(); fv = {f["name"]: f["value"] for f in TS["discord"][-1]["embeds"][0]["fields"]}
    check("'list the titles that were sent' adds them", "Source Title 2001 → AniList" in fv.get("Titles sent", ""), fv)
    TS["discord_forum"] = True; TS["discord_attempts"].clear(); n = len(TS["discord"]); src()[0]["progress"] = 6; log = go()
    check("a forum channel works: the report is retried with a thread name", len(TS["discord_attempts"]) == 1 and len(TS["discord"]) == n + 1 and TS["discord"][-1]["thread_name"].startswith("AniList Triple Sync ·") and "Report sent" in log, (TS["discord_attempts"], log))
    TS["discord_forum"] = False; TS["discord_429"] = 1; n = len(TS["discord"]); src()[0]["progress"] = 7; go()
    check("Discord's rate limit is waited out and the report still arrives", len(TS["discord"]) == n + 1)
    TS["discord_fail"] = True; src()[0]["progress"] = 8; log = go()
    check("a Discord problem is reported but the sync itself still finishes", "Couldn't post to Discord" in log and "Done." in log, log)
    TS["discord_fail"] = False; n = len(TS["discord"]); go("#syncPreview")
    check("a preview posts nothing to Discord", len(TS["discord"]) == n)
    page.uncheck("#tsDcOn"); src()[0]["progress"] = 9; go()
    check("the report can be switched off", len(TS["discord"]) == n)

    # ================= preview, sync both, auto interval =================
    fresh(); log = go("#syncPreview")
    check("Preview says what would happen and sends nothing", "Nothing is sent in a preview" in log and "AniList (first run: the whole list): 6 title(s)" in log and "MyAnimeList (first run: the whole list): 6 title(s)" in log and "2 have no MyAnimeList page" in log and TS["al_saved"] == [] and puts() == [] and not mem("anime"), log)
    check("Preview reads both lists", [r[0] for r in TS["src_reads"][-2:]] == ["ANIME", "MANGA"] and "Reading the" not in log.replace("Preview: reading the", ""), TS["src_reads"])
    fresh(); TS["src_reads"] = []; page.click("#syncBoth"); page.wait_for_selector(".dsheet .dopt"); page.click('.dsheet .dopt:has-text("Copy my whole list")'); wait_done(); page.wait_for_function("document.querySelector('#syncLog').textContent.includes('manga')", timeout=15000); wait_done(); log = t("#syncLog")
    check("'Sync both' asks once and then does anime and manga in turn", log.index("anime list") < log.index("manga list") and len(TS["al_saved"]) == 9 and len(mem("anime")["media"]) == 6 and len(mem("manga")["media"]) == 3, (log, len(TS["al_saved"])))
    page.select_option("#tsAutoHours", "6"); page.check("#tsAuto"); TS["al_saved"].clear(); src()[0]["progress"] = 11
    page.evaluate("(h) => { const s = JSON.parse(localStorage.getItem('wn_ts_state_anime')); s.last_run = Date.now() - h * 3600 * 1000; localStorage.setItem('wn_ts_state_anime', JSON.stringify(s)); }", 4)
    page.evaluate("maybeAutoSync()"); page.wait_for_timeout(600)
    check("auto sync waits for the chosen interval (4 hours is not enough for 6)", TS["al_saved"] == [])
    page.evaluate("(h) => { const s = JSON.parse(localStorage.getItem('wn_ts_state_anime')); s.last_run = Date.now() - h * 3600 * 1000; localStorage.setItem('wn_ts_state_anime', JSON.stringify(s)); }", 7)
    page.evaluate("maybeAutoSync()"); page.wait_for_function("window.__x = 1; true"); page.wait_for_timeout(1500)
    check("and runs when it has passed (7 hours)", [v["mediaId"] for v in TS["al_saved"]] == [2001] or 2001 in [v["mediaId"] for v in TS["al_saved"]], TS["al_saved"])
    check("narrow width: nothing sticks out sideways", page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"))
out = run(main, viewport=(360, 780))
real = [c for c in out["console"] if "ERR_INTERNET" not in c[1] and not any(("status of %d" % s) in c[1] for s in (400, 401, 403, 404, 429, 500))]
check("no console errors", not real and not out["errors"], (real[:2], out["errors"][:2]))

# ================= the old Discord Sync settings are carried over and cleaned up =================
def main2(page, out):
    store = lambda: page.evaluate("JSON.parse(localStorage.getItem('wn_ts') || '{}')")
    check("old Discord Sync keys are removed from the phone", page.evaluate("['wn_cfg', 'wn_sync_anime', 'wn_sync_manga'].every(k => localStorage.getItem(k) === null)"))
    check("one old webhook (the log one first) and the old source are carried over", store().get("dcUrl") == "https://discord.com/api/webhooks/2/logtok" and store().get("source") == "oldsrc", store())
    page.evaluate("setApp({ advanced: true }); showTab('set-sync')"); page.wait_for_selector("#setSync:not([hidden])")
    check("they show up in the new settings", page.input_value("#tsDcUrl") == "https://discord.com/api/webhooks/2/logtok" and page.input_value("#tsSource") == "oldsrc")
init = "if(!localStorage.getItem('wn_ts')){ localStorage.setItem('wn_cfg', JSON.stringify({ source: 'oldsrc', hook: 'https://discord.com/api/webhooks/1/oldtok', logHook: 'https://discord.com/api/webhooks/2/logtok', mangaHook: 'not a link' })); localStorage.setItem('wn_sync_anime', '{\"x\":1}'); localStorage.setItem('wn_sync_manga', '{\"x\":1}'); }"
out2 = run(main2, viewport=(360, 780), init=init)
print("\n%d checks, %d failed" % (len(R), R.count(False))); sys.exit(1 if False in R else 0)
