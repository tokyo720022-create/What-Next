# AniList Triple Sync: the Discord update cards (the anime and manga webhooks).
import sys, time
from harness import *
import harness
R = []
def check(n, c, d=""): R.append(bool(c)); print(("PASS " if c else "FAIL ") + n + ((" :: " + str(d)) if d and not c else ""))
ANIME = "https://discord.com/api/webhooks/111/animeTok-1"; MANGA = "https://discord.com/api/webhooks/222/mangaTok-1"; REPORT = "https://discord.com/api/webhooks/123456789/reportTok_1"
def main(page, out):
    TS = harness.TS; t = lambda s: page.inner_text(s); E = harness._ts_entry
    page.evaluate("window.__tsGap = 2; window.__opened = []; window.open = u => { window.__opened.push(u); return null; }")
    mem = lambda k: page.evaluate("JSON.parse(localStorage.getItem('wn_ts_state_%s') || '{}')" % k)
    cfg = lambda: page.evaluate("tsCfg()")
    def fresh(extra=None, targets=False):
        harness.ts_reset()
        page.evaluate("for(const k of Object.keys(localStorage)) if(k.startsWith('wn_ts')) localStorage.removeItem(k)")
        c = {"al": {}, "mal": {}}
        if targets:
            c = {"al": {"clientId": "4242", "clientSecret": "alsecret", "token": "TARGETTOK", "user": "TargetUser", "userId": 777},
                 "mal": {"clientId": "malid", "clientSecret": "malsecret", "redirect": "http://localhost", "access": "MALTOK1", "refresh": "MALREF1", "expires": int(time.time() * 1000) + 9 * 10**9, "user": "MalTester", "userId": 31337}}
        c.update({"dcAnime": ANIME, "dcManga": MANGA}); c.update(extra or {})
        page.evaluate("(c) => { setApp({ advanced: true }); LSset('wn_ts', c); showTab('set-sync'); tsFill(); tsRenderStatus(); $('#syncLog').textContent = ''; $('#syncLog').hidden = true; }", c)
        page.wait_for_selector("#setSync:not([hidden])")
    def wait_done(): page.wait_for_function("!document.querySelector('#syncNow').disabled && document.querySelector('#syncLog').textContent.length > 0", timeout=25000); page.wait_for_timeout(120)
    def go(btn="#syncNow", choice=None):
        page.click(btn)
        if choice: page.wait_for_selector(".dsheet .dopt"); page.click('.dsheet .dopt:has-text("%s")' % choice)
        wait_done(); return t("#syncLog")
    src = lambda k="ANIME": TS["src"][k]
    def anime(*entries): TS["src"]["ANIME"] = list(entries)
    def bump(i, n=1, k="ANIME"): src(k)[i]["progress"] += n
    cards = lambda hook=None: [c for c in TS["cards"] if hook is None or c["hook"] == hook]
    fv = lambda c: {f["name"]: f["value"] for f in c["embed"]["fields"]}

    # ---------- settings ----------
    fresh({"dcAnime": "", "dcManga": ""})
    check("the test-look choices list every theme, built from the theme list", page.evaluate("[...document.querySelectorAll('#tsDcPreview option')].map(o => o.value)") == [""] + page.evaluate("Object.keys(TS_THEMES)") and page.evaluate("Object.keys(TS_THEMES).length") >= 9, page.evaluate("[...document.querySelectorAll('#tsDcPreview option')].map(o => o.value)"))
    check("the default own-thread lists include Fantasy and every list that has a theme", all(w in page.evaluate("TS_DC_LISTS") for w in ("fantasy", "anime movies", "plan to continue", "planning", "favourite", "fav", "hentai", "milf", "isekai", "rom com")))
    check("the page has the anime and manga webhooks and the own-thread lists", all(page.locator(i).count() == 1 for i in ("#tsDcAnime", "#tsDcManga", "#tsDcLists", "#tsDcAnimeTest", "#tsDcMangaTest", "#tsDcUrl")))
    check("the own-thread lists start with the usual ones", "iseki" in page.input_value("#tsDcLists") and "anime movies" in page.input_value("#tsDcLists") and cfg()["dcLists"] == page.input_value("#tsDcLists"))
    page.fill("#tsDcAnime", "https://example.com/nope"); page.press("#tsDcAnime", "Tab")
    check("a link that isn't a Discord webhook is refused for the anime webhook, and says which one", "the anime webhook was not saved" in t("#syncLog") and cfg()["dcAnime"] == "", t("#syncLog"))
    page.fill("#tsDcAnime", ANIME); page.press("#tsDcAnime", "Tab"); page.fill("#tsDcManga", MANGA); page.press("#tsDcManga", "Tab"); page.fill("#tsDcLists", "iseki, favourite"); page.press("#tsDcLists", "Tab")
    check("real links and the list names are saved", cfg()["dcAnime"] == ANIME and cfg()["dcManga"] == MANGA and cfg()["dcLists"] == "iseki, favourite")
    page.fill("#tsDcLists", "anime movies, iseki, isekai, milf, loli, rom com, plan to continue, hentai, favourite, fav, planning, tensei"); page.press("#tsDcLists", "Tab")
    page.click("#tsDcAnimeTest"); page.wait_for_function("document.querySelector('#syncLog').textContent.includes('Test card')", timeout=8000)
    th = TS["threads"]; first = cards()[-1]
    check("the test button makes the thread and posts a sample card in it", len(th) == 1 and list(th.values())[0]["name"] == "[ANIME] General Updates" and list(th.values())[0]["starter"] == "📡 **General Updates** | ANIME Telemetry Dashboard" and first["embed"]["title"].startswith("TEST:") and first["hook"] == "111" and "Test card sent to the anime channel" in t("#syncLog"), (th, first))
    check("the thread is made with wait=true and the card is posted with its thread id", any("wait=true" in u for u in TS["discord_urls"]) and "thread_id=9100" in first["url"], TS["discord_urls"])
    page.click("#tsDcAnimeTest"); page.wait_for_timeout(300)
    check("a second test card reuses the thread", len(TS["threads"]) == 1 and len(cards()) == 2)
    page.click("#tsDcMangaTest"); page.wait_for_timeout(500)
    check("the manga test goes to the manga webhook in its own thread", cards()[-1]["hook"] == "222" and cards()[-1]["thread"] == "[MANGA] General Updates" and len(TS["threads"]) == 2, cards()[-1])

    # ---------- the first run only remembers, then progress makes cards ----------
    fresh({"dcManga": ""})
    anime(E(2001, 5001, "CURRENT", 3, 0))
    log = go()
    check("a Discord-only run works without any target account, and the first run posts nothing", "Done." in log and "Connect a target" not in log and "first run only remembers your progress" in log and cards() == [] and mem("anime")["media"]["2001"]["dp"] == 3, log)
    q = TS["src_queries"][-1]
    check("with a card webhook the source is read with covers, totals, tags and custom lists", all(x in q for x in ("customLists(asArray:true)", "coverImage{extraLarge color}", "tags{name}", "episodes chapters")), q)
    bump(0, 2); log = go(); c1 = cards()
    check("progress going up posts one card", len(c1) == 1 and c1[0]["hook"] == "111" and "1 card(s) posted to Discord" in log, (log, c1))
    e1 = c1[0]["embed"]
    check("the card has the title, romaji, status, progress, left, the cover colour and the poster", e1["title"] == "UPDATE: Source Title 2001" and fv(c1[0]) == {"🇯🇵 Romaji": "Src 2001", "📊 Status": "CURRENT", "✅ Progress": "5", "⏳ Left": "7"} and e1["color"] == 4432340 and e1["image"] == {"url": "https://img.test/cover2001.jpg"}, e1)
    check("it went to the General Updates thread of the anime channel", c1[0]["thread"] == "[ANIME] General Updates" and TS["threads"][c1[0]["thread_id"]]["starter"].startswith("📡 **General Updates**"), c1[0]["thread"])
    n = len(cards()); go()
    check("running again with no new progress posts nothing", len(cards()) == n)
    bump(0, -3); go(); n = len(cards())
    check("progress going down posts nothing (and is remembered quietly)", n == 1 and mem("anime")["media"]["2001"]["dp"] == 2)
    bump(0, 1); go()
    check("the next increase counts from the lower number", len(cards()) == 2 and fv(cards()[-1])["✅ Progress"] == "3", cards()[-1:])
    anime(*src(), E(2007, None, "CURRENT", 9, 0)); n = len(cards()); go()
    check("a title that is new to the list is remembered without a card", len(cards()) == n and mem("anime")["media"]["2007"]["dp"] == 9)

    # ---------- threads by custom list ----------
    fresh({"dcManga": ""})
    anime(E(2001, 5001, "CURRENT", 3, 0), E(2002, 5002, "CURRENT", 3, 0, lists=["Iseki"]), E(2003, 5003, "CURRENT", 3, 0, lists=["Random list"]), E(2004, 5004, "CURRENT", 3, 0, tags=["Isekai"]), E(2005, 5005, "CURRENT", 3, 0, fmt="MOVIE"), E(2006, 5006, "CURRENT", 11, 0))
    go()
    for i in range(5): bump(i)
    src()[5]["progress"] = 12; src()[5]["status"] = "COMPLETED"
    log = go(); by = {__import__("re").sub(r"^.*?Source Title ", "", c["embed"]["title"]): c["thread"] for c in cards()}   # standard or themed title
    check("every title goes to the right thread: its custom list, a guess from its tags or format, else General Updates", by == {"2001": "[ANIME] General Updates", "2002": "[ANIME] Iseki", "2003": "[ANIME] General Updates", "2004": "[ANIME] Iseki", "2005": "[ANIME] Anime Movies", "2006": "[ANIME] General Updates"}, by)
    iseki = [c for c in cards() if c["thread"] == "[ANIME] Iseki"]; plain = [c for c in cards() if c["thread"] == "[ANIME] General Updates"]
    check("themed cards: Iseki cards have the Isekai look (poster-coloured border, Isekai heading), other threads keep the standard card", len(iseki) == 2 and all(c["embed"]["color"] == page.evaluate("tsAdaptColor('#43a1d4', 0)") and c["embed"]["author"]["name"].startswith("🌀 ISEKAI GATE") and c["embed"]["title"].startswith("⚔️ ") for c in iseki) and all(c["embed"]["title"].startswith("UPDATE: ") for c in plain), [(c["thread"], c["embed"]["title"]) for c in cards()])
    page.select_option("#tsDcPreview", "romcom"); page.press("#tsDcPreview", "Tab"); n0 = len(cards()); page.click("#tsDcAnimeTest"); page.wait_for_function("document.querySelectorAll('#syncLog').length && document.querySelector('#syncLog').textContent.includes('look)') || true"); page.wait_for_timeout(900)
    last = cards()[-1] if len(cards()) > n0 else None
    check("the preview select makes the test button send the Rom Com look, into General Updates", bool(last) and last["embed"]["color"] == page.evaluate("tsAdaptColor('#43a1d4', 0)") and "Rom Com look" in last["embed"]["title"] and last["thread"] == "[ANIME] General Updates", last and (last["thread"], last["embed"]["title"]))
    page.select_option("#tsDcPreview", "")
    check("one thread per name, with the list in its starter message", sorted(v["name"] for v in TS["threads"].values()) == ["[ANIME] Anime Movies", "[ANIME] General Updates", "[ANIME] Iseki"] and any(v["starter"] == "📡 **Iseki** | ANIME Telemetry Dashboard" for v in TS["threads"].values()), TS["threads"])
    check("the card footer names the list (the Isekai look has its own footer, standard cards name the list)", [c["embed"]["footer"]["text"] for c in cards() if c["embed"]["title"].endswith("2002")] == ["🌀 Isekai · Tokyo Brotherhood"] and [c["embed"]["footer"]["text"] for c in cards() if c["embed"]["title"].endswith("2001")] == ["General Updates"])
    done = [c for c in cards() if c["embed"]["title"].endswith("2006")][0]["embed"]
    check("a completed series is marked, and left is 0", done.get("author") == {"name": "🏆 SERIES COMPLETED"} and [f["value"] for f in done["fields"] if "Left" in f["name"]] == ["0"], done)
    nthreads = len(TS["threads"]); bump(1); go()
    check("a later card for the same list reuses its thread", len(TS["threads"]) == nthreads and cards()[-1]["thread"] == "[ANIME] Iseki")
    page.fill("#tsDcLists", "favourite"); page.press("#tsDcLists", "Tab"); bump(1); go()
    check("lists not named in the setting go to General Updates", cards()[-1]["thread"] == "[ANIME] General Updates", cards()[-1]["thread"])

    # ---------- the manga webhook ----------
    fresh({"dcAnime": ""})
    harness.TS["src"]["MANGA"][0]["progress"] = 20
    log = go("#syncNowManga"); check("manga: first run posts nothing", cards() == [] and "Done." in log, log)
    bump(0, 5, "MANGA"); log = go("#syncNowManga"); c = cards()
    check("manga: a card goes to the manga webhook with chapters left", len(c) == 1 and c[0]["hook"] == "222" and c[0]["thread"] == "[MANGA] General Updates" and fv(c[0])["✅ Progress"] == "25" and fv(c[0])["⏳ Left"] == "55" and c[0]["embed"]["title"] == "UPDATE: Source Title 3001", c)
    fresh(); page.click("#syncBoth"); wait_done(); bump(0); bump(0, 1, "MANGA")
    page.click("#syncBoth"); wait_done(); page.wait_for_function("document.querySelector('#syncLog').textContent.includes('manga')", timeout=15000); wait_done()
    check("Sync both posts anime cards to the anime webhook and manga cards to the manga one", sorted(c["hook"] for c in cards()) == ["111", "222"], [c["hook"] for c in cards()])

    # ---------- odd channels and failures ----------
    fresh({"dcManga": ""}); TS["discord_plain"] = True; anime(E(2001, 5001, "CURRENT", 3, 0), E(2002, 5002, "CURRENT", 3, 0)); go(); bump(0); bump(1); go()
    check("a plain channel (not a forum) just gets the cards, and the thread attempt is made once per run, not once per card", len(cards()) == 2 and all(c["thread"] is None for c in cards()) and len([u for u in TS["discord_urls"] if "wait=true" in u]) == 1, (len(cards()), TS["discord_urls"]))
    TS["discord_plain"] = False; bump(0); go()
    check("if the channel is turned into a forum the next run makes threads again", len(TS["threads"]) == 1 and cards()[-1]["thread"] == "[ANIME] General Updates", (len(TS["threads"]), cards()[-1]))
    fresh({"dcManga": ""}); anime(E(2001, 5001, "CURRENT", 3, 0)); go(); bump(0); go(); old = list(TS["threads"])[0]; TS["dead_threads"].add(old); bump(0); log = go()
    check("a deleted thread is replaced by a new one and the card still arrives", len(TS["threads"]) == 2 and cards()[-1]["thread_id"] != old and "Couldn't post" not in log, (log, TS["threads"]))
    fresh({"dcManga": ""}); anime(E(2001, 5001, "CURRENT", 3, 0)); go(); TS["discord_card_fail"] = True; bump(0); log = go()
    check("a webhook Discord says is deleted is reported in Discord's words, with what to do, and the sync still finishes", "Discord refused the anime webhook" in log and "Unknown Webhook (10015)" in log and "deleted, or its link is wrong" in log and "anime webhook" in log and "Done." in log and cards() == [], log)
    TS["discord_card_fail"] = False; go()
    check("the card that could not be posted is tried again on the next sync, once the webhook works", len(cards()) == 1 and fv(cards()[0])["✅ Progress"] == "4", cards())
    TS["discord_429"] = 1; bump(0); go()
    check("Discord's rate limit is waited out for cards too", len(cards()) == 2)
    fresh({"dcManga": ""}); anime(*[E(2300 + i, None, "CURRENT", 1, 0) for i in range(5)]); go()
    for i in range(5): bump(i)
    TS["gone_hooks"] = {"111"}; n = len(TS["discord_urls"]); log = go()
    check("with a deleted webhook it stops after the first try instead of failing on every card, and keeps all 5 cards", len(TS["discord_urls"]) - n == 1 and "5 card(s) not posted yet will be tried again" in log and cards() == [], (log, len(TS["discord_urls"]) - n))
    TS["gone_hooks"] = set(); go()
    check("once the webhook is back all 5 cards are posted", len(cards()) == 5, len(cards()))
    fresh({"dcManga": ""}); anime(*[E(2400 + i, None, "CURRENT", 1, 0) for i in range(4)]); go()
    for i in range(4): bump(i)
    TS["discord_5xx"] = True; n = len(TS["discord_urls"]); log = go()
    check("when Discord itself has a problem (a 5xx) it stops after one try and keeps all the cards for later", len(TS["discord_urls"]) - n == 1 and "Discord had a problem" in log and "4 card(s) not posted yet will be tried again" in log and cards() == [], (log, len(TS["discord_urls"]) - n))
    TS["discord_5xx"] = False; go()
    check("once Discord is back the cards are posted (nothing was lost)", len(cards()) == 4, len(cards()))
    fresh({"dcManga": ""}); anime(E(2001, 5001, "CURRENT", 3, 0)); go(); bump(0); go(); TS["discord_card_400"] = True; bump(0); log = go()
    check("a card Discord won't accept is reported with the title and Discord's reason", "Couldn't post the Discord card for Source Title 2001" in log and "Invalid Form Body (50035)" in log and "anime webhook" in log and "Done." in log, log)
    TS["discord_card_400"] = False; n = len(cards()); go()
    check("and, since the problem is that card, it is not posted later", len(cards()) == n)
    fresh({"dcManga": ""}); page.click("#tsDcAnimeTest"); page.wait_for_function("document.querySelector('#syncLog').textContent.includes('Test card')", timeout=8000)
    check("the test button first checks the webhook and says where the card went", "Webhook found: Test hook 111" in t("#syncLog") and "in the thread [ANIME] General Updates" in t("#syncLog"), t("#syncLog"))
    TS["gone_hooks"] = {"111"}; page.click("#tsDcAnimeTest"); page.wait_for_function("document.querySelector('#syncLog').textContent.includes('exist')", timeout=8000)
    check("on a deleted webhook the test button says so plainly and posts nothing", "doesn't exist (404)" in t("#syncLog") and "deleted, or the link is wrong" in t("#syncLog") and len(cards()) == 1, t("#syncLog"))
    TS["gone_hooks"] = set()

    # ---------- limits, preview, targets, auto ----------
    fresh({"dcManga": ""}); anime(*[E(2200 + i, None, "CURRENT", 1, 0) for i in range(60)]); go()
    for i in range(60): bump(i)
    log = go()
    check("at most 50 cards per run, and the rest are mentioned", len(cards()) == 50 and "10 more update(s) were not posted (limit 50 cards per run)" in log, (len(cards()), log))
    n = len(cards()); go()
    check("the ones past the limit are not posted later", len(cards()) == n)
    fresh({"dcManga": ""}); anime(E(2001, 5001, "CURRENT", 3, 0), E(2002, 5002, "CURRENT", 3, 0)); go(); bump(0); bump(1)
    log = go("#syncPreview")
    check("Preview says how many cards would be posted and posts none", "2 update card(s) would be posted" in log and cards() == [], log)
    fresh(targets=True); anime(E(2001, 5001, "CURRENT", 3, 0)); page.click("#syncNow"); page.wait_for_selector(".dsheet .dopt"); page.click('.dsheet .dopt:has-text("Only send changes")'); wait_done()
    check("with accounts connected the first run still posts no cards", cards() == [] and TS["al_saved"] == [])
    bump(0); TS["al_saved"].clear(); log = go()
    check("cards and the target sync happen in the same run", len(cards()) == 1 and [v["mediaId"] for v in TS["al_saved"]] == [2001] and "1 card(s) posted to Discord" in log and "1 sent to AniList" in log, log)
    fresh({"auto": True, "dcManga": ""}); anime(E(2001, 5001, "CURRENT", 3, 0)); go(); bump(0)
    page.evaluate("(() => { const s = JSON.parse(localStorage.getItem('wn_ts_state_anime')); s.last_run = Date.now() - 5 * 3600 * 1000; localStorage.setItem('wn_ts_state_anime', JSON.stringify(s)); })()")
    page.evaluate("maybeAutoSync()"); page.wait_for_timeout(1500)
    check("auto sync posts cards too, with no target account at all", len(cards()) == 1)
    fresh({"dcUrl": REPORT, "dcManga": "", "dcQuiet": False}); anime(E(2001, 5001, "CURRENT", 3, 0)); go(); bump(0); go()
    check("the log report is unchanged and separate: it goes only to its own webhook, in the same format", len(TS["discord"]) == 2 and TS["discord"][-1]["embeds"][0]["title"] == "AniList Triple Sync · Anime" and len(cards()) == 1 and cards()[0]["hook"] == "111", (len(TS["discord"]), len(cards())))
    fresh({"dcAnime": "", "dcManga": ""}); anime(E(2001, 5001, "CURRENT", 3, 0)); log = go()
    check("without any webhook or account a sync explains what to do", "Connect a target AniList account" in log and "Discord" in log, log)
    fresh({"dcAnime": "", "dcManga": "", "dcUrl": REPORT}, targets=True); page.uncheck("#tsProtect"); go(choice="Only send changes"); q = TS["src_queries"][-1]
    check("without a card webhook the source is read with the lighter query", "customLists" not in q and "coverImage" not in q and "tags{" not in q, q)
    check("narrow width: nothing sticks out sideways", page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"))
out = run(main, viewport=(360, 780))
real = [c for c in out["console"] if "ERR_INTERNET" not in c[1] and not any(("status of %d" % s) in c[1] for s in (400, 401, 403, 404, 429, 500, 503))]
check("no console errors", not real and not out["errors"], (real[:2], out["errors"][:2]))
print("\n%d checks, %d failed" % (len(R), R.count(False))); sys.exit(1 if False in R else 0)
