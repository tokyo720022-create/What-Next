import sys, json, re
from harness import *
FINDINGS = []
def note(level, msg): FINDINGS.append((level, msg)); print(level, msg)
SKIP = re.compile(r"log out|logout|remove|reset sync memory|clear|disconnect|open anilist login|open myanimelist login", re.I)
SCREENS = [("pick", None), ("anime", None), ("manga", None), ("discover", None), ("schedule", None), ("profile", None),
           ("profile", "stats"), ("profile", "chat"), ("profile", "settings"), ("profile", "set-app"), ("profile", "set-anilist"), ("profile", "set-lists"), ("profile", "set-sync"), ("profile", "set-account"), ("profile", "set-about")]
def goto(page, tab, sub):
    page.click('#tabs [data-v="%s"]' % tab); page.wait_for_timeout(500)
    if sub:
        if sub in ("stats", "chat", "settings"): page.click('[data-go="%s"]' % sub)
        else: page.click('[data-go="settings"]'); page.click('[data-go="%s"]' % sub)
        page.wait_for_timeout(500)
def main(page, out):
    page.evaluate("setApp({ advanced: true })")   # AniList Triple Sync only appears with Advanced features on
    total_clicks = 0
    for tab, sub in SCREENS:
        goto(page, tab, sub); name = sub or tab
        before_err = len(out["errors"]); n = 0
        labels = page.evaluate("""() => [...document.querySelectorAll('button, a.link, [role=button]')].filter(b => { const r = b.getBoundingClientRect(); const cs = getComputedStyle(b); return r.width > 4 && r.height > 4 && cs.visibility !== 'hidden' && !b.disabled && b.closest('[hidden]') === null && !b.closest('#tabs') && !b.closest('.sheet[hidden]') }).map((b, i) => (b.id || b.className.split(' ')[0] || b.tagName) + '|' + (b.textContent || '').trim().slice(0, 24) + '|' + i)""")
        for lab in labels[:25]:
            idx = int(lab.rsplit("|", 1)[1]); text = lab.split("|")[1]
            if SKIP.search(text): continue
            try:
                page.evaluate("""(i) => { const bs = [...document.querySelectorAll('button, a.link, [role=button]')].filter(b => { const r = b.getBoundingClientRect(); const cs = getComputedStyle(b); return r.width > 4 && r.height > 4 && cs.visibility !== 'hidden' && !b.disabled && b.closest('[hidden]') === null && !b.closest('#tabs') && !b.closest('.sheet[hidden]') }); const b = bs[i]; if (b && !(b.tagName === 'A')) b.click(); }""", idx)
                n += 1; total_clicks += 1; page.wait_for_timeout(120)
            except Exception as e:
                note("WARN", "%s: click failed on %r: %s" % (name, lab, str(e)[:80]))
            # close any overlay opened so the next button is reachable
            page.evaluate("document.querySelectorAll('.sheet:not([hidden]), .qvback:not([hidden])').forEach(s => { if(s.id !== 'setup') s.hidden = true; })")
        errs = out["errors"][before_err:]
        print("screen %-12s clicked %2d controls, new page errors: %d" % (name, n, len(errs)))
        for e in errs: note("BUG", "%s: page error after clicking controls: %s" % (name, e[:160]))
        # reload to reset state between screens
        page.reload(); page.wait_for_selector("#tabs:not([hidden])"); page.wait_for_timeout(300)
    diag = page.evaluate("window.__wnErrors || []")
    for d in diag: note("BUG", "diagnostics recorder caught: %s" % d[:160])
    print("total controls clicked:", total_clicks)
out = run(main)
for c in out["console"]:
    if "favicon" not in c[1]: note("WARN", "console %s: %s" % c)
print("\nfindings:", len(FINDINGS))
import sys as _s
_s.exit(1 if any(l == "BUG" for l, _ in FINDINGS) else 0)
