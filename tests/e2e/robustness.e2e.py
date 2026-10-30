import sys, json, re, time
from harness import *
import harness
DELAY_JS = "const __f = window.fetch.bind(window); window.__delay = 0; window.fetch = (u, o) => (window.__delay && String(u).includes('graphql')) ? new Promise(r => setTimeout(r, window.__delay)).then(() => __f(u, o)) : __f(u, o);"
FINDINGS = []
def note(level, msg): FINDINGS.append((level, msg)); print(level, msg)
def ok(msg): print("OK  ", msg)

def t1(page, out):
    # loading indicator
    page.evaluate("window.__delay = 1200")
    page.click('#tabs [data-v="anime"]'); page.wait_for_timeout(300)
    sk = page.locator("#listBody .skel").count(); cnt = page.inner_text("#listCount")
    (ok if sk > 0 and cnt == "Loading…" else lambda m: note("BUG", m))("loading placeholders shown while fetching (skeleton cards=%d, header=%r)" % (sk, cnt))
    page.wait_for_selector("#listBody .lcard:not(.skel)", timeout=8000); page.evaluate("window.__delay = 0")
    # error + retry (manga)
    NET["fail"] = 1
    page.click('#tabs [data-v="manga"]'); page.wait_for_selector("#listBody .state", timeout=8000)
    txt = page.inner_text("#listBody")
    (ok if "Can't reach AniList" in txt and page.locator("#listBody button:has-text('Retry')").count() == 1 else lambda m: note("BUG", m))("error state with Retry button when AniList is unreachable")
    page.click("#listBody button:has-text('Retry')"); page.wait_for_selector("#listBody .lcard:not(.skel)", timeout=8000)
    ok("Retry loads the list after a failure")
    # scroll position preserved after +1
    page.click('#tabs [data-v="anime"]'); page.wait_for_selector("#listBody .lcard")
    for _ in range(3):
        if not page.eval_on_selector("#listMore", "e => e.hidden"): page.click("#listMore"); page.wait_for_timeout(80)
    page.evaluate("(() => { const bs = [...document.querySelectorAll('#listBody .lplus')]; bs[12].scrollIntoView({block: 'center'}); })()"); page.wait_for_timeout(300); y0 = page.evaluate("scrollY")
    page.evaluate("(() => { const bs = [...document.querySelectorAll('#listBody .lplus')]; const b = bs.find(b => { const r = b.getBoundingClientRect(); return r.top > 150 && r.top < 650; }); b.click(); })()"); page.wait_for_timeout(800)
    y1 = page.evaluate("scrollY")
    (ok if abs(y1 - y0) < 60 and y0 > 800 else lambda m: note("BUG", m))("scroll position kept after +1 (before %d, after %d)" % (y0, y1))

out = run(t1, viewport=(390, 844), init=DELAY_JS)

# stale-while-revalidate + offline
def t2(page, out):
    page.click('#tabs [data-v="anime"]'); page.wait_for_selector("#listBody .lcard:not(.skel)"); page.wait_for_timeout(500)
    page.evaluate("navigator.serviceWorker.ready.then(() => true)"); page.wait_for_timeout(800)
    cached = page.evaluate("Object.keys(localStorage).filter(k => k.startsWith('wn_list_'))")
    (ok if cached else lambda m: note("BUG", m))("list cached in localStorage: %s" % cached)
    # second visit: cached list should appear instantly even if AniList is slow
    page.reload(); page.wait_for_selector("#boot", state="detached"); page.wait_for_selector("#tabs:not([hidden])"); page.evaluate("window.__delay = 2500")   # the logo splash covers the screen for about a second
    t0 = time.time(); page.click('#tabs [data-v="anime"]'); page.wait_for_selector("#listBody .lcard:not(.skel)", timeout=1500); dt = time.time() - t0
    (ok if dt < 1.0 else lambda m: note("BUG", m))("cached list shown immediately on revisit (%.2fs) while the refresh runs" % dt)
    page.wait_for_timeout(3500); page.evaluate("window.__delay = 0")
    # offline
    NET["off"] = True; out["ctx"].set_offline(True)
    page.reload(); page.wait_for_selector("#tabs:not([hidden])", timeout=10000)
    page.click('#tabs [data-v="anime"]'); page.wait_for_selector("#listBody .lcard:not(.skel)", timeout=8000); page.wait_for_timeout(1500)
    note_t = page.inner_text("#listNote") if not page.eval_on_selector("#listNote", "e => e.hidden") else ""
    n = page.locator("#listBody .lcard:not(.skel)").count()
    (ok if n > 0 and "Offline" in note_t else lambda m: note("BUG", m))("offline: %d cached cards shown with note %r" % (n, note_t))
    page.click('#tabs [data-v="pick"]'); page.wait_for_timeout(500)
    ok("offline: app shell loads from the service worker cache") if page.is_visible("#tabs") else note("BUG", "offline: shell did not load")
    out["ctx"].set_offline(False); NET["off"] = False
out = run(t2, init=DELAY_JS)

# themes
def t3(page, out):
    page.click('#tabs [data-v="anime"]'); page.wait_for_selector("#listBody .lcard:not(.skel)")
    def lum(c):
        r, g, b = [int(x) for x in re.findall(r"\d+", c)[:3]]
        f = lambda v: (v / 255 / 12.92) if v / 255 <= .03928 else (((v / 255 + .055) / 1.055) ** 2.4)
        return .2126 * f(r) + .7152 * f(g) + .0722 * f(b)
    for mode in ("sakuraflowers", "onepiece", "naruto", "gintama", "dragonball", "bleach", "rentagirlfriend", "aot"):
        page.evaluate("localStorage.setItem('wn_theme', JSON.stringify({id:'%s'}))" % mode); page.reload(); page.wait_for_selector("#tabs:not([hidden])")
        page.click('#tabs [data-v="anime"]'); page.wait_for_selector("#listBody .lcard:not(.skel)")
        c = page.evaluate("(() => { const card = document.querySelector('#listBody .lcard'); const t = card.querySelector('.li') || card; return { bg: getComputedStyle(document.body).backgroundColor, card: getComputedStyle(card).backgroundColor, text: getComputedStyle(card.querySelector('.lt')).color } })()")
        a_, b_ = lum(c["card"]), lum(c["text"]); ratio = (max(a_, b_) + .05) / (min(a_, b_) + .05)
        (ok if ratio >= 4.5 else lambda m: note("BUG", m))("%s theme: title contrast %.1f:1 (page %s, card %s)" % (mode, ratio, c["bg"], c["card"]))
    page.evaluate("localStorage.removeItem('wn_theme')")
run(t3)

# perf on a big list
def t4(page, out):
    t0 = time.time(); page.click('#tabs [data-v="anime"]'); page.wait_for_selector("#listBody .lcard:not(.skel)", timeout=15000); dt = time.time() - t0
    nodes = page.evaluate("document.querySelectorAll('*').length"); cards = page.locator("#listBody .lcard").count()
    (ok if dt < 3 and cards <= 48 else lambda m: note("BUG", m))("1200-entry list: first batch in %.2fs, %d cards in DOM, %d nodes total" % (dt, cards, nodes))
harness.N = 1200
harness.DATA["ANIME"] = [harness.entry(i, "ANIME") for i in range(1200)]
run(t4)

# service worker versioning
def t5(page, out):
    page.wait_for_timeout(1200)
    names = page.evaluate("caches.keys()"); print("cache names:", names)
    page.evaluate("caches.open('wn-legacy-old').then(c => c.put('/x', new Response('x')))")
    page.evaluate("navigator.serviceWorker.getRegistrations().then(rs => Promise.all(rs.map(r => r.unregister())))"); page.reload(); page.wait_for_timeout(2500)
    names2 = page.evaluate("caches.keys()")
    (ok if "wn-legacy-old" not in names2 else lambda m: note("BUG", m))("old caches are removed when a new service worker activates: %s" % names2)
run(t5)
print("\nrobustness findings:", len(FINDINGS))
import sys as _s
_s.exit(1 if any(l == "BUG" for l, _ in FINDINGS) else 0)
