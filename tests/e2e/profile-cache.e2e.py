# Profile > Tendencies and Favourites are saved, shown at once, and only refreshed after 6 hours (fewer requests).
import sys, json
from harness import *
import harness
R = []
def check(n, c, d=""): R.append(bool(c)); print(("PASS " if c else "FAIL ") + n + ((" :: " + str(d)) if d and not c else ""))
def n(kind): return len([x for x in harness.PROFREQ if x == kind])
def age(page, ms):
    page.evaluate("(ms) => { for(const k of ['wn_c_acct_tend_tester', 'wn_c_acct_fav_anime_tester']){ const r = JSON.parse(localStorage.getItem(k) || 'null'); if(r){ r.at = Date.now() - ms; localStorage.setItem(k, JSON.stringify(r)); } } }", ms)
def open_profile(page):
    page.evaluate("showTab('anime')"); page.click('#tabs [data-v="profile"]'); page.wait_for_selector("#tendList .pftitem"); page.wait_for_selector("#favGrid .favt"); page.wait_for_timeout(500)
def main(page, out):
    open_profile(page)
    check("first open: one stats request and one favourites page of 12", n("tend") == 1 and n("fav:anime:1") == 1 and page.locator("#favGrid .favt").count() == 12, harness.PROFREQ)
    check("both are saved", all(page.evaluate("!!localStorage.getItem('%s')" % k) for k in ("wn_c_acct_tend_tester", "wn_c_acct_fav_anime_tester")))
    t0, f0 = n("tend"), n("fav:anime:1")
    page.reload(); page.wait_for_selector("#tabs:not([hidden])"); open_profile(page)
    check("opening it again in a new session asks for nothing", n("tend") == t0 and n("fav:anime:1") == f0 and page.locator("#favGrid .favt").count() == 12 and page.locator("#tendList .pftitem").count() > 5, (n("tend"), n("fav:anime:1")))
    age(page, 7 * 3600000)
    page.reload(); page.wait_for_selector("#tabs:not([hidden])"); open_profile(page)
    check("after 6 hours the saved copy still shows at once and is refreshed quietly (one request each)", n("tend") == t0 + 1 and n("fav:anime:1") == f0 + 1 and page.locator("#favGrid .favt").count() == 12, (n("tend"), n("fav:anime:1")))
    # offline with an old saved copy: it stays, no error
    age(page, 7 * 3600000); harness.NET["off"] = True
    page.reload(); page.wait_for_selector("#tabs:not([hidden])"); page.click('#tabs [data-v="profile"]'); page.wait_for_selector("#tendList .pftitem"); page.wait_for_timeout(1200)
    check("offline: the saved Tendencies and Favourites stay on screen, with no error", page.locator("#tendList .pftitem").count() > 5 and page.locator("#favGrid .favt").count() == 12 and "reach AniList" not in page.inner_text("#tendList") + page.inner_text("#favGrid"), page.inner_text("#tendList")[:80])
    harness.NET["off"] = False
    # damaged saved copies are thrown away and loaded again
    page.evaluate("localStorage.setItem('wn_c_acct_tend_tester', JSON.stringify({v:1,at:Date.now(),c:'acct',d:{anime:5}})); localStorage.setItem('wn_c_acct_fav_anime_tester', JSON.stringify({v:1,at:Date.now(),c:'acct',d:{nodes:[1]}}))")
    t1, f1 = n("tend"), n("fav:anime:1")
    page.reload(); page.wait_for_selector("#tabs:not([hidden])"); open_profile(page)
    check("damaged saved copies are replaced with fresh data", n("tend") == t1 + 1 and n("fav:anime:1") == f1 + 1 and page.locator("#favGrid .favt").count() == 12 and page.locator("#tendList .pftitem").count() > 5, (n("tend"), n("fav:anime:1")))
    # pull down to refresh: asks again
    t2, f2 = n("tend"), n("fav:anime:1")
    page.evaluate("profRefresh()"); page.wait_for_timeout(1500)
    check("pulling down on the Profile asks again", n("tend") == t2 + 1 and n("fav:anime:1") == f2 + 1, (n("tend"), n("fav:anime:1")))
    # Show more still adds 12 at a time and is saved
    page.click("#favMore"); page.wait_for_function("document.querySelectorAll('#favGrid .favt').length === 24"); page.wait_for_timeout(300)
    check("Show more adds the next 12, and the longer list is saved", page.evaluate("JSON.parse(localStorage.getItem('wn_c_acct_fav_anime_tester')).d.nodes.length") == 24)
out = run(main, viewport=(390, 844))
check("no page errors", not [e for e in out["errors"] if "favicon" not in e and "ERR_INTERNET_DISCONNECTED" not in e], out["errors"][:2])
print("%d checks, %d failed" % (len(R), R.count(False))); sys.exit(1 if False in R else 0)
