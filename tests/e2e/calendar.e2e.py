import sys, datetime, calendar as pycal
from harness import *
import harness
R = []
def check(n, c, d=""): R.append(bool(c)); print(("PASS " if c else "FAIL ") + n + ((" :: " + str(d)) if d and not c else ""))
def main(page, out):
    t = lambda sel: page.inner_text(sel)
    today = datetime.date.today(); first = today.replace(day=1)
    page.evaluate("showTab('calendar')"); page.wait_for_selector("#czBody .czcell")
    check("opens on this month with the year", t("#czMonth") == today.strftime("%B") and t("#czYear") == str(today.year), (t("#czMonth"), t("#czYear")))
    check("month grid: Monday first header", page.evaluate("[...document.querySelectorAll('#czBody .czwd span')].map(s => s.textContent)") == ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"])
    rows = (first.weekday() + pycal.monthrange(today.year, today.month)[1] + 6) // 7
    check("the grid has whole weeks around the month", page.locator("#czBody .czcell").count() == rows * 7, page.locator("#czBody .czcell").count())
    check("today is marked", page.locator("#czBody .czcell.today").count() == 1 and t("#czBody .czcell.today b") == str(today.day))
    check("days of other months are dimmed", page.locator("#czBody .czcell.dim").count() == rows * 7 - pycal.monthrange(today.year, today.month)[1])
    start = datetime.date.fromtimestamp(harness.CZREQ[0]["from"] + 1)
    cells = page.evaluate("[...document.querySelectorAll('#czBody .czcell')].map(c => ({p: c.querySelectorAll('.czposters img').length, more: (c.querySelector('.czmore') || {}).textContent || ''}))")
    ok_cells = True
    for di, c in enumerate(cells):
        n = 2 + di % 5; vis = n - (1 if n > 3 else 0)   # the adult airing (4th) is hidden by default
        if c["p"] != min(4, vis) or c["more"] != ("+%d" % (vis - 4) if vis > 4 else ""): ok_cells = False; print("   cell", di, c, "expected", min(4, vis), vis - 4)
    check("each day shows up to 4 posters and +N for the rest", ok_cells)
    check("one request covers the whole grid and loads every page", harness.CZREQ[0]["to"] - harness.CZREQ[0]["from"] in range(rows * 7 * 86400 - 5, rows * 7 * 86400 + 5) and all(r["from"] == harness.CZREQ[0]["from"] for r in harness.CZREQ), harness.CZREQ[:2])
    # ---- filters
    page.click('#calendar .czchips [data-c="premiere"]'); page.wait_for_timeout(200)
    eps1 = [di for di in range(rows * 7) if di % 12 == 0]
    check("Premiere shows only episode 1 days", page.evaluate("[...document.querySelectorAll('#czBody .czcell')].filter(c => c.querySelector('.czposters img')).length") >= 1 and page.evaluate("[...document.querySelectorAll('#czBody .czcell')].map((c, i) => c.querySelectorAll('.czposters img').length > 0 ? i : -1).filter(i => i >= 0).every(i => i % 12 === 0)"))
    page.click('#calendar .czchips [data-c="finale"]'); page.wait_for_timeout(200)
    fin = page.evaluate("[...document.querySelectorAll('#czBody .czcell')].map(c => c.querySelectorAll('.czposters img').length)")
    check("Finale shows only final episodes (one show a day, or all on the last-episode day)", all((n == 1) or (di % 12 == 11 and n > 0) for di, n in enumerate(fin) if n), fin[:14])
    page.click('#calendar .czchips [data-c="all"]'); page.wait_for_timeout(200)
    page.click("#czFilter"); page.wait_for_selector(".dsheet"); page.click('.dsheet .lsrow:has-text("Show adult content")'); page.click('.dsheet button:has-text("Done")'); page.wait_for_timeout(200)
    c0 = page.evaluate("[...document.querySelectorAll('#czBody .czcell')].map(c => c.querySelectorAll('.czposters img').length + ((c.querySelector('.czmore') || {textContent: '+0'}).textContent.replace('+', '') | 0))")
    check("Show adult content adds the hidden airing back; filter badge shows 1", all(c0[di] == 2 + di % 5 for di in range(len(c0))) and t("#czFilterN") == "1", c0[:6])
    page.click("#czFilter"); page.click('.dsheet .lsrow:has-text("Show adult content")'); page.click('.dsheet .lsrow:has-text("Only my Watching and Planning list")'); page.click('.dsheet button:has-text("Done")'); page.wait_for_timeout(200)
    c1 = page.evaluate("[...document.querySelectorAll('#czBody .czcell')].map(c => c.querySelectorAll('.czposters img').length)")
    check("Only my Watching and Planning list keeps 2 a day", all(n == 2 for n in c1), c1[:6])
    page.click("#czFilter"); page.click('.dsheet .lsrow:has-text("Only my Watching and Planning list")'); page.click('.dsheet button:has-text("Done")')
    # ---- months
    r0 = len(harness.CZREQ); page.click("#czNext"); page.wait_for_function("document.querySelector('#czMonth').textContent !== '%s'" % today.strftime("%B")); page.wait_for_timeout(300)
    nxt = (first + datetime.timedelta(days=32)).replace(day=1)
    check("next month loads the next month", t("#czMonth") == nxt.strftime("%B") and len(harness.CZREQ) > r0, t("#czMonth"))
    page.click("#czTodayBtn"); page.wait_for_function("document.querySelector('#czMonth').textContent === '%s'" % today.strftime("%B")); check("the date button returns to today", t("#czTodayNum") == str(today.day))
    page.click("#czTitle"); page.wait_for_selector(".czmonths"); page.click('.czmonths .chip >> nth=0'); page.wait_for_function("document.querySelector('#czMonth').textContent === 'January'"); check("tapping the month opens a month picker", t("#czMonth") == "January")
    page.click("#czTodayBtn"); page.wait_for_selector("#czBody .czcell.today")
    # ---- week list
    page.click("#czBody .czcell.today"); page.wait_for_selector("#czBody .czweek")
    check("tapping a day opens the week list on that day", page.locator("#czBody .czday").count() == 7 and page.locator("#czBody .czday.on").count() == 1 and t("#czBody .czday.on b") == str(today.day))
    strip = t("#czBody .czweek")
    check("week strip shows weekday, date, month and count", "Mon" in strip and "+" in strip, strip[:60])
    check("a section per day with a heading like 'Tuesday, 27 Oct'", page.locator("#czBody .czsec").count() == 7 and today.strftime("%A") in t("#czBody .czh.on"))
    pill = t("#czBody .czsec .czpill >> nth=0"); check("cards show the air time as a pill", ":" in pill and ("AM" in pill or "PM" in pill), pill)
    check("cards show the title and episode", "Airing" in t("#czBody .czc >> nth=0") and "E" in t("#czBody .czc >> nth=0"))
    check("two columns of cards", page.evaluate("getComputedStyle(document.querySelector('#czBody .czgrid')).gridTemplateColumns.split(' ').length") == 2)
    # mark as watched (only for an aired episode that is next in line)
    past = page.evaluate("(() => { const b = [...document.querySelectorAll('#czBody .czc .czchk:not(.on)')]; return b.length; })()")
    if past:
        harness.SAVED.clear(); page.click('#czBody .czc .czchk:not(.on) >> nth=0'); page.wait_for_selector('#czBody .czchk.on'); page.wait_for_timeout(300)
        check("the check button marks the episode watched and saves progress", len(harness.SAVED) == 1 and "progress" in harness.SAVED[0], harness.SAVED)
    else:
        check("(no aired next episode in this week, skipping the check button)", True)
    page.click("#czNext"); page.wait_for_timeout(400); page.click("#czPrev"); page.wait_for_timeout(300)
    page.click("#czBody .czday >> nth=0"); check("tapping a day tile selects it", page.locator("#czBody .czday.on").count() == 1)
    page.click("#czView"); page.wait_for_selector("#czBody .czcell"); check("the view button goes back to the month grid", True)
    page.click("#czBody .czcell.today"); page.wait_for_selector("#czBody .czc"); page.click("#czBody .czc .cztxt >> nth=0"); page.wait_for_selector("#media:not([hidden])"); check("tapping a card opens the title", page.locator("#media").is_visible())
    page.click("#media .mbtn"); page.wait_for_timeout(300)
    check("narrow width: nothing sticks out sideways", page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"))
out = run(main, viewport=(360, 780))
real = [c for c in out["console"] if "ERR_INTERNET" not in c[1]]
check("no console errors", not real and not out["errors"], (real[:2], out["errors"][:2]))
print("%d checks, %d failed" % (len(R), R.count(False))); sys.exit(1 if False in R else 0)
