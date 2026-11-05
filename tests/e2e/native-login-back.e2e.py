import sys, json
from harness import *
FINDINGS = []
def note(level, msg): FINDINGS.append((level, msg)); print(level, msg)
STUB = """window.__cap = {}; window.__opened = []; window.__exited = false;
window.Capacitor = { isNativePlatform: () => true, Plugins: { App: { addListener: (n, cb) => { window.__cap[n] = cb; }, exitApp: () => { window.__exited = true; }, getLaunchUrl: () => Promise.resolve(null) }, Browser: { open: o => { window.__opened.push(o.url); return Promise.resolve(); }, close: () => {} } } };"""

# ---------- A. logged out (web) ----------
def a(page, out):
    vis = page.evaluate("(() => { const s = document.querySelector('#setup'); const r = s.getBoundingClientRect(); return {hidden: s.hidden, w: r.width, h: r.height, tabs: document.querySelector('#tabs').hidden} })()")
    print("A. logged-out:", vis)
    if vis["hidden"] or vis["w"] < 300 or not vis["tabs"]: note("BUG", "login overlay not shown correctly when logged out: %s" % vis)
    page.click("#loginBtn"); page.wait_for_timeout(300)
    msg = page.inner_text("#loginErr"); print("A. login message (should be empty, there is no web login any more):", repr(msg))
    if msg: note("INFO", "tapping Log in showed a message: %r" % msg)
run(a, anon=True)

# ---------- B. native stub: login URL, deep link, back button ----------
def b(page, out):
    pass
def b_anon(page, out):
    page.click("#loginBtn"); page.wait_for_timeout(300)
    urls = page.evaluate("window.__opened"); print("B. Browser.open urls:", urls)
    if not urls or "client_id=54060" not in urls[0] or "response_type=token" not in urls[0]: note("BUG", "native Login did not open the AniList authorize URL correctly: %s" % urls)
    elif "redirect_uri" in urls[0]: note("BUG", "authorize URL still sends redirect_uri")
    page.evaluate("window.__cap.appUrlOpen({url:'whatnext://auth#access_token=abc123token&token_type=Bearer&expires_in=31536000'})")
    page.wait_for_timeout(800)
    tok = page.evaluate("localStorage.getItem('wn_token')"); print("B. token after deep link:", tok)
    if tok != "abc123token": note("BUG", "deep link did not store the token: %r" % tok)
run(b_anon, anon=True, init=STUB)

def b_back(page, out):
    cap = "window.__cap.backButton()"
    def vis(sel): return page.evaluate("!document.querySelector(%s).hidden" % json.dumps(sel))
    page.click('#tabs [data-v="anime"]'); page.wait_for_selector("#listBody .lcard")
    page.click("#listBody .lcard .lmain"); page.wait_for_selector("#media .mstats")
    page.evaluate(cap); page.wait_for_timeout(200)
    if vis("#media"): note("BUG", "back button did not close the media page")
    page.click("#lFilterBtn"); page.evaluate(cap); page.wait_for_timeout(100)
    if vis("#fsheet"): note("BUG", "back button did not close the filter sheet")
    page.click('#tabs [data-v="profile"]'); page.click('[data-go="settings"]'); page.click('[data-go="set-app"]')
    page.evaluate(cap); page.wait_for_timeout(100)
    if not vis("#settings"): note("BUG", "back from a settings page should go to the Settings menu")
    page.evaluate(cap); page.wait_for_timeout(100)
    if not vis("#profile"): note("BUG", "back from the Settings menu should go to Profile")
    page.evaluate(cap); page.wait_for_timeout(100)
    page.evaluate(cap); page.wait_for_timeout(100)
    print("B. back chain done; exited app:", page.evaluate("window.__exited"))
    if not page.evaluate("window.__exited") and vis("#pickWrap") is False: note("BUG", "back button ended on an unexpected screen")
run(b_back, init=STUB)
print("native/back checks finished; findings so far:", len(FINDINGS))
import sys as _s
_s.exit(1 if any(l == "BUG" for l, _ in FINDINGS) else 0)
