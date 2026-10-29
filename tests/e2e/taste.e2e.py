import re
from harness import *
import harness
R = []
def check(n, c, d=""): R.append(bool(c)); print(("PASS " if c else "FAIL ") + n + ((" :: " + str(d)) if d and not c else ""))
def main(page, out):
    t = lambda sel: page.inner_text(sel)
    check("Pick shows a taste report card", "Your taste report" in t("#tasteBtn"), t("#tasteBtn"))
    page.click("#tasteBtn"); page.wait_for_selector("#tzBody .tzhero", timeout=15000)
    check("opens the taste screen and keeps the Pick tab lit", page.locator("#taste").is_visible() and page.locator('#tabs [data-v="pick"][aria-pressed="true"]').count() == 1)
    check("anime list asked once with the shared reference sample", [r for r in harness.TASTEREQ if r[0] == "list"] == [("list", "ANIME")] and [r[2] for r in harness.TASTEREQ if r[0] == "ref"] == [1, 2, 3, 4], harness.TASTEREQ)
    hero = t("#tzBody .tzhero")
    check("archetype comes from the strongest theme", "The Portal Hopper" in hero and "Isekai" in hero, hero)
    check("big lift shows as 5×+", "5×+" in hero, hero)
    check("themes below the average fan show a minus ratio", re.search(r"−\d+(\.\d)?×", hero) is not None, hero)
    code = t("#tzBody .tzcode")
    check("personality type has four letters", re.fullmatch(r"[NM][RF][DS][CA]", code) is not None, code)
    check("four sliders with a pole highlighted", page.locator("#tzBody .tzpoles").count() == 4 and page.locator("#tzBody .tzp.on").count() == 4)
    check("niche list gets hidden gems with rarity chips", "hidden gems" in t("#tzBody").lower() and page.locator("#tzBody .tzchip").count() >= 1)
    check("various genres bar and legend", page.locator("#tzBody .tzgbar b").count() >= 2 and "Fantasy" in t("#tzBody .tzlegend"), t("#tzBody .tzlegend"))
    check("biggest gaps list up to three titles", 1 <= page.locator("#tzBody .tzgap").count() <= 3 and "Fans" in t("#tzBody .tzgap"), t("#tzBody"))
    check("five vibe sliders", page.locator("#tzBody .tzvibe").count() == 5)
    check("footer says how many titles it used", "titles in your list" in t("#tzBody"))
    # share
    page.evaluate("window.__shared = null; navigator.share = async d => { window.__shared = d; }")
    page.click('#tzBody .go:has-text("Share my taste report")'); page.wait_for_timeout(200)
    shared = page.evaluate("window.__shared")
    check("share sends the archetype, type and themes", shared and "The Portal Hopper" in shared["text"] and code in shared["text"] and "Isekai" in shared["text"], shared)
    # a tile opens the media page
    page.locator("#tzBody .tzt").first.click(); page.wait_for_selector("#media:not([hidden])"); check("tapping a cover opens the title", True)
    page.evaluate("closeMedia()"); page.wait_for_timeout(200)
    # cached: reopening does not ask again
    before = len(harness.TASTEREQ)
    page.click('.back[data-go="pick"]'); page.wait_for_selector("#pickWrap:not([hidden])")
    check("entry card now shows the archetype and code", "The Portal Hopper" in t("#tasteBtn") and code in t("#tasteBtn"), t("#tasteBtn"))
    page.click("#tasteBtn"); page.wait_for_selector("#tzBody .tzhero")
    check("reopening uses the saved report (no new requests)", len(harness.TASTEREQ) == before, harness.TASTEREQ[before:])
    check("reference sample is kept on the device", page.evaluate("!!localStorage.getItem('wn_taste_ref_anime')"))
    # manga
    page.click('#tzKinds .chip[data-v="manga"]'); page.wait_for_selector("#tzBody .tzhero, #tzBody .msg:not(:has-text('Reading'))", timeout=15000); page.wait_for_selector("#tzBody .tzcode")
    check("manga asks for the manga list and its own sample", ("list", "MANGA") in harness.TASTEREQ and ("ref", "MANGA", 1) in harness.TASTEREQ, harness.TASTEREQ)
    check("manga chip is selected", page.get_attribute('#tzKinds .chip[data-v="manga"]', "aria-pressed") == "true")
    check("narrow width: nothing sticks out sideways", page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"))
    # offline error with retry
    page.evaluate("tz.cache = {}; localStorage.removeItem('wn_taste_ref_anime')"); harness.NET["off"] = True
    page.click('#tzKinds .chip[data-v="anime"]'); page.wait_for_selector("#tzBody .msg", timeout=10000); page.wait_for_function("document.querySelector('#tzBody').textContent.includes('reach AniList')")
    check("offline: a clear message with a retry button", "reach AniList" in t("#tzBody") and page.locator("#tzBody button").count() >= 1, t("#tzBody"))
    harness.NET["off"] = False
    page.click("#tzBody button"); page.wait_for_selector("#tzBody .tzhero", timeout=15000); check("retry loads the report", True)
    # back button chain
    page.click('.back[data-go="pick"]'); check("back returns to Pick", page.locator("#pickWrap").is_visible())
out = run(main, viewport=(360, 780))
real = [c for c in out["console"] if "ERR_INTERNET" not in c[1]]
check("no console errors", not real and not out["errors"], (real[:2], out["errors"][:2]))
print("\n%d checks, %d failed" % (len(R), R.count(False))); sys.exit(1 if False in R else 0)
