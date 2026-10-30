import sys
from harness import *
R = []
def check(n, c, d=""): R.append(bool(c)); print(("PASS " if c else "FAIL ") + n + ((" :: " + str(d)) if d and not c else ""))
IDS = ["sakuraflowers", "onepiece", "naruto", "gintama", "dragonball", "bleach", "rentagirlfriend", "aot"]
def lum(c):
    import re
    r, g, b = [int(x) for x in re.findall(r"\d+", c)[:3]]
    f = lambda v: (v / 255 / 12.92) if v / 255 <= .03928 else (((v / 255 + .055) / 1.055) ** 2.4)
    return .2126 * f(r) + .7152 * f(g) + .0722 * f(b)
def ratio(a, b): x, y = lum(a), lum(b); return (max(x, y) + .05) / (min(x, y) + .05)
def main(page, out):
    t = lambda sel: page.inner_text(sel)
    check("default theme is One Piece", page.evaluate("document.documentElement.dataset.theme") == "onepiece" and page.evaluate("getComputedStyle(document.body).backgroundColor") == "rgb(5, 11, 26)")
    page.evaluate("showTab('set-app')"); page.wait_for_selector("#themeGrid .thm")
    check("eight theme cards", page.locator("#themeGrid .thm").count() == 8)
    check("only Gintama is marked Special", page.locator("#themeGrid .thsp").count() == 1 and "Special" in t('#themeGrid .thm:has-text("Gintama")'))
    check("each card shows a swatch, name and one-line note", all(page.locator("#themeGrid .thm:nth-child(%d) .thsw" % i).count() == 1 and page.locator("#themeGrid .thm:nth-child(%d) .thnote" % i).inner_text().strip() for i in range(1, 9)))
    check("current theme is marked", page.get_attribute('#themeGrid .thm[data-id="onepiece"]', "aria-pressed") == "true" and page.locator('#themeGrid .thm[aria-pressed="true"]').count() == 1)
    for tid in IDS:
        page.click('#themeGrid .thm[data-id="%s"]' % tid); page.wait_for_timeout(80)
        m = page.evaluate("""(() => { const cs = getComputedStyle(document.documentElement), card = getComputedStyle(document.querySelector('#themeGrid .thm')), g = cs.getPropertyValue('--grad');
            const probe = document.createElement('button'); probe.className = 'go'; document.body.append(probe); const pc = getComputedStyle(probe); const o = { bg: getComputedStyle(document.body).backgroundColor, ink: getComputedStyle(document.body).color, cardbg: cs.getPropertyValue('--card').trim(), muted: cs.getPropertyValue('--muted').trim(), sak: cs.getPropertyValue('--sakura').trim(), on: cs.getPropertyValue('--sakura-ink').trim(), btn: pc.color, grad: g.trim(), pattern: document.documentElement.dataset.pattern, theme: document.documentElement.dataset.theme, scheme: document.documentElement.style.colorScheme, meta: document.querySelector('meta[name=theme-color]').content, saved: JSON.parse(localStorage.getItem('wn_theme')).id }; probe.remove(); return o; })()""")
        hexrgb = lambda h: "rgb(%d, %d, %d)" % tuple(int(h.lstrip('#')[i:i + 2], 16) for i in (0, 2, 4))
        check("%s: applied and saved" % tid, m["theme"] == tid and m["saved"] == tid, m)
        check("%s: text readable on the page and cards (>= 4.5:1)" % tid, ratio(m["ink"], m["bg"]) >= 4.5 and ratio(hexrgb(m["muted"]), hexrgb(m["cardbg"])) >= 4.5 and ratio(m["ink"], hexrgb(m["cardbg"])) >= 4.5, (ratio(m["ink"], m["bg"]), m))
        check("%s: button text readable on the accent (>= 4.5:1)" % tid, ratio(m["btn"], hexrgb(m["sak"])) >= 4.5 or ratio(m["btn"], hexrgb(m["on"])) >= 4.5 and m["btn"] == hexrgb(m["on"]), m)
        check("%s: status bar colour follows the page" % tid, m["meta"].lower() == "#%02x%02x%02x" % tuple(int(x) for x in __import__("re").findall(r"\d+", m["bg"])[:3]), (m["meta"], m["bg"]))
        want = {"sakuraflowers": "petals", "gintama": "waves"}.get(tid, "")
        check("%s: pattern %s" % (tid, want or "none"), m["pattern"] == want, m["pattern"])
        check("%s: native controls use the %s scheme" % (tid, "light" if tid in ("sakuraflowers", "rentagirlfriend") else "dark"), m["scheme"] == ("light" if tid in ("sakuraflowers", "rentagirlfriend") else "dark"), m["scheme"])
    page.click('#themeGrid .thm[data-id="gintama"]'); page.reload(); page.wait_for_selector("#tabs:not([hidden])")
    check("the choice survives a reload", page.evaluate("document.documentElement.dataset.theme") == "gintama")
    page.evaluate("localStorage.setItem('wn_theme', JSON.stringify({mode:'light', a:'#2d9cff', b:'#4fe0ff'}))"); page.reload(); page.wait_for_selector("#tabs:not([hidden])")
    check("an old 'light' setting becomes Sakura Flowers", page.evaluate("document.documentElement.dataset.theme") == "sakuraflowers")
    page.evaluate("localStorage.setItem('wn_theme', JSON.stringify({mode:'amoled', a:'', b:''}))"); page.reload(); page.wait_for_selector("#tabs:not([hidden])")
    check("any other old setting becomes the default", page.evaluate("document.documentElement.dataset.theme") == "onepiece")
    page.evaluate("localStorage.setItem('wn_theme', 'not json')"); page.reload(); page.wait_for_selector("#tabs:not([hidden])")
    check("a broken saved value falls back to the default", page.evaluate("document.documentElement.dataset.theme") == "onepiece")
    # themes reach the whole app
    page.evaluate("setTheme('bleach')"); page.click('#tabs [data-v="anime"]'); page.wait_for_selector("#listBody .lcard:not(.skel)")
    check("a list chip on the accent uses the theme's text colour", page.evaluate("getComputedStyle(document.querySelector('#listStatus .chip[aria-pressed=true]')).color") == "rgb(20, 7, 0)")
    page.evaluate("showTab('set-app')"); page.click("#appReset"); page.click("#appReset"); page.wait_for_timeout(250)
    check("Reset app settings returns to the default theme", page.evaluate("document.documentElement.dataset.theme") == "onepiece" and page.get_attribute('#themeGrid .thm[data-id="onepiece"]', "aria-pressed") == "true")
    check("narrow width: nothing sticks out sideways", page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"))
out = run(main, viewport=(360, 780))
real = [c for c in out["console"] if "ERR_INTERNET" not in c[1]]
check("no console errors", not real and not out["errors"], (real[:2], out["errors"][:2]))
print("\n%d checks, %d failed" % (len(R), R.count(False))); sys.exit(1 if False in R else 0)
