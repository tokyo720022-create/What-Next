from harness import *
FINDINGS = []
def note(level, msg): FINDINGS.append((level, msg)); print(level, msg)
def main(page, out):
    page.evaluate("setApp({ advanced: true })")   # AniList Triple Sync only appears with Advanced features on
    shots = [("pick", None), ("anime", None), ("manga", None), ("discover", None), ("schedule", None), ("profile", None), ("profile", "stats"), ("profile", "chat"), ("profile", "settings"), ("profile", "set-app"), ("profile", "set-anilist"), ("profile", "set-lists"), ("profile", "set-sync"), ("profile", "set-account"), ("profile", "set-about")]
    for tab, sub in shots:
        page.click('#tabs [data-v="%s"]' % tab); page.wait_for_timeout(500)
        if sub:
            if sub in ("stats", "chat", "settings"): page.click('[data-go="%s"]' % sub)
            else: page.click('[data-go="settings"]'); page.click('[data-go="%s"]' % sub)
            page.wait_for_timeout(400)
        r = page.evaluate("""() => { const d = document.documentElement; const wide = [...document.querySelectorAll('main *')].filter(e => { if (e.closest('[hidden]') || e.closest('.hscroll') || e.closest('.srow') || e.closest('.trend')) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.right > innerWidth + 1; }).slice(0, 3).map(e => e.tagName + '.' + e.className); return { over: d.scrollWidth - d.clientWidth, wide } }""")
        name = sub or tab
        print("%-12s horizontal overflow: %s %s" % (name, r["over"], r["wide"]))
        if r["over"] > 1: note("BUG", "%s: page scrolls sideways by %dpx at 320px wide (%s)" % (name, r["over"], r["wide"]))
        if tab in ("anime", "manga") and not sub:
            page.evaluate("window.scrollTo(0, document.documentElement.scrollHeight)"); page.wait_for_timeout(200)
            gap = page.evaluate("(() => { const m = document.querySelector('#listMore'); const t = document.querySelector('#tabs'); if (m.hidden) return null; return t.getBoundingClientRect().top - m.getBoundingClientRect().bottom })()")
            print("   'Show more' clears the tab bar by", gap, "px")
            if gap is not None and gap < 0: note("BUG", "%s: last 'Show more' button is hidden behind the tab bar" % name)
        page.evaluate("window.scrollTo(0, 0)")
run(main, viewport=(320, 568))
print("layout findings:", len(FINDINGS))
import sys as _s
_s.exit(1 if any(l == "BUG" for l, _ in FINDINGS) else 0)
