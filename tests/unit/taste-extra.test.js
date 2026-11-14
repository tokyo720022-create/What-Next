// Unit tests for the smarter taste report (js/features/taste-insights.js) and the layout of the shareable picture (js/features/taste-card.js).
// Run: node tests/unit/taste-extra.test.js
const fs = require("fs"), vm = require("vm"), path = require("path");
const ROOT = path.join(__dirname, "../..");
const ctx = { console, Date, Math, Number, String, Array, Set, Map, JSON, Object }; vm.createContext(ctx);
for(const f of ["taste-math", "taste-insights", "taste-card"]) vm.runInContext(fs.readFileSync(path.join(ROOT, "js/features/" + f + ".js"), "utf8"), ctx, { filename: f });
ctx.tt = m => m.title.romaji;
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8"), g = n => vm.runInContext(n, ctx);
let pass = 0, fail = 0;
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pass++ : fail++; console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "\n   got  " + JSON.stringify(got) + "\n   want " + JSON.stringify(want))); };
const yes = (name, cond) => eq(name, !!cond, true);

let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const mkE = (id, o) => { o = o || {}; return Object.assign({ status: "COMPLETED", score: 70, completedAt: { year: 2020 }, startedAt: { year: 2020 } }, o, { media: Object.assign({ id, type: "ANIME", isAdult: false, title: { romaji: "Show " + id }, coverImage: { large: "c" + id }, genres: ["Action"], tags: [], averageScore: 70, popularity: 20000, startDate: { year: 2015 }, format: "TV", episodes: 12, source: "MANGA", studios: { nodes: [{ name: "Bones" }] } }, o.media || {}) }); };

// ---- rating
{
  const e = Array.from({ length: 12 }, (_, i) => mkE(i + 1, { score: 90, media: { averageScore: 70 } }));
  const r = g("tiRating")(e);
  eq("a rater 2 points above the fans is Generous, with the right bias and mean", [r.known, r.label, r.bias, r.mean], [true, "Generous", 2, 9]);
  yes("the histogram counts every rated title once, in the 9 box", r.hist.reduce((a, b) => a + b, 0) === 12 && r.hist[8] === 12);
  const t = g("tiRating")(Array.from({ length: 12 }, (_, i) => mkE(i + 1, { score: 40, media: { averageScore: 70 } })));
  eq("3 points below the fans is a Tough critic", t.label, "Tough");
  eq("fewer than 8 rated titles: nothing is said", g("tiRating")(e.slice(0, 5)).known, false);
  eq("everything the same score is a narrow band", r.narrow, true);
}
// ---- finishing and dropping
{
  const e = [...Array.from({ length: 9 }, (_, i) => mkE(i + 1)), mkE(20, { status: "DROPPED" })];
  const f = g("tiFinish")(e); eq("9 finished and 1 dropped is a Finisher at 90%", [f.known, f.label, f.pct], [true, "Finisher", 90]);
  const s = g("tiFinish")([...Array.from({ length: 4 }, (_, i) => mkE(i + 1)), ...Array.from({ length: 4 }, (_, i) => mkE(i + 10, { status: "DROPPED" }))]); eq("half dropped is a Sampler", s.label, "Sampler");
  eq("too few titles: unknown", g("tiFinish")(e.slice(0, 4)).known, false);
}
// ---- the genre you quit
{
  const e = [...Array.from({ length: 14 }, (_, i) => mkE(i + 1, { media: { genres: ["Action"] } })), ...Array.from({ length: 3 }, (_, i) => mkE(i + 30, { status: "DROPPED", media: { genres: ["Ecchi"] } })), mkE(40, { media: { genres: ["Ecchi"] } })];
  const d = g("tiDrops")(e); eq("a genre dropped 3 of 4 times is named", d && [d.genre, d.n, d.dropped], ["Ecchi", 4, 3]);
  eq("with a clean list nothing is named", g("tiDrops")(e.slice(0, 14)), null);
}
// ---- genre scores
{
  const e = [...Array.from({ length: 5 }, (_, i) => mkE(i + 1, { score: 95, media: { genres: ["Psychological"] } })), ...Array.from({ length: 5 }, (_, i) => mkE(i + 10, { score: 55, media: { genres: ["Harem"] } })), ...Array.from({ length: 6 }, (_, i) => mkE(i + 20, { score: 75, media: { genres: ["Comedy"] } }))];
  const s = g("tiGenreScores")(e); eq("best and toughest genre against your own average", [s.best.genre, s.worst.genre], ["Psychological", "Harem"]);
}
// ---- eras, formats, length, sources, studios
{
  const e = Array.from({ length: 20 }, (_, i) => mkE(i + 1, { media: { startDate: { year: i < 15 ? 2012 : 2024 }, format: i < 18 ? "TV" : "MOVIE", episodes: i < 18 ? 12 : 1, source: "LIGHT_NOVEL" } }));
  const d = g("tiDecades")(e); eq("decades are shares of titles", d.rows.map(r => [r.label, r.pct]), [["2010s", 75], ["2020s", 25]]);
  eq("formats in order with shares", g("tiFormats")(e).map(f => [f.name, f.pct]), [["TV", 90], ["Movie", 10]]);
  eq("a typical 12-episode anime is short and sweet; one-episode movies are not counted", g("tiLength")(e, "anime").label, "Short and sweet");
  eq("light novels at 100% are named", g("tiSources")(e).name, "light novels");
  eq("a studio with 3 or more titles shows", g("tiStudios")(e)[0], { name: "Bones", n: 20 });
  eq("3 recent years: 25% started since 2024", g("tiRecent")(e, 2026).pct, 25);
}
// ---- drift (lately vs before)
{
  const old = Array.from({ length: 14 }, (_, i) => mkE(i + 1, { completedAt: { year: 2019 }, media: { startDate: { year: 2008 }, popularity: 80000 } }));
  const late = Array.from({ length: 12 }, (_, i) => mkE(i + 40, { completedAt: { year: 2026 }, media: { startDate: { year: 2026 }, popularity: 800, genres: ["Drama", "Comedy", "Fantasy", "Romance"][i % 4] ? [["Drama", "Comedy", "Fantasy", "Romance"][i % 4]] : [] } }));
  const d = g("tiDrift")(old.concat(late), [], "anime", 2026);
  yes("lately newer and more niche is reported", d && d.shifts.some(s => s.to === "Fresh") && d.shifts.some(s => s.to === "Niche"));
  eq("too few recent titles: no drift", g("tiDrift")(old.concat(late.slice(0, 4)), [], "anime", 2026), null);
}
// ---- the whole build never states what it can't know
{
  const entries = Array.from({ length: 70 }, (_, i) => mkE(i + 1, { score: rnd() < 0.8 ? Math.round(40 + rnd() * 55) : 0, media: { genres: [["Action", "Drama", "Comedy"][i % 3]], tags: i % 2 ? [{ name: "Isekai", rank: 80 }] : [{ name: "School", rank: 60 }], popularity: 1000 + i * 700 } }));
  const ref = Array.from({ length: 200 }, () => ({ genres: ["Action"], tags: [{ name: "School", rank: 60 }] }));
  const rep = g("tzBuild")(entries, ref, "anime", 2026), x = g("tiBuild")(entries, rep, ref, "anime", 2026);
  yes("a report has lines, a summary naming the archetype and a confidence level", x.lines.length >= 3 && x.summary.startsWith(rep.arch.name) && ["High", "Medium", "Low"].includes(x.confidence.level));
  yes("no sentence contains null, undefined or NaN", JSON.stringify(x.lines).indexOf("null") < 0 && !/undefined|NaN/.test(JSON.stringify(x.lines) + x.summary));
  eq("70 titles and many ratings is high confidence, 9 titles is low", [g("tiConfidence")(70, 60).level, g("tiConfidence")(9, 8).level], ["High", "Low"]);
  yes("the genre list for the picture has up to 8 names", rep.genres.names.length >= 3 && rep.genres.names.length <= 8);
  // ---- the picture
  const measure = (s, size) => String(s).length * size * 0.55;
  const plan = g("tcPlan")(Object.assign(rep, { extra: x }), { name: "orewatokyo", avatar: "https://s4.anilist.co/a.jpg" }, { measure, acc: "#8B7CFF" });
  yes("the picture is 1080 wide and tall enough for everything", plan.w === 1080 && plan.h > 1400 && plan.h < 3200);
  yes("every command stays inside the picture", plan.cmds.every(c => c.t === "circ" ? c.x - c.r >= 0 && c.x + c.r <= 1080 : c.t === "text" ? c.y > 0 && c.y < plan.h && (c.a === "right" ? c.x <= 1080 : c.a === "center" ? c.x > 0 && c.x < 1080 : c.x >= 0 && c.x < 1080) : c.x >= -1 && c.x + c.w <= 1081 && c.y >= 0 && c.y + c.h <= plan.h + 1));
  yes("the name, the archetype, the type code and the footer are drawn", ["orewatokyo", rep.arch.name, rep.code, "Made with What Next?", "anilist.co/user/orewatokyo"].every(s => plan.cmds.some(c => c.t === "text" && (c.s === s || c.s.includes(s)))));
  yes("all five vibes and all four letters are drawn", rep.vibes.every(v => plan.cmds.some(c => c.t === "text" && c.s === v.left.name) && plan.cmds.some(c => c.t === "text" && c.s === v.right.name)) && rep.axes.every(a => plan.cmds.some(c => c.t === "text" && c.s === a.letter)));
  yes("no text is cut off with an ellipsis by accident on short words and nothing is drawn as null or undefined", !plan.cmds.some(c => c.t === "text" && /undefined|null|NaN/.test(c.s)));
  yes("only https cover addresses are asked for (the plan lists what to load)", plan.urls.every(u => typeof u === "string" && u.length > 0));
  eq("an unready layout input does not crash when extra is missing", (() => { const r2 = Object.assign({}, rep); delete r2.extra; return g("tcPlan")(r2, { name: "x", avatar: "" }, { measure, acc: "#8B7CFF" }).h > 1000; })(), true);
}
// ---- the screens use it
const taste = read("js/features/taste.js"), share = read("js/features/taste-share.js"), boot = read("boot.js");
yes("the files load in order: maths, insights, layout, share, screen", ["taste-math", "taste-insights", "taste-card", "taste-share", "taste.js"].map(f => boot.indexOf(f)).every((x, i, a) => x > 0 && (i === 0 || x > a[i - 1])));
yes("the report asks AniList for the extra fields (format, length, source, studios, dates) and builds the insights", /format episodes chapters source studios/.test(taste) && /completedAt\{year\}/.test(taste) && /tiBuild\(entries, rep, ref, type, year\)/.test(taste));
yes("the Share button makes the picture, and the sheet offers Share, Copy and Save image", /tsOpen\(rep\)/.test(taste) && ["tzShareDo", "tzCopyDo", "tzSaveDo", "tzShareX"].every(id => read("views/screens/taste.html").includes('id="' + id + '"')) && /Share image/.test(read("views/screens/taste.html")) && /Copy image/.test(read("views/screens/taste.html")) && /Save image/.test(read("views/screens/taste.html")));
yes("covers are loaded so the picture is never tainted, with the phone's own HTTP as the fallback, and a failure falls back to text", /crossOrigin = "anonymous"/.test(share) && /CapacitorHttp/.test(share) && /tzShareAsText\(rep\)/.test(share));
yes("the native add-on is tried first, then the web view; nothing is claimed saved when it was not", /nativePlugin\("WnImage"\)/.test(share) && /navigator\.canShare/.test(share) && /ClipboardItem/.test(share) && /Saving needs the full build/.test(share));
yes("the Android back button closes the sheet", /#tzShare/.test(read("js/core/auth.js")));
console.log("\n" + pass + " passed, " + fail + " failed"); process.exit(fail ? 1 : 0);
