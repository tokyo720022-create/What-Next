import sys
from harness import *
R = []
def check(n, c, d=""): R.append(bool(c)); print(("PASS " if c else "FAIL ") + n + ((" :: " + str(d)) if d and not c else ""))
def main(page, out):
    page.evaluate("showTab('stats')"); page.wait_for_selector("#anistatsBody .asdonut")
    t = lambda sel: page.inner_text(sel)
    body = t("#anistatsBody")
    check("anime and manga columns with totals", "806" in body and "494" in body and "Total anime" in body and "Total manga" in body)
    check("days watched and chapters read", "136.1" in body and "11,148" in body)
    check("genres sorted with counts and percentages", "Comedy (418)" in body and "51.9%" in body and "Hentai (207)" in body)
    check("status legend uses watching/reading words", "Watching (111)" in body and "Reading (160)" in body and "Planning (341)" in body)
    check("status percentages", "42.3%" in body and "33.8%" in body)
    check("demographics built from tags with a not-specified slice", "Shounen (239)" in body and "Not specified" in body)
    check("formats named nicely", "TV (600)" in body and "TV Short (6)" in body and "One Shot (60)" in body)
    check("donuts drawn (status, demographics, formats for both)", page.locator("#anistatsBody svg.asdonut").count() == 6, page.locator("#anistatsBody svg.asdonut").count())
    check("no demographic tags inside the Tags list", page.evaluate("[...document.querySelectorAll('#anistatsBody .asbox')].filter(b => b.querySelector('h4').textContent === 'Tags').every(b => !/Shounen|Seinen/.test(b.textContent))"))
    check("genre bars are coloured per genre", page.evaluate("(() => { const i = document.querySelector('#anistatsBody .asgb i'); return i && i.style.background && i.style.width; })()"))
    # progress tab keeps the old tools
    page.click('#statsSeg [data-s="progress"]'); page.wait_for_selector("#statsBody .tile")
    check("Progress tab shows today, the week chart and backlog tiles", "backlog" in t("#statsBody").lower() and "today" in t("#statsBody").lower() and "last 7 days" in t("#statsBody").lower() and page.locator("#anistatsBody").is_hidden())
    page.click('#statsSeg [data-s="overview"]'); check("back to Overview", page.locator("#anistatsBody").is_visible())
    # the query asks for sort values and fields AniList knows
    check("narrow width: nothing sticks out sideways", page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"))
out = run(main, viewport=(360, 780))
real = [c for c in out["console"] if "ERR_INTERNET" not in c[1]]
check("no console errors", not real and not out["errors"], (real[:2], out["errors"][:2]))
print("%d checks, %d failed" % (len(R), R.count(False))); sys.exit(1 if False in R else 0)
