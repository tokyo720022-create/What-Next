# Character, staff, and studio pages: opening, favourites, voice actors, series, See more, and the back stack.
import sys
from harness import *
import harness
R = []
def check(n, c, d=""): R.append(bool(c)); print(("PASS " if c else "FAIL ") + n + ((" :: " + str(d)) if d and not c else ""))
STUB = """window.__cap = {}; window.__exited = false; window.__opened = [];
window.Capacitor = { isNativePlatform: () => true, Plugins: { App: { addListener: (n, cb) => { window.__cap[n] = cb; }, exitApp: () => { window.__exited = true; }, getLaunchUrl: () => Promise.resolve(null) }, Browser: { open: o => { window.__opened.push(o.url); return Promise.resolve(); }, close: () => {} } } };"""
def top(page): return page.inner_text("#media h1") if page.locator("#media h1").count() else ""
def main(page, out):
    page.click('#tabs [data-v="anime"]'); page.wait_for_selector("#listBody .lcard:not(.skel)")
    page.click("#listBody .lcard .lmain"); page.wait_for_selector("#media .mstats")
    # --- media page: links and the stats row
    studios = page.eval_on_selector_all("#media .irow .links .lk", "els => els.map(e => e.textContent)")
    check("media page: studios and producers are links", studios == ["Studio One", "Producer One"], studios)
    rows = page.eval_on_selector_all("#media .irow > span:first-child", "els => els.map(e => e.textContent)")
    check("media page: Studios and Producers rows exist", "Studios" in rows and "Producers" in rows, rows)
    s4 = page.eval_on_selector_all("#media .stat4 span", "els => els.map(e => e.textContent)")
    check("media page: Average, Mean, Popularity, Favorites row", s4 == ["Average", "Mean", "Popularity", "Favorites"], s4)
    # --- See more characters
    before = page.locator("#media .person").count()
    page.click("#media h3:has-text('Characters') button"); page.wait_for_timeout(500)
    after = page.locator("#media .person").count()
    check("See more adds more characters and then goes away", after == before + 2 and page.locator("#media h3:has-text('Characters') button").count() == 0, (before, after))
    # --- character page
    page.click("#media .person:has-text('Hero One')"); page.wait_for_selector("#media h1:has-text('Hero One')")
    check("character page: name, native name, numbers", "ヒーロー" in page.inner_text("#media .mrow") and "15" in page.inner_text("#media .mstats") and "Media" in page.inner_text("#media .mstats"), page.inner_text("#media .mstats"))
    check("character page: the spoiler in the About text is hidden until tapped", page.locator("#media .clamp .spl").count() == 1 and page.evaluate("getComputedStyle(document.querySelector('#media .clamp .spl')).color") == "rgba(0, 0, 0, 0)" and "Loves" in page.inner_text("#media .clamp"), page.inner_text("#media .clamp"))
    page.click("#media .clamp .spl", position={"x": 3, "y": 3}); check("character page: tapping the spoiler shows it", page.evaluate("document.querySelector('#media .clamp .spl').classList.contains('on')") and "Secret" in page.inner_text("#media .clamp"))
    vas = page.eval_on_selector_all("#media h3:has-text('Voice actors') + .hscroll .person", "els => els.map(e => e.textContent)")
    check("character page: voice actors listed once each, Japanese first", len(vas) == 2 and vas[0].startswith("Actor Jp"), vas)
    check("character page: series grid with roles", page.locator("#media .mgrid .mcard").count() == 2 and "MAIN" in page.inner_text("#media .mgrid"))
    harness.FAVS.clear(); page.click("#media .favbtn"); page.wait_for_timeout(400)
    check("favourite: sends the character toggle", harness.FAVS == [("c", 501)], harness.FAVS)
    check("favourite: button and count update", "Favorite" in page.inner_text("#media .favbtn") and page.inner_text("#media .favbtn").startswith("✓") and "16" in page.inner_text("#media .mstats"), page.inner_text("#media .mstats"))
    page.click("#media .favbtn"); page.wait_for_timeout(400)
    check("favourite: tapping again removes it", page.inner_text("#media .favbtn") == "Set as Favorite" and "15" in page.inner_text("#media .mstats"))
    # --- voice actor -> staff page
    page.click("#media .person:has-text('Actor Jp')"); page.wait_for_selector("#media h1:has-text('Actor Jp')")
    check("staff page: name, occupation, media grid, characters", "Voice Actor" in page.inner_text("#media") and page.locator("#media .mgrid .mcard").count() == 2 and page.locator("#media h3:has-text('Characters')").count() == 1)
    check("staff page: role shown under each title", "Sidekick" in page.inner_text("#media .mgrid"))
    # --- series -> media page, then the back stack
    page.click("#media .mgrid .mcard:first-child"); page.wait_for_selector("#media .mstats")
    check("tapping a series opens that title (the fake AniList names title 1003 'English Title 3')", "English Title 3" in top(page), top(page))
    page.click("#media .mbtn"); page.wait_for_selector("#media h1:has-text('Actor Jp')")
    check("close goes back to the staff page", True)
    page.click("#media .mbtn"); page.wait_for_selector("#media h1:has-text('Hero One')")
    check("close goes back to the character page", True)
    page.click("#media .mbtn"); page.wait_for_selector("#media .stat4")
    check("close goes back to the first media page", True)
    # --- studio page and See more
    page.click("#media .lk:has-text('Studio One')"); page.wait_for_selector("#media h1:has-text('Studio One')")
    check("studio page: favourites and 24 titles", "62" in page.inner_text("#media .mstats") and page.locator("#media .mgrid .mcard").count() == 24, page.locator("#media .mgrid .mcard").count())
    page.click("#media button:has-text('See more')"); page.wait_for_timeout(500)
    titles = page.eval_on_selector_all("#media .mgrid .mcard b", "els => els.map(e => e.textContent)")
    check("studio page: See more adds the rest with no repeats", len(titles) == 30 and len(set(titles)) == 30 and page.locator("#media button:has-text('See more')").count() == 0, len(titles))
    harness.FAVS.clear(); page.click("#media .favbtn"); page.wait_for_timeout(400)
    check("favourite: studio toggle uses the studio id", harness.FAVS == [("t", 77)], harness.FAVS)
    # --- Android back button walks down the stack
    page.click("#media .mgrid .mcard:first-child"); page.wait_for_selector("#media .mstats")
    page.evaluate("window.__cap.backButton()"); page.wait_for_selector("#media h1:has-text('Studio One')")
    check("Android back: from a title to the studio page", True)
    page.evaluate("window.__cap.backButton()"); page.wait_for_selector("#media .stat4")
    check("Android back: from the studio to the media page", True)
    page.evaluate("window.__cap.backButton()"); page.wait_for_timeout(300)
    check("Android back: last step returns to the list", page.eval_on_selector("#media", "e => e.hidden") and page.is_visible("#listBody .lcard"))
out = run(main, viewport=(390, 844), init=STUB)
real = [c for c in out["console"] if "favicon" not in c[1]]
check("no console errors", not real and not out["errors"], (real[:2], out["errors"][:2]))
print("%d checks, %d failed" % (len(R), R.count(False))); sys.exit(1 if False in R else 0)
