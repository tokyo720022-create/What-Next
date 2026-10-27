import sys
from harness import *
import harness
R = []
def check(n, c, d=""): R.append(bool(c)); print(("PASS " if c else "FAIL ") + n + ((" :: " + str(d)) if d and not c else ""))
def main(page, out):
    t = lambda sel: page.inner_text(sel)
    page.click('#tabs [data-v="discover"]'); page.wait_for_selector("#dlist .dcard")
    check("Discover shows search, type chips, tiles and an Explore list", page.locator("#dq").is_visible() and page.locator("#dKinds .chip").count() == 6 and page.locator("#dTiles .dtile").count() == 4 and t("#dTitle") == "Explore Anime")
    tiles = t("#dTiles")
    check("tiles: Seasonal, Calendar, For you, Rediscover", all(x in tiles for x in ("Seasonal", "Calendar", "For you", "Rediscover")))
    check("old clutter is gone", "Find titles" not in t("#discover") and page.locator("#dgo, #dadult, #dsort, #dgenre").count() == 0)
    d0 = harness.DREQ[0]
    check("default request hides 18+ and unreleased titles", d0.get("adult") is False and d0.get("type") == "ANIME" and d0.get("sort") == ["POPULARITY_DESC"] and d0.get("statusNot") == "NOT_YET_RELEASED", d0)
    check("ranked 1, 2, 3 on the covers", page.evaluate("[...document.querySelectorAll('#dlist .drank')].slice(0, 3).map(r => r.textContent)") == ["1", "2", "3"])
    check("first page has 30 titles", page.locator("#dlist .dcard").count() == 30, page.locator("#dlist .dcard").count())
    page.evaluate("window.scrollTo(0, document.body.scrollHeight)"); page.wait_for_function("document.querySelectorAll('#dlist .dcard').length > 30")
    page.evaluate("window.scrollTo(0, document.body.scrollHeight)"); page.wait_for_timeout(500)
    check("scrolling to the end loads the next page by itself (no button)", page.locator("#dlist .dcard").count() >= 42 and page.locator("#dmore").is_hidden(), page.locator("#dlist .dcard").count())
    page.evaluate("window.scrollTo(0, 0)")
    # a completed title must not offer + Planning (it used to overwrite the status)
    card = page.locator('#dlist .dcard:has-text("Catalog Anime 2")').first
    check("a Completed title shows its status and no + Planning button", "COMPLETED" in card.inner_text().upper() and card.locator("button:has-text('Planning')").count() == 0, card.inner_text())
    card1 = page.locator('#dlist .dcard:has-text("Catalog Anime 1")').first
    harness.SAVED.clear(); card1.locator("button:has-text('+ Planning')").click(); page.wait_for_timeout(600)
    check("+ Planning on an unlisted title saves Planning and shows the chip", [(s.get("mediaId"), s.get("status")) for s in harness.SAVED] == [(7001, "PLANNING")] and "PLANNING" in card1.inner_text().upper(), harness.SAVED)
    # ---- live search
    n0 = len(harness.DREQ); page.click("#dq"); page.keyboard.type("naruto", delay=40); page.wait_for_function("document.querySelector('#dTitle').textContent.includes('naruto')"); page.wait_for_timeout(700)
    new = harness.DREQ[n0:]
    check("typing searches by itself, after one short pause", len(new) == 1 and new[0].get("q") == "naruto", new)
    check("search uses best-match order", new and new[0].get("sort") == ["SEARCH_MATCH"], new)
    names = page.evaluate("[...document.querySelectorAll('#dlist .dcard b')].map(b => b.textContent)")
    check("results match the words typed", names and all("Naruto" in n for n in names) and page.locator("#dlist .drank").count() == 0 and page.locator("#dTiles").is_hidden(), names[:3])
    page.fill("#dq", ""); page.wait_for_function("document.querySelector('#dTitle').textContent === 'Explore Anime'"); page.wait_for_selector("#dlist .drank")
    check("clearing the box brings the tiles and ranking back", page.locator("#dTiles").is_visible())
    # ---- each type
    for k, expect in (("characters", "Satoru Gojou"), ("staff", "Hayao Miyazaki"), ("studios", "MAPPA")):
        page.click('#dKinds [data-k="%s"]' % k); page.wait_for_function("document.querySelector('#dTitle').textContent.includes('%s')" % k.capitalize()); page.wait_for_selector("#dlist .dcard")
        check("Explore %s lists them" % k, expect in t("#dlist") and "♥" in t("#dlist"))
    page.click('#dKinds [data-k="characters"]'); page.wait_for_selector('#dlist .dcard:has-text("Levi")')
    check("characters are ranked by favourites with counts", t("#dlist .dcard:nth-child(1)").startswith("1") and "39,385" in t("#dlist") and page.evaluate("[...document.querySelectorAll('#dlist .drank')].map(r => r.textContent)") == ["1", "2", "3"])
    page.click('#dKinds [data-k="users"]'); page.wait_for_function("document.querySelector('#dlist').textContent.includes('Type a name')")
    check("Users asks for a name first", "Type a name" in t("#dlist") and page.locator("#dFilterBtn").is_hidden())
    page.click("#dq"); page.keyboard.type("more", delay=30); page.wait_for_selector("#dlist .ucard")
    check("user search shows people with Mutual badge", "Moreaumi" in t("#dlist") and "Mutual" in t("#dlist"))
    page.click("#dlist .ucard .uname"); page.wait_for_selector("#user .pname"); check("tapping a user opens their profile", t("#user .pname") == "Moreaumi"); page.click("#user .uback")
    page.fill("#dq", ""); page.click('#dKinds [data-k="anime"]'); page.wait_for_selector("#dlist .drank")
    # ---- filters
    page.click("#dFilterBtn"); page.wait_for_selector(".dsheet")
    check("filter sheet has all the options", all(x.lower() in t(".dsheet").lower() for x in ("Sort", "Genres", "Year", "Season", "Format", "Status", "Country", "Source", "On my list", "18+ content", "Choose tags")), t(".dsheet")[:200])
    page.click('.dsheet .chip:has-text("Drama")'); page.select_option('.dsheet select >> nth=1', "2012" if False else "2012"); page.select_option('.dsheet label:has-text("On my list") select', "HIDE"); page.select_option('.dsheet label:has-text("18+ content") select', "ALL")
    page.click('.dsheet button:has-text("Choose tags")'); page.wait_for_selector(".dtag"); check("tag picker hides adult tags while 18+ is included? (included, so shown)", "Nudity" in t(".dtaglist"))
    page.click('.dtag:has-text("Isekai") input'); page.fill('.dsheet input[placeholder="Search tags"]', "time"); check("tag search narrows the list", "Time Loop" in t(".dtaglist") and "Isekai" not in t(".dtaglist")); page.click('.dsheet button:has-text("Done") >> nth=-1')
    page.click('.dsheet button:has-text("Apply")'); page.wait_for_function("document.querySelector('#dFilterN') && !document.querySelector('#dFilterN').hidden"); page.wait_for_timeout(500)
    f = harness.DREQ[-1]
    check("applied filters reach AniList", f.get("genres") == ["Drama"] and f.get("tags") == ["Isekai"] and f.get("year") == 2012 and f.get("onList") is False and "adult" not in f, f)
    check("filter button shows how many are active", t("#dFilterN") == "5", t("#dFilterN"))
    page.click("#dFilterBtn"); page.click('.dsheet button:has-text("Reset")'); page.click('.dsheet button:has-text("Apply")'); page.wait_for_function("document.querySelector('#dFilterN').hidden"); page.wait_for_timeout(400)
    check("Reset clears them", harness.DREQ[-1].get("adult") is False and "genres" not in harness.DREQ[-1] and "tags" not in harness.DREQ[-1], harness.DREQ[-1])
    # ---- For you and Rediscover
    page.click('#dTiles .dtile:has-text("For you")'); page.wait_for_selector("#dmlist .dcard")
    fy = harness.DREQ[-1]
    check("For you only asks for titles that are not on your list", t("#dmTitle") == "For you" and fy.get("onList") is False and fy.get("sort") == ["TRENDING_DESC"] and page.locator("#dHub").is_hidden(), fy)
    n = page.locator("#dmlist .dcard").count(); page.locator("#dmlist .dcard button:has-text('Not interested')").first.click(); check("Not interested removes the card", page.locator("#dmlist .dcard").count() == n - 1)
    page.click("#dmBack"); check("back returns to the Discover home", page.locator("#dHub").is_visible())
    page.click('#dTiles .dtile:has-text("Rediscover")'); page.wait_for_selector("#dmlist .dcard")
    check("Rediscover lists paused and dropped titles", t("#dmTitle") == "Rediscover" and "PAUSED" in t("#dmlist").upper() and "DROPPED" in t("#dmlist").upper())
    page.click("#dmBack")
    page.click('#dTiles .dtile:has-text("Seasonal")'); page.wait_for_selector("#seasonal:not([hidden])"); check("Seasonal tile opens the chart", True)
    check("narrow width: nothing sticks out sideways", page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"))
out = run(main, viewport=(360, 780))
real = [c for c in out["console"] if "ERR_INTERNET" not in c[1]]
check("no console errors", not real and not out["errors"], (real[:2], out["errors"][:2]))
print("%d checks, %d failed" % (len(R), R.count(False))); sys.exit(1 if False in R else 0)
