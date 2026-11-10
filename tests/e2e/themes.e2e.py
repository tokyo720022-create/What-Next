import sys
from harness import *
R = []
def check(n, c, d=""): R.append(bool(c)); print(("PASS " if c else "FAIL ") + n + ((" :: " + str(d)) if d and not c else ""))
IDS = ["sakuraflowers", "onepiece", "naruto", "gintama", "dragonball", "bleach", "rentagirlfriend", "aot", "konosuba", "shieldhero", "magicalexplorer", "blackclover", "sao", "mashle", "ikenie"]
PATTERNS = {"sakuraflowers": "petals", "gintama": "waves", "konosuba": "stars", "shieldhero": "scales", "magicalexplorer": "runes", "blackclover": "clover", "sao": "hex", "mashle": "bolts", "ikenie": "embers"}
LIGHT = ("sakuraflowers", "rentagirlfriend", "mashle")
def pick(page, tid):
    h = '#themeGrid .thdh[data-g="%s"]' % page.evaluate("THEMES.find(t => t.id === '%s').group" % tid)
    if page.get_attribute(h, "aria-expanded") != "true": page.click(h); page.wait_for_timeout(320)
    page.click('#themeGrid .thm[data-id="%s"]' % tid)
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
    page.evaluate("setApp({adultThemes: true}); fillApp()")
    D = lambda g: '#themeGrid .thdh[data-g="%s"]' % g
    check("fifteen themes in eight drawers", page.evaluate("THEMES.length") == 15 and page.locator("#themeGrid .thdr").count() == 8 and page.locator("#themeGrid .thm").count() == 15)
    check("no horizontal category pills any more", page.locator("#themeGroups").count() == 0)
    check("each header shows a name and its theme count", page.eval_on_selector_all("#themeGrid .thdr", "els => els.map(e => e.querySelector('.thdn').textContent + ':' + e.querySelector('.thdc').textContent)") == ["One Piece:1", "Isekai:3", "Fantasy:3", "Action:4", "Comedy:1", "Rom Com:1", "Romance:1", "Hentai 18+:1"])
    check("opens on the drawer of the current theme, the others closed", page.get_attribute(D("onepiece"), "aria-expanded") == "true" and page.locator('#themeGrid .thdh[aria-expanded="true"]').count() == 1)
    check("the drawer holding the current theme says Active", page.locator("#themeGrid .thdr[data-cur] .thcur").is_visible())
    page.click(D("comedy")); page.wait_for_timeout(320)
    check("tapping a closed drawer opens it", page.get_attribute(D("comedy"), "aria-expanded") == "true" and page.locator('#themeGrid .thdr[data-g="comedy"] .thm').first.is_visible())
    check("only Gintama is marked Special", page.locator("#themeGrid .thsp").count() == 1 and "Special" in t('#themeGrid .thm:has-text("Gintama")'))
    page.click(D("comedy")); page.wait_for_timeout(320)
    check("tapping an open drawer closes it", page.get_attribute(D("comedy"), "aria-expanded") == "false" and not page.locator('#themeGrid .thdr[data-g="comedy"] .thm').first.is_visible())
    page.click(D("isekai")); page.wait_for_timeout(320)
    check("Isekai holds KonoSuba, Shield Hero and Magical Explorer", page.locator('#themeGrid .thdr[data-g="isekai"] .thm').count() == 3)
    check("each card shows a swatch, name, one-line note and a selected marker", all(page.locator('#themeGrid .thdr[data-g="isekai"] .thm:nth-child(%d) %s' % (i, sel)).count() == 1 for i in range(1, 4) for sel in (".thsw", ".thn", ".thck")) and all(page.locator('#themeGrid .thdr[data-g="isekai"] .thm:nth-child(%d) .thnote' % i).inner_text().strip() for i in range(1, 4)))
    page.fill("#themeSearch", "konosuba"); page.wait_for_timeout(120)
    check("search by theme name shows just that theme", page.locator("#themeGrid .thdr").count() == 1 and page.locator("#themeGrid .thm").count() == 1 and page.locator("#themeGrid .thm").first.is_visible())
    page.fill("#themeSearch", "isekai"); page.wait_for_timeout(120)
    check("search by category shows the whole category", page.locator("#themeGrid .thdr").count() == 1 and page.locator("#themeGrid .thm").count() == 3)
    page.fill("#themeSearch", "zzzz"); page.wait_for_timeout(120)
    check("a search with no match says so", page.locator("#themeGrid .thdr").count() == 0 and page.locator("#themeEmpty").is_visible())
    page.fill("#themeSearch", ""); page.wait_for_timeout(120)
    check("clearing the search brings every drawer back", page.locator("#themeGrid .thdr").count() == 8 and not page.locator("#themeEmpty").is_visible())
    page.evaluate("setApp({adultThemes: false}); fillApp()")
    check("the 18+ drawer is hidden until Show 18+ themes is on", page.locator('#themeGrid .thdr[data-g="hentai"]').count() == 0 and page.locator("#themeGrid .thdr").count() == 7)
    page.click("#setApp label:has-text('Show 18+ themes')")
    check("turning it on shows the drawer", page.locator('#themeGrid .thdr[data-g="hentai"]').count() == 1)
    check("current theme is marked", page.get_attribute('#themeGrid .thm[data-id="onepiece"]', "aria-pressed") == "true" and page.locator('#themeGrid .thm[aria-pressed="true"]').count() == 1)
    for tid in IDS:
        pick(page, tid); page.wait_for_timeout(80)
        m = page.evaluate("""(() => { const cs = getComputedStyle(document.documentElement), card = getComputedStyle(document.querySelector('#themeGrid .thm')), g = cs.getPropertyValue('--grad');
            const probe = document.createElement('button'); probe.className = 'go'; document.body.append(probe); const pc = getComputedStyle(probe); const o = { bg: getComputedStyle(document.body).backgroundColor, ink: getComputedStyle(document.body).color, cardbg: cs.getPropertyValue('--card').trim(), muted: cs.getPropertyValue('--muted').trim(), sak: cs.getPropertyValue('--sakura').trim(), on: cs.getPropertyValue('--sakura-ink').trim(), btn: pc.color, grad: g.trim(), pattern: document.documentElement.dataset.pattern, theme: document.documentElement.dataset.theme, scheme: document.documentElement.style.colorScheme, meta: document.querySelector('meta[name=theme-color]').content, saved: JSON.parse(localStorage.getItem('wn_theme')).id }; probe.remove(); return o; })()""")
        hexrgb = lambda h: "rgb(%d, %d, %d)" % tuple(int(h.lstrip('#')[i:i + 2], 16) for i in (0, 2, 4))
        check("%s: applied and saved" % tid, m["theme"] == tid and m["saved"] == tid, m)
        check("%s: text readable on the page and cards (>= 4.5:1)" % tid, ratio(m["ink"], m["bg"]) >= 4.5 and ratio(hexrgb(m["muted"]), hexrgb(m["cardbg"])) >= 4.5 and ratio(m["ink"], hexrgb(m["cardbg"])) >= 4.5, (ratio(m["ink"], m["bg"]), m))
        check("%s: button text readable on the accent (>= 4.5:1)" % tid, ratio(m["btn"], hexrgb(m["sak"])) >= 4.5 or ratio(m["btn"], hexrgb(m["on"])) >= 4.5 and m["btn"] == hexrgb(m["on"]), m)
        check("%s: status bar colour follows the page" % tid, m["meta"].lower() == "#%02x%02x%02x" % tuple(int(x) for x in __import__("re").findall(r"\d+", m["bg"])[:3]), (m["meta"], m["bg"]))
        want = PATTERNS.get(tid, "")
        check("%s: pattern %s" % (tid, want or "none"), m["pattern"] == want, m["pattern"])
        check("%s: native controls use the %s scheme" % (tid, "light" if tid in LIGHT else "dark"), m["scheme"] == ("light" if tid in LIGHT else "dark"), m["scheme"])
    pick(page, "gintama"); page.reload(); page.wait_for_selector("#tabs:not([hidden])")
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
