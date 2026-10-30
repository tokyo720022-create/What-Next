import sys
from harness import *
import harness
R = []
def check(n, c, d=""): R.append(bool(c)); print(("PASS " if c else "FAIL ") + n + ((" :: " + str(d)) if d and not c else ""))
def hero(page): return page.inner_text("#result .hero h2")
def main(page, out):
    page.on("response", lambda r: print("HTTP", r.status, r.url) if r.status == 404 else None)
    t = lambda sel: page.inner_text(sel)
    page.wait_for_selector("#result .hero")
    # --- titles that are not out yet never show in the normal pick ---
    bad = """(() => { const mk = (id, o) => ({ status: 'PLANNING', progress: 0, media: Object.assign({ id, type: 'ANIME', title: { romaji: 'X' + id, english: 'X' + id }, coverImage: { large: 'https://img.test/c1.jpg', extraLarge: 'https://img.test/c1.jpg' }, episodes: 12, duration: 24, genres: [], isAdult: false }, o) });
        state.items = [mk(1, { status: 'NOT_YET_RELEASED' }), mk(2, { status: 'RELEASING', nextAiringEpisode: { episode: 1, airingAt: 4102444800 } }), mk(3, { startDate: { year: 2099, month: 1, day: 1 } }), mk(4, { type: 'MANGA', status: 'NOT_YET_RELEASED', chapters: 20 })];
        state.skipped.clear(); pick(); return $('#result').textContent; })()"""
    check("not-yet-released, not-yet-aired and future-dated titles are never picked", "Nothing matches" in page.evaluate(bad), page.evaluate("$('#result').textContent"))
    ok_ = """(() => { state.items = [{ status: 'CURRENT', progress: 3, media: { id: 9, type: 'ANIME', title: { romaji: 'Airing', english: 'Airing' }, coverImage: { large: 'https://img.test/c1.jpg', extraLarge: 'https://img.test/c1.jpg' }, episodes: 12, duration: 24, genres: [], isAdult: false, status: 'RELEASING', nextAiringEpisode: { episode: 6, airingAt: 4102444800 } } }]; state.time = 120; pick(); return $('#result').textContent; })()"""
    txt = page.evaluate(ok_)
    check("an airing show only offers episodes that have aired", "Watch episode 4–5" in txt, txt)
    page.evaluate("state.time = 30")
    # --- the new pick ---
    check("button is on the Pick screen", "Something new for my taste" in t("#tastePickBtn"))
    page.click("#tastePickBtn"); page.wait_for_selector("#result .hero h2", timeout=15000)
    req = harness.PICKREQ
    check("asks AniList for titles NOT on the list and not yet released", all("onList:false" in r["_q"] and "status_not:NOT_YET_RELEASED" in r["_q"] for r in req) and len(req) >= 1, req[:1])
    check("uses the taste report's top genre and themes", req[0].get("g") and "Fantasy" in req[0]["g"] and any(r.get("tags") and "Isekai" in r["tags"] for r in req), [(r.get("g"), r.get("tags")) for r in req])
    seen = set()
    for _ in range(8):
        h = hero(page); seen.add(h)
        manga = "Manga" in t("#result .tag")   # a publishing manga with chapters is fine to read; an anime with no episode aired is not
        check("pick is a released, aired title: " + h, h in (("New Title 1", "New Title 3", "New Title 4") if manga else ("New Title 1", "New Title 4")), h)
        if len(seen) >= 2: break
        page.click('#result .btns .chip:has-text("Another")'); page.wait_for_timeout(250)
        page.wait_for_selector("#result .hero h2")
    check("tag says it is new for you, not from your list", "New for you" in t("#result .tag"), t("#result .tag"))
    check("no Mark as done, an Add to Planning button instead", page.locator('#result .btns .go:has-text("Add to Planning")').count() == 1 and page.locator('#result .btns .go:has-text("Mark as done")').count() == 0)
    check("no progress line for a title you have not started", "You're at" not in t("#result .act"))
    harness.SAVED.clear(); page.click('#result .btns .go:has-text("Add to Planning")'); page.wait_for_timeout(600)
    check("Add to Planning saves it", [(x.get("status")) for x in harness.SAVED] == ["PLANNING"] and harness.SAVED[0]["mediaId"] in (7001, 7003, 7004), harness.SAVED)
    # Hide keeps a title out
    page.click("#tastePickBtn"); page.wait_for_selector("#result .hero h2"); first = hero(page)
    page.click('#result .btns .chip:has-text("Hide")'); page.wait_for_selector("#result .hero h2, #result .msg"); page.wait_for_timeout(300)
    check("Hide removes it from new picks", "#result .hero h2" and (page.locator("#result .hero h2").count() == 0 or hero(page) != first))
    # filters apply
    page.evaluate("state.kind = 'MANGA'; pt.pools.clear()"); n0 = len(harness.PICKREQ); page.click("#tastePickBtn"); page.wait_for_selector("#result .hero h2", timeout=15000)
    check("Read filter asks for manga only", any(r["t"] == "MANGA" for r in harness.PICKREQ[n0:]) and not any(r["t"] == "ANIME" for r in harness.PICKREQ[n0:]), harness.PICKREQ[n0:])
    page.evaluate("state.kind = 'BOTH'; state.adult = 'HIDE'"); n1 = len(harness.PICKREQ); page.evaluate("pt.pools.clear()"); page.click("#tastePickBtn"); page.wait_for_selector("#result .hero h2", timeout=15000)
    check("Hide 18+ is sent to AniList", harness.PICKREQ[n1:] and all(r.get("adult") is False for r in harness.PICKREQ[n1:]), harness.PICKREQ[n1:])
    check("narrow width: nothing sticks out sideways", page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"))
out = run(main, viewport=(360, 780))
real = [c for c in out["console"] if "ERR_INTERNET" not in c[1]]
check("no console errors", not real and not out["errors"], (real[:2], out["errors"][:2]))
print("\n%d checks, %d failed" % (len(R), R.count(False))); sys.exit(1 if False in R else 0)
