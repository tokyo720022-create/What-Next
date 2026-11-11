// Looks through every file of the project for things that must never be in a public repo: signing keys, private keys, access tokens, webhook secrets.
// Run: node tests/unit/secrets.test.js   (it also runs on every build, so a pasted secret stops the build before it is published)
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "../..");
const SKIP_DIRS = new Set(["node_modules", ".git", "android", "www", "ios"]);
const FORBIDDEN_FILES = /\.(jks|keystore|p12|pfx|pem)$|(^|\/)\.env(\.|$)|(^|\/)google-services\.json$/i;
const PATTERNS = [
  ["a private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["an AniList or other login token (a long JWT)", /\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}/],
  ["a GitHub token", /\b(ghp|gho|ghs|ghu|github_pat)_[A-Za-z0-9_]{20,}/],
  ["an AWS key", /\bAKIA[0-9A-Z]{16}\b/],
  ["a Slack token", /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ["a Discord webhook with its secret part", /discord(app)?\.com\/api\/webhooks\/\d{15,}\/[A-Za-z0-9_-]{40,}/],
  ["a Telegram bot token", /\b\d{8,10}:[A-Za-z0-9_-]{35}\b/],
  ["a long Bearer token", /Bearer\s+[A-Za-z0-9._-]{40,}/],
];
let pass = 0, fail = 0;
const ok = (name, cond, detail) => { cond ? pass++ : fail++; console.log((cond ? "PASS " : "FAIL ") + name + (cond || !detail ? "" : "\n   " + detail)); };
const files = [];
(function walk(dir){ for(const e of fs.readdirSync(dir, { withFileTypes: true })){ if(e.isDirectory()){ if(!SKIP_DIRS.has(e.name)) walk(path.join(dir, e.name)); } else files.push(path.join(dir, e.name)); } })(ROOT);
const rel = f => path.relative(ROOT, f).split(path.sep).join("/");
const TEXT = /\.(js|json|html|css|md|yml|yaml|py|sh|txt|svg|xml|gradle|properties)$/i;

ok("the scan found the project files", files.length > 50, files.length + " files");
const bad = files.filter(f => FORBIDDEN_FILES.test(rel(f))).map(rel);
ok("no signing key, private key file or .env file is in the project", !bad.length, bad.join(", "));
const hits = [];
for(const f of files){
  if(!TEXT.test(f) || rel(f) === "tests/unit/secrets.test.js") continue;
  let text; try{ text = fs.readFileSync(f, "utf8"); }catch(_){ continue; }
  for(const [what, re] of PATTERNS){ const m = re.exec(text); if(m) hits.push(rel(f) + " has " + what + ": " + m[0].slice(0, 18) + "..."); }
}
ok("no token, private key or webhook secret is written in any file", !hits.length, hits.join("\n   "));
// the pattern list itself must work, or the check above proves nothing
const sample = { "a private key": "-----BEGIN RSA PRIVATE KEY-----", "a GitHub token": "ghp_" + "a".repeat(30), "an AWS key": "AKIA" + "A".repeat(16), "a Discord webhook with its secret part": "discord.com/api/webhooks/" + "1".repeat(18) + "/" + "x".repeat(60), "an AniList or other login token (a long JWT)": "eyJ" + "a".repeat(20) + "." + "b".repeat(20) + "." + "c".repeat(20) };
ok("the patterns do catch these kinds of secret", PATTERNS.every(([what, re]) => !sample[what] || re.test(sample[what])), "a pattern did not match its own sample");
const cfg = fs.readFileSync(path.join(ROOT, "config.js"), "utf8");
ok("config.js holds only the public client ID, no secret", /clientApp:\s*"\d+"/.test(cfg) && !/secret/i.test(cfg.replace(/\/\/.*$/gm, "")));
console.log("\n" + pass + " passed, " + fail + " failed"); process.exit(fail ? 1 : 0);
