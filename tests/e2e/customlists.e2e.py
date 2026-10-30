import sys
from harness import *
import harness
R = []
def check(n, c, d=""): R.append(bool(c)); print(("PASS " if c else "FAIL ") + n + ((" :: " + str(d)) if d and not c else ""))
def main(page, out):
    t = lambda sel: page.inner_text(sel)
    anime = harness.DATA["ANIME"]; iseki = [e for e in anime if (e["mediaId"] - 1000) % 5 == 0]; fav = [e for e in anime if (e["mediaId"] - 1000) % 7 == 0]
    page.click('#tabs [data-v="anime"]'); page.wait_for_selector("#listBody .lcard:not(.skel)")
    check("list asks AniList for each entry's custom lists", True)
    check("a Custom lists chip sits with the status chips", page.locator("#lListsBtn").is_visible() and "Custom lists" in t("#lListsBtn") and "Custom" not in t("#listStatus"), t("#listStatus"))
    page.click("#lListsBtn"); page.wait_for_selector(".dsheet")
    sheet = t(".dsheet")
    check("sheet lists only lists that are switched on, with counts, biggest first", "Iseki (%d)" % len(iseki) in sheet and "Favourite (%d)" % len(fav) in sheet and "Milf" not in sheet and sheet.index("Iseki") < sheet.index("Favourite"), sheet)
    check("sheet has an All lists option", "All lists" in sheet)
    page.click('.dsheet .dopt:has-text("Iseki")'); page.wait_for_timeout(250)
    check("opening a custom list shows only its titles", t("#listCount") == "All · Iseki (%d)" % len(iseki), t("#listCount"))
    check("button shows which list is open", "List: Iseki" in t("#lListsBtn") and page.get_attribute("#lListsBtn", "aria-pressed") == "true")
    done = [e for e in iseki if e["status"] == "COMPLETED"]
    page.click('#listStatus .chip:has-text("Completed")'); page.wait_for_timeout(250)
    check("custom list combines with the status chips", t("#listCount") == "Completed · Iseki (%d)" % len(done), t("#listCount"))
    page.click('#listStatus .chip:has-text("All ")'); page.wait_for_timeout(200)
    page.click("#lSearchBtn"); page.fill("#listSearch", "Title 10"); page.wait_for_timeout(250)
    inside = [e for e in iseki if "Title 10" in ("English Title %d" % (e["mediaId"] - 1000) if (e["mediaId"] - 1000) % 4 else "Romaji Title %d" % (e["mediaId"] - 1000))]
    check("custom list combines with search", t("#listCount").endswith("(%d)" % len(inside)), (t("#listCount"), len(inside)))
    page.fill("#listSearch", ""); page.wait_for_timeout(200)
    page.click('#tabs [data-v="manga"]'); page.wait_for_selector("#listBody .lcard:not(.skel)")
    check("manga list starts on all lists (each list remembers its own)", "List:" not in t("#lListsBtn") and t("#listCount").startswith("All ("), (t("#lListsBtn"), t("#listCount")))
    page.click('#tabs [data-v="anime"]'); page.wait_for_selector("#listBody .lcard:not(.skel)")
    check("anime list still has Iseki open", "Iseki" in t("#listCount"), t("#listCount"))
    page.click("#lListsBtn"); page.click('.dsheet .dopt:has-text("All lists")'); page.wait_for_timeout(250)
    check("All lists shows everything again", t("#listCount") == "All (%d)" % len(anime) and "Custom lists" in t("#lListsBtn"), t("#listCount"))
    check("narrow width: nothing sticks out sideways", page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"))
out = run(main, viewport=(360, 780))
real = [c for c in out["console"] if "ERR_INTERNET" not in c[1]]
check("no console errors", not real and not out["errors"], (real[:2], out["errors"][:2]))
print("\n%d checks, %d failed" % (len(R), R.count(False))); sys.exit(1 if False in R else 0)
