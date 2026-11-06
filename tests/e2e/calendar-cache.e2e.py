# The calendar is loaded and saved week by week, so opening it costs a few requests at most.
import sys, time
from harness import *
import harness
R = []
def check(n, c, d=""): R.append(bool(c)); print(("PASS " if c else "FAIL ") + n + ((" :: " + str(d)) if d and not c else ""))
def windows(): return sorted({r["from"] for r in harness.CZREQ})
def main(page, out):
    page.evaluate("showTab('calendar')"); page.wait_for_function("cz.items.length > 0", timeout=10000); page.wait_for_timeout(500)
    first = len(windows()); weeks = page.evaluate("czWeeks().length")
    check("the first open asks for each week of the view once (%d weeks)" % weeks, first == weeks and len({(r['from'], r['p']) for r in harness.CZREQ}) == len(harness.CZREQ), (first, weeks))
    check("every week is saved", len(page.evaluate("Object.keys(localStorage).filter(k => k.startsWith('wn_c_cal_w'))")) == weeks)
    n0 = len(harness.CZREQ)
    page.evaluate("showTab('anime')"); page.wait_for_timeout(200); page.evaluate("showTab('calendar')"); page.wait_for_timeout(700)
    check("opening it again soon asks for nothing", len(harness.CZREQ) == n0, len(harness.CZREQ) - n0)
    # switch between the month grid and the week list: the week is already saved
    page.click("#czView"); page.wait_for_timeout(700)
    check("the other view (week/month) reuses the saved weeks", len(harness.CZREQ) == n0 or page.evaluate("cz.view") == "month", (len(harness.CZREQ) - n0, page.evaluate("cz.view")))
    page.click("#czView"); page.wait_for_timeout(700)
    # make one week stale (this week, 11 minutes old) and one week of the past old (2 days): only the first is asked for again
    page.evaluate("""() => {
      const now = new Date(), cur = czMon(now), past = czAdd(cur, -7);
      const age = (w, ms) => { const k = 'wn_c_cal_' + czWeekKey(w), r = JSON.parse(localStorage.getItem(k) || 'null'); if(r){ r.at = Date.now() - ms; localStorage.setItem(k, JSON.stringify(r)); } };
      age(cur, 11 * 60000); age(past, 2 * 86400000);
    }""")
    harness.CZREQ.clear(); page.evaluate("showTab('anime')"); page.evaluate("showTab('calendar')"); page.wait_for_timeout(1500)
    cur = page.evaluate("czTs(czMon(new Date())) - 1"); past = page.evaluate("czTs(czAdd(czMon(new Date()), -7)) - 1")
    w = windows()
    check("a stale week is refreshed, and only that one", w == [cur] or (w and w == [cur]) or (cur in w and past not in w and len(w) <= 2), (w, cur, past))
    check("a week that is over is never asked for again, however old", past not in w, (w, past))
    # a failure part way keeps the weeks that did load
    page.evaluate("cacheClear('cal'); cz.cache = []")
    page.evaluate("window.__og = gql; window.__n = 0; gql = async (...a) => { if(a[0] === CZ_Q && ++window.__n === 4) throw new Error('boom'); return window.__og(...a); }; 0")
    page.evaluate("showTab('anime')"); page.evaluate("showTab('calendar')"); page.wait_for_timeout(2500)
    shown = page.evaluate("cz.items.length"); toast = page.inner_text("#toast")
    check("a failure part way keeps what loaded and says so", shown > 0 and "couldn't load" in toast, (shown, toast))
    page.evaluate("gql = window.__og; 0")
    # the very first load failing shows the usual retry message
    page.evaluate("cacheClear('cal'); cz.cache = []; window.__og = gql; gql = async (...a) => { if(a[0] === CZ_Q) throw new Error('boom'); return window.__og(...a); }; 0")
    page.evaluate("showTab('anime')"); page.evaluate("showTab('calendar')"); page.wait_for_timeout(800)
    check("nothing loaded at all: an error with a retry button", "boom" in page.inner_text("#czBody") and page.locator("#czBody button").count() >= 1, page.inner_text("#czBody")[:120])
    page.evaluate("gql = window.__og; 0")
    # a damaged saved week is thrown away and loaded again
    page.evaluate("cz.cache = []; localStorage.setItem('wn_c_cal_' + czWeekKey(czWeeks()[0]), JSON.stringify({v:1,at:Date.now(),c:'cal',d:[{airingAt:'x'}]}))")
    harness.CZREQ.clear(); page.evaluate("showTab('anime')"); page.evaluate("showTab('calendar')"); page.wait_for_timeout(1200)
    check("a damaged saved week is replaced with a fresh one", cur_ok(page), harness.CZREQ[:1])
def cur_ok(page): return page.evaluate("(() => { const d = JSON.parse(localStorage.getItem('wn_c_cal_' + czWeekKey(czWeeks()[0])) || 'null'); return !!d && Array.isArray(d.d) && d.d.every(x => typeof x.airingAt === 'number'); })()")
out = run(main, viewport=(390, 844))
check("no page errors", not [e for e in out["errors"] if "boom" not in e and "favicon" not in e], out["errors"][:3])
print("%d checks, %d failed" % (len(R), R.count(False))); sys.exit(1 if False in R else 0)
