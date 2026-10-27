import sys
from harness import *
import harness
R = []
def check(n, c, d=""): R.append(bool(c)); print(("PASS " if c else "FAIL ") + n + ((" :: " + str(d)) if d and not c else ""))
def main(page, out):
    t = lambda sel: page.inner_text(sel)
    page.evaluate("showTab('stats')"); page.click('#statsSeg [data-s="progress"]'); page.wait_for_selector("#statsBody .pgtoday")
    page.wait_for_function("document.querySelector('#statsBody .pgnote').textContent.includes('include updates')")
    check("note says AniList updates are included", "AniList" in t("#statsBody .pgnote"))
    page.click('#statsBody .pgtoday .chip:has-text("3/day")'); page.wait_for_timeout(200)
    check("today counts AniList activity (3 + 1 = 4 of 3)", t("#statsBody .pgtoday .ring") == "4/3" and "Goal reached" in t("#statsBody .pgtoday"), t("#statsBody .pgtoday"))
    check("streak uses the same counts (today 4, then 3, 3, then a short day)", "3 day streak" in t("#statsBody .pgtoday") and "best 3" in t("#statsBody .pgtoday"), t("#statsBody .pgtoday"))
    counts = page.evaluate("[...document.querySelectorAll('#statsBody .pgday em')].map(e => e.textContent)")
    check("week chart shows seven days with each day's count", counts[-4:] == ["1", "3", "3", "4"] and len(counts) == 7, counts)
    check("days that reached the goal are coloured and today is marked", page.locator("#statsBody .pgday.met").count() == 3 and page.locator("#statsBody .pgday.today").count() == 1)
    check("Continue list shows what you're watching with progress", page.locator("#statsBody .pgrow").count() >= 1 and "Episode" in t("#statsBody .pgcont") or "Chapter" in t("#statsBody .pgcont"))
    first = page.locator("#statsBody .pgrow .mini:not([disabled])").first
    harness.SAVED.clear(); first.click(); page.wait_for_function("document.querySelector('#statsBody .pgtoday .ring').textContent === '5/3'")
    check("+1 in Continue counts straight away and is saved", len(harness.SAVED) == 1 and "progress" in harness.SAVED[0], harness.SAVED)
    # a failed save takes the count back
    NET["saveerr"] = True; page.locator("#statsBody .pgrow .mini:not([disabled])").first.click(); page.wait_for_function("document.querySelector('#statsBody .pgtoday .ring').textContent === '5/3'", timeout=8000); page.wait_for_timeout(600)
    check("a failed save does not leave a count behind", t("#statsBody .pgtoday .ring") == "5/3", t("#statsBody .pgtoday .ring"))
    NET["saveerr"] = False
    check("backlog tiles remain", "backlog" in t("#statsBody").lower() and "finished this month" in t("#statsBody"))
    check("narrow width: nothing sticks out sideways", page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"))
out = run(main, viewport=(360, 780))
real = [c for c in out["console"] if "ERR_INTERNET" not in c[1] and "status of 5" not in c[1]]
check("no console errors", not real and not out["errors"], (real[:2], out["errors"][:2]))
print("%d checks, %d failed" % (len(R), R.count(False))); sys.exit(1 if False in R else 0)
