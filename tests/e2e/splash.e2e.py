import sys, time
from harness import *
import harness
from playwright.sync_api import sync_playwright
R = []
def check(n, c, d=""): R.append(bool(c)); print(("PASS " if c else "FAIL ") + n + ((" :: " + str(d)) if d and not c else ""))
def open_page(p, w, h, init=""):
    b = p.chromium.launch(); ctx = b.new_context(viewport={"width": w, "height": h}, is_mobile=True, has_touch=True, device_scale_factor=2)
    ctx.route("**/*", harness.handle); page = ctx.new_page()
    errs = []; page.on("pageerror", lambda e: errs.append(str(e)))
    page.add_init_script("if(!localStorage.getItem('wn_token')){localStorage.setItem('wn_token','tok'); localStorage.setItem('wn_name','Tester');}" + init)
    page.goto("http://127.0.0.1:%d/index.html" % harness.PORT, wait_until="commit")
    return b, page, errs
srv = serve()
with sync_playwright() as p:
    b, page, errs = open_page(p, 390, 844)
    page.wait_for_selector("#boot .boottitle", timeout=5000)
    widths = []; t0 = time.time()
    while time.time() - t0 < 6:
        w = page.evaluate("(() => { const f = document.getElementById('bootFill'); return f ? parseFloat(f.style.width || '6') : null; })()")
        if w is None: break
        widths.append(w); page.wait_for_timeout(20)
    check("loading bar only ever moves forward", all(a <= b2 for a, b2 in zip(widths, widths[1:])) and len(widths) > 3, widths[:20])
    check("loading bar starts small and ends full", widths and widths[0] < 60 and max(widths) >= 99, (widths[:3], max(widths) if widths else None))
    page.wait_for_selector("#boot", state="detached", timeout=8000); page.wait_for_selector("#tabs:not([hidden])")
    check("the screen goes away and the app is ready", page.locator("#boot").count() == 0 and page.locator("#result .hero").count() >= 0)
    check("no script errors while loading", not errs, errs[:2]); b.close()
    b, page, errs = open_page(p, 390, 844)
    page.wait_for_selector("#boot .boottitle", timeout=5000)
    t = lambda s: page.inner_text(s)
    check("opening screen shows the logo, name, tagline and footer", page.locator("#boot img").count() == 1 and t("#boot .boottitle") == "What Next?" and "next pick" in t("#boot .boottag") and "AniList" in t("#boot .bootfoot"))
    check("logo is the app logo", "logo-512.png" in page.get_attribute("#boot img", "src"))
    bg = page.evaluate("getComputedStyle(document.getElementById('boot')).backgroundImage")
    check("dark purple glow background", "radial-gradient" in bg and "43, 27, 76" in bg, bg)
    page.screenshot(path="/tmp/splash_mid.png"); b.close()
    # small phone: nothing overlaps or runs off
    b, page, errs = open_page(p, 320, 568)
    page.wait_for_selector("#boot .bootbar", timeout=5000); page.wait_for_timeout(900)
    g = page.evaluate("""(() => { const r = s => document.querySelector(s).getBoundingClientRect(); const mid = r('.bootmid'), foot = r('.bootfoot'), bar = r('.bootbar'), img = r('#boot img');
        return { midBottom: mid.bottom, footTop: foot.top, barBottom: bar.bottom, imgTop: img.top, footBottom: foot.bottom, vh: innerHeight, sw: document.documentElement.scrollWidth, iw: innerWidth }; })()""")
    check("320x568: content sits above the footer and inside the screen", g["midBottom"] < g["footTop"] and g["imgTop"] > 0 and g["footBottom"] <= g["vh"] and g["sw"] <= g["iw"] + 1, g)
    page.screenshot(path="/tmp/splash_small.png"); b.close()
    # the setting that switches the logo screen off still works
    b, page, errs = open_page(p, 390, 844, "localStorage.setItem('wn_app', JSON.stringify({splash:false}));")
    page.wait_for_selector("#boot", state="detached", timeout=8000); page.wait_for_selector("#tabs:not([hidden])")
    check("with the logo screen switched off the app still opens", page.locator("#tabs").is_visible()); b.close()
srv.shutdown(); srv.server_close()
print("\n%d checks, %d failed" % (len(R), R.count(False))); sys.exit(1 if False in R else 0)
