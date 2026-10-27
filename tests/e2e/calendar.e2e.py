import sys
from harness import *
import harness
R = []
def check(n, c, d=""): R.append(bool(c)); print(("PASS " if c else "FAIL ") + n + ((" :: " + str(d)) if d and not c else ""))
def main(page, out):
    t = lambda sel: page.inner_text(sel)
    page.evaluate("showTab('calendar')"); page.wait_for_selector("#czList .czcard")
    r0 = harness.CZREQ[0]; check("asks for today's airing", 86300 <= r0["to"] - r0["from"] <= 90100, r0)
    check("adult titles are hidden by default", page.locator("#czList .czcard").count() == 3, page.locator("#czList .czcard").count())
    times = page.evaluate("[...document.querySelectorAll('#czList .cztime')].map(x => x.textContent)")
    check("each card starts with the air time", times == ["18:00", "19:30", "20:00"], times)
    first = t("#czList .czcard:nth-child(1)")
    check("episode number and countdown", "Ep. 4" in first and ("in " in first or "ago" in first), first)
    check("list status badge", "WATCHING" in first.upper() and "PLANNING" in t("#czList .czcard:nth-child(2)").upper())
    check("streaming sites are shown, info links are not", "Crunchyroll" in first and "YouTube" in first and "Official Site" not in first, first)
    check("the banner is used behind the card", page.evaluate("document.querySelector('#czList .czcard').style.backgroundImage.includes('c8.jpg')"))
    # filters
    page.click("#czList2"); page.wait_for_timeout(200)
    check("only Watching and Planning list", page.locator("#czList .czcard").count() == 2 and page.get_attribute("#czList2", "aria-pressed") == "true")
    page.click("#czList2")
    page.click("#czSeason"); page.wait_for_timeout(200)
    check("only from the current season hides older shows", "Airing 9003" not in t("#czList") and page.get_attribute("#czSeason", "aria-pressed") == "true")
    page.click("#czSeason")
    page.click("#czAdult"); page.wait_for_timeout(200)
    check("Show adult content adds 18+ titles", page.locator("#czList .czcard").count() == 4 and "Airing 9004" in t("#czList"))
    page.click("#czAdult")
    check("choices are remembered", page.evaluate("JSON.parse(localStorage.getItem('wn_cz')).adult") is False)
    # days
    page.click("#czNext"); page.wait_for_function("document.querySelector('#czDate').value !== ''"); page.wait_for_timeout(300)
    r1 = harness.CZREQ[-1]; check("next day asks for tomorrow", 80000 <= r1["from"] - r0["from"] <= 93000, (r0, r1))
    check("a Today button appears", page.locator("#czToday").is_visible())
    page.click("#czToday"); page.wait_for_timeout(300); check("Today goes back", page.locator("#czToday").is_hidden())
    page.click("#czPrev"); page.wait_for_timeout(300); r2 = harness.CZREQ[-1]; check("previous day asks for yesterday", -93000 <= r2["from"] - r0["from"] <= -80000, r2)
    page.fill("#czDate", "2026-12-25"); page.wait_for_timeout(400)
    check("picking a date loads that day", page.input_value("#czDate") == "2026-12-25" and harness.CZREQ[-1]["from"] > r0["from"] - 1, harness.CZREQ[-1])
    # open a show
    page.click("#czList .czcard:nth-child(1) .czinfo b"); page.wait_for_selector("#media:not([hidden])"); check("tapping a card opens the title", page.locator("#media").is_visible())
    page.click("#media .mbtn"); page.wait_for_timeout(300)
    check("narrow width: nothing sticks out sideways", page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"))
out = run(main, viewport=(360, 780))
real = [c for c in out["console"] if "ERR_INTERNET" not in c[1]]
check("no console errors", not real and not out["errors"], (real[:2], out["errors"][:2]))
print("%d checks, %d failed" % (len(R), R.count(False))); sys.exit(1 if False in R else 0)
