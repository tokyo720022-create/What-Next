// Unit tests for AniList Triple Sync maths in js/features/triple-math.js. Run: node tests/unit/triple.test.js
const fs = require("fs"), vm = require("vm"), path = require("path");
const ctx = { console }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, "../../js/features/triple-math.js"), "utf8"), ctx);
const g = n => vm.runInContext(n, ctx);
let pass = 0, fail = 0;
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pass++ : fail++; console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "\n   got  " + JSON.stringify(got) + "\n   want " + JSON.stringify(want))); };
const E = (id, o = {}) => Object.assign({ mediaId: id, status: "CURRENT", progress: 3, progressVolumes: 0, repeat: 0, private: false, notes: "", score: 0, startedAt: { year: null, month: null, day: null }, completedAt: { year: null, month: null, day: null }, media: { id, idMal: id + 1000 } }, o);

// dates and scores
eq("full date is YYYY-MM-DD, partial is empty", [g("tsDate")({ year: 2026, month: 3, day: 7 }), g("tsDate")({ year: 2026, month: null, day: 7 }), g("tsDate")(null)], ["2026-03-07", "", ""]);
eq("AniList fuzzy date keeps parts and nulls the rest", [g("tsFuzzy")({ year: 2026, month: 3, day: 7 }), g("tsFuzzy")(null)], [{ year: 2026, month: 3, day: 7 }, { year: null, month: null, day: null }]);
eq("0-100 score becomes MAL 1-10, 0 stays 0", [0, 4, 5, 45, 50, 86, 95, 100, null].map(g("tsScoreMal")), [0, 1, 1, 5, 5, 9, 10, 10, 0]);
// fingerprint
const fp = g("tsFingerprint");
eq("fingerprint is stable and changes with every sent field", [fp(E(1)) === fp(E(1)), fp(E(1)) !== fp(E(1, { progress: 4 })), fp(E(1)) !== fp(E(1, { score: 80 })), fp(E(1)) !== fp(E(1, { status: "COMPLETED" })), fp(E(1)) !== fp(E(1, { notes: "x" })), fp(E(1)) !== fp(E(1, { startedAt: { year: 2026, month: 1, day: 1 } })), fp(E(1)) !== fp(E(1, { private: true }))], [true, true, true, true, true, true, true]);
eq("fingerprint ignores the update time and title", fp(E(1)) === fp(Object.assign(E(1), { updatedAt: 5, media: { id: 1, idMal: 1001, title: { romaji: "x" } } })), true);
// MAL fields
const am = g("tsMalFields")(E(1, { status: "REPEATING", progress: 7, score: 86, startedAt: { year: 2026, month: 1, day: 5 } }), "ANIME", false);
eq("anime to MAL: status, episodes, score, rewatching, start date (no empty finish date)", am, { status: "watching", score: 9, num_watched_episodes: 7, is_rewatching: "true", start_date: "2026-01-05" });
eq("empty dates are sent as blank only for titles sent before (to clear them)", [Object.keys(g("tsMalFields")(E(1), "ANIME", false)).includes("start_date"), g("tsMalFields")(E(1), "ANIME", true).start_date, g("tsMalFields")(E(1), "ANIME", true).finish_date], [false, "", ""]);
eq("manga to MAL: chapters, volumes, rereading", g("tsMalFields")(E(2, { status: "PLANNING", progress: 20, progressVolumes: 2, score: 90 }), "MANGA", false), { status: "plan_to_read", score: 9, num_chapters_read: 20, num_volumes_read: 2, is_rereading: "false" });
eq("every AniList status has a MAL status", ["CURRENT", "REPEATING", "PLANNING", "COMPLETED", "PAUSED", "DROPPED"].map(s => g("tsMalFields")(E(1, { status: s }), "ANIME").status), ["watching", "watching", "plan_to_watch", "completed", "on_hold", "dropped"]);
// AniList target
const av = g("tsAlVars")(E(3, { status: "COMPLETED", progress: 12, score: 85, notes: "hi", private: true, startedAt: { year: 2025, month: 2, day: 3 } }), "ANIME");
eq("AniList save variables", av, { mediaId: 3, status: "COMPLETED", progress: 12, scoreRaw: 85, repeat: 0, private: true, notes: "hi", startedAt: { year: 2025, month: 2, day: 3 }, completedAt: { year: null, month: null, day: null } });
eq("manga adds volumes, anime does not", ["progressVolumes" in g("tsAlVars")(E(3, { progressVolumes: 4 }), "MANGA"), "progressVolumes" in av], [true, false]);
// pasted codes
const pc = g("tsParseCode");
eq("code from a whole link, a bare code, or nothing", [pc("http://localhost/?code=abc%2Fdef&state=xyz"), pc("  rawcode123 "), pc("")], [{ code: "abc/def", state: "xyz" }, { code: "rawcode123", state: "" }, { code: "", state: "" }]);
eq("code from a link with the code last", pc("https://x.test/cb?state=s1&code=c1"), { code: "c1", state: "s1" });
// planning
const plan = g("tsPlan"), a = E(1), b = E(2), c = E(3);
const p0 = plan([a, b], {}, ["al", "mal"], "baseline");
eq("baseline remembers everything and sends nothing", [p0.work.length, p0.now["1"].a === fp(a), p0.now["1"].m === fp(a), p0.now["1"].i], [0, true, true, 1001]);
const p1 = plan([a, b], {}, ["al"], "all");
eq("'all' sends every title to the chosen target only", [p1.work.length, p1.work[0].need], [2, ["al"]]);
const mem = { "1": { fp: fp(a), a: fp(a), m: fp(a) }, "2": { fp: fp(b), a: fp(b), m: "old" }, "9": { a: "z", m: "z", i: 77 } };
const p2 = plan([a, b, c], mem, ["al", "mal"], "delta");
eq("delta: only changed or new titles, and only for the target that is behind", p2.work.map(w => [w.id, w.need]), [["2", ["mal"]], ["3", ["al", "mal"]]]);
eq("titles gone from the source are listed as removed with what is known about them", p2.removed, [{ id: "9", a: "z", m: "z", i: 77 }]);
eq("a changed title is picked up again", plan([E(1, { progress: 9 })], mem, ["al"], "delta").work.map(w => w.id), ["1"]);
const mm = g("tsPlanMulti")([a, b], {}, ["al", "mal"], { al: "baseline", mal: "all" });
eq("mixed start: AniList only remembers, MyAnimeList gets everything", [mm.work.map(w => [w.id, w.need]), mm.now["1"].a === fp(a), mm.now["1"].m], [[["1", ["mal"]], ["2", ["mal"]]], true, undefined]);
eq("first-run targets are the ones nothing was ever sent to", [g("tsFirstTargets")({}, ["al", "mal"]), g("tsFirstTargets")({ "1": { a: "x" } }, ["al", "mal"]), g("tsFirstTargets")({ "1": { a: "x", m: "y" } }, ["al", "mal"])], [["al", "mal"], ["mal"], []]);
eq("a mass disappearance is flagged, a few titles are not", [g("tsRemovalLooksWrong")(40, 100), g("tsRemovalLooksWrong")(5, 20), g("tsRemovalLooksWrong")(11, 100), g("tsRemovalLooksWrong")(30, 400)], [true, false, false, false]);
console.log("\n" + pass + " passed, " + fail + " failed"); process.exit(fail ? 1 : 0);
