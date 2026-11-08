# The upgraded list, Pick, media-banner and editor screens.
import sys
from harness import *
R = []
def check(n, c, d=""): R.append(bool(c)); print(("PASS " if c else "FAIL ") + n + ((" :: " + str(d)) if d and not c else ""))
def main(page, out):
    page.evaluate("showTab('anime')"); page.wait_for_selector("#listBody .lcard:not(.skel)"); page.wait_for_timeout(500)
    check("the list draws 24 titles at a time", page.locator("#listBody .lcard").count() == 24, page.locator("#listBody .lcard").count())
    check("the toolbar fits the screen (no sideways scroll)", page.evaluate("(() => { const t = document.querySelector('.ltools'); return t.scrollWidth <= t.clientWidth + 1; })()"))
    check("status chips have a colour dot hook and a count", page.locator("#listStatus .chip[data-s]").count() >= 2 and page.locator("#listStatus .chip .cnt").count() >= 2)
    check("the status row stays at the top while you scroll", page.evaluate("getComputedStyle(document.querySelector('#listStatus')).position") == "sticky")
    # airing badge: episodes you haven't watched, or when the next one airs
    page.evaluate("""() => { const L = lists.anime; for(const e of L.entries) if(e.status === 'CURRENT') e.m.nextAiringEpisode = { episode: 8, airingAt: Math.round(Date.now() / 1000) + 2 * 86400 + 600 }; L.sig = null; L.drawn = 0; renderList(); }""")
    page.wait_for_timeout(300)
    badges = page.evaluate("[...document.querySelectorAll('#listBody .lcard')].map(c => [c.querySelector('.lp').textContent.trim(), (c.querySelector('.lair') || {}).textContent || '', !!c.querySelector('.lair.new')])")
    new = [b for b in badges if b[2]]; soon = [b for b in badges if b[1] and not b[2]]
    check("an episode you haven't seen yet shows '<n> new'", new and all(b[1].endswith(" new") for b in new), badges[:6])
    check("a show you are up to date on shows when the next episode airs", soon and all(b[1].startswith("Ep 8 · 2d") for b in soon), badges[:6])
    check("a finished or dropped title shows no airing badge", page.evaluate("[...document.querySelectorAll('#listBody .lcard')].filter(c => ['COMPLETED','DROPPED'].includes(c.dataset.s)).every(c => !c.querySelector('.lair'))"))
    # media page banner
    page.click("#listBody .lcard .lmain >> nth=0"); page.wait_for_selector("#media .mstatus")
    page.evaluate("(() => { const m = mcache.get(mstack[mstack.length - 1]); m.bannerImage = 'https://img.test/banner.jpg'; renderMedia(m); })()"); page.wait_for_timeout(300)
    check("a title with a banner shows it sharp, with a fade into the page", page.locator("#media .mhead.hasbanner .mbg.banner").count() == 1 and page.evaluate("getComputedStyle(document.querySelector('#media .mbg')).filter") == "none")
    check("the stats card overlaps the banner's lower edge", page.evaluate("(() => { const h = document.querySelector('#media .mhead').getBoundingClientRect(), s = document.querySelector('#media .mstats').getBoundingClientRect(); return s.top < h.bottom; })()"))
    page.evaluate("(() => { const m = mcache.get(mstack[mstack.length - 1]); m.bannerImage = 'javascript:alert(1)'; renderMedia(m); })()"); page.wait_for_timeout(200)
    check("no banner (or a bad address): the blurred cover is used instead", page.locator("#media .mhead.hasbanner").count() == 0 and page.locator("#media .mbg:not(.banner)").count() == 1 and "blur" in page.evaluate("getComputedStyle(document.querySelector('#media .mbg')).filter"))
    # editor
    page.click("#media .mstatus"); page.wait_for_selector("#editor .sheetbar"); page.wait_for_timeout(300)
    check("the editor has a cover header and card sections", page.locator("#editor .ehero img").count() == 1 and page.locator("#editor .esec").count() >= 5 and "English" in page.inner_text("#editor .ehero h2"))
    check("status buttons carry their status for the colour dot", page.evaluate("[...document.querySelectorAll('#editor .seg .chip[data-s]')].map(b => b.dataset.s)") == ["CURRENT", "PLANNING", "COMPLETED", "REPEATING", "PAUSED", "DROPPED"] or page.locator("#editor .seg .chip[data-s]").count() == 6)
    check("priority is one connected control", page.locator("#editor .seg4 .chip").count() == 4)
    check("private is a switch", page.locator("#editor .sw input[type=checkbox]").count() == 1)
    total = page.evaluate("Number(document.querySelector('#editor .stepper input').closest('.esec').querySelector('.esub').textContent.match(/(\\d+)% /)[1]) >= 0 && 12")
    page.click("#editor .efin"); page.wait_for_timeout(200)
    check("'All' jumps to the last episode and says so", page.input_value("#editor .stepper input") == "12" and "100% watched · 0 left" in page.inner_text("#editor .esec .esub"), (page.input_value("#editor .stepper input"), page.inner_text("#editor .esec .esub")))
    page.click("#editor .sheethead .mini >> nth=0"); page.wait_for_timeout(300)
    # Pick
    page.evaluate("showTab('pick')"); page.wait_for_selector("#result .hero"); page.wait_for_timeout(300)
    check("Pick card: score, format and genres as chips", page.locator("#result .hchips .hchip").count() >= 2)
    check("Pick card: an 'Up next' tile with time and place", page.text_content("#result .actlab") == "Up next" and "About" in page.inner_text("#result .actrow") and "You're at" in page.inner_text("#result .actrow"))
    check("Pick buttons: Mark as done on its own row, Another and Hide below", page.locator("#result .btns .go").count() == 1 and page.locator("#result .btns .chip").count() == 2)
    check("Pick controls keep their text (icons are decoration)", page.inner_text("#pickBtn") == "Pick for me" and page.inner_text("#spinBtn") == "Surprise me" and page.inner_text("#lineupBtn") == "Build a lineup" and page.inner_text("#tastePickBtn") == "Something new for my taste")
out = run(main, viewport=(390, 844))
check("no page errors", not [e for e in out["errors"] if "favicon" not in e], out["errors"][:2])
print("%d checks, %d failed" % (len(R), R.count(False))); sys.exit(1 if False in R else 0)
