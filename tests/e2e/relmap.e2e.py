import sys
from harness import *
import harness
R = []
def check(n, c, d=""): R.append(bool(c)); print(("PASS " if c else "FAIL ") + n + ((" :: " + str(d)) if d and not c else ""))
def boxes(page): return page.evaluate("[...document.querySelectorAll('#rmInner .rmnode')].map(n => ({id: +n.dataset.id, x: n.offsetLeft, y: n.offsetTop, w: n.offsetWidth, h: n.offsetHeight}))")
def main(page, out):
    t = lambda sel: page.inner_text(sel)
    page.evaluate("openMedia(1001)"); page.wait_for_selector('#media button:has-text("Relation map")')
    check("media page has a Relation map button", True)
    page.click('#media button:has-text("Relation map")'); page.wait_for_selector("#relmap .rmnode"); page.wait_for_function("/found|no related/.test(document.querySelector('#rmStatus').textContent)")
    check("map opens above and the media page steps aside", page.locator("#relmap").is_visible() and page.locator("#media").is_hidden())
    nb = boxes(page); ids = sorted(b["id"] for b in nb)
    check("core + related titles are drawn, characters are not", ids == [1001, 5000, 5002, 5003, 5004, 5005, 5006, 5007, 5010, 5011], ids)
    check("status line counts related titles", "9 related titles" in t("#rmStatus"), t("#rmStatus"))
    check("character links were not requested yet", all(5020 not in r for r in harness.RMREQS), harness.RMREQS)
    check("titles are loaded in a few batches", 1 <= len(harness.RMREQS) <= 5 and all(len(r) <= 50 for r in harness.RMREQS), harness.RMREQS)
    by = {b["id"]: b for b in nb}
    check("source above, prequel above, sequel and side stories below", by[5000]["y"] < by[1001]["y"] and by[5010]["y"] < by[1001]["y"] and by[5002]["y"] > by[1001]["y"] and by[5003]["y"] > by[1001]["y"])
    check("sequel's sequel is a row further down", by[5007]["y"] > by[5002]["y"])
    ov = [(a["id"], b["id"]) for i, a in enumerate(nb) for b in nb[i + 1:] if a["x"] < b["x"] + b["w"] and b["x"] < a["x"] + a["w"] and a["y"] < b["y"] + b["h"] and b["y"] < a["y"] + a["h"]]
    check("no two titles overlap", not ov, ov)
    labels = page.evaluate("[...document.querySelectorAll('#rmInner .rmlabel')].map(l => l.textContent)")
    check("relation labels on the map", all(any(x.startswith(w) for x in labels) for w in ("Source", "Prequel", "Sequel", "Side story · 2", "Spin-off", "Alternative")), labels)
    check("root is highlighted and shows Completed", page.evaluate("document.querySelector('.rmnode.root').dataset.id") == "1001" and "Completed" in page.inner_text(".rmnode.root"))
    check("planning title shows ✓ Planning, others offer + Add to list", "Planning" in page.inner_text('.rmnode[data-id="5002"]') and "+ Add to list" in page.inner_text('.rmnode[data-id="5003"]'))
    check("connector lines are drawn", page.evaluate("document.querySelectorAll('#rmSvg path').length") >= 18)
    # zoom
    z0 = t("#rmZoom"); page.click("#rmPlus"); z1 = t("#rmZoom"); page.click("#rmMinus"); page.click("#rmMinus"); z2 = t("#rmZoom")
    check("zoom buttons change the zoom", int(z1[:-1]) > int(z0[:-1]) > int(z2[:-1]), (z0, z1, z2))
    page.click("#rmFit"); fit = int(t("#rmZoom")[:-1]); check("fit shows the whole map width", page.evaluate("document.querySelector('#rmView').scrollWidth <= document.querySelector('#rmView').clientWidth + 2"), fit)
    # fold a branch by tapping its label
    n0 = page.locator("#rmInner .rmnode").count(); page.click('#rmInner .rmlabel[data-key="1001|SIDE_STORY"]')
    check("folding Side story hides its 2 titles", page.locator("#rmInner .rmnode").count() == n0 - 2 and page.locator('#rmInner .rmlabel[data-key="1001|SIDE_STORY"]').inner_text().endswith("+"))
    page.click('#rmInner .rmlabel[data-key="1001|SIDE_STORY"]'); check("unfolding brings them back", page.locator("#rmInner .rmnode").count() == n0)
    # branches sheet
    page.click("#rmBranches"); page.wait_for_selector("#rmBranchList .rmbrow"); n = page.locator("#rmBranchList .rmbrow").count()
    check("Branches sheet lists the branches", n >= 5, n)
    page.evaluate("[...document.querySelectorAll('#rmBranchList .rmbrow')].find(r => /Spin-off/.test(r.textContent)).querySelector('input').click()")
    check("unticking a branch folds it", page.locator("#rmInner .rmnode").count() == n0 - 1, page.locator("#rmInner .rmnode").count())
    page.evaluate("[...document.querySelectorAll('#rmBranchList .rmbrow')].find(r => /Spin-off/.test(r.textContent)).querySelector('input').click()"); page.click("#rmBranchDone")
    check("branches sheet closes", page.locator("#rmBranchSheet").is_hidden())
    # Core off
    page.click("#rmCore"); check("Core off: only related links stay", sorted(b["id"] for b in boxes(page)) == [1001, 5003, 5004, 5005, 5006], sorted(b["id"] for b in boxes(page)))
    page.click("#rmCore")
    # characters on
    page.click("#rmChar"); page.wait_for_function("document.querySelectorAll('#rmInner .rmnode').length >= 12 && /found/.test(document.querySelector('#rmStatus').textContent)")
    check("Character links are loaded on demand", any(5020 in r for r in harness.RMREQS) and "11 related" in t("#rmStatus"), t("#rmStatus"))
    page.click("#rmChar"); check("Character off hides them again", page.locator("#rmInner .rmnode").count() == 10)
    # add to list from the map
    harness.SAVED.clear(); page.click('.rmnode[data-id="5003"] .rmadd'); page.wait_for_function("document.querySelector('.rmnode[data-id=\"5003\"]').innerText.includes('Planning')")
    check("+ Add to list saves Planning", [(s.get("mediaId"), s.get("status")) for s in harness.SAVED] == [(5003, "PLANNING")], harness.SAVED)
    # list view
    page.click("#rmList"); page.wait_for_selector("#rmListView .rmrow")
    lv = t("#rmListView"); check("List view groups titles by relation", "THIS TITLE" in lv and "SIDE STORY" in lv.upper() and "Show 5002" in lv and page.locator("#rmView").is_hidden() and page.locator("#rmBar").is_hidden())
    page.click("#rmList"); check("back to the map", page.locator("#rmView").is_visible())
    # watch order
    page.click("#rmOrder"); page.wait_for_selector("#rmOrderView .rmorow")
    ov = t("#rmOrderView"); check("Watch order lists the titles in release order with this title marked", "watch order" in ov.lower() and "This title" in ov and page.locator("#rmView").is_hidden() and page.locator("#rmListView").is_hidden() and page.locator("#rmOrderView .rmorow").count() >= 5, ov[:90])
    check("exactly one title is marked Next up or Start here", page.locator("#rmOrderView .rmotag.go").count() == 1, page.locator("#rmOrderView .rmotag.go").count())
    page.click("#rmOrder"); check("back to the map from the order view", page.locator("#rmView").is_visible() and page.locator("#rmOrderView").is_hidden())
    # opening a title from the map, then returning
    page.click('.rmnode[data-id="5004"] .rmttl'); page.wait_for_selector("#media:not([hidden])")
    check("tapping a title opens its page above the map", page.locator("#media").is_visible() and page.locator("#relmap").is_visible())
    page.click("#media .mbtn"); page.wait_for_timeout(300)
    check("closing it returns to the map", page.locator("#media").is_hidden() and page.locator("#relmap").is_visible())
    page.click("#rmBack"); page.wait_for_selector("#media:not([hidden])")
    check("Back from the map returns to the first title's page", page.locator("#relmap").is_hidden() and page.locator("#media").is_visible() and "English Title 1" in t("#media"), t("#media")[:60])
    check("remembered toggles", page.evaluate("JSON.parse(localStorage.getItem('wn_rm')).core") is True)
    check("narrow width: nothing sticks out sideways", page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"))
out = run(main, viewport=(360, 780))
real = [c for c in out["console"] if "ERR_INTERNET" not in c[1]]
check("no console errors", not real and not out["errors"], (real[:2], out["errors"][:2]))
print("%d checks, %d failed" % (len(R), R.count(False))); sys.exit(1 if False in R else 0)
