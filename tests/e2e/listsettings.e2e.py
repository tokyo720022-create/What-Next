import sys
from harness import *
import harness
R = []
def check(n, c, d=""): R.append(bool(c)); print(("PASS " if c else "FAIL ") + n + ((" :: " + str(d)) if d and not c else ""))
def main(page, out):
    page.evaluate("showTab('set-lists')"); page.wait_for_selector("#lsForm .lssec")
    t = lambda sel: page.inner_text(sel)
    form = t("#lsForm")
    check("scoring system, advanced scoring and criteria shown", "Scoring" in form and "Use advanced scoring" in form and "Story" in form and "Characters" in form)
    check("default order, split toggles, activity toggles", "Default list order" in form and "Split Anime completed list section by format" in form and "Stop creating Rewatching/Rereading activity" in form)
    check("custom lists for anime and manga", "Anime movies" in form and "Custom Manga Lists" in form and "Fav" in form)
    check("section orders shown", "Anime Section Order" in form and "Completed Movie" in form and "Manga Section Order" in form)
    check("score select has the saved format", page.evaluate("document.querySelector('#lsForm select').value") == "POINT_100")
    check("rewatching activity toggle starts on", page.evaluate("(() => { const r = [...document.querySelectorAll('#lsForm .lsrow')].find(x => /Rewatching/.test(x.textContent)); return r.querySelector('input').checked; })()"))
    check("Save bar hidden until something changes", page.locator("#lsBar").is_hidden())
    # change things
    page.select_option("#lsForm select >> nth=0", "POINT_10")
    page.select_option("#lsForm select >> nth=1", "title")
    page.evaluate("[...document.querySelectorAll('#lsForm .lsrow')].find(x => /Stop creating Planning/.test(x.textContent)).click()")
    check("Save bar appears and is enabled", page.locator("#lsBar").is_visible() and page.locator("#lsSave").is_enabled())
    # custom list: add one, remove one
    page.evaluate("[...document.querySelectorAll('#lsForm .lshead')].find(x => /Custom Anime Lists/.test(x.textContent)).querySelector('button').click()")
    page.fill("#lsForm .lsadd input", "Rom Com"); page.click("#lsForm .lsadd .mini >> text=Add")
    check("new custom list appears as chip and in section order", "Rom Com" in t("#lsForm"))
    page.evaluate("[...document.querySelectorAll('#lsForm .lschip')].find(x => x.textContent.startsWith('Iseki')).querySelector('button').click()")
    check("removed list is struck out with a warning and leaves the order", page.locator("#lsForm .lschip.gone").count() == 1 and "deleted from all your titles" in t("#lsForm"))
    # duplicates are refused
    page.evaluate("[...document.querySelectorAll('#lsForm .lshead')].find(x => /Custom Anime Lists/.test(x.textContent)).querySelector('button').click()")
    page.fill("#lsForm .lsadd input", "anime MOVIES"); page.click("#lsForm .lsadd .mini >> text=Add")
    check("duplicate list name refused", page.evaluate("[...document.querySelectorAll('#lsForm .lschip')].filter(x => /anime movies/i.test(x.textContent)).length") == 1)
    page.click("#lsForm .lsadd .mini >> text=Cancel")
    # split toggle adds the format sections, reorder moves a row
    page.evaluate("[...document.querySelectorAll('#lsForm .lsrow')].find(x => /Split Manga/.test(x.textContent)).click()")
    check("splitting manga adds format sections", "Completed One Shot" in t("#lsForm"))
    page.evaluate("[...document.querySelectorAll('#lsForm .lshead')].find(x => /Anime Section Order/.test(x.textContent)).querySelectorAll('button')[1].click()")
    check("reorder buttons appear", page.locator("#lsForm .lsord button").count() > 0)
    before = page.evaluate("[...document.querySelectorAll('#lsForm .lsord')].slice(0, 3).map(r => r.querySelector('span').textContent)")
    page.evaluate("document.querySelectorAll('#lsForm .lsord')[1].querySelectorAll('button')[0].click()")
    after = page.evaluate("[...document.querySelectorAll('#lsForm .lsord')].slice(0, 3).map(r => r.querySelector('span').textContent)")
    check("move up swaps two rows", after[0] == before[1] and after[1] == before[0], (before, after))
    # save
    page.evaluate("cacheSet('acct', 'list_anime_tester', {entries: []}); cacheSet('acct', 'pool_tester', [1]); cacheSet('card', 'media_9', {x: 1}); cacheSet('card', 'trend_ANIME', [1])")
    harness.UPDATES.clear(); page.click("#lsSave"); page.wait_for_function("document.querySelector('#lsBar').hidden")
    page.wait_for_timeout(300)
    check("saving list settings drops saved lists, the Pick pool and saved pages (they hold scores in the old format), not other cards", all(page.evaluate("localStorage.getItem('%s')" % k) is None for k in ("wn_c_acct_list_anime_tester", "wn_c_acct_pool_tester", "wn_c_card_media_9")) and page.evaluate("localStorage.getItem('wn_c_card_trend_ANIME')") is not None)
    u = harness.UPDATES
    check("custom list deleted before the update is sent", u and u[0].get("delete") == {"n": "Iseki", "t": "ANIME"}, u[:1])
    up = u[-1] if u else {}
    check("score format, order, six activity flags sent", up.get("sf") == "POINT_10" and up.get("ro") == "title" and len(up.get("da", [])) == 6 and {a["type"]: a["disabled"] for a in up["da"]}["PLANNING"] is True and {a["type"]: a["disabled"] for a in up["da"]}["REPEATING"] is True, up.get("da"))
    al = up.get("al", {}); ml = up.get("ml", {})
    check("anime list options sent", al.get("customLists") == ["Anime movies", "Milf", "Rom Com"] and al.get("splitCompletedSectionByFormat") is True and al.get("advancedScoringEnabled") is True and al.get("advancedScoring") == ["Story", "Characters", "Visuals"] and "Iseki" not in al.get("sectionOrder", []) and "Rom Com" in al.get("sectionOrder", []), al)
    check("manga list options sent", ml.get("splitCompletedSectionByFormat") is True and "Completed Manga" in ml.get("sectionOrder", []), ml)
    check("anime section order was reordered", al["sectionOrder"][0] == "Rewatching", al.get("sectionOrder"))
    check("saved score format is used by the app", page.evaluate("localStorage.getItem('wn_scorefmt')") == "POINT_10")
    check("form reloaded from AniList after saving", page.evaluate("document.querySelector('#lsForm select').value") == "POINT_10" and "Iseki" not in t("#lsForm"), (page.evaluate("document.querySelector('#lsForm select').value"), "Iseki" in t("#lsForm"), t("#lsMsg")))
    # a failed save shows the reason and keeps the changes
    page.select_option("#lsForm select >> nth=1", "id"); NET["updateerr"] = True; page.click("#lsSave"); page.wait_for_timeout(600)
    check("failed save shows the error and keeps the Save bar", "Boom" in t("#lsMsg") and page.locator("#lsSave").is_enabled(), t("#lsMsg"))
    NET["updateerr"] = False
    check("narrow width: nothing sticks out sideways", page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"))
out = run(main, viewport=(360, 780))
real = [c for c in out["console"] if "ERR_INTERNET" not in c[1]]
check("no console errors", not real and not out["errors"], (real[:2], out["errors"][:2]))
print("%d checks, %d failed" % (len(R), R.count(False))); sys.exit(1 if False in R else 0)
