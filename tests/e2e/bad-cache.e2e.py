# Saved data in the wrong shape (an older version of the app, or damage) must never crash the app, and must not come back on the next start.
import sys, json
from harness import *
R = []
def check(n, c, d=""): R.append(bool(c)); print(("PASS " if c else "FAIL ") + n + ((" :: " + str(d)) if d and not c else ""))
def wrap(cls, d): return "JSON.stringify({v:1,at:Date.now(),c:%s,d:%s})" % (json.dumps(cls), json.dumps(d))
TABS = ["pick", "anime", "manga", "discover", "calendar", "schedule", "profile", "stats", "chat", "settings", "set-account"]
def case(name, init, check_fn=None):
    res = {}
    def main(page, out):
        page.wait_for_timeout(1500)
        for t in TABS:
            try: page.evaluate("showTab(%s)" % json.dumps(t))
            except Exception as e: res["tabErr"] = (t + ": " + str(e))[:140]
            page.wait_for_timeout(200)
        page.evaluate("showTab('pick')"); page.wait_for_timeout(500)
        res["tabs"] = page.evaluate("!document.querySelector('#tabs').hidden")
        res["pick"] = page.locator("#result .hero").count()
        if check_fn: res["extra"] = check_fn(page)
    out = run(main, viewport=(390, 844), init="localStorage.setItem(%s, %s);" % (json.dumps(init[0]), init[1]))
    errs = [e for e in out["errors"] if "favicon" not in e]
    check("%s: no errors, every screen opens" % name, not errs and not res.get("tabErr") and res.get("tabs"), (errs[:2], res.get("tabErr")))
    return res
r = case("a damaged saved Pick (junk items)", ("wn_c_acct_pool_tester", wrap("acct", [{"x": 1}, 5])))
check("  the Pick is built from fresh data instead", r.get("pick") == 1, r)
r = case("a damaged saved Pick (a number)", ("wn_c_acct_pool_tester", wrap("acct", 5)))
check("  the Pick still works", r.get("pick") == 1, r)
case("damaged saved trending (an object)", ("wn_c_card_trend_ANIME", wrap("card", {"a": 1})))
case("damaged saved trending (poster missing)", ("wn_c_card_trend_ANIME", wrap("card", [{"id": 1}])))
case("a damaged saved anime list", ("wn_c_acct_list_anime_tester", wrap("acct", {"entries": [1, 2]})))
case("a damaged saved profile", ("wn_c_acct_profile_tester", wrap("acct", "x")))
case("a damaged saved activity record", ("wn_c_acct_actdays_tester", wrap("acct", [])))
case("a damaged saved tag list", ("wn_c_card_tagcol", wrap("card", {"a": 1})))
for g in ["null", "123", "\"x\"", "{}"]:
    case("chat history saved as %s" % g, ("wn_chats", json.dumps(g)))
# the damaged item is deleted, so it does not come back on the next start
def gone(page): return page.evaluate("localStorage.getItem('wn_c_card_trend_ANIME')")
r = case("damaged trending is removed and replaced", ("wn_c_card_trend_ANIME", wrap("card", [{"id": 1}])), lambda page: page.evaluate("(() => { const s = localStorage.getItem('wn_c_card_trend_ANIME'); return !s || !JSON.stringify(JSON.parse(s).d).includes('\"id\":1}'); })()"))
check("  nothing damaged is left behind", r.get("extra") is True, r)
# Everything the app itself saves must pass its own check, or the saved copy would silently never be used.
def real(page, out):
    for t in ["pick", "anime", "manga", "calendar", "discover", "seasonal", "stats", "profile"]:
        page.evaluate("showTab(%s)" % json.dumps(t)); page.wait_for_timeout(1200)
    page.evaluate("showMedia(1000)"); page.wait_for_timeout(1500)
    page.wait_for_timeout(1500)   # delayed writes
    res = page.evaluate("""() => {
      const rules = [['acct_pool_', CACHE_OK.pool], ['acct_list_', CACHE_OK.list], ['acct_profile_', CACHE_OK.object], ['acct_actdays_', CACHE_OK.actdays], ['acct_tend_', CACHE_OK.stats], ['acct_fav_', CACHE_OK.fav], ['acct_stats_me_', CACHE_OK.object],
                     ['card_trend_', CACHE_OK.medias], ['card_season_', CACHE_OK.medias], ['card_media_', CACHE_OK.media], ['card_ent_', CACHE_OK.entity], ['card_tagcol', CACHE_OK.array], ['card_tref_', CACHE_OK.array], ['cal_w', CACHE_OK.airing]];
      const out = { seen: [], bad: [], unknown: [] };
      for(const k of cacheKeys()){ const n = k.replace('wn_c_', ''), r = rules.find(x => n.startsWith(x[0])); if(!r){ out.unknown.push(n); continue; }
        out.seen.push(r[0]); let d = null; try{ d = JSON.parse(localStorage.getItem(k)).d; }catch(_){} let ok = false; try{ ok = !!r[1](d); }catch(_){} if(!ok) out.bad.push(n); }
      out.seen = [...new Set(out.seen)]; return out; }""")
    print("   saved kinds seen:", res["seen"])
    check("everything the app saves passes its own shape check", not res["bad"], res["bad"])
    check("every kind of saved data has a shape check (none unknown)", not res["unknown"], res["unknown"])
    check("the main kinds really were saved in this session (so the check above means something)", all(k in res["seen"] for k in ("acct_pool_", "acct_list_", "cal_w", "card_media_", "card_season_", "acct_profile_")), res["seen"])
out = run(real, viewport=(390, 844))
check("no page errors while visiting the screens", not [e for e in out["errors"] if "favicon" not in e], out["errors"][:2])
print("%d checks, %d failed" % (len(R), R.count(False))); sys.exit(1 if False in R else 0)
