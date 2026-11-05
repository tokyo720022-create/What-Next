import sys
from harness import *
R = []
def check(n, c, d=""): R.append(bool(c)); print(("PASS " if c else "FAIL ") + n + ((" :: " + str(d)) if d and not c else ""))
def main(page, out):
    # splash: the logo was loaded and the splash is gone once the app is ready
    check("splash used the logo image", page.evaluate("performance.getEntriesByType('resource').some(r => r.name.includes('logo-512.png'))"))
    check("splash is removed after loading", page.locator("#boot").count() == 0)
    check("header shows the logo image", page.evaluate("(() => { const i = document.querySelector('.brand img.logo'); return !!i && i.naturalWidth > 0; })()"))
    check("no Log out button in the header", page.locator("#whoBar button").count() == 0 and page.locator("header #logout").count() == 0)
    # a failing AniList request shows a message and can be retried
    NET["profileerr"] = True; page.click('#tabs [data-v="profile"]'); page.wait_for_selector("#profErr:not([hidden])")
    check("profile error is shown, not blank", "Too Many Requests" in page.inner_text("#profErr"), page.inner_text("#profErr"))
    NET["profileerr"] = False; page.click("#profErr")
    page.wait_for_function("document.querySelector('#pcFollowers').textContent !== '–'")
    t = lambda sel: page.inner_text(sel).strip()
    check("name shown", t("#profName") == "Tester", t("#profName"))
    check("banner image set", "c8.jpg" in page.evaluate("document.querySelector('#profBanner').style.backgroundImage"))
    check("avatar shown", page.evaluate("(() => { const a = document.querySelector('#profAvatar'); return !a.hidden && a.naturalWidth > 0; })()"))
    check("counts: anime / manga / following / followers", [t("#pcAnime"), t("#pcManga"), t("#pcFollowing"), t("#pcFollowers")] == ["464", "311", "7", "3"], [t("#pcAnime"), t("#pcManga"), t("#pcFollowing"), t("#pcFollowers")])
    check("manga rows", (t("#pmChaps"), t("#pmVols"), t("#pmMean")) == ("11,148", "473", "94.96"), (t("#pmChaps"), t("#pmVols"), t("#pmMean")))
    check("anime rows", (t("#paEps"), t("#paDays"), t("#paMean")) == ("5,100", "136.1", "80.50"), (t("#paEps"), t("#paDays"), t("#paMean")))
    bio = t("#profBio")
    check("bio is cleaned (no spoiler, image or link markup)", "hidden twist" not in bio and "img200" not in bio and "](" not in bio and bio.startswith("Just a normal hardcore otaku"), bio[:80])
    check("bio has a More button when long", page.locator("#profBioMore").is_visible())
    check("profile colour applied to the ring", page.evaluate("getComputedStyle(document.querySelector('#profile .pcard')).getPropertyValue('--pc').trim()") == "#fc9dd6")
    check("View on AniList link", page.get_attribute("#profLink", "href") == "https://anilist.co/user/Tester")
    check("saved copy kept for next time", "Tester" in (page.evaluate("localStorage.getItem('wn_c_acct_profile_tester')") or ""))
    # log out now lives in Settings > Account
    page.click('#profile [data-go="settings"]'); page.click('#settings [data-go="set-account"]')
    check("Log out button is on the Account page", page.locator("#setAccount #logout").is_visible())
    page.click("#logout"); check("first tap only asks", "again" in t("#logout") and page.evaluate("!!localStorage.getItem('wn_token')"), t("#logout"))
    page.click("#logout"); page.wait_for_timeout(300)
    check("second tap logs out", page.evaluate("!localStorage.getItem('wn_token')") and page.evaluate("!document.querySelector('#setup').hidden"))
    check("saved profile cleared on log out", page.evaluate("localStorage.getItem('wn_c_acct_profile_tester')") is None)
out = run(main, viewport=(390, 844))
real = [c for c in out["console"] if "ERR_INTERNET" not in c[1] and "status of 500" not in c[1]]   # the 500 is the error we trigger on purpose
check("no console errors", not real and not out["errors"], (real[:2], out["errors"][:2]))
print("%d checks, %d failed" % (len(R), R.count(False))); sys.exit(1 if False in R else 0)
