import json, re, sys
from harness import *
import harness
R = []
def check(name, cond, detail=""):
    R.append((name, bool(cond), detail)); print(("PASS " if cond else "FAIL ") + name + ((" :: " + str(detail)) if detail and not cond else ""))

def cards(page): return page.eval_on_selector_all("#listBody .lcard:not(.skel)", "els => els.map(e => ({s: e.dataset.s, label: (e.querySelector('.lmain')||{}).ariaLabel || '', title: (e.querySelector('.lt')||{}).textContent || '', vis: e.getBoundingClientRect().height > 40 && e.getBoundingClientRect().width > 40, img: !!(e.querySelector('img')||{}).src, prog: (e.querySelector('.lp')||{}).textContent || null, sc: (e.querySelector('.sc')||{}).textContent || null, plus: !!e.querySelector('.lplus')}))")
def chips(page): return page.eval_on_selector_all("#listStatus .chip", "els => els.map(e => ({t: e.textContent.trim(), on: e.getAttribute('aria-pressed') === 'true'}))")
def show_all(page):
    for _ in range(40):
        if page.eval_on_selector("#listMore", "e => e.hidden"): break
        page.click("#listMore"); page.wait_for_timeout(60)
def go(page, t): page.click('#tabs [data-v="%s"]' % t); page.wait_for_function("document.querySelector('#listBody .lcard') !== null", timeout=8000); page.wait_for_timeout(250)

def main(page, out):
    # ---- anime
    go(page, "anime")
    c = cards(page); total = harness.N
    check("anime: first batch renders (24 at a time)", len(c) == 24, len(c))
    check("anime: every card visible (non-zero size)", all(x["vis"] for x in c))
    check("anime: card shows cover, title, status, progress, score", all(x["img"] and x["title"] and x["s"] and x["prog"] and x["sc"] for x in c))
    bm = page.evaluate("(() => { const r = document.querySelector('#listBody').getBoundingClientRect(); return [r.width, r.height]; })()")
    check("anime: list area has real size (not collapsed)", bm[0] > 300 and bm[1] > 400, bm)
    check("anime: header count", page.inner_text("#listCount") == "All (%d)" % total, page.inner_text("#listCount"))
    labels = [x["t"].rsplit(" ", 1)[0] for x in chips(page)]
    check("anime: status tabs", labels == ["All", "Watching", "Rewatching", "Planning", "Paused", "Completed", "Dropped"], labels)
    # regression: going back to a list that has not changed must not leave the other list's cards on screen
    check("anime: the list area belongs to anime", page.get_attribute("#listBody", "data-list") == "anime" and "/ 12" in page.inner_text("#listBody .lcard:not(.skel) .lm"))
    go(page, "manga")
    check("manga: shows its own cards, not anime's", page.get_attribute("#listBody", "data-list") == "manga" and "/ 40" in page.inner_text("#listBody .lcard:not(.skel) .lm"))
    go(page, "anime")
    check("anime again: back on the anime cards, not the manga ones", page.get_attribute("#listBody", "data-list") == "anime" and "/ 12" in page.inner_text("#listBody .lcard:not(.skel) .lm") and page.inner_text("#listCount") == "All (%d)" % total)
    # show more
    n = 0
    while not page.eval_on_selector("#listMore", "e => e.hidden"):
        page.click("#listMore"); page.wait_for_timeout(60); n += 1
    c = cards(page); labs = [x["label"] for x in c]
    check("anime: show more reaches every entry", len(c) == total, (len(c), total))
    check("anime: no duplicate cards", len(set(labs)) == len(labs))
    # status tabs
    tabs = chips(page)
    ok = True; det = []
    for i, tb in enumerate(tabs):
        page.click("#listStatus .chip:nth-child(%d)" % (i + 1)); page.wait_for_timeout(120); show_all(page)
        want = int(tb["t"].rsplit(" ", 1)[1]); cs = cards(page)
        key = {"Watching": "CURRENT", "Rewatching": "REPEATING", "Planning": "PLANNING", "Paused": "PAUSED", "Completed": "COMPLETED", "Dropped": "DROPPED"}.get(tb["t"].rsplit(" ", 1)[0])
        good = len(cs) == want and (key is None or all(x["s"] == key for x in cs)) and len(set(x["label"] for x in cs)) == len(cs)
        if not good: ok = False; det.append((tb["t"], len(cs), want))
    check("anime: each status tab shows exactly its entries", ok, det)
    # status persists through search and layout change
    page.click("#listStatus .chip:nth-child(4)")  # Planning
    page.click("#lSearchBtn"); page.fill("#listSearch", "Title 1"); page.wait_for_timeout(200)
    sel = [x["t"] for x in chips(page) if x["on"]]
    check("anime: selected tab stays Planning while searching", sel and sel[0].startswith("Planning"), sel)
    cs = cards(page); check("anime: search narrows results within the tab", all(x["s"] == "PLANNING" and "Title 1" in x["title"] for x in cs) and len(cs) > 0, len(cs))
    page.fill("#listSearch", "zzzz-no-match"); page.wait_for_timeout(200)
    check("anime: empty state for no match", page.locator("#listBody .state").count() == 1 and "No titles match" in page.inner_text("#listBody"))
    page.click("#lSearchBtn"); page.wait_for_timeout(200)
    page.click("#listStatus .chip:nth-child(1)")
    # layouts and columns
    page.click("#lCustBtn")
    for cols in (2, 3, 4):
        page.click('#csCols .chip[data-v="%d"]' % cols); page.wait_for_timeout(100)
        gc = page.evaluate("getComputedStyle(document.querySelector('#listBody')).gridTemplateColumns.split(' ').length")
        check("layout: grid %d columns" % cols, gc == cols, gc)
    page.click('#csLayout .chip[data-v="linear"]'); page.wait_for_timeout(150)
    r = page.evaluate("(() => { const c = document.querySelector('#listBody .lcard'); const x = c.getBoundingClientRect(); return {cls: document.querySelector('#listBody').className, w: x.width, h: x.height, flex: getComputedStyle(c.querySelector('.lmain')).display} })()")
    check("layout: list rows render as wide short rows", r["cls"] == "lrows" and r["w"] > 300 and 60 < r["h"] < 200, r)
    page.click("#csHideUnscored"); page.click("#csHideProgress"); page.wait_for_timeout(150)
    c = cards(page)
    check("customise: hide progress removes progress text", all(x["prog"] is None for x in c))
    check("customise: hide unscored hides score only when unscored", any(x["sc"] is None for x in c) and any(x["sc"] for x in c))
    page.click("#csHideUnscored"); page.click("#csHideProgress"); page.click('#csLayout .chip[data-v="grid"]'); page.click('#csCols .chip[data-v="3"]'); page.click("#csBack")
    # filter + sort
    page.click("#lFilterBtn"); page.select_option("#fsSort", "TITLE"); page.click("#fsGenres .chip:nth-child(1)"); page.click("#fsApply"); page.wait_for_timeout(200)
    show_all(page); cs = cards(page); titles = [x["title"] for x in cs]
    want_n = sum(1 for e in harness.DATA["ANIME"] if "Action" in e["media"]["genres"])
    check("filter: genre include narrows to matching entries", len(cs) == want_n, (len(cs), want_n))
    check("filter: title sort orders A to Z", titles == sorted(titles, key=lambda s: s.lower()), titles[:4])
    page.click("#lFilterBtn"); page.click("#fsReset"); page.click("#fsApply"); page.wait_for_timeout(200)
    check("filter: reset restores all entries", page.inner_text("#listCount") == "All (%d)" % total, page.inner_text("#listCount"))
    # open media + back
    page.click("#listBody .lcard .lmain"); page.wait_for_selector("#media .mhead", timeout=5000)
    check("tap: opens the media page", page.is_visible("#media .mstats"))
    page.click("#media .mbtn"); page.wait_for_timeout(200)
    check("tap: closing returns to the list", page.is_visible("#listBody .lcard") and page.eval_on_selector("#media", "e => e.hidden"))
    # +1
    before = cards(page)[0]; SAVED.clear()
    page.click("#listBody .lcard .lplus"); page.wait_for_timeout(500)
    after = cards(page)[0]
    check("+1: saves to AniList", len(SAVED) == 1 and "progress" in SAVED[0], SAVED)
    check("+1: UI progress updated", after["prog"] != before["prog"], (before["prog"], after["prog"]))
    # editor
    SAVED.clear()
    page.click("#listBody .lcard .lmain"); page.wait_for_selector("#media .mstatus"); page.click("#media .mstatus"); page.wait_for_selector("#editor .sheetbar")
    page.click("#editor .stepper .chip:nth-of-type(2)"); page.click("#editor .sheetbar .go:not(.alt)"); page.wait_for_timeout(600)
    check("editor: save sends mutation", any("progress" in s and "mediaId" in s for s in SAVED), SAVED)
    page.click("#media .mbtn"); page.wait_for_timeout(300)
    check("editor: returns to a populated list", len(cards(page)) > 0)
    # ---- manga
    go(page, "manga")
    c = cards(page); mt = harness.N // 2
    check("manga: renders cards", len(c) == min(24, mt) and all(x["vis"] for x in c), len(c))
    labels = [x["t"].rsplit(" ", 1)[0] for x in chips(page)]
    check("manga: status tabs use Reading/Rereading", labels == ["All", "Reading", "Rereading", "Planning", "Paused", "Completed", "Dropped"], labels)
    show_all(page); check("manga: show more reaches every entry", len(cards(page)) == mt, (len(cards(page)), mt))
    # ---- horizontal overflow
    ov = page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
    check("small screen: no horizontal overflow", ov <= 1, ov)

out = run(main, viewport=(360, 640))
check("no console errors", not out["console"] and not out["errors"], (out["console"][:3], out["errors"][:3]))
check("no failed asset requests", not [u for u in out["failed"] if "img.test" not in u], out["failed"][:3])
bad = [r for r in R if not r[1]]
print("\n%d checks, %d failed" % (len(R), len(bad)))
sys.exit(1 if bad else 0)
