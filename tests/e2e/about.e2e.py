# About screen: version, check for updates (to the latest stable release), what's new, licenses, privacy policy, link icons.
import sys, json
from harness import *
R = []
def check(n, c, d=""): R.append(bool(c)); print(("PASS " if c else "FAIL ") + n + ((" :: " + str(d)) if d and not c else ""))
REPO = "https://github.com/tokyo720022-create/What-Next"
STUB = """window.__opened = [];
window.Capacitor = { isNativePlatform: () => true, Plugins: { App: { addListener: () => {}, exitApp: () => {}, getLaunchUrl: () => Promise.resolve(null), getInfo: () => Promise.resolve({ version: '2.1.1-b57', build: '2000' }) }, Browser: { open: o => { window.__opened.push(o.url); return Promise.resolve(); }, close: () => {} } } };"""
def release(tag, body="Installs over the previous version: version code 3000, release build.\n\n## What's Changed\n* Fix the **calendar** by @someone in https://github.com/tokyo720022-create/What-Next/pull/1"):
    return {"tag_name": tag, "name": "What Next? " + tag, "html_url": REPO + "/releases/tag/" + tag, "body": body, "published_at": "2026-11-05T03:03:00Z"}
state = {"mode": "b58"}
def api(route):
    m = state["mode"]
    if m == "error": return route.fulfill(status=500, content_type="application/json", body="{}")
    if m == "none": return route.fulfill(status=404, content_type="application/json", body="{}")
    route.fulfill(status=200, content_type="application/json", headers={"Access-Control-Allow-Origin": "*"}, body=json.dumps(release("v2.1.1-" + m)))
def main(page, out):
    page.route("https://api.github.com/**", api)
    t = lambda sel: page.inner_text(sel)
    toast = lambda: page.inner_text("#toast")
    opened = lambda: page.evaluate("window.__opened")
    page.evaluate("showTab('set-about')"); page.wait_for_selector("#setAbout:not([hidden])")
    txt = t("#setAbout")
    check("company and creator are unchanged", "Company: Tokyo Brotherhood" in txt and "Creator: Hariharasuthan Karunakaran" in txt and "Contributor: Claude (AI)" in txt)
    check("the old clean-reload button is gone", page.locator("#cleanReload").count() == 0)
    check("the rows of the new About screen are there", all(x in txt for x in ("Version", "Check for updates", "What's new", "Open source licenses", "Privacy policy")))
    page.wait_for_timeout(300)
    check("the version is read from the installed app (with build date)", t("#abVersion").startswith("Stable v2.1.1 (build 57 · "), t("#abVersion"))
    check("the header chip shows the version", t("#abChip") == "v2.1.1", t("#abChip"))
    # icons
    vis = lambda: page.evaluate("[...document.querySelectorAll('#abLinks [data-link]')].filter(b => !b.hidden).map(b => b.dataset.link)")
    check("only the icons that have a link show (GitHub, by default)", vis() == ["github"], vis())
    page.click("#abLinks [data-link=github]"); check("the GitHub icon opens the repository", opened()[-1] == REPO, opened())
    page.evaluate("window.WN_CONFIG.links = { website: 'https://w.test', discord: 'https://d.test', x: 'https://x.test', facebook: 'https://f.test', reddit: 'https://r.test', github: '%s', bad: 'javascript:1' }; aboutShowLinks()" % REPO)
    check("all six icons show when their links are set", vis() == ["website", "discord", "x", "facebook", "reddit", "github"], vis())
    page.evaluate("window.WN_CONFIG.links.discord = 'javascript:alert(1)'; aboutShowLinks()"); check("a link that is not https stays hidden", "discord" not in vis(), vis())
    # check for updates
    state["mode"] = "b58"; page.evaluate("window.__opened = []"); page.click("#abUpdate"); page.wait_for_function("window.__opened.length > 0")
    check("a newer release: it says so and opens that release", "New version available" in toast() and opened() == [REPO + "/releases/tag/v2.1.1-b58"], (toast(), opened()))
    state["mode"] = "b57"; page.evaluate("window.__opened = []"); page.click("#abUpdate"); page.wait_for_function("document.querySelector('#toast').textContent.includes('No new')")
    check("the same release: 'No new updates available', nothing opens", opened() == [], opened())
    state["mode"] = "b50"; page.evaluate("window.__opened = []"); page.click("#abUpdate"); page.wait_for_function("document.querySelector('#toast').textContent.includes('No new')")
    check("an older release is not offered", opened() == [])
    state["mode"] = "error"; page.evaluate("window.__opened = []"); page.click("#abUpdate"); page.wait_for_function("window.__opened.length > 0")
    check("GitHub can't be reached: it still takes you to the latest release page", opened() == [REPO + "/releases/latest"] and "Couldn't check" in toast(), (toast(), opened()))
    state["mode"] = "none"; page.click("#abUpdate"); page.wait_for_function("document.querySelector('#toast').textContent.includes('No releases')")
    check("no release yet is said plainly", "No releases" in toast())
    # what's new
    state["mode"] = "b58"; page.click("#abNew"); page.wait_for_selector("#abNewBox .abnotes")
    box = t("#abNewBox")
    check("What's new shows the release notes, with Markdown", "What Next? v2.1.1-b58" in box and "Fix the calendar" in box and page.locator("#abNewBox .abnotes strong").count() == 1, box[:200])
    page.evaluate("window.__opened = []"); page.click("#abNewBox button:has-text('Open this release')"); check("it can open the release on GitHub", opened() == [REPO + "/releases/tag/v2.1.1-b58"], opened())
    page.click("#abNew"); check("tapping What's new again closes it", page.evaluate("document.querySelector('#abNewBox').hidden"))
    # licenses
    page.click("#abLic"); lic = t("#abLicBox")
    check("licenses are listed", "Capacitor" in lic and "MIT License" in lic and "Apache License 2.0" in lic and "AniList API" in lic, lic[:200])
    page.evaluate("window.__opened = []"); page.click("#abLicBox .ablic >> nth=0"); check("a license row opens its page", len(opened()) == 1 and opened()[0].startswith("https://"), opened())
    page.click("#abLic"); check("licenses close again", page.evaluate("document.querySelector('#abLicBox').hidden"))
    # privacy
    page.evaluate("window.__opened = []"); page.click("#abPrivacy"); check("Privacy policy opens PRIVACY.md", opened() == [REPO + "/blob/main/PRIVACY.md"], opened())
out = run(main, viewport=(390, 844), init=STUB)
check("no page errors", not out["errors"], out["errors"][:2])
print("%d checks, %d failed" % (len(R), R.count(False))); sys.exit(1 if False in R else 0)
