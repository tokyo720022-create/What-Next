// Unit tests for the request pacer (js/core/pacer.js). Run: node tests/unit/pacer.test.js
const fs = require("fs"), vm = require("vm"), path = require("path");
let pass = 0, fail = 0;
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pass++ : fail++; console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "\n   got  " + JSON.stringify(got) + "\n   want " + JSON.stringify(want))); };
function make(maxWait){
  const clock = { t: 1000000 }, waits = [], ctx = { console }; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../../js/core/pacer.js"), "utf8") + "\n;this.makePacer = makePacer;", ctx);
  const p = ctx.makePacer({ now: () => clock.t, sleep: ms => { waits.push(ms); clock.t += ms; return Promise.resolve(); }, maxWait: maxWait || 45000 });
  return { p, clock, waits };
}
(async () => {
  { const { p, waits } = make(); for(let i = 0; i < 200; i++) await p.pace(false);
    eq("before the limit is known nothing is held back", waits.length, 0); }
  { const { p, waits, clock } = make(70000); p.setLimit(30);   // AniList in its degraded state: 30 a minute, so 28 are used
    let n = 0; for(let i = 0; i < 28 - 4; i++){ await p.pace(false); n++; }
    eq("reading screens use the limit minus a small reserve without waiting", [n, waits.length], [24, 0]);
    await p.pace(false); eq("the next reading request waits for the minute to pass", waits.length, 1);
    eq("and it waits about a minute, not longer", waits[0] > 59000 && waits[0] < 61000, true); }
  { const { p } = make(); p.setLimit(30); for(let i = 0; i < 24; i++) await p.pace(false);
    let err = null; try{ await p.pace(false); }catch(e){ err = e; }
    eq("when the wait would be longer than 45 seconds the request fails fast with a clear message", [!!err, err && err.net, err && /seconds/.test(err.message)], [true, true, true]); }
  { const { p, waits } = make(); p.setLimit(30); for(let i = 0; i < 24; i++) await p.pace(false);
    for(let i = 0; i < 4; i++) await p.pace(true);
    eq("saving a change can use the reserve at once", waits.length, 0); }
  { const { p, waits } = make(); p.setLimit(90); for(let i = 0; i < 60; i++) await p.pace(false);
    eq("with the normal limit of 90 there is room for 60 reads", waits.length, 0); }
  { const { p, clock, waits } = make(); p.setHold(20000);
    eq("after a 429 the hold time is known", Math.round(p.holdLeft() / 1000), 20);
    await p.pace(false); eq("requests wait out Retry-After, then go", [waits.length, clock.t >= 1000000 + 20000], [1, true]); }
  { const { p } = make(); p.setHold(60000);
    let err = null; try{ await p.pace(false); }catch(e){ err = e; }
    eq("a hold longer than the longest wait fails fast with a message that has the seconds", [!!err, err && err.net, err && /60 seconds/.test(err.message)], [true, true, true]); }
  { const { p } = make(); p.setLimit(10); p.setLimit(0); eq("a missing header value is ignored", p.holdLeft(), 0); }
  { const { p, waits } = make(); p.setLimit(2);   // a tiny limit never goes below 6
    for(let i = 0; i < 5; i++) await p.pace(true); eq("the lowest allowed limit is 6 a minute", waits.length, 0); }
  console.log("\n" + pass + " passed, " + fail + " failed"); process.exit(fail ? 1 : 0);
})();
