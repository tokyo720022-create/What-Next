// Runs the TypeScript checker over the app's JavaScript (nothing is converted or rewritten: it only reads).
// It FAILS only on mistakes that really break an app: a name that does not exist, a const or let declared twice, something called that is not
// a function. (In plain JavaScript files TypeScript does not count a function's arguments, and ESLint's no-redeclare covers repeated functions.)
// Everything else it finds is counted and shown, not enforced.
// Run: node tools/tsc-gate.js     (set TSC=tsc to use an installed checker instead of downloading the exact version below)
const { spawnSync } = require("child_process");
const path = require("path");

const TYPESCRIPT = "typescript@6.0.3";
const GATE = {
  2304: "a name that does not exist",
  2552: "a name that does not exist (a spelling slip?)",
  2451: "a name declared twice",
  2300: "a name declared twice",
  2392: "a function written twice",
  2393: "a function written twice",
  2554: "a function called with the wrong number of arguments",
  2555: "a function called with too few arguments",
  2349: "something called that is not a function",
  2348: "something called that is not a function",
};

// "js/x.js(12,34): error TS2304: Cannot find name 'foo'." -> { file, line, col, code, message }
function parse(output){
  const list = [], re = /^(.+?)\((\d+),(\d+)\): error TS(\d+): (.*)$/;
  for(const line of String(output || "").split(/\r?\n/)){ const m = re.exec(line); if(m) list.push({ file: m[1], line: +m[2], col: +m[3], code: +m[4], message: m[5] }); }
  return list;
}
function summarize(list){
  const gate = list.filter(e => GATE[e.code]), other = {};
  for(const e of list) if(!GATE[e.code]) other[e.code] = (other[e.code] || 0) + 1;
  return { gate, other, total: list.length };
}
function runTsc(cwd){
  const custom = process.env.TSC;
  const [cmd, args] = custom ? [custom, []] : ["npx", ["--yes", "-p", TYPESCRIPT, "tsc"]];
  return spawnSync(cmd, args.concat(["-p", "tsconfig.json", "--pretty", "false"]), { cwd, encoding: "utf8", shell: process.platform === "win32" });
}
function main(){
  const cwd = path.join(__dirname, "..");
  const r = runTsc(cwd);
  if(r.error || (r.status !== 0 && !parse(r.stdout).length && !/error TS/.test((r.stdout || "") + (r.stderr || "")))){
    console.log("FAIL TypeScript did not run: " + ((r.error && r.error.message) || r.stderr || r.stdout || "no output").toString().slice(0, 400));
    process.exit(1);
  }
  const s = summarize(parse((r.stdout || "") + "\n" + (r.stderr || "")));
  for(const e of s.gate) console.log("FAIL " + e.file + ":" + e.line + " " + GATE[e.code] + " (TS" + e.code + "): " + e.message);
  const rest = Object.keys(s.other).map(c => "TS" + c + " x" + s.other[c]).join(", ");
  console.log((s.gate.length ? "FAIL " : "PASS ") + s.gate.length + " real mistake(s) found. Other TypeScript notes (typing detail, not enforced): " + (rest || "none"));
  process.exit(s.gate.length ? 1 : 0);
}
module.exports = { parse, summarize, GATE, TYPESCRIPT };
if(require.main === module) main();
