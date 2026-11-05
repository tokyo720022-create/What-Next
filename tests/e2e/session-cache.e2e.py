# Smart cache, 14-day sign-out, account switch, first screen without a blank gap, and tap-to-reveal spoilers.
import sys, time
from harness import *
R = []
def check(n, c, d=""): R.append(bool(c)); print(("PASS " if c else "FAIL ") + n + ((" :: " + str(d)) if d and not c else ""))
DAY = "864e5"
def seed(js): return "if(!sessionStorage.getItem('seeded')){sessionStorage.setItem('seeded','1');" + js + "}"
TOK = "localStorage.setItem('wn_token','tok');localStorage.setItem('wn_name','Tester');"
keys = lambda page, p: page.evaluate("Object.keys(localStorage).filter(k => k.startsWith('%s'))" % p)

# 1. unused for 15 days: signed out before anything is asked, and the account's data is gone
def t1(page, out):
    check("15 days unused: the login screen is shown", page.locator("#setup").is_visible() and page.locator("#tabs").is_hidden())
    check("the login is removed", page.evaluate("localStorage.getItem('wn_token')") is None)
    check("the screen says why", "14 days" in page.inner_text("#loginErr"), page.inner_text("#loginErr"))
    check("saved data and waiting changes are removed", not keys(page, "wn_c_") and page.evaluate("localStorage.getItem('wn_pending')") is None and page.evaluate("localStorage.getItem('wn_name')") is None, keys(page, "wn_"))
    check("app settings are kept", page.evaluate("localStorage.getItem('wn_theme')") == "keep-me")
out = run(t1, anon=True, init=seed(TOK + "localStorage.setItem('wn_theme','keep-me');localStorage.setItem('wn_last', String(Date.now() - 15 * %s));localStorage.setItem('wn_pending','{\"5\":{\"type\":\"anime\",\"patch\":{\"progress\":3},\"ver\":1}}');localStorage.setItem('wn_c_acct_pool_tester', JSON.stringify({v:1,at:Date.now(),c:'acct',d:[]}));" % DAY))
check("no page errors (15 days)", not out["errors"], out["errors"][:2])

# 2. 13 days is still fine, and opening the app restarts the clock
def t2(page, out):
    check("13 days unused: still signed in", page.evaluate("localStorage.getItem('wn_token')") == "tok" and page.locator("#tabs").is_visible())
    check("opening the app restarted the 14-day clock", page.evaluate("Date.now() - Number(localStorage.getItem('wn_last'))") < 60000)
out = run(t2, init=seed(TOK + "localStorage.setItem('wn_last', String(Date.now() - 13 * %s));" % DAY))
check("no page errors (13 days)", not out["errors"], out["errors"][:2])

# 3. old saved items are swept when the app starts
def t3(page, out):
    left = sorted(keys(page, "wn_c_"))
    check("card 4 days old is deleted, card 1 day old stays", "wn_c_card_old" not in left and "wn_c_card_new" in left, left)
    check("calendar 8 days old is deleted", "wn_c_cal_x" not in left, left)
    check("account data 15 days old is deleted, 13 days old stays", "wn_c_acct_y" not in left and "wn_c_acct_z" in left, left)
def item(cls, name, days): return "localStorage.setItem('wn_c_%s_%s', JSON.stringify({v:1,at:Date.now() - %s * %s,c:'%s',d:[1]}));" % (cls, name, days, DAY, cls)
out = run(t3, init=seed(TOK + item("card", "old", 4) + item("card", "new", 1) + item("cal", "x", 8) + item("acct", "y", 15) + item("acct", "z", 13)))
check("no page errors (sweep)", not out["errors"], out["errors"][:2])

# 4. a different AniList account on the same phone starts clean; the same account keeps its data
def t4(page, out):
    check("another account: its hidden titles and chats are gone", page.evaluate("localStorage.getItem('wn_hide')") is None and page.evaluate("localStorage.getItem('wn_chats')") is None)
    check("the new account is remembered", page.evaluate("localStorage.getItem('wn_uid')") == "1", page.evaluate("localStorage.getItem('wn_uid')"))
out = run(t4, init=seed(TOK + "localStorage.setItem('wn_uid','123');localStorage.setItem('wn_hide','[9]');localStorage.setItem('wn_chats','[1]');"))
def t4b(page, out):
    check("same account: hidden titles are kept", page.evaluate("localStorage.getItem('wn_hide')") == "[9]")
out = run(t4b, init=seed(TOK + "localStorage.setItem('wn_uid','1');localStorage.setItem('wn_hide','[9]');"))

# 5. no blank screen after the logo: the saved Pick is on screen while AniList is slow
SLOW = "const __f = window.fetch.bind(window); window.fetch = (u, o) => (sessionStorage.getItem('slow') && String(u).includes('graphql')) ? new Promise(r => setTimeout(r, 3500)).then(() => __f(u, o)) : __f(u, o);"
def t5(page, out):
    page.wait_for_selector("#result .hero", timeout=10000); page.wait_for_timeout(800)   # first visit saves the pool
    page.evaluate("sessionStorage.setItem('slow', '1')")
    t0 = time.time(); page.reload(); page.wait_for_selector("#boot", state="detached", timeout=15000); dt = time.time() - t0
    check("the logo goes away before the slow AniList answers (%.1fs)" % dt, dt < 3.3, dt)
    check("a Pick card is already on screen when the logo goes away", page.locator("#result .hero").count() == 1 and page.is_visible("#app"))
    check("your name is in the header", page.inner_text("#whoName") == "Tester", page.inner_text("#whoName"))
    page.wait_for_timeout(4200)
    check("after AniList answers, the card is still there", page.locator("#result .hero").count() == 1)
out = run(t5, init=SLOW)
check("no page errors (fast start)", not out["errors"], out["errors"][:2])

# 6. spoilers: hidden until tapped, Markdown inside, nothing injected
def t6(page, out):
    page.evaluate("""() => { const d = document.createElement('div'); d.id = 'sp'; d.className = 'clamp'; d.style.maxHeight = 'none'; document.querySelector('#app').append(d);
      d.append(richText('Start ~!inline **secret** twist!~ end <img src=x onerror=window.__pwn=1> snake_case [site](https://x.test)\\n~!block one\\n\\nblock **two**!~')); }""")
    check("an inline spoiler and a block spoiler are made", page.locator("#sp .spl").count() == 1 and page.locator("#sp .splb").count() == 1)
    check("the inline spoiler is hidden (text is transparent)", page.evaluate("getComputedStyle(document.querySelector('#sp .spl')).color") == "rgba(0, 0, 0, 0)")
    page.click("#sp .spl strong") if False else page.click("#sp .spl", position={"x": 4, "y": 4})
    check("tapping reveals it, with Markdown inside", page.evaluate("document.querySelector('#sp .spl').classList.contains('on')") and page.locator("#sp .spl strong").count() == 1 and page.evaluate("getComputedStyle(document.querySelector('#sp .spl strong')).color") != "rgba(0, 0, 0, 0)")
    page.click("#sp .spl", position={"x": 4, "y": 4}); check("tapping again hides it", not page.evaluate("document.querySelector('#sp .spl').classList.contains('on')"))
    check("the block spoiler body is hidden at first", page.evaluate("document.querySelector('#sp .splbody').hidden"))
    page.click("#sp .splhead"); check("its button opens it", not page.evaluate("document.querySelector('#sp .splbody').hidden") and page.locator("#sp .splbody strong").count() == 1)
    check("text outside spoilers is normal, links are links, snake_case is untouched", "snake_case" in page.inner_text("#sp") and page.get_attribute("#sp a", "href") == "https://x.test")
    check("nothing from the text can inject elements or run code", page.locator("#sp img").count() == 0 and page.evaluate("window.__pwn === undefined"))
    check("cards show [spoiler] instead of the spoiler text", page.evaluate("plainText('Great. ~!He dies!~')") == "Great. [spoiler]")
out = run(t6)
check("no page errors (spoilers)", not out["errors"], out["errors"][:2])
print("%d checks, %d failed" % (len(R), R.count(False))); sys.exit(1 if False in R else 0)
