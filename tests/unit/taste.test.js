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
const lines = (st, k) => g("tzTendencies")(st, k).map(l => l.parts.join(""));
const tend = lines(stat, "anime");
eq("tendency lines (basic stats only)", tend, ["Seems to love A/B/C", "Seems to hate D", "Tends to like T1", "Favourite era is the 2020s (45% of titles)", "First recorded watching Anime in 2008", "Ends up completing 75.00% of Anime started", "Drops 12.5% of what gets started", "Has 20 titles waiting in Planning"]);
eq("every line has an icon and a group", g("tzTendencies")(stat, "anime").every(l => l.icon && (l.group === "taste" || l.group === "habits")), true);
eq("manga wording", lines(stat, "manga").filter(l => /First recorded|Ends up/.test(l)), ["First recorded reading Manga in 2008", "Ends up completing 75.00% of Manga started"]);
eq("a genre you tried only once is never 'hated'", tend.some(l => l.includes(" E")), false);
eq("no hated genre when none is clearly below your average", g("tzTendencies")(Object.assign({}, stat, { genres: stat.genres.map(x => Object.assign({}, x, { meanScore: 80 })) }), "anime").some(l => l.parts[0] === "Seems to hate "), false);
eq("an empty list gives no lines", [g("tzTendencies")(null, "anime"), g("tzTendencies")({ count: 0 }, "anime")], [[], []]);
// the richer lines, when AniList gives the extra statistics
const rich = Object.assign({}, stat, { minutesWatched: 62000, episodesWatched: 2500, chaptersRead: 8400, volumesRead: 300,
  formats: [{ format: "TV", count: 60 }, { format: "MOVIE", count: 25 }, { format: "TV_SHORT", count: 10 }, { format: "OVA", count: 5 }],
  countries: [{ country: "JP", count: 80 }, { country: "KR", count: 20 }], studios: [{ studio: { name: "MAPPA" }, count: 9 }, { studio: { name: "Bones" }, count: 1 }, { studio: { name: "Ghibli" }, count: 3 }],
  startYears: [{ startYear: 2021, count: 40 }, { startYear: 2012, count: 3 }] });
const rl = lines(rich, "anime");
eq("formats: the three biggest with their share", rl.find(l => l.startsWith("Mostly ") && !l.includes("from")), "Mostly TV 60%/Movie 25%/TV Short 10%");
eq("studios: only ones seen at least twice, most first (anime only)", [rl.find(l => l.startsWith("Keeps coming back")), lines(rich, "manga").some(l => l.startsWith("Keeps coming back"))], ["Keeps coming back to MAPPA/Ghibli", false]);
eq("origins appear for anime once 10% or more is not Japanese", rl.find(l => l.startsWith("Mostly from")), "Mostly from Japan 80%/Korea 20%");
eq("time spent: days and hours, and episodes with a thousands separator", rl.find(l => l.startsWith("Has spent")), "Has spent 43d 1h watching (2,500 episodes)");
eq("manga: chapters and volumes", lines(rich, "manga").find(l => l.startsWith("Has read")), "Has read 8,400 chapters and 300 volumes");
eq("busiest year needs at least 5 titles", [rl.find(l => l.startsWith("Busiest year")), lines(stat, "anime").some(l => l.startsWith("Busiest year"))], ["Busiest year: 2021 (40 started)", false]);
const mostlyJp = Object.assign({}, rich, { countries: [{ country: "JP", count: 95 }, { country: "KR", count: 5 }] });
eq("anime from Japan only: no origin line; manga always has one when there are two countries", [lines(mostlyJp, "anime").some(l => l.startsWith("Mostly from")), lines(mostlyJp, "manga").find(l => l.startsWith("Mostly from"))], [false, "Mostly from Japan 95%/Korea 5%"]);
const hidden = Object.assign({}, stat, { genres: [{ genre: "A", count: 50, meanScore: 70 }, { genre: "B", count: 40, meanScore: 90 }, { genre: "C", count: 30, meanScore: 72 }, { genre: "D", count: 20, meanScore: 71 }] , statuses: [{ status: "COMPLETED", count: 5 }] });
eq("the highest-rated genre is not repeated when it is already one of the three most watched", lines(hidden, "anime").find(l => l.startsWith("Rates ")), undefined);
const gem = Object.assign({}, stat, { genres: [{ genre: "A", count: 50, meanScore: 70 }, { genre: "B", count: 40, meanScore: 71 }, { genre: "C", count: 30, meanScore: 72 }, { genre: "Z", count: 10, meanScore: 92 }], meanScore: 72 });
eq("...and shows it with its score out of 10", lines(gem, "anime").find(l => l.startsWith("Rates ")), "Rates Z highest (9.2)");
eq("no drop line and no planning line when there are none", lines(Object.assign({}, stat, { statuses: [{ status: "COMPLETED", count: 5 }] }), "anime").filter(l => /^Drops|waiting in Planning/.test(l)), []);
// genre bars
const bars = g("tzTopGenres")(stat, 5);
eq("genre bars: top five by count, share of your titles and average score out of 10", [bars.length, bars[0], bars[4]], [5, { name: "A", pct: 50, count: 50, mean: "8.5" }, { name: "E", pct: 1, count: 1, mean: "1.0" }]);
eq("genre bars never exceed 100% and need titles", [g("tzTopGenres")({ count: 10, genres: [{ genre: "X", count: 30, meanScore: 0 }] }, 3)[0].pct, g("tzTopGenres")(null), g("tzTopGenres")({ count: 0, genres: [] })], [100, [], []]);
console.log("\n" + pass + " passed, " + fail + " failed"); process.exit(fail ? 1 : 0);
