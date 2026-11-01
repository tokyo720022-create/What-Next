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
eq("anime to MAL: status, episodes, score, rewatching, start date (no empty finish date)", am, { status: "watching", score: 9, num_watched_episodes: 7, is_rewatching: "true", num_times_rewatched: 0, start_date: "2026-01-05" });
eq("empty dates are sent as blank only for titles sent before (to clear them)", [Object.keys(g("tsMalFields")(E(1), "ANIME", false)).includes("start_date"), g("tsMalFields")(E(1), "ANIME", true).start_date, g("tsMalFields")(E(1), "ANIME", true).finish_date], [false, "", ""]);
eq("manga to MAL: chapters, volumes, rereading", g("tsMalFields")(E(2, { status: "PLANNING", progress: 20, progressVolumes: 2, score: 90 }), "MANGA", false), { status: "plan_to_read", score: 9, num_chapters_read: 20, num_volumes_read: 2, is_rereading: "false", num_times_reread: 0 });
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

// ---- fixes ----
eq("a year-only or year-and-month date is a change (it used to be invisible)", [fp(E(1)) !== fp(E(1, { startedAt: { year: 2026, month: null, day: null } })), fp(E(1, { startedAt: { year: 2026, month: 3, day: null } })) !== fp(E(1, { startedAt: { year: 2026, month: null, day: null } }))], [true, true]);
eq("rewatch and reread counts reach MyAnimeList", [g("tsMalFields")(E(1, { repeat: 2 }), "ANIME").num_times_rewatched, g("tsMalFields")(E(2, { repeat: 3 }), "MANGA").num_times_reread], [2, 3]);
// merging: never overwrite a target that is further along
const AL = (o = {}) => Object.assign({ status: "CURRENT", progress: 5, progressVolumes: 0, score: 0, repeat: 0, private: false, notes: "", startedAt: { year: null, month: null, day: null }, completedAt: { year: null, month: null, day: null } }, o);
const mAl = (src, tgt, type = "ANIME") => g("tsMergeAl")(E(1, src), AL(tgt), type);
eq("AniList: a target that is further along is left alone", [mAl({ progress: 3 }, { progress: 9 }), mAl({ status: "CURRENT", progress: 3 }, { status: "COMPLETED", progress: 12 })], [{ skip: "ahead" }, { skip: "ahead" }]);
eq("AniList: a rewatch of a title that is completed there is allowed", mAl({ status: "REPEATING", progress: 12 }, { status: "COMPLETED", progress: 12 }).vars.status, "REPEATING");
eq("AniList: identical entries are not written again", mAl({ progress: 5 }, { progress: 5 }), { same: true });
const w = mAl({ progress: 7, score: 0, notes: "" }, { progress: 5, score: 80, notes: "mine", startedAt: { year: 2025, month: 2, day: 3 }, repeat: 2 }).vars;
eq("AniList: an update never clears the target's score, notes, dates or rewatch count", [w.progress, w.scoreRaw, w.notes, w.startedAt, w.repeat], [7, 80, "mine", { year: 2025, month: 2, day: 3 }, 2]);
eq("AniList: a score on the source wins over the target's", mAl({ progress: 7, score: 90 }, { progress: 5, score: 80 }).vars.scoreRaw, 90);
eq("AniList manga: volumes never go down (nothing to write when only the volumes differ, and the higher count is kept when something else changes)", [mAl({ progress: 5, progressVolumes: 1 }, { progress: 5, progressVolumes: 4 }, "MANGA"), mAl({ progress: 8, progressVolumes: 1 }, { progress: 5, progressVolumes: 4 }, "MANGA").vars.progressVolumes], [{ same: true }, 4]);
const MF = (o = {}) => g("tsMalFields")(E(1, o), "ANIME", true), MT = (o = {}) => Object.assign({ status: "watching", score: 0, num_episodes_watched: 5, is_rewatching: false, start_date: "", finish_date: "", num_times_rewatched: 0 }, o);
eq("MyAnimeList: a target that is further along is left alone", [g("tsMergeMal")(MF({ progress: 3 }), MT({ num_episodes_watched: 9 }), "ANIME"), g("tsMergeMal")(MF({ progress: 3 }), MT({ status: "completed", num_episodes_watched: 12 }), "ANIME")], [{ skip: "ahead" }, { skip: "ahead" }]);
eq("MyAnimeList: identical entries are not written again", g("tsMergeMal")(MF({ progress: 5 }), MT(), "ANIME"), { same: true });
const mm2 = g("tsMergeMal")(MF({ progress: 7, score: 0 }), MT({ score: 8, start_date: "2025-02-03", num_times_rewatched: 1 }), "ANIME").fields;
eq("MyAnimeList: an update keeps the target's score, dates and rewatch count", [mm2.num_watched_episodes, mm2.score, "start_date" in mm2, mm2.num_times_rewatched], [7, 8, false, 1]);
// rejected titles
const rej = { "1": { fp: fp(E(1)), rj: { mal: fp(E(1)) } }, "2": { fp: "x", rj: { mal: "old" } } };
const pr = g("tsPlan")([E(1), E(2)], rej, ["al", "mal"], "delta");
eq("a title a target rejected is not retried until it changes (the other target still gets it)", pr.work.map(x => [x.id, x.need]), [["1", ["al"]], ["2", ["al", "mal"]]]);
eq("the rejection note goes away once the entry changes", [pr.now["1"].rj, pr.now["2"].rj], [{ mal: fp(E(1)) }, undefined]);
eq("copying everything ignores earlier rejections (it is a fresh start)", g("tsPlan")([E(1)], rej, ["mal"], "all").work.map(x => x.need), [["mal"]]);
// which accounts the memory belongs to
const rc = g("tsReconcile"), mem1 = { src: "me", ids: { al: 7, mal: 9 }, media: { "1": { a: "x", e: 11, m: "y", x: 1, i: 5 }, "2": { a: "z", m: "w", rj: { al: "q", mal: "r" } } } };
eq("same accounts: the memory is kept", rc(mem1, { src: "me", al: 7, mal: 9 }).media, mem1.media);
const r2 = rc(mem1, { src: "me", al: 8, mal: 9 });
eq("a different target AniList account forgets only what was sent to AniList", [r2.media["1"], r2.media["2"], r2.notes.length, r2.ids.al], [{ m: "y", x: 1, i: 5 }, { m: "w", rj: { mal: "r" } }, 1, 8]);
const r3 = rc(mem1, { src: "me", al: 7, mal: 10 });
eq("a different MyAnimeList account forgets only what was sent to MyAnimeList", [r3.media["1"], r3.ids.mal], [{ a: "x", e: 11, i: 5 }, 10]);
eq("a different source clears the whole memory", [Object.keys(rc(mem1, { src: "other", al: 7, mal: 9 }).media).length, rc(mem1, { src: "other", al: 7, mal: 9 }).notes.length], [0, 1]);
eq("an older memory without account ids is trusted and gets them", [Object.keys(rc({ media: { "1": { a: "x" } } }, { src: "me", al: 7, mal: 0 }).media).length, rc({ media: {} }, { src: "me", al: 7, mal: 0 }).ids], [1, { al: 7 }]);
eq("targets not in use do not change anything", rc(mem1, { src: "me", al: 0, mal: 0 }).ids, mem1.ids);
// errors
const ek = g("tsErrKind");
eq("error kinds: stop, retry later, or never retry this one", [ek({ fatal: true }), ek({ net: true }), ek({ status: 400 }), ek({ status: 403 }), ek({ status: 422 }), ek({ status: 429 }), ek({ status: 500 }), ek({})], ["fatal", "net", "reject", "reject", "reject", "transient", "transient", "transient"]);
// discord
const wo = g("tsWebhookOk");
eq("Discord webhook links", [wo("https://discord.com/api/webhooks/123456/abcDEF-_1"), wo("https://discordapp.com/api/webhooks/1/a?thread_id=9"), wo("http://discord.com/api/webhooks/1/a"), wo("https://example.com/api/webhooks/1/a"), wo(""), wo("https://discord.com/api/webhooks/abc/def")], [true, true, false, false, false, false]);
eq("a run where nothing happened is quiet", [g("tsQuiet")({ sentAl: 0, sentMal: 0, removed: 0, failed: 0, rejected: 0 }), g("tsQuiet")({ sentAl: 1, sentMal: 0, removed: 0, failed: 0, rejected: 0 }), g("tsQuiet")({ sentAl: 0, sentMal: 0, removed: 0, failed: 0, rejected: 2 })], [true, false, false]);
const emb = g("tsReport")({ kind: "Anime", source: "me", targets: ["AniList", "MyAnimeList"], sentAl: 3, sentMal: 2, same: 1, ahead: 0, skipped: 0, noMal: 1, removed: 0, rejected: 1, failed: 0, seconds: 12, stopped: false, titles: ["A", "B"], problems: [{ title: "Bad", msg: "MyAnimeList 400" }] });
eq("the Discord report says what happened", [emb.title, emb.description, emb.color, emb.fields.map(f => f.name)], ["AniList Triple Sync · Anime", "Finished. 5 update(s) sent, 1 problem(s) in 12s.", 15105570, ["Source", "Targets", "Sent to AniList", "Sent to MyAnimeList", "Already up to date", "No MyAnimeList page", "Rejected", "Titles sent", "Problems"]]);
eq("a clean report is green and caps long title lists", [g("tsReport")({ kind: "Manga", source: "me", targets: ["AniList"], sentAl: 20, sentMal: 0, rejected: 0, failed: 0, seconds: 1, titles: Array.from({ length: 20 }, (_, i) => "T" + i), problems: [] }).color, g("tsReport")({ kind: "Manga", source: "me", targets: ["AniList"], sentAl: 20, sentMal: 0, rejected: 0, failed: 0, seconds: 1, titles: Array.from({ length: 20 }, (_, i) => "T" + i), problems: [] }).fields.find(f => f.name === "Titles sent").value.split("\n").length], [5763719, 16]);
console.log("\n" + pass + " passed, " + fail + " failed"); process.exit(fail ? 1 : 0);
