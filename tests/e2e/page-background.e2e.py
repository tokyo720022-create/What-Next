# The page colour must fill the whole screen, even when the content is short (an empty search result, for example).
# Regression: a background on <html> stopped <body>'s colour from filling the screen and left a dark band below the content.
import sys, io
from harness import *
from PIL import Image
R = []
def check(n, c, d=""): R.append(bool(c)); print(("PASS " if c else "FAIL ") + n + ((" :: " + str(d)) if d and not c else ""))
def main(page, out):
    page.click('#tabs [data-v="discover"]'); page.wait_for_timeout(500)
    page.evaluate("document.querySelectorAll('main > section').forEach(s => { if(s.id !== 'discover') s.hidden = true; }); document.querySelector('#dlist').replaceChildren(); document.body.style.cssText += ';height:300px;overflow:hidden'; scrollTo(0,0)")
    page.wait_for_timeout(300)
    check("<html> has no background of its own", page.evaluate("getComputedStyle(document.documentElement).backgroundColor") == "rgba(0, 0, 0, 0)", page.evaluate("getComputedStyle(document.documentElement).backgroundColor"))
    im = Image.open(io.BytesIO(page.screenshot())).convert("RGB"); w, h = im.size
    px = im.getpixel((3, int(h * .6)))
    check("light theme: the empty area below short content is light, not dark %s" % (px,), sum(px) > 600, px)
out = run(main, viewport=(360, 800), init="localStorage.setItem('wn_theme', JSON.stringify({id:'rentagirlfriend'}));")
check("no page errors", not out["errors"], out["errors"][:2])
print("%d checks, %d failed" % (len(R), R.count(False))); sys.exit(1 if False in R else 0)
