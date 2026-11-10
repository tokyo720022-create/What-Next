// Unit tests for the themes in js/core/theme.js: groups, required colours and readable text in every theme. Run: node tests/unit/themes.test.js
const fs = require("fs"), vm = require("vm"), path = require("path");
const el0 = () => ({ style: { setProperty(){} }, dataset: {} });
const ctx = { console, LS: (k, d) => d, LSset(){}, document: { documentElement: el0(), querySelector: () => null, querySelectorAll: () => [], getElementById: () => null } };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, "../../js/core/theme.js"), "utf8"), ctx);
const THEMES = vm.runInContext("THEMES", ctx), GROUPS = vm.runInContext("THEME_GROUPS", ctx), DEFAULT = vm.runInContext("THEME_DEFAULT", ctx);
let pass = 0, fail = 0;
const ok = (name, cond, detail) => { cond ? pass++ : fail++; console.log((cond ? "PASS " : "FAIL ") + name + (cond || !detail ? "" : "\n   " + detail)); };
const lum = h => { const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const VARS = ["--bg", "--card", "--ink", "--muted", "--line", "--chip", "--sakura", "--sakura-ink", "--shadow", "--glass"], HEX = /^#[0-9A-Fa-f]{6}$/;

ok("theme ids are unique", new Set(THEMES.map(t => t.id)).size === THEMES.length);
ok("theme names are unique", new Set(THEMES.map(t => t.name)).size === THEMES.length);
ok("group ids are unique", new Set(GROUPS.map(g => g.id)).size === GROUPS.length);
ok("every theme is in a group that exists", THEMES.every(t => GROUPS.some(g => g.id === t.group)), THEMES.filter(t => !GROUPS.some(g => g.id === t.group)).map(t => t.id).join());
ok("every group has at least one theme", GROUPS.every(g => THEMES.some(t => t.group === g.id)));
ok("the default theme exists and is not in an 18+ group", THEMES.some(t => t.id === DEFAULT && !GROUPS.find(g => g.id === t.group).adult));
ok("only the Hentai group is 18+", GROUPS.filter(g => g.adult).map(g => g.id).join() === "hentai");
ok("every theme has a note, a pattern name or none, and a two-colour gradient", THEMES.every(t => t.note && t.g.length === 2 && t.g.every(c => HEX.test(c))));
ok("every theme sets every colour variable", THEMES.every(t => VARS.every(k => t.v[k])), THEMES.filter(t => !VARS.every(k => t.v[k])).map(t => t.id).join());
ok("colour variables that are hex are six digits", THEMES.every(t => ["--bg", "--card", "--ink", "--muted", "--line", "--chip", "--sakura", "--sakura-ink"].every(k => HEX.test(t.v[k]))));
ok("dark flag matches the page colour", THEMES.every(t => (lum(t.v["--bg"]) < 0.2) === t.dark), THEMES.filter(t => (lum(t.v["--bg"]) < 0.2) !== t.dark).map(t => t.id).join());
const css = fs.readFileSync(path.join(__dirname, "../../css/themes.css"), "utf8");
ok("every pattern a theme names has CSS", THEMES.filter(t => t.pattern).every(t => css.includes('data-pattern="' + t.pattern + '"')), THEMES.filter(t => t.pattern && !css.includes('data-pattern="' + t.pattern + '"')).map(t => t.id).join());

for(const t of THEMES){
  const v = t.v, rows = [
    ["text on page", v["--ink"], v["--bg"]], ["text on cards", v["--ink"], v["--card"]], ["muted on page", v["--muted"], v["--bg"]], ["muted on cards", v["--muted"], v["--card"]], ["muted on chips", v["--muted"], v["--chip"]],
    ["accent on page", v["--sakura"], v["--bg"]], ["accent on cards", v["--sakura"], v["--card"]],
    ["button text on accent", v["--sakura-ink"], v["--sakura"]], ["button text on gradient start", v["--sakura-ink"], t.g[0]], ["button text on gradient end", v["--sakura-ink"], t.g[1]]
  ], low = rows.filter(r => ratio(r[1], r[2]) < 4.5).map(r => r[0] + " " + ratio(r[1], r[2]).toFixed(1));
  ok(t.id + ": all text is readable (>= 4.5:1)", !low.length, low.join(", "));
}

// Categories (the drawers in App Settings) are built from the theme data
const cats = () => vm.runInContext("themeCategories()", ctx), ids = c => c.flatMap(x => x.themes.map(t => t.id)).sort().join();
ok("every theme is in exactly one drawer", ids(cats()) === THEMES.map(t => t.id).sort().join());
ok("no drawer is empty and drawer ids are unique", cats().every(c => c.themes.length) && new Set(cats().map(c => c.id)).size === cats().length);
ok("drawers follow the order of THEME_GROUPS", cats().map(c => c.id).join() === GROUPS.map(g => g.id).join());
vm.runInContext('THEMES.push({ id: "zz-nogroup", name: "No Group", note: "n", dark: true, g: ["#000000", "#FFFFFF"], v: {} }, { id: "zz-odd", group: "mystery-group", name: "Odd One", note: "n", dark: true, g: ["#000000", "#FFFFFF"], v: {} })', ctx);
const c2 = cats();
ok("a theme with no group is not lost: it lands in Other, last", c2[c2.length - 1].id === "other" && c2[c2.length - 1].name === "Other" && c2[c2.length - 1].themes.some(t => t.id === "zz-nogroup"));
ok("a group nobody described still gets a drawer with a readable name", (c2.find(c => c.id === "mystery-group") || {}).name === "Mystery Group");
ok("those extra themes are all reachable", ids(c2) === THEMES.map(t => t.id).sort().join());
vm.runInContext("THEMES.length -= 2", ctx);
console.log("\n" + pass + " passed, " + fail + " failed"); process.exit(fail ? 1 : 0);
