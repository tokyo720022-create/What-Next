// Checks the project hangs together: every file exists and is listed, ids match, CSS and JS parse, versions agree.
// Run: node tests/check-structure.js
const fs = require("fs"), path = require("path"), vm = require("vm");
const root = path.join(__dirname, ".."), read = f => fs.readFileSync(path.join(root, f), "utf8");
let bad = 0; const fail = m => { bad++; console.log("FAIL " + m); }, ok = m => console.log("PASS " + m);
const boot = read("boot.js"), html = read("index.html");
const VIEWS = JSON.parse(boot.match(/const VIEWS = (\[[\s\S]*?\]);\n/)[1]), SCRIPTS = JSON.parse(boot.match(/const SCRIPTS = (\[[\s\S]*?\]);/)[1]);
const CSS = [...html.matchAll(/href="([^"]+\.css)"/g)].map(m => m[1]);
const loaded = [...VIEWS.map(v => v[1]), ...SCRIPTS, ...CSS];
const missing = loaded.filter(f => !fs.existsSync(path.join(root, f)));
missing.length ? fail("files listed but missing: " + missing) : ok("every listed file exists");
const walk = d => fs.readdirSync(path.join(root, d), { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const orphan = ["css", "js", "views"].flatMap(walk).filter(f => /\.(css|js|html)$/.test(f) && !loaded.includes(f.replace(/\\/g, "/")));
orphan.length ? fail("files on disk that are never loaded: " + orphan) : ok("no orphan files");
const rev = boot.match(/const REV = "([^"]+)"/)[1]; /^\d+\.\d+\.\d+-r\d+$/.test(rev) ? ok("boot.js REV looks right (" + rev + ")") : fail("REV is not like 2.1.1-r22: " + rev);
// All scripts share one global scope: the same top-level name declared twice stops the app from starting.
const seenNames = new Map(); let dupNames = [];
SCRIPTS.forEach(f => { for(const m of read(f).matchAll(/^(?:async\s+)?(?:function\*?|const|let|class)\s+([A-Za-z_$][\w$]*)/gm)){ if(seenNames.has(m[1]) && seenNames.get(m[1]) !== f) dupNames.push(m[1] + " (" + seenNames.get(m[1]) + ", " + f + ")"); else seenNames.set(m[1], f); } });
dupNames.length ? fail("declared in two script files: " + dupNames) : ok("no top-level name is declared in two script files");
SCRIPTS.forEach(f => { try{ new vm.Script(read(f), { filename: f }); }catch(e){ fail("syntax error in " + f + ": " + e.message); } });
ok("all " + SCRIPTS.length + " scripts parse");
const markup = VIEWS.map(v => read(v[1])).join("\n"), js = SCRIPTS.map(read).join("\n");
const ids = [...markup.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
const dup = [...new Set(ids.filter((x, i) => ids.indexOf(x) !== i))]; dup.length ? fail("duplicate ids: " + dup) : ok("no duplicate ids");
const used = [...new Set([...js.matchAll(/\$\("#([A-Za-z0-9_]+)"\)/g)].map(m => m[1]))].filter(x => !ids.includes(x));
used.length ? fail("script uses ids that do not exist: " + used) : ok("every id the scripts use exists");
const screens = js.match(/const SCREENS = \{([\s\S]*?)\};/)[1], keys = [...screens.matchAll(/"?([A-Za-z-]+)"?:\s*"#/g)].map(m => m[1]);
const goBad = [...new Set([...markup.matchAll(/data-go="([^"]+)"/g)].map(m => m[1]))].filter(x => !keys.includes(x));
goBad.length ? fail("data-go targets not in SCREENS: " + goBad) : ok("every data-go target is a real screen");
CSS.forEach(f => { const s = read(f).replace(/\/\*[\s\S]*?\*\//g, ""); let d = 0, min = 0; for(const c of s){ if(c === "{") d++; if(c === "}") d--; min = Math.min(min, d); } if(d || min) fail("unbalanced braces in " + f); });
ok("CSS braces balanced in all " + CSS.length + " files");
const cls = new Map(); CSS.forEach(f => { for(const m of read(f).replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/(?:^|\})\s*(\.[A-Za-z0-9_-]+)\s*\{/g)) cls.set(m[1], (cls.get(m[1]) || new Set()).add(f)); });
const twice = [...cls].filter(([, s]) => s.size > 1).map(([k]) => k); twice.length ? fail("same class styled in several CSS files: " + twice) : ok("no class is styled in two CSS files");
const tiny = [...cls.keys()].filter(k => /^\.c\d$/.test(k)); tiny.length ? fail("risky short class names (this caused the blank lists): " + tiny) : ok("no short class names like .c3");
// A file inside a folder that .gitignore hides is silently left out of every commit (the unpack workflow runs "git add -A"), and then the app or a test cannot find it.
// A line such as "android/" hides EVERY folder with that name, at any depth, so native/android/ was lost once. Folders made by the build (android, www at the top) are expected.
{
  const ignoredNames = read(".gitignore").split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith("#") && l.endsWith("/") && !l.startsWith("/") && !l.slice(0, -1).includes("/")).map(l => l.slice(0, -1));
  const hidden = [], skip = new Set(["node_modules", ".git", "__pycache__"]);
  (function walk(dir, rel){ for(const e of fs.readdirSync(path.join(root, dir || "."), { withFileTypes: true })){
    const r = rel ? rel + "/" + e.name : e.name;
    if(e.isDirectory()){ if(skip.has(e.name) || (!rel && ignoredNames.includes(e.name))) continue; if(ignoredNames.includes(e.name)) { hidden.push(r + "/"); continue; } walk(r, r); } } })("", "");
  hidden.length ? fail("these folders are hidden by .gitignore, so their files would never be committed: " + hidden.join(", ")) : ok("no folder of the project is hidden by .gitignore (" + ignoredNames.join(", ") + ")");
}
console.log(bad ? "\n" + bad + " problem(s)" : "\nStructure OK"); process.exit(bad ? 1 : 0);
