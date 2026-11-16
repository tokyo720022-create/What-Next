// Unit tests for Pick Memory (js/features/pickmem-math.js) and how the screens use it. Run: node tests/unit/pickmem.test.js
const fs = require("fs"), vm = require("vm"), path = require("path");
const ROOT = path.join(__dirname, "../..");
const ctx = { console, Date, Math, Number, String, Array, Set, Map, JSON, Object }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, "js/features/pickmem-math.js"), "utf8"), ctx);
const g = n => vm.runInContext(n, ctx), read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
let pass = 0, fail = 0;
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pass++ : fail++; console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "\n   got  " + JSON.stringify(got) + "\n   want " + JSON.stringify(want))); };
const yes = (n, c) => eq(n, !!c, true);
const NOW = 1800000000, DAY = 86400;
const M = (id, genres, o) => Object.assign({ id, type: "ANIME", genres, episodes: 12, countryOfOrigin: "JP", startDate: { year: 2015 }, averageScore: 70, status: "FINISHED" }, o || {});
const bonus = (mem, m, now) => g("pmBonus")(mem, "anime", m, now == null ? NOW : now);
const learn = (mem, m, t, s, now, skip) => g("pmLearn")(mem, "anime", m, t, s, now == null ? NOW : now, skip);

// ---- traits
eq("a title's traits: each genre, length, decade and country", g("pmTraits")(M(1, ["Drama", "Thriller"]), "anime").map(t => t.key), ["genre:Drama", "genre:Thriller", "len:short", "era:2010", "from:JP"]);
eq("one-shots and unknown lengths say nothing about length", [g("pmLen")({ episodes: 1 }, "anime"), g("pmLen")({}, "anime"), g("pmLen")({ episodes: 24 }, "anime"), g("pmLen")({ chapters: 200 }, "manga"), g("pmLen")({ chapters: 30 }, "manga")], [null, null, "mid", "long", "short"]);
eq("traits in words", ["genre:Romance", "len:short", "era:2010", "from:KR"].map(k => g("pmLabel")(k, "anime")), ["Romance", "short series", "the 2010s", "Korean anime"]);
// ---- nothing learned: no effect
yes("an empty memory changes nothing, and so does a switched-off one", bonus(g("pmEmpty")(), M(1, ["Drama"])) === 0 && bonus(Object.assign(g("pmEmpty")(), { on: false }), M(1, ["Drama"])) === 0);
// ---- learning
{
  let mem = g("pmEmpty")(); const m = M(1, ["Psychological"]);
  const r1 = learn(mem, m, 1, 1); mem = r1.mem;
  yes("one like barely moves the score (a trait needs about 3 reactions)", bonus(mem, m) > 0 && bonus(mem, m) < 6);
  for(let i = 0; i < 4; i++) mem = learn(mem, m, 1, 1).mem;
  const b = bonus(mem, m); yes("five likes give a clear lift, never above the cap", b > 8 && b <= 25);
  yes("a title with other traits gets a smaller lift, a different title none", bonus(mem, M(2, ["Psychological"], { episodes: 40, countryOfOrigin: "KR", startDate: { year: 1999 } })) < b && bonus(mem, M(3, ["Sports"], { episodes: 40, countryOfOrigin: "KR", startDate: { year: 1999 } })) === 0);
  for(let i = 0; i < 30; i++) mem = learn(mem, m, 1, 1).mem;
  yes("however many likes, the bonus stays within the cap", bonus(mem, m) <= 25 + 1e-9);
  const dis = M(4, ["Romance"]); let m2 = mem; for(let i = 0; i < 5; i++) m2 = learn(m2, dis, -1, 1).mem;
  yes("dislikes lower the score the same way, within the cap", bonus(m2, dis) < -8 && bonus(m2, dis) >= -25);
  eq("the reaction names what it learned most", [r1.top, r1.up, learn(g("pmEmpty")(), dis, -1, 1).up], ["genre:Psychological", true, false]);
  eq("it counts the reaction (for the settings line)", learn(g("pmEmpty")(), m, 1, 1).mem.react.anime, 1);
}
// ---- filters: the genre you filtered on is not a preference
{
  const r = learn(g("pmEmpty")(), M(1, ["Action", "Drama"]), 1, 1, NOW, new Set(["genre:Action"]));
  yes("a genre chosen as a filter is not learned, the other traits are", !r.mem.anime["genre:Action"] && r.mem.anime["genre:Drama"] && r.changes.every(c => c.key !== "genre:Action"));
}
// ---- time fades it
{
  let mem = g("pmEmpty")(); const m = M(1, ["Mystery"]); for(let i = 0; i < 6; i++) mem = learn(mem, m, 1, 1).mem;
  const fresh = bonus(mem, m), later = bonus(mem, m, NOW + 90 * DAY), much = bonus(mem, m, NOW + 900 * DAY);
  const rec = mem.anime["genre:Mystery"], e0 = g("pmEff")(rec, NOW), e90 = g("pmEff")(rec, NOW + 90 * DAY);
  yes("after 90 days a preference has half its strength; the bonus shrinks with it, and after a very long time almost nothing is left", Math.abs(e90 / e0 - 0.5) < 0.01 && later < fresh && much < fresh * 0.01);
  const newer = learn(mem, M(9, ["Mystery"]), -1, 1, NOW + 90 * DAY).mem;
  yes("a new reaction counts more than an old habit (it moves from the faded value)", newer.anime["genre:Mystery"].v < mem.anime["genre:Mystery"].v * 0.5);
}
// ---- your own setting (the hybrid part)
{
  let mem = g("pmEmpty")(); const m = M(1, ["Horror"]);
  mem.anime["genre:Horror"] = { v: -0.9, n: 9, t: NOW, m: 1 };
  yes("Favour beats what it learned, Mute does the opposite, and neither needs 3 reactions", bonus(mem, m) > 0);
  mem.anime["genre:Horror"] = { v: 0.9, n: 9, t: NOW, m: -1 }; yes("Mute lowers it even if it learned to like it", bonus(mem, m) < 0);
  mem.anime["genre:Horror"] = { v: 0, n: 0, t: NOW, m: 1 }; yes("a manual setting works with nothing learned", bonus(mem, m) > 0);
}
// ---- undo
{
  const mem = g("pmEmpty")(), r = learn(mem, M(1, ["Drama"]), 1, 1), back = g("pmUndo")(r.mem, "anime", r.changes);
  eq("undo puts every trait and the count back exactly", JSON.stringify(back), JSON.stringify(mem));
  const r2 = learn(r.mem, M(2, ["Drama"]), 1, 1), back2 = g("pmUndo")(r2.mem, "anime", r2.changes);
  eq("undo of a second reaction returns to the state after the first", JSON.stringify(back2.anime), JSON.stringify(r.mem.anime));
}
// ---- starting from your list
{
  const E = (id, genres, score, status) => ({ status: status || "COMPLETED", score, media: M(id, genres) });
  const list = [...Array.from({ length: 6 }, (_, i) => E(i + 1, ["Psychological"], 90)), ...Array.from({ length: 6 }, (_, i) => E(i + 20, ["Harem"], 40)), ...Array.from({ length: 6 }, (_, i) => E(i + 40, ["Comedy"], 70)), E(60, ["Sports"], 90)];
  const mem = g("pmBoot")(g("pmEmpty")(), "anime", list, NOW);
  yes("high scores become likes, low scores dislikes, the middle stays near zero", mem.anime["genre:Psychological"].v > 0.3 && mem.anime["genre:Harem"].v < -0.3 && (!mem.anime["genre:Comedy"] || Math.abs(mem.anime["genre:Comedy"].v) < 0.3));
  yes("a trait seen only once is not learned, and the list is marked as used", !mem.anime["genre:Sports"] && mem.boot.anime === true && mem.boot.manga === false);
  yes("it can raise the score of a liked kind straight away (no cold start)", bonus(mem, M(100, ["Psychological"])) > 3 && bonus(mem, M(101, ["Harem"])) < -3);
  const dropped = [...Array.from({ length: 4 }, (_, i) => E(i + 1, ["Ecchi"], 0, "DROPPED")), ...Array.from({ length: 8 }, (_, i) => E(i + 10, ["Drama"], 0, "COMPLETED"))];
  yes("without scores, drops count against a genre and finished titles for it", g("pmBoot")(g("pmEmpty")(), "anime", dropped, NOW).anime["genre:Ecchi"].v < 0 && g("pmBoot")(g("pmEmpty")(), "anime", dropped, NOW).anime["genre:Drama"].v > 0);
  const own = g("pmEmpty")(); own.anime["genre:Psychological"] = { v: -0.5, n: 4, t: NOW };
  eq("what you reacted to yourself is never overwritten by the list", g("pmBoot")(own, "anime", list, NOW).anime["genre:Psychological"].v, -0.5);
}
// ---- not today
{
  const day = g("pmDay")(NOW), m1 = g("pmSnoozeAdd")({}, 5, day);
  yes("a title set aside is skipped today and back tomorrow", g("pmSnoozed")(m1, 5, day) && !g("pmSnoozed")(m1, 5, g("pmDay")(NOW + 2 * DAY)) && !g("pmSnoozed")(m1, 6, day));
  eq("older days are dropped when a new one is added", Object.keys(g("pmSnoozeAdd")({ 1: "2000-01-01" }, 2, day)), ["2"]);
}
// ---- a change of pace
{
  const f = g("pmExploreIndex");
  eq("never when switched off or with fewer than 4 candidates", [f(10, () => 0, false), f(3, () => 0, true)], [0, 0]);
  eq("when the dice say so it picks one of the next four", [f(10, (() => { const q = [0.05, 0.5]; return () => q.shift(); })(), true), f(10, () => 0.9, true)], [3, 0]);
  let hits = 0, seed = 5; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647; for(let i = 0; i < 4000; i++) if(f(10, rnd, true) > 0) hits++;
  yes("about 1 pick in 7 is a change of pace", hits > 4000 * 0.11 && hits < 4000 * 0.19);
}
// ---- why this pick
{
  let mem = g("pmEmpty")(); const m = M(1, ["Psychological"], { averageScore: 86, status: "RELEASING" }); for(let i = 0; i < 6; i++) mem = learn(mem, m, 1, 1).mem;
  const e = { status: "CURRENT", media: m }, p = { minutes: 24, progress: 5 }, why = g("pmWhy")(mem, "anime", e, p, { time: 30, explore: false }, NOW);
  yes("the reasons put what it learned first, then your list and time, at most three", why[0] === "You like Psychological" && why.length <= 3 && why.includes("You're at episode 5"));
  yes("a change of pace says so", g("pmWhy")(mem, "anime", e, p, { time: 30, explore: true }, NOW)[0] === "A change of pace");
  yes("with nothing learned it still explains from your list and time", g("pmWhy")(g("pmEmpty")(), "anime", { status: "PLANNING", media: M(2, ["Drama"], { averageScore: 85 }) }, { minutes: 20 }, { time: 30 }, NOW).join("|") === "On your Planning list|Fits your 30 min|Highly rated (85%)");
}
// ---- the screens use it
const core = read("js/core/core.js"), glue = read("js/features/pickmem.js"), boot = read("boot.js");
yes("Pick adds the bonus to its own score only (Surprise me stays random) and skips titles set aside today", /pmScore\(e\)/.test(core) && /pmSnoozedNow/.test(core) && /: base \+ \(e\.media\.averageScore \|\| 60\) \/ 2 \+ Math\.random\(\) \* 30/.test(core));
yes("the card shows why, and the three reactions under it", /pmWhyRow/.test(core) && /pmFeedbackRow/.test(core));
yes("the files load in order: maths, then the screen code, before start", boot.indexOf("pickmem-math.js") > 0 && boot.indexOf("pickmem-math.js") < boot.indexOf("js/features/pickmem.js") && boot.indexOf("js/features/pickmem.js") < boot.indexOf("js/core/start.js"));
yes("it is kept on this phone, wiped at sign-out, and no request is made except reading your own list once", /"wn_pickmem"/.test(read("js/core/session.js")) && /"wn_pm_snooze"/.test(read("js/core/session.js")) && (glue.match(/gql\(|collection\(/g) || []).length === 1);
yes("the settings page has the switches and a reset that needs two taps", /id="pmOn"/.test(read("views/settings/app.html")) && /id="pmReset"/.test(read("views/settings/app.html")) && /Tap again/.test(glue));
console.log("\n" + pass + " passed, " + fail + " failed"); process.exit(fail ? 1 : 0);
