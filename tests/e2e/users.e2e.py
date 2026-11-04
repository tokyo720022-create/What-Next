import sys
from harness import *
import harness
R = []
def check(n, c, d=""): R.append(bool(c)); print(("PASS " if c else "FAIL ") + n + ((" :: " + str(d)) if d and not c else ""))
def main(page, out):
    t = lambda sel: page.inner_text(sel)
    page.click('#tabs [data-v="profile"]'); page.wait_for_function("document.querySelector('#pcFollowers').textContent !== '–'")
    # ---- my Followers list
    page.click("#pcFollowersBtn"); page.wait_for_selector("#user .ucard")
    check("Followers list opens above the profile with a title", page.locator("#user").is_visible() and "Followers" in t("#user .utop"), t("#user .utop"))
    names = page.evaluate("[...document.querySelectorAll('#user .uname')].map(n => n.textContent)")
    check("lists all followers", names == ["Moreaumi", "Orewatokyo720", "Vaskim"], names)
    tags = page.evaluate("[...document.querySelectorAll('#user .ucard')].map(c => c.querySelector('.utag').textContent)")
    check("Mutual badge only where you follow back", tags == ["Mutual", "Mutual", ""], tags)
    check("a person with a banner gets it behind their card", page.evaluate("document.querySelector('#user .ucard').style.backgroundImage.includes('c8.jpg')") and page.evaluate("document.querySelectorAll('#user .ucard.ub').length") == 1)
    check("avatars are loaded", page.evaluate("[...document.querySelectorAll('#user .uav')].every(i => i.naturalWidth > 0)"))
    # ---- the three-dot menu
    page.click('#user .ucard:nth-child(3) .ukebab'); page.wait_for_selector("#user .usheet")
    check("menu offers profile, follow and AniList", all(x in t("#user .usheet") for x in ("View profile", "Follow", "View on AniList")))
    harness.FOLLOWS.clear(); page.click('#user .usheet button:has-text("Follow")'); page.wait_for_function("document.querySelector('#user .ucard:nth-child(3) .utag').textContent === 'Mutual'")
    check("following someone from the menu sends ToggleFollow and makes them Mutual", harness.FOLLOWS == [303], harness.FOLLOWS)
    page.click('#user .ucard:nth-child(3) .ukebab'); page.click('#user .usheet button:has-text("Unfollow")'); page.wait_for_function("document.querySelector('#user .ucard:nth-child(3) .utag').textContent === ''")
    page.click('#user .ucard:nth-child(3) .ukebab'); page.mouse.click(190, 60); page.wait_for_timeout(200)
    check("tapping outside closes the menu", page.locator("#user .usheet").count() == 0)
    # ---- open a person's profile
    page.click("#user .ucard:nth-child(1) .uname"); page.wait_for_selector("#user .pcard .pname")
    page.wait_for_function("document.querySelector('#user .pcounts b:nth-child(1)') && [...document.querySelectorAll('#user .pcounts b')][3].textContent !== '–'")
    check("profile shows name, Mutual tag and counts", t("#user .pname") == "Moreaumi" and "Mutual" in t("#user .uchips") and [x.strip() for x in page.evaluate("[...document.querySelectorAll('#user .pcounts b')].map(b => b.textContent)")] == ["198", "26", "12", "9"], page.evaluate("[...document.querySelectorAll('#user .pcounts b')].map(b => b.textContent)"))
    check("their banner and avatar are shown", "c8.jpg" in page.evaluate("document.querySelector('#user .pbanner').style.backgroundImage") and page.evaluate("document.querySelector('#user .pavatar').naturalWidth") > 0)
    check("profile colour applied", page.evaluate("getComputedStyle(document.querySelector('#user .pcard')).getPropertyValue('--pc').trim()") == "#c063ff")
    stats = t("#user .pcard ~ .card:nth-of-type(2)") if False else t("#user")
    check("stats list like AniList", all(x in stats for x in ("Total Anime", "198", "Episodes Watched", "8,359", "Days Watched", "138.38", "Anime Mean Score", "93.88", "Total Manga", "Chapters Read", "4,942", "Volumes Read", "254", "Manga Mean Score", "93.57")), stats[:300])
    page.wait_for_function("[...document.querySelectorAll('#user .prows')][0].textContent.includes('shared')")
    aff = t("#user .prows >> nth=0")
    check("affinity is calculated for anime and manga", aff.count("%") == 2 and "Calculating" not in aff, aff)
    check("bio is cleaned", "Hi, I am Moreaumi." in t("#user") and "spoiler" not in t("#user"))
    check("Follow state: already following", "Following" in t("#user .uacts"))
    # Following -> unfollow -> follow again
    harness.FOLLOWS.clear(); page.click('#user .uacts button:has-text("Following")'); page.wait_for_selector('#user .uacts button:has-text("Follow"):not(:has-text("Following"))')
    check("unfollow from the profile updates the button and drops the Mutual tag", harness.FOLLOWS == [301] and "Mutual" not in t("#user .uchips") and "Follows you" in t("#user .uchips"), t("#user .uchips"))
    page.click('#user .uacts button:has-text("Follow")'); page.wait_for_selector('#user .uacts button:has-text("Following")')
    # ---- their followers / following
    page.click('#user .pcounts button:has-text("Following")'); page.wait_for_selector("#user .ucard")
    check("their Following list opens", "Following" in t("#user .utop") and page.locator("#user .ucard").count() == 3)
    page.click("#user .uback"); page.wait_for_selector("#user .pname")
    check("back returns to the profile", t("#user .pname") == "Moreaumi")
    # ---- detail statistics
    page.click('#user button:has-text("View Detail Statistics")'); page.wait_for_selector("#user .asdonut")
    check("detail statistics use the same charts", "Genres" in t("#user") and "Comedy (418)" in t("#user") and "Moreaumi's stats" in t("#user .utop"))
    page.click("#user .uback"); page.wait_for_selector("#user .pname")
    # ---- message
    page.click('#user .uacts button:has-text("Message")'); page.wait_for_selector("#chatRoom:not([hidden])")
    check("Message opens a chat with them and closes the overlay", t("#chatWith") == "Moreaumi" and page.locator("#user").is_hidden())
    # ---- a person who does not follow back: Follow button is the primary action
    openUser(page, 303) if False else None
    page.evaluate("openUser(303, 'Vaskim')"); page.wait_for_selector("#user .pname"); page.wait_for_function("document.querySelector('#user .uchips') && document.querySelector('#user .uchips').textContent.includes('Follows you') && document.querySelector('#user .uact.pri')")   # the name shows at once; the tags and buttons arrive when the profile has loaded
    check("someone you don't follow shows Follow and 'Follows you'", "Follows you" in t("#user .uchips") and page.locator('#user .uact.pri').count() == 1)
    page.click("#user .uback"); check("✕ closes the overlay", page.locator("#user").is_hidden())
    # ---- my own Following list from the profile
    page.click('#tabs [data-v="profile"]'); page.click("#pcFollowingBtn"); page.wait_for_selector("#user .ucard")
    names = page.evaluate("[...document.querySelectorAll('#user .uname')].map(n => n.textContent)")
    check("my Following list", names == ["cloudberrypies", "Moreaumi", "Orewatokyo720"], names)
    page.click("#user .uback")
    # Anime / Manga counts open the lists
    page.click("#pcAnimeBtn"); check("tapping Anime opens the anime list", page.locator("#animeList, #listTitle").first.is_visible() and "Anime" in t("#listTitle"))
    check("narrow width: nothing sticks out sideways", page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"))
out = run(main, viewport=(360, 780))
real = [c for c in out["console"] if "ERR_INTERNET" not in c[1]]
check("no console errors", not real and not out["errors"], (real[:2], out["errors"][:2]))
print("%d checks, %d failed" % (len(R), R.count(False))); sys.exit(1 if False in R else 0)
