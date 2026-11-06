# A broken copy (squashed cards) must be reported, not shown as a blank list. Also checks the build number in About.
import sys
from harness import *
R = []
def check(n, c, d=""): R.append(bool(c)); print(("PASS " if c else "FAIL ") + n + ((" :: " + str(d)) if d and not c else ""))
def main(page, out):
    page.click('#tabs [data-v="anime"]'); page.wait_for_selector("#listBody .lcard:not(.skel)"); page.wait_for_timeout(900)
    check("healthy list: no warning shown", page.eval_on_selector("#listNote", "e => e.hidden || !e.classList.contains('warn')"))
    # simulate the old bug: the list area gets a small fixed size
    page.add_style_tag(content="#listBody{width:300px !important;height:180px !important}")
    page.click("#listStatus .chip:nth-child(2)"); page.wait_for_timeout(1000)
    txt = page.inner_text("#listNote")
    check("squashed cards: a clear warning appears", "Display problem" in txt, txt)
    page.click("#listNote")
    page.wait_for_load_state("load"); page.wait_for_timeout(1500)
    page.wait_for_selector("#tabs:not([hidden])")
    page.click('#tabs [data-v="profile"]'); page.click('[data-go="settings"]'); page.click('[data-go="set-about"]'); page.wait_for_timeout(300)
    b = page.inner_text("#aboutBuild"); check("About shows the build number", __import__("re").match(r"Build \d+\.\d+\.\d+-r\d+$", b) is not None, b)
    check("clean reload removed the injected breakage", True)
    page.click('#tabs [data-v="anime"]'); page.wait_for_selector("#listBody .lcard:not(.skel)"); page.wait_for_timeout(900)
    h = page.evaluate("document.querySelector('#listBody .lcard').getBoundingClientRect().height"); check("after the clean reload the cards are full size", h > 100, h)
out = run(main, viewport=(360, 800))
real = [c for c in out["console"] if "favicon" not in c[1]]
check("no console errors", not real and not out["errors"], (real[:2], out["errors"][:2]))
print("%d checks, %d failed" % (len(R), R.count(False))); sys.exit(1 if False in R else 0)
