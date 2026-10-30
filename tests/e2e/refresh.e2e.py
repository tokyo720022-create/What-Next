import sys
from harness import *
import harness
R = []
def check(n, c, d=""): R.append(bool(c)); print(("PASS " if c else "FAIL ") + n + ((" :: " + str(d)) if d and not c else ""))
def main(page, out):
    cdp = page.context.new_cdp_session(page)
    def swipe(x0, y0, x1, y1, steps=10):
        cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x0, "y": y0}]})
        for i in range(1, steps + 1): cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": x0 + (x1 - x0) * i / steps, "y": y0 + (y1 - y0) * i / steps}]})
        cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
        page.wait_for_timeout(120)
    settle = lambda: page.wait_for_function("!document.querySelector('.ptrbox') || !document.querySelector('.ptrbox').classList.contains('busy')", timeout=8000)
    # --- Anime list ---
    page.click('#tabs [data-v="anime"]'); page.wait_for_selector("#listBody .lcard:not(.skel)"); page.wait_for_timeout(500)
    n = len(harness.COLLREQ); swipe(180, 160, 180, 520); settle(); page.wait_for_timeout(300)
    check("swipe down on the list reloads it from AniList", len(harness.COLLREQ) > n and harness.COLLREQ[-1] == "ANIME", harness.COLLREQ[n:])
    check("the circle goes away afterwards", page.evaluate("getComputedStyle(document.querySelector('.ptrbox')).opacity") == "0")
    n = len(harness.COLLREQ); swipe(180, 160, 180, 200); page.wait_for_timeout(500)
    check("a short pull does nothing", len(harness.COLLREQ) == n, harness.COLLREQ[n:])
    n = len(harness.COLLREQ); swipe(40, 300, 330, 330); page.wait_for_timeout(500)
    check("a sideways swipe does nothing", len(harness.COLLREQ) == n, harness.COLLREQ[n:])
    n = len(harness.COLLREQ); swipe(180, 500, 180, 200); page.wait_for_timeout(500)
    check("swiping up does nothing", len(harness.COLLREQ) == n, harness.COLLREQ[n:])
    page.evaluate("window.scrollTo(0, 600)"); page.wait_for_timeout(200)
    n = len(harness.COLLREQ); swipe(180, 160, 180, 520); page.wait_for_timeout(700)
    check("not at the top of the page: no refresh", len(harness.COLLREQ) == n, harness.COLLREQ[n:])
    page.evaluate("window.scrollTo(0, 0)"); page.wait_for_timeout(200)
    page.click("#lFilterBtn"); page.wait_for_selector("#fsheet:not([hidden])")
    n = len(harness.COLLREQ); swipe(180, 160, 180, 520); page.wait_for_timeout(700)
    check("a sheet is open: no refresh", len(harness.COLLREQ) == n, harness.COLLREQ[n:])
    page.evaluate("document.querySelector('#fsheet').hidden = true")
    # --- manga list refreshes the manga list ---
    page.click('#tabs [data-v="manga"]'); page.wait_for_selector("#listBody .lcard:not(.skel)"); page.wait_for_timeout(500)
    n = len(harness.COLLREQ); swipe(180, 160, 180, 520); settle(); page.wait_for_timeout(300)
    check("on Manga it reloads the manga list", len(harness.COLLREQ) > n and harness.COLLREQ[-1] == "MANGA", harness.COLLREQ[n:])
    # --- Pick: list, trending ---
    page.click('#tabs [data-v="pick"]'); page.wait_for_selector("#result .hero"); page.wait_for_timeout(400)
    n = len(harness.COLLREQ); swipe(180, 160, 180, 520); settle(); page.wait_for_timeout(400)
    check("on Pick it reloads your list and picks again", len(harness.COLLREQ) > n and page.locator("#result .hero").count() == 1, harness.COLLREQ[n:])
    # --- Seasonal ---
    page.evaluate("showTab('seasonal')"); page.wait_for_selector("#szList .szcard"); page.wait_for_timeout(300)
    n = len(harness.SZREQ); swipe(180, 160, 180, 520); settle(); page.wait_for_timeout(400)
    check("on Seasonal it loads the chart again", len(harness.SZREQ) > n, harness.SZREQ[n:])
    # --- Profile ---
    page.click('#tabs [data-v="profile"]'); page.wait_for_selector("#tendList .pftitem"); page.wait_for_timeout(500)
    n = len(harness.PROFREQ); swipe(180, 160, 180, 520); settle(); page.wait_for_timeout(500)
    check("on Profile it reloads tendencies and favourites", "tend" in harness.PROFREQ[n:] and any(x.startswith("fav:anime") for x in harness.PROFREQ[n:]), harness.PROFREQ[n:])
    check("Profile is filled in again afterwards", page.locator("#tendList .pftitem").count() >= 5 and page.locator("#favGrid .favt").count() >= 1)
    # --- Taste report ---
    page.evaluate("showTab('taste')"); page.wait_for_selector("#tzBody .tzhero"); page.wait_for_timeout(300)
    n = len(harness.TASTEREQ); swipe(180, 160, 180, 520); settle(); page.wait_for_timeout(600)
    check("on the taste report it works the report out again", len(harness.TASTEREQ) > n and page.locator("#tzBody .tzhero").count() == 1, harness.TASTEREQ[n:])
    # --- a screen with nothing to refresh ---
    page.evaluate("showTab('set-app')"); page.wait_for_timeout(200)
    swipe(180, 160, 180, 520); page.wait_for_timeout(500)
    check("settings pages ignore the swipe (no circle left behind)", page.evaluate("!document.querySelector('.ptrbox') || getComputedStyle(document.querySelector('.ptrbox')).opacity === '0'"))
    check("the page itself never scrolls sideways", page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"))
out = run(main, viewport=(360, 780))
real = [c for c in out["console"] if "ERR_INTERNET" not in c[1]]
check("no console errors", not real and not out["errors"], (real[:2], out["errors"][:2]))
print("\n%d checks, %d failed" % (len(R), R.count(False))); sys.exit(1 if False in R else 0)
