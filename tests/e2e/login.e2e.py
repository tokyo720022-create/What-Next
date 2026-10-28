import sys
from harness import *
R = []
def check(n, c, d=""): R.append(bool(c)); print(("PASS " if c else "FAIL ") + n + ((" :: " + str(d)) if d and not c else ""))
def main(page, out):
    t = lambda sel: page.inner_text(sel)
    check("login page shows the logo and name", page.evaluate("(() => { const i = document.querySelector('#setup .logo'); return !!i && i.naturalWidth > 0; })()") and "What Next?" in t("#setup .ltop"))
    check("a tagline", "what to watch or read next" in t("#setup .ltop").lower())
    feats = t("#setup .lfeat"); check("three feature cards", page.locator("#setup .lfeat li").count() == 3 and "Synced with AniList" in feats and "Calendar" in feats, feats[:80])
    check("login and create-account buttons", t("#loginBtn") == "Log in with AniList" and "Create an AniList account" in t("#registerBtn"))
    check("safety note about anilist.co", "never see your password" in t("#setup .lsafe"))
    check("the buttons can be reached and tapped", page.evaluate("(() => { for(const id of ['#loginBtn', '#registerBtn']){ const b = document.querySelector(id); b.scrollIntoView(); const r = b.getBoundingClientRect(); if(r.bottom > innerHeight || r.right > innerWidth || r.left < 0) return false; } return true; })()"))
    check("nothing sticks out sideways", page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"))
    page.click("#loginBtn"); page.wait_for_timeout(300); check("web login still shows its message", t("#loginErr") != "", t("#loginErr"))
for vp in ((360, 780), (320, 568)):
    out = run(main, viewport=vp, anon=True); print("-- viewport", vp)
    real = [c for c in out["console"] if "ERR_INTERNET" not in c[1]]
    check("no console errors", not real and not out["errors"], (real[:2], out["errors"][:2]))
print("%d checks, %d failed" % (len(R), R.count(False))); sys.exit(1 if False in R else 0)
