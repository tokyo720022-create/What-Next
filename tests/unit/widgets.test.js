// Unit tests for the home screen widgets' data (js/features/widgets-math.js) and the app side (js/features/widgets.js). Run: node tests/unit/widgets.test.js
const fs = require("fs"), vm = require("vm"), path = require("path");
const ROOT = path.join(__dirname, "../..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
let pass = 0, fail = 0;
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pass++ : fail++; console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "\n   got  " + JSON.stringify(got) + "\n   want " + JSON.stringify(want))); };
const yes = (n, c) => eq(n, !!c, true);
const ctx = { console, Date, Math, Number, String, Array, Set, Map, JSON, Object }; vm.createContext(ctx);
vm.runInContext(read("js/features/widgets-math.js"), ctx);
const g = n => vm.runInContext(n, ctx);
const NOW = Math.floor(new Date(2026, 10, 16, 12, 0, 0).getTime() / 1000), DAY = 86400, name = m => m.title.romaji;
const M = (id, o) => Object.assign({ id, type: "ANIME", isAdult: false, title: { romaji: "T" + id }, coverImage: { large: "https://s4.anilist.co/c" + id + ".jpg" }, episodes: 12, nextAiringEpisode: null }, o || {});
const E = (id, status, o, mo) => Object.assign({ status, progress: 3, media: M(id, mo) }, o || {});

// ---- airing
{
  const items = [E(1, "CURRENT", {}, { nextAiringEpisode: { episode: 4, airingAt: NOW + 3 * 3600 } }), E(2, "PLANNING", {}, { nextAiringEpisode: { episode: 1, airingAt: NOW + 3600 } }), E(3, "COMPLETED", {}, { nextAiringEpisode: { episode: 9, airingAt: NOW + 100 } }), E(4, "CURRENT", {}, { nextAiringEpisode: { episode: 2, airingAt: NOW + 9 * DAY } }), E(5, "CURRENT", {}, { nextAiringEpisode: { episode: 7, airingAt: NOW - 600 } }), E(6, "CURRENT", {}, { nextAiringEpisode: { episode: 7, airingAt: NOW - 3600 } }), E(7, "CURRENT", {}, { type: "MANGA", nextAiringEpisode: null }), E(8, "CURRENT", {}, { isAdult: true, nextAiringEpisode: { episode: 1, airingAt: NOW + 7200 } })];
  const a = g("wgAiring")(items, NOW, name, false);
  eq("airing: your anime that air within a week (or in the last 15 minutes), soonest first; finished, far-off, long-gone, manga and 18+ left out", a.map(x => x.id), [5, 2, 1]);
  eq("each row has the title, cover, episode and time for the widget", [a[2].t, a[2].c, a[2].ep, a[2].at, a[2].ty], ["T1", "https://s4.anilist.co/c1.jpg", 4, NOW + 3 * 3600, "ANIME"]);
  eq("18+ titles appear only when allowed", g("wgAiring")(items, NOW, name, true).map(x => x.id), [5, 2, 8, 1]);
  yes("at most 8 rows", g("wgAiring")(Array.from({ length: 20 }, (_, i) => E(i + 1, "CURRENT", {}, { nextAiringEpisode: { episode: 2, airingAt: NOW + 60 * (i + 1) } })), NOW, name, false).length === 8);
}
// ---- continue
{
  const items = [E(1, "CURRENT", { progress: 5 }), E(2, "REPEATING", { progress: 1 }), E(3, "PLANNING"), E(4, "CURRENT", { progress: 9 }, { type: "MANGA", chapters: 40, episodes: null }), E(5, "CURRENT", {}), E(6, "CURRENT", {}), E(7, "CURRENT", {}, { isAdult: true })];
  const c = g("wgContinue")(items, { 5: 900, 2: 800 }, name, false);
  eq("continue: what you are watching or reading, most recently changed first, then list order; Planning and 18+ left out; at most 4", c.map(x => x.id), [5, 2, 1, 4]);
  eq("progress and length: episodes for anime, chapters for manga", [c.find(x => x.id === 1).p, c.find(x => x.id === 1).total, c.find(x => x.id === 4).total, c.find(x => x.id === 4).ty], [5, 12, 40, "MANGA"]);
}
// ---- updates
{
  const entries = [{ updatedAt: NOW - 100, media: M(1) }, { updatedAt: NOW - 50, media: M(2) }, { updatedAt: 0, media: M(3) }, { updatedAt: NOW - 20, media: M(2) }, { updatedAt: NOW - 10, media: M(4, { isAdult: true }) }, ...Array.from({ length: 12 }, (_, i) => ({ updatedAt: NOW - 1000 - i, media: M(100 + i) }))];
  const u = g("wgUpdates")(entries, name, false);
  eq("updates: most recent first, each title once, no 18+, none without a time, at most 8", [u.slice(0, 2).map(x => x.id), u.length, u.some(x => x.id === 4 || x.id === 3)], [[2, 1], 8, false]);
}
// ---- streak
{
  const day = n => g("wgDay")(NOW - n * DAY), st = g("wgStreak");
  eq("three days in a row including today", st([day(0), day(1), day(2), day(4)], NOW), { days: 3, risk: false, week: [0, 0, 1, 0, 1, 1, 1] });
  eq("today not done yet keeps the streak and says it is at risk", [st([day(1), day(2)], NOW).days, st([day(1), day(2)], NOW).risk], [2, true]);
  eq("a missed day breaks it", st([day(2), day(3)], NOW).days, 0);
  eq("no activity: zero and no risk", [st([], NOW).days, st([], NOW).risk], [0, false]);
  const d = g("wgDays")([NOW - 5, NOW - DAY - 5, 0, NOW + 10 * DAY], [day(3)], NOW);
  eq("days come from your entries' update times and from changes made in the app; future and empty times are ignored", d.sort(), [day(0), day(1), day(3)].sort());
}
// ---- the whole snapshot
{
  const items = [E(1, "CURRENT", { progress: 2 }, { nextAiringEpisode: { episode: 3, airingAt: NOW + 3600 } })];
  const snap = g("wgSnapshot")({ items, lists: { anime: [{ updatedAt: NOW - 5, media: M(1) }], manga: [] }, pick: { id: 1, title: "T1", cover: "https://s4.anilist.co/c1.jpg", why: "You like Drama" }, days: [], adult: false, name, now: NOW });
  eq("the snapshot has every part the widgets read", Object.keys(snap).sort(), ["airing", "at", "continue", "pick", "streak", "updates", "v"]);
  eq("pick, streak and updates are filled from the lists", [snap.pick.t, snap.pick.why, snap.streak.days, snap.updates.length], ["T1", "You like Drama", 1, 1]);
  const bare = g("wgSnapshot")({ items, lists: {}, pick: null, days: [], adult: false, name, now: NOW });
  eq("before your lists are opened, updates fall back to what you are watching and the pick is empty", [bare.updates.map(x => x.id), bare.pick], [[1], null]);
  eq("a cover that is not https is never passed on", g("wgSnapshot")({ items: [E(2, "CURRENT", {}, { coverImage: { large: "http://x/y.jpg" } })], lists: {}, pick: { id: 2, title: "x", cover: "http://x/y.jpg", why: "" }, days: [], adult: false, name, now: NOW }).continue[0].c, "");
  yes("the snapshot is small enough for the phone to store (well under 400 KB even with a full widget)", JSON.stringify(g("wgSnapshot")({ items: Array.from({ length: 300 }, (_, i) => E(i + 1, "CURRENT", {}, { nextAiringEpisode: { episode: 2, airingAt: NOW + 60 * i } })), lists: {}, pick: null, days: [], adult: false, name, now: NOW })).length < 20000);
}
// ---- the app side, with a fake phone
function world(opts){
  opts = opts || {};
  const ls = new Map(), els = {}, calls = [];
  class N { constructor(){ this.dataset = {}; this.checked = false; this.hidden = false; this.text = ""; } set textContent(v){ this.text = String(v); } get textContent(){ return this.text; } }
  const $ = s => els[s] || (els[s] = new N());
  const plugin = { update: async o => { calls.push(["update", JSON.parse(o.json)]); }, pin: async o => { calls.push(["pin", o.kind]); return { ok: true }; }, status: async () => ({ airing: 1, pick: 2 }), clear: async () => { calls.push(["clear"]); } };
  const c = { console, Date, Math, Number, String, Array, Set, Map, JSON, Object, Promise, setTimeout, clearTimeout, $, toast: m => calls.push(["toast", m]),
    localStorage: { getItem: k => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)), removeItem: k => ls.delete(k) },
    isNative: !opts.web, nativePlugin: n => (n === "WnWidget" && !opts.web ? plugin : null), auth: { token: "t" }, state: { items: opts.items || [], time: 30 }, tt: m => m.title.romaji, candidates: () => (opts.items || []).map(e => ({ e })), nfReady: true, showTab: t => calls.push(["tab", t]), openMedia: id => calls.push(["media", id]) };
  c.LS = (k, d) => { try{ return Object.assign({}, d, JSON.parse(c.localStorage.getItem(k) || "{}")); }catch(_){ return d; } };
  c.LSset = (k, v) => { c.localStorage.setItem(k, JSON.stringify(v)); return true; };
  vm.createContext(c); vm.runInContext(read("js/features/widgets-math.js"), c); vm.runInContext(read("js/features/widgets.js"), c);
  return { c, ls, calls, els, g: n => vm.runInContext(n, c) };
}
(async () => {
  {
    const w = world({ items: [E(1, "CURRENT", { progress: 2 }, { nextAiringEpisode: { episode: 3, airingAt: NOW + 3600 } })] });
    await w.g("wgPush")();
    const up = w.calls.filter(x => x[0] === "update");
    yes("a snapshot is sent to the widgets", up.length === 1 && up[0][1].continue.length === 1 && up[0][1].pick && up[0][1].pick.id === 1);
    await w.g("wgPush")(); eq("nothing is sent again when nothing changed", w.calls.filter(x => x[0] === "update").length, 1);
    w.c.state.items.push(E(2, "CURRENT")); await w.g("wgPush")(); eq("a change is sent", w.calls.filter(x => x[0] === "update").length, 2);
    w.g("wgNote")(); const days = JSON.parse(w.ls.get("wn_streak")).d; w.g("wgNote")();
    eq("a change you make in the app counts for today's streak once", [days.length, JSON.parse(w.ls.get("wn_streak")).d.length], [1, 1]);
    w.g("wgForget")(); eq("signing out empties the widgets", w.calls.filter(x => x[0] === "clear").length, 1);
  }
  {
    const w = world({ web: true, items: [E(1, "CURRENT")] }); await w.g("wgPush")(); await w.g("wgFill")();
    eq("in a browser nothing is sent and the settings say widgets need the Android app", [w.calls.length, /Android app/.test(w.els["#wgState"].text), w.els["#wgPinAiring"].hidden], [0, true, true]);
  }
  {
    const w = world({ items: [E(1, "CURRENT")] }); await w.g("wgFill")();
    eq("settings show the buttons and how many widgets are placed", [w.els["#wgPinAiring"].hidden, /3 widgets are on your home screen/.test(w.els["#wgState"].text)], [false, true]);
    w.els["#wgPinPick"].onclick && await w.els["#wgPinPick"].onclick();
    eq("a button asks Android to add that kind", w.calls.filter(x => x[0] === "pin").map(x => x[1]), ["pick"]);
  }
  {
    const w = world();
    eq("only the app's own addresses are accepted, with plain numbers", ["whatnext://media/123", "whatnext://pick", "whatnext://schedule", "whatnext://media/abc", "whatnext://media/1234567890", "whatnext://evil", "https://x/media/1", "whatnext://media/12/../x"].map(u => w.g("wgOpenUrl")(u)), [true, true, true, false, false, false, false, false]);
    eq("a tap opens the title or the screen", w.calls.filter(x => x[0] === "media" || x[0] === "tab"), [["media", 123], ["tab", "pick"], ["tab", "schedule"]]);
    w.c.nfReady = false; w.g("wgOpenUrl")("whatnext://media/9"); eq("before the app has started the tap waits", w.calls.filter(x => x[0] === "media").length, 1);
    w.c.nfReady = true; w.g("wgGo")(); eq("and runs when it is ready", w.calls.filter(x => x[0] === "media").map(x => x[1]), [123, 9]);
  }
  // ---- wiring
  const boot = read("boot.js"), tabs = read("js/core/tabs.js"), core = read("js/core/core.js"), trk = read("js/core/tracker.js"), ses = read("js/core/session.js"), app = read("views/settings/app.html");
  yes("the files load in order: maths, then the app side, before start", boot.indexOf("widgets-math.js") > 0 && boot.indexOf("widgets-math.js") < boot.indexOf("js/features/widgets.js") && boot.indexOf("js/features/widgets.js") < boot.indexOf("js/core/start.js"));
  yes("the snapshot is refreshed after a list load, a list change, and when the app returns", /wgSoon\(\)/.test(core) && /wgSoon\(\)/.test(trk) && /wgSoon\(3000\)/.test(read("js/features/notify.js")) && /wgSoon\(6000\)/.test(read("js/features/notify.js")));
  yes("changes made in the app count for the streak, and the shown pick is remembered for the widget", /wgNote\(\)/.test(trk) && /wgPicked\(e, p\)/.test(core));
  yes("taps from a widget are routed before the login link handler, at launch and while running", /!nfOpenUrl\(ev\.url\) && !wgOpenUrl\(ev\.url\)/.test(read("js/core/auth.js")) && /!wgOpenUrl\(r\.url\)/.test(read("js/core/auth.js")));
  yes("signing out clears the widgets and the three stored items", /wgForget\(\)/.test(ses) && ["wn_widgets", "wn_streak", "wn_wg_pick"].every(k => ses.includes('"' + k + '"')));
  yes("App Settings has a button for each of the five widgets, the 18+ switch and a state line", ["wgPinAiring", "wgPinContinue", "wgPinUpdates", "wgPinStreak", "wgPinPick", "wgAdult", "wgState"].every(id => app.includes('id="' + id + '"')) && /wgFill\(\)/.test(tabs));
  console.log("\n" + pass + " passed, " + fail + " failed"); process.exit(fail ? 1 : 0);
})();
