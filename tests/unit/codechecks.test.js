// Tests for the code-checking tools: the TypeScript gate (tools/tsc-gate.js), tsconfig.json, types/globals.d.ts and eslint.config.js.
// Where TypeScript is installed (set TSC=tsc, or have `tsc` on the path) the gate is also run on the real code. Run: node tests/unit/codechecks.test.js
const fs = require("fs"), path = require("path"), { spawnSync } = require("child_process");
const ROOT = path.join(__dirname, "../..");
const gate = require(path.join(ROOT, "tools/tsc-gate.js"));
let pass = 0, fail = 0;
const ok = (name, cond, detail) => { cond ? pass++ : fail++; console.log((cond ? "PASS " : "FAIL ") + name + (cond || !detail ? "" : "\n   " + detail)); };

// ---- reading the checker's output
const sample = [
  "js/a.js(3,5): error TS2304: Cannot find name 'foo'.",
  "js/a.js(9,1): error TS2451: Cannot redeclare block-scoped variable 'x'.",
  "js/b.js(1,1): error TS2349: This expression is not callable.",
  "js/c.js(7,2): error TS2339: Property 'dataset' does not exist on type 'Element'.",
  "js/c.js(8,2): error TS2322: Type 'number' is not assignable to type 'string'.",
  "Found 5 errors in 3 files.", "",
].join("\n");
const list = gate.parse(sample), s = gate.summarize(list);
ok("every error line is read, with file, line, column and code", list.length === 5 && list[0].file === "js/a.js" && list[0].line === 3 && list[0].col === 5 && list[0].code === 2304);
ok("a missing name, a repeated const/let and a non-function call fail the gate", s.gate.length === 3 && s.gate.map(e => e.code).join() === "2304,2451,2349");
ok("typing details are only counted, not enforced", s.other[2339] === 1 && s.other[2322] === 1 && !s.gate.some(e => e.code === 2339));
ok("empty or odd output gives no errors", gate.parse("").length === 0 && gate.parse(null).length === 0 && gate.parse("hello\nworld").length === 0);
ok("the TypeScript version is pinned exactly", /^typescript@\d+\.\d+\.\d+$/.test(gate.TYPESCRIPT));

// ---- the settings files
const tsconfig = JSON.parse(fs.readFileSync(path.join(ROOT, "tsconfig.json"), "utf8"));
ok("tsconfig reads the app's JavaScript and writes nothing", tsconfig.compilerOptions.checkJs === true && tsconfig.compilerOptions.allowJs === true && tsconfig.compilerOptions.noEmit === true && tsconfig.include.includes("js/**/*.js") && tsconfig.include.includes("boot.js"));
ok("the files are treated as plain scripts that share names, as the browser does", tsconfig.compilerOptions.moduleDetection === "legacy");
const d = fs.readFileSync(path.join(ROOT, "types/globals.d.ts"), "utf8");
ok("the window properties the app uses are declared", ["__REV", "__wnReady", "__wnErrors", "WN_CONFIG", "Capacitor"].every(n => new RegExp("\\b" + n + "\\b").test(d)));
const eslint = require(path.join(ROOT, "eslint.config.js"));
const appRule = eslint.find(c => c.files && c.files.includes("js/**/*.js"));
ok("ESLint settings load and cover the app and the Node files", Array.isArray(eslint) && !!appRule && eslint.some(c => c.files && c.files.includes("tests/**/*.js")) && eslint.some(c => c.ignores && c.ignores.includes("android/**")));
ok("the app files are checked as plain scripts, and top-level names are not 'unused'", appRule.languageOptions.sourceType === "script" && appRule.rules["no-unused-vars"][1].vars === "local");
ok("the settings catch repeated names, unreachable code and similar real mistakes", ["no-redeclare", "no-dupe-keys", "no-unreachable", "no-const-assign", "no-self-assign", "use-isnan"].every(r => appRule.rules[r] === "error"));
ok("undefined names are left to TypeScript (they would be false alarms across shared scripts)", appRule.rules["no-undef"] === undefined);

// ---- the real code (only where TypeScript is installed)
const tsc = process.env.TSC || "tsc", have = spawnSync(tsc, ["--version"], { encoding: "utf8" });
if(have.status === 0){
  const r = spawnSync(process.execPath, [path.join(ROOT, "tools/tsc-gate.js")], { encoding: "utf8", env: Object.assign({}, process.env, { TSC: tsc }) });
  ok("the real code has no missing names, repeated const/let or non-function calls", r.status === 0, r.stdout);
}else console.log("SKIP the TypeScript run on the real code (TypeScript is not installed here; the test workflow runs it)");
console.log("\n" + pass + " passed, " + fail + " failed"); process.exit(fail ? 1 : 0);
