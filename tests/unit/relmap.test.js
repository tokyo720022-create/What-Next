// Unit tests for the franchise order in js/features/relmap-order.js. Run: node tests/unit/relmap.test.js
const fs = require("fs"), vm = require("vm"), path = require("path");
const ctx = { console, Date, Math, Number, String, Array, Set, Map }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, "../../js/features/relmap-order.js"), "utf8"), ctx);
const read = f => fs.readFileSync(path.join(__dirname, "../..", f), "utf8");
let pass = 0, fail = 0;
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pass++ : fail++; console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "\n   got  " + JSON.stringify(got) + "\n   want " + JSON.stringify(want))); };
const yes = (n, c) => eq(n, !!c, true);
const A = (id, year, rel, o) => Object.assign({ id, type: "ANIME", status: "FINISHED", episodes: 12, startDate: { year, month: 1, day: 1 }, relations: { edges: (rel || []).map(([t, n]) => ({ relationType: t, node: { id: n } })) }, mediaListEntry: null }, o || {});
const G = list => ({ nodes: new Map(list.map(m => [m.id, m])) });
const rd = m => vm.runInContext("rmoDate", ctx)(m);
const show = { core: true, related: true, character: false };
const build = (g, root, s) => vm.runInContext("rmoBuild", ctx)(g, root, s || show);

// S1 (2010) - S2 (2012) - S3 (2015), a side story (2013), a movie (2014, sequel of S2 as a side story), a manga source (2008), an unreleased S4
const g = G([
  A(1, 2010, [["SEQUEL", 2], ["SOURCE", 50], ["SIDE_STORY", 20]]),
  A(2, 2012, [["PREQUEL", 1], ["SEQUEL", 3], ["SIDE_STORY", 21]]),
  A(3, 2015, [["PREQUEL", 2], ["SEQUEL", 4]]),
  A(4, 2027, [["PREQUEL", 3]], { status: "NOT_YET_RELEASED", episodes: null }),
  A(20, 2013, [["PARENT", 1]], { format: "OVA" }), A(21, 2014, [["PARENT", 2]], { format: "MOVIE" }),
  { id: 50, type: "MANGA", status: "FINISHED", chapters: 60, startDate: { year: 2008 }, relations: { edges: [{ relationType: "ADAPTATION", node: { id: 1 } }] } },
]);
{
  const r = build(g, 2);
  eq("anime are in release order, the manga source is listed apart", [r.items.map(x => x.id), r.others.map(x => x.id)], [[1, 2, 20, 21, 3, 4], [50]]);
  eq("the main story is the prequel and sequel chain only", r.items.filter(x => x.main).map(x => x.id), [1, 2, 3, 4]);
  eq("how each title is linked is kept (this title has none)", r.items.map(x => x.rel), ["PREQUEL", "", "SIDE_STORY", "SIDE_STORY", "SEQUEL", "SEQUEL"]);
  eq("with nothing on your list, you start with the first title", [r.summary.next, r.summary.started, r.items.find(x => x.id === 1).first], [1, false, true]);
  eq("the unreleased season is never the next one", r.items.find(x => x.id === 4).next, false);
}
{
  const m = new Map(g.nodes); m.set(1, Object.assign({}, g.nodes.get(1), { mediaListEntry: { status: "COMPLETED", progress: 12 } })); m.set(2, Object.assign({}, g.nodes.get(2), { mediaListEntry: { status: "CURRENT", progress: 5 } }));
  const r = build({ nodes: m }, 2);
  eq("watching season 2 means season 2 is next up (not a first start)", [r.summary.next, r.summary.started, r.summary.done, r.items.find(x => x.id === 2).next, r.items.find(x => x.id === 2).first], [2, true, 1, true, false]);
  eq("progress and total episodes come through", [r.items.find(x => x.id === 2).progress, r.items.find(x => x.id === 2).total], [5, 12]);
  const m2 = new Map(m); m2.set(2, Object.assign({}, g.nodes.get(2), { mediaListEntry: { status: "COMPLETED", progress: 12 } })); m2.set(3, Object.assign({}, g.nodes.get(3), { mediaListEntry: { status: "COMPLETED", progress: 12 } }));
  const r2 = build({ nodes: m2 }, 2); eq("finished everything released: caught up, one more on the way, no next", [r2.summary.next, r2.summary.upcoming, /caught up/.test(r2.summary.label)], [null, 1, true]);
}
{
  const r = build(g, 2, { core: true, related: false, character: false });
  eq("Related off leaves out side stories and movies", r.items.map(x => x.id), [1, 2, 3, 4]);
  const r2 = build(g, 1, { core: false, related: true, character: false });
  eq("Core off cannot walk past the first title: only related links of the root remain", r2.items.map(x => x.id), [1, 20]);
}
eq("a dropped main title is skipped for next up", (() => { const m = new Map(g.nodes); m.set(1, Object.assign({}, g.nodes.get(1), { mediaListEntry: { status: "DROPPED", progress: 2 } })); return build({ nodes: m }, 2).summary.next; })(), 2);
eq("dates sort: a missing year goes last, a missing day counts as late", [rd({ startDate: { year: 2020, month: 3, day: 5 } }) < rd({ startDate: { year: 2020, month: 3 } }), rd({ startDate: {} }) > rd({ startDate: { year: 2099, month: 12, day: 31 } })], [true, true]);
eq("a missing title gives an empty, safe result", build(G([]), 99).items, []);
// ---- how the screen uses it
const js = read("js/features/relmap.js"), html = read("views/sheets/relmap.html"), boot = read("boot.js");
yes("the order file loads before the map and the new view has its container and chip", boot.indexOf("relmap-order.js") > 0 && boot.indexOf("relmap-order.js") < boot.indexOf("js/features/relmap.js") && /id="rmOrderView"/.test(html) && /id="rmOrder"/.test(html) && /id="rmMore"/.test(html));
yes("the map draws while it loads (after every batch) and offers more titles when it was limited", /onRound/.test(js) && /rmMore/.test(js));
yes("the query asks for what the order view needs (progress, length, full start date)", /mediaListEntry\{status progress\}/.test(js) && /startDate\{year month day\}/.test(js) && /episodes chapters/.test(js));
console.log("\n" + pass + " passed, " + fail + " failed"); process.exit(fail ? 1 : 0);
