// Unit tests for the smart cache, the 14-day session clock (js/core/cache.js) and the spoiler/text helpers (js/core/markup.js).
// Run: node tests/unit/cache.test.js
const fs = require("fs"), vm = require("vm"), path = require("path");
const DAY = 86400000;
let T = 1800000000000;   // the fake clock
function makeStore(limit){
  const m = new Map();
  const size = () => [...m].reduce((n, [k, v]) => n + k.length + v.length, 0);
  return { map: m,
    get length(){ return m.size; }, key: i => [...m.keys()][i] ?? null,
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem(k, v){ v = String(v); const old = m.has(k) ? k.length + m.get(k).length : 0; if(limit && size() - old + k.length + v.length > limit) throw new Error("QuotaExceededError"); m.set(k, v); },
    removeItem: k => { m.delete(k); } };
}
function load(limit){
  const ls = makeStore(limit), ctx = { localStorage: ls, Date: { now: () => T }, state: { user: "Ann" }, console, setTimeout, clearTimeout };
  vm.createContext(ctx);
  const src = fs.readFileSync(path.join(__dirname, "../../js/core/cache.js"), "utf8") + "\n;this.api = { cacheGet, cacheMeta, cacheSet, cacheSetSoon, cacheFlushSoon, cacheDel, cacheDelPrefix, cacheClear, cacheSweep, cacheStats, cacheKeys, cacheGetAs, cacheMetaAs, CACHE_OK, sessionTouch, sessionExpired, sessionLast, acctUser, CACHE_TTL, SESSION_MAX };";
  vm.runInContext(src, ctx);
  return { ls, api: ctx.api };
}
let pass = 0, fail = 0;
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pass++ : fail++; console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "\n   got  " + JSON.stringify(got) + "\n   want " + JSON.stringify(want))); };

// ---- expiry per class ----
{ const { api, ls } = load(); const t0 = T;
  api.cacheSet("card", "a", { x: 1 }); api.cacheSet("cal", "b", [2]); api.cacheSet("acct", "c", "three");
  eq("a fresh item is read back", [api.cacheGet("card", "a"), api.cacheGet("cal", "b"), api.cacheGet("acct", "c")], [{ x: 1 }, [2], "three"]);
  T = t0 + 3 * DAY - 1; eq("card is still there just under 3 days", api.cacheGet("card", "a"), { x: 1 });
  T = t0 + 3 * DAY + 1; eq("card is gone after 3 days", api.cacheGet("card", "a"), null);
  eq("an expired card is removed from storage when read", ls.getItem("wn_c_card_a"), null);
  T = t0 + 7 * DAY - 1; eq("calendar still there just under 7 days", api.cacheGet("cal", "b"), [2]);
  T = t0 + 7 * DAY + 1; eq("calendar is gone after 7 days", api.cacheGet("cal", "b"), null);
  T = t0 + 14 * DAY - 1; eq("account data still there just under 14 days", api.cacheGet("acct", "c"), "three");
  T = t0 + 14 * DAY + 1; eq("account data is gone after 14 days", api.cacheGet("acct", "c"), null);
  T = t0; }
// ---- sweep ----
{ const { api, ls } = load(); const t0 = T;
  api.cacheSet("card", "old", 1); T = t0 + 2 * DAY; api.cacheSet("cal", "mid", 2); api.cacheSet("acct", "keep", 3); ls.setItem("wn_pending", "{}"); ls.setItem("wn_theme", "x");
  T = t0 + 3.5 * DAY; eq("sweep deletes only what is too old and says how many", api.cacheSweep(), 1);
  eq("sweep left the others, and never touched other keys", [api.cacheGet("cal", "mid"), api.cacheGet("acct", "keep"), ls.getItem("wn_pending"), ls.getItem("wn_theme")], [2, 3, "{}", "x"]);
  ls.setItem("wn_c_card_broken", "{not json"); eq("sweep removes a broken entry", api.cacheSweep(), 1);
  T = t0; }
// ---- clock set back ----
{ const { api } = load(); api.cacheSet("card", "f", 1); T -= 10 * 60000;
  eq("an item stamped in the future (clock moved back) is not trusted", api.cacheGet("card", "f"), null); T += 10 * 60000; }
{ const { api } = load(); api.cacheSet("card", "f", 1); T -= 30000; eq("a few seconds of clock drift is fine", api.cacheGet("card", "f"), 1); T += 30000; }
// ---- soon / flush / delete ----
{ const { api, ls } = load();
  api.cacheSetSoon("acct", "list", { n: 1 }, 5000); api.cacheSetSoon("acct", "list", { n: 2 }, 5000);
  eq("a delayed write is not written yet", ls.getItem("wn_c_acct_list"), null);
  api.cacheFlushSoon(); eq("flush writes the last value once", api.cacheGet("acct", "list"), { n: 2 });
  api.cacheSetSoon("acct", "x", 1, 5000); api.cacheDel("acct", "x"); api.cacheFlushSoon(); eq("deleting cancels a delayed write", api.cacheGet("acct", "x"), null); }
// ---- clear / prefix ----
{ const { api } = load();
  api.cacheSet("acct", "list_anime_ann", 1); api.cacheSet("acct", "list_manga_ann", 2); api.cacheSet("acct", "profile_ann", 3); api.cacheSet("card", "m", 4);
  api.cacheDelPrefix("acct", "list_"); eq("deleting by prefix removes just those", [api.cacheGet("acct", "list_anime_ann"), api.cacheGet("acct", "list_manga_ann"), api.cacheGet("acct", "profile_ann")], [null, null, 3]);
  eq("clear removes one class and reports the count", [api.cacheClear("card"), api.cacheGet("card", "m"), api.cacheGet("acct", "profile_ann")], [1, null, 3]);
  eq("clear with no class removes everything", [api.cacheClear(), api.cacheKeys().length], [1, 0]); }
// ---- entry limits ----
{ const { api } = load(); for(let i = 0; i < 15; i++){ T += 1000; api.cacheSet("cal", "k" + i, i); }
  eq("the calendar keeps only 12 weeks, newest first", [api.cacheKeys("cal").length, api.cacheGet("cal", "k0"), api.cacheGet("cal", "k14")], [12, null, 14]); }
// ---- full storage ----
{ const { api } = load(900);
  for(let i = 0; i < 6; i++){ T += 1000; api.cacheSet("card", "c" + i, "x".repeat(60)); }
  const before = api.cacheKeys("card").length; T += 1000;
  eq("an account item still fits when storage is full: the oldest cards make room", [api.cacheSet("acct", "big", "y".repeat(300)), api.cacheGet("acct", "big") === "y".repeat(300), api.cacheKeys("card").length < before], [true, true, true]); }
{ const { api } = load(700);
  T += 1000; api.cacheSet("acct", "a1", "z".repeat(250)); T += 1000; api.cacheSet("acct", "a2", "z".repeat(250));
  eq("a card never pushes account data out", [api.cacheSet("card", "c", "q".repeat(300)), api.cacheGet("acct", "a1") !== null, api.cacheGet("acct", "a2") !== null], [false, true, true]); }
// ---- stats ----
{ const { api } = load(); api.cacheSet("card", "a", 1); api.cacheSet("acct", "b", 2); const s = api.cacheStats();
  eq("stats count items per class", [s.count, s.byClass.card, s.byClass.cal, s.byClass.acct, s.chars > 0], [2, 1, 0, 1, true]); }
// ---- saved data in the wrong shape is thrown away, never handed to a screen ----
{ const { api, ls } = load(); const ok = api.CACHE_OK;
  const entry = { id: 1, status: "CURRENT", media: { id: 5, title: { romaji: "x" } } };
  api.cacheSet("acct", "pool_a", [entry]);
  eq("a good saved Pick is handed back", api.cacheGetAs("acct", "pool_a", ok.pool), [entry]);
  for(const [name, bad] of [["junk items", [{ x: 1 }, 5]], ["a number", 5], ["an object", { a: 1 }], ["no title", [{ media: { id: 1 } }]], ["null", null]]){
    api.cacheSet("acct", "pool_b", bad);
    eq("a damaged saved Pick (" + name + ") is refused and deleted", [api.cacheGetAs("acct", "pool_b", ok.pool), ls.getItem("wn_c_acct_pool_b")], [null, null]);
  }
  const le = { id: 7, status: "CURRENT", m: { id: 5, title: { romaji: "x" } } };
  api.cacheSet("acct", "list_a", { entries: [le] }); api.cacheSet("acct", "list_b", { entries: [1] }); api.cacheSet("acct", "list_c", [le]); api.cacheSet("acct", "list_d", { entries: [entry] });
  eq("saved lists must be { entries: [...] } of real entries", [api.cacheMetaAs("acct", "list_a", ok.list) !== null, api.cacheMetaAs("acct", "list_b", ok.list), api.cacheMetaAs("acct", "list_c", ok.list), api.cacheMetaAs("acct", "list_d", ok.list)], [true, null, null, null]);
  const media = { id: 1, title: { romaji: "t" }, coverImage: { large: "u" } };
  eq("trending and chart items need a title and a poster", [ok.medias([media]), ok.medias([{ id: 1 }]), ok.medias({}), ok.medias([])], [true, false, false, true]);
  eq("a calendar week needs numeric air times and real titles", [ok.airing([{ airingAt: 5, media }]), ok.airing([{ airingAt: "x", media }]), ok.airing([{ airingAt: 5 }]), ok.airing([])], [true, false, false, true]);
  eq("a validator that itself throws counts as damaged", [api.cacheSet("acct", "z", 1), api.cacheGetAs("acct", "z", () => { throw new Error("x"); }), ls.getItem("wn_c_acct_z")], [true, null, null]);
  eq("pages, entities, activity, objects and arrays", [ok.media(media), ok.media({}), ok.entity({ id: 3 }), ok.entity([]), ok.actdays({ days: {} }), ok.actdays({}), ok.object({}), ok.object([]), ok.array([]), ok.array({})], [true, false, true, false, true, false, true, false, true, false]); }
// ---- names ----
{ const { api, ls } = load(); eq("the account name comes from state and is lower case", api.acctUser(), "ann"); }
// ---- 14-day session ----
{ const { api, ls } = load(); const t0 = T;
  eq("no clock yet (first run after the update) is never expired", api.sessionExpired(), false);
  api.sessionTouch(); eq("touching saves the time", api.sessionLast(), t0);
  T = t0 + 14 * DAY; eq("exactly 14 days unused is still signed in", api.sessionExpired(), false);
  T = t0 + 14 * DAY + 1; eq("more than 14 days unused is expired", api.sessionExpired(), true);
  api.sessionTouch(); eq("using the app again starts the clock over", api.sessionExpired(), false);
  T = t0 - 5 * DAY; eq("a clock set back far is not punished", api.sessionExpired(), false); T = t0; }

// ---- spoiler and text helpers ----
{ const ctx = { console }; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../../js/core/markup.js"), "utf8") + "\n;this.api = { splitSpoilers, plainText, mdPrep };", ctx); const m = ctx.api;
  eq("splits plain and spoiler parts", m.splitSpoilers("a ~!b!~ c"), [{ sp: false, text: "a " }, { sp: true, text: "b" }, { sp: false, text: " c" }]);
  eq("nested spoilers stay inside the outer one", m.splitSpoilers("~!a ~!b!~ c!~"), [{ sp: true, text: "a ~!b!~ c" }]);
  eq("a spoiler can cover several lines", m.splitSpoilers("x\n~!one\n\ntwo!~").map(s => s.sp), [false, true]);
  eq("a tag that never closes is plain text", m.splitSpoilers("hello ~!oops"), [{ sp: false, text: "hello ~!oops" }]);
  eq("cards never show spoiler text", m.plainText("He is the <b>king</b>. ~!He dies in ep 5!~ Great show."), "He is the king. [spoiler] Great show.");
  eq("cards drop Markdown marks and links", m.plainText("**Bold** and [a link](https://x.test) and __more__"), "Bold and a link and more");
  eq("HTML tags and entities are cleaned", m.mdPrep("A&amp;B<br>C <i>d</i><script>x</script>"), "A&B\nC *d*x"); }
console.log("\n" + pass + " passed, " + fail + " failed"); process.exit(fail ? 1 : 0);
