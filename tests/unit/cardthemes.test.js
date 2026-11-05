// Unit tests for the Discord card themes in js/features/triple-math.js. Run: node tests/unit/cardthemes.test.js
const fs = require("fs"), vm = require("vm"), path = require("path");
const ctx = { console }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, "../../js/features/triple-math.js"), "utf8"), ctx);
const g = n => vm.runInContext(n, ctx);
let pass = 0, fail = 0;
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pass++ : fail++; console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "\n   got  " + JSON.stringify(got) + "\n   want " + JSON.stringify(want))); };
const entry = (o = {}) => Object.assign({ mediaId: 5, status: "CURRENT", progress: 23, customLists: [], media: { title: { english: "Farming Life in Another World", romaji: "Isekai Nonbiri Nouka" }, format: "MANGA", genres: [], tags: [], episodes: 12, chapters: 100, coverImage: { extraLarge: "https://s4.anilist.co/cover.jpg", color: "#43a1d4" } } }, o);
const tf = g("tsThemeFor"), card = g("tsCard");
const own = name => ({ name, own: true });

eq("Iseki, Isekai and Tensei lists get the Isekai theme", ["Iseki", "isekai", "Tensei", "Isekai 2"].map(n => tf(own(n))), ["isekai", "isekai", "isekai", "isekai"]);
eq("Rom Com in any spelling gets the Rom-Com theme", ["Rom Com", "rom-com", "RomCom", "Romantic Comedy"].map(n => tf(own(n))), ["romcom", "romcom", "romcom", "romcom"]);
eq("other lists have no theme yet", ["Favourite", "Milf", "Anime movies", "Plan to continue"].map(n => tf(own(n))), ["", "", "", ""]);
eq("General Updates (a list with no thread of its own) is never themed", [tf({ name: "Iseki", own: false }), tf({ name: "General Updates", own: false })], ["", ""]);
eq("no theme, or no list, is safe", [tf(null), tf({ own: true })], ["", ""]);

const std = card(entry(), "manga", own("Iseki"));
eq("without options the standard card is used (nothing changes for old callers)", [std.title, std.fields[0].name, std.color], ["UPDATE: Farming Life in Another World", "🇯🇵 Romaji", 0x43a1d4]);
eq("themes switched off: standard card", card(entry(), "manga", own("Iseki"), { themes: false }).title, "UPDATE: Farming Life in Another World");
const iso = card(entry(), "manga", own("Iseki"), { themes: true });
eq("Isekai card: colour, author, title", [iso.color, iso.author.name, iso.title], [0x8E5CFF, "🌀 ISEKAI GATE · CHAPTER LOG", "⚔️ Farming Life in Another World"]);
eq("Isekai card: progress bar and flavour text", iso.description, "**Chapter 23** of 100\n🟪🟪⬛⬛⬛⬛⬛⬛⬛⬛ 23%\n*The journey in another world continues…*");
eq("Isekai card keeps Romaji, Status, Chapter and Left, with the poster", [iso.fields.map(f => f.name), iso.fields.map(f => f.value), iso.image.url], [["🌀 Romaji", "🗺️ Quest status", "📜 Chapter", "⏳ Left"], ["Isekai Nonbiri Nouka", "**CURRENT** · on the journey", "23", "77"], "https://s4.anilist.co/cover.jpg"]);
eq("Isekai footer", iso.footer.text, "🌀 Isekai · Tokyo Brotherhood");
const rc = card(entry({ status: "PLANNING", progress: 0 }), "anime", own("Rom Com"), { themes: true });
eq("Rom-Com card for anime: colour, author, hearts, Episode wording", [rc.color, rc.author.name, rc.description, rc.fields[2].name], [0xFF6FA3, "💕 ROM-COM DIARY · NEW EPISODE", "**Episode 0** of 12\n🤍🤍🤍🤍🤍🤍🤍🤍🤍🤍 0%\n*Saved for a rainy day with someone special.*", "💖 Episode"]);
const fin = card(entry({ status: "COMPLETED", progress: 12 }), "anime", own("Rom Com"), { themes: true });
eq("a completed series has its own heading, a full bar and 0 left", [fin.author.name, fin.description.includes("💗".repeat(10) + " 100%"), fin.fields[3].value], ["💍 HAPPILY EVER AFTER", true, "0"]);
const fin2 = card(entry({ status: "COMPLETED", progress: 100 }), "manga", own("Iseki"), { themes: true });
eq("Isekai completed heading", fin2.author.name, "🏆 QUEST COMPLETE · BACK FROM ANOTHER WORLD");
const unk = entry(); unk.media.chapters = null; unk.media.coverImage = null;
const iu = card(unk, "manga", own("Iseki"), { themes: true });
eq("unknown total: no bar, Left is ?, and no poster is fine", [iu.description, iu.fields[3].value, iu.image], ["**Chapter 23**\n*The journey in another world continues…*", "?", undefined]);
eq("a status AniList adds later does not break the card", card(entry({ status: "SOMETHING_NEW" }), "manga", own("Iseki"), { themes: true }).fields[1].value, "**SOMETHING_NEW**");
eq("the test buttons can force a look, or the standard card", [card(entry(), "anime", { name: "General Updates", own: false }, { force: "romcom" }).color, card(entry(), "anime", own("Iseki"), { force: "" }).title], [0xFF6FA3, "UPDATE: Farming Life in Another World"]);
const long = entry(); long.media.title.english = "x".repeat(400);
eq("a very long title stays inside Discord's 256 character limit", card(long, "manga", own("Iseki"), { themes: true }).title.length <= 256, true);
console.log("\n" + pass + " passed, " + fail + " failed"); process.exit(fail ? 1 : 0);
