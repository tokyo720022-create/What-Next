// Unit tests for the taste report maths in js/features/taste-math.js. Run: node tests/unit/taste.test.js
const fs = require("fs"), vm = require("vm");
const ctx = { console }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(require("path").join(__dirname, "../../js/features/taste-math.js"), "utf8"), ctx);
const g = n => vm.runInContext(n, ctx);
let pass = 0, fail = 0;
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pass++ : fail++; console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "\n   got  " + JSON.stringify(got) + "\n   want " + JSON.stringify(want))); };
const tag = (name, rank = 80, spoiler = false) => ({ name, rank, isMediaSpoiler: spoiler });
const media = (id, o = {}) => Object.assign({ id, genres: ["Action"], tags: [], averageScore: 70, popularity: 60000, startDate: { year: 2015 }, isAdult: false }, o);
const entry = (id, o = {}, m = {}) => Object.assign({ status: "COMPLETED", score: 0, media: media(id, m) }, o);

// ratio text
eq("ratio text", [g("tzX")(1.26), g("tzX")(3.04), g("tzX")(5), g("tzX")(12), g("tzX")(1 / 4.8), g("tzX")(0.01)], ["1.3×", "3×", "5×+", "5×+", "−4.8×", "−9.9×"]);
// weak and spoiler tags are ignored
eq("only strong, non-spoiler tags count", g("tzTags")({ tags: [tag("A", 90), tag("B", 40), tag("C", 90, true)] }), ["A"]);
// themes
const mine = Array.from({ length: 10 }, (_, i) => media(i, { tags: i < 6 ? [tag("Isekai")] : [tag("Tragedy")] }));
const ref = Array.from({ length: 100 }, (_, i) => media(100 + i, { tags: [].concat(i < 4 ? [tag("Isekai")] : [], i < 40 ? [tag("Tragedy")] : [], i < 30 ? [tag("Comedy")] : []) }));
const th = g("tzThemes")(mine, ref);
eq("strongest theme first, with its count", [th.up[0].name, th.up[0].count], ["Isekai", 6]);
eq("a theme you under-use lands in the minus list", th.down.map(t => t.name), ["Comedy"]);
eq("too few titles with a tag: not shown as a theme", g("tzThemes")([media(1, { tags: [tag("Rare")] }), media(2), media(3)], ref).up, []);
// axes
const ax = (es, type = "anime") => g("tzAxes")(es, type, 2026);
const popular = Array.from({ length: 10 }, (_, i) => entry(i, {}, { popularity: 250000 })), obscure = Array.from({ length: 10 }, (_, i) => entry(i, {}, { popularity: 2000 }));
eq("popular titles lean Mainstream, obscure lean Niche", [ax(popular)[0].letter, ax(obscure)[0].letter], ["M", "N"]);
const newer = Array.from({ length: 10 }, (_, i) => entry(i, {}, { startDate: { year: 2025 } })), older = Array.from({ length: 10 }, (_, i) => entry(i, {}, { startDate: { year: 1998 } }));
eq("new titles lean Fresh, old titles lean Retro", [ax(newer)[1].letter, ax(older)[1].letter], ["F", "R"]);
const one = Array.from({ length: 10 }, (_, i) => entry(i, {}, { genres: ["Action", "Fantasy", "Comedy"] })), wide = Array.from({ length: 12 }, (_, i) => entry(i, {}, { genres: [["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"][i]] }));
eq("one set of genres leans Specialized, many lean Diverse", [ax(one)[2].letter, ax(wide)[2].letter], ["S", "D"]);
const agree = Array.from({ length: 10 }, (_, i) => entry(i, { score: 70 })), clash = Array.from({ length: 10 }, (_, i) => entry(i, { score: 100 }, { averageScore: 60 }));
eq("rating like the crowd is Aligned, far from it is Contrarian", [ax(agree)[3].letter, ax(clash)[3].letter], ["A", "C"]);
const few = ax(Array.from({ length: 10 }, (_, i) => entry(i, i < 3 ? { score: 100 } : {})));
eq("too few ratings: that slider is unknown and centred", [few[3].known, few[3].letter, few[3].pos], [false, "?", 0.5]);
eq("every slider stays between 0 and 1", ax(popular).concat(ax(obscure), ax(one)).every(a => a.pos >= 0 && a.pos <= 1), true);
// vibes
const grim = Array.from({ length: 10 }, (_, i) => media(i, { tags: [tag("Tragedy"), tag("War")] })), cosy = Array.from({ length: 10 }, (_, i) => media(i, { tags: [tag("Iyashikei"), tag("Family Life")] }));
const mixedRef = Array.from({ length: 40 }, (_, i) => media(100 + i, { tags: i % 2 ? [tag("Tragedy"), tag("Iyashikei")] : [tag("War"), tag("Family Life")] }));
eq("vibe slider moves toward the side you watch more", [g("tzVibes")(grim, mixedRef)[0].pos < 0.5, g("tzVibes")(cosy, mixedRef)[0].pos > 0.5], [true, true]);
eq("a vibe with no matching tags stays in the middle", g("tzVibes")(grim, mixedRef)[4].pos, 0.5);
// showcase
const shelf = [entry(1, { score: 90 }, { popularity: 1000 }), entry(2, { score: 30 }, { popularity: 900 }), entry(3, {}, { popularity: 3000, isAdult: true }), entry(4, { status: "DROPPED" }, { popularity: 500 }), entry(5, {}, { popularity: 15000 })];
eq("hidden gems skip low scores, adult and dropped titles, rarest first", g("tzGems")(shelf).map(x => [x.m.id, x.label]), [[1, "Ultra rare"], [5, "Rare"]]);
eq("gaps are the biggest rating differences", g("tzGaps")([entry(1, { score: 100 }, { averageScore: 60 }), entry(2, { score: 70 }), entry(3, { score: 20 }, { averageScore: 80 })]).map(x => [x.m.id, x.diff]), [[3, -6], [1, 4], [2, 0]]);
// whole report
eq("too few titles: no report yet", g("tzBuild")([entry(1), entry(2)], ref, "anime", 2026).ready, false);
const rep = g("tzBuild")(Array.from({ length: 12 }, (_, i) => entry(i, { score: 80 }, { tags: [tag("Isekai")], popularity: 3000 })), ref, "anime", 2026);
eq("report has an archetype, a type code and a type name", [rep.ready, rep.arch.name, /^[NM][RF][DS][CA]$/.test(rep.code), typeof rep.typeName], [true, "The Portal Hopper", true, "string"]);
eq("every one of the 16 type codes has a name", Object.keys(g("TZ_TYPES")).length, 16);
eq("share text names the archetype and themes", g("tzShareText")(rep).includes("The Portal Hopper") && g("tzShareText")(rep).includes("Isekai"), true);
// profile tendencies
const stat = { count: 100, meanScore: 80, statuses: [{ status: "COMPLETED", count: 60 }, { status: "CURRENT", count: 10 }, { status: "DROPPED", count: 10 }, { status: "PLANNING", count: 20 }],
  genres: [{ genre: "A", count: 50, meanScore: 85 }, { genre: "B", count: 40, meanScore: 84 }, { genre: "C", count: 30, meanScore: 83 }, { genre: "D", count: 20, meanScore: 70 }, { genre: "E", count: 1, meanScore: 10 }],
  tags: [{ tag: { name: "T1" }, count: 9 }, { tag: { name: "T2" }, count: 2 }], releaseYears: [{ releaseYear: 2001, count: 5 }, { releaseYear: 2020, count: 5 }, { releaseYear: 1999, count: 1 }], startYears: [{ startYear: 2012, count: 3 }, { startYear: 2008, count: 1 }, { startYear: 0, count: 9 }] };
const tend = g("tzTendencies")(stat, "anime").map(l => l.join(""));
eq("tendency lines", tend, ["Seems to love A/B/C", "Seems to hate D", "Tends to like T1", "Love 2020/2001/1999 series", "First recorded watching Anime in 2008", "Ends up completing 75.00% of Anime started"]);
eq("manga wording", g("tzTendencies")(stat, "manga").map(l => l.join("")).slice(4), ["First recorded reading Manga in 2008", "Ends up completing 75.00% of Manga started"]);
eq("a genre you tried only once is never 'hated'", tend.some(l => l.includes(" E")), false);
eq("no hated genre when none is clearly below your average", g("tzTendencies")(Object.assign({}, stat, { genres: stat.genres.map(x => Object.assign({}, x, { meanScore: 80 })) }), "anime").some(l => l[0] === "Seems to hate "), false);
eq("an empty list gives no lines", [g("tzTendencies")(null, "anime"), g("tzTendencies")({ count: 0 }, "anime")], [[], []]);
console.log("\n" + pass + " passed, " + fail + " failed"); process.exit(fail ? 1 : 0);
