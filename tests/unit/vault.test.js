// Unit tests for the Triple Sync vault (keys in the encrypted store) and lock (PIN). Run: node tests/unit/vault.test.js
const fs = require("fs"), vm = require("vm"), path = require("path"), nodeCrypto = require("crypto");
const ROOT = path.join(__dirname, "../..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
let pass = 0, fail = 0;
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pass++ : fail++; console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "\n   got  " + JSON.stringify(got) + "\n   want " + JSON.stringify(want))); };
const yes = (n, c) => eq(n, !!c, true);
const canon = o => (o && typeof o === "object" ? Object.fromEntries(Object.keys(o).sort().map(k => [k, canon(o[k])])) : o);

// ---------- a small browser: localStorage, a fake secure store, a fake page ----------
class N { constructor(){ this.children = []; this.dataset = {}; this.style = {}; this.hidden = false; this.checked = false; this.value = ""; this.text = ""; this.classList = { add(){}, toggle(){} }; } append(...a){ this.children.push(...a); } replaceChildren(...a){ this.children = a; } addEventListener(){} focus(){} click(){} set textContent(v){ this.text = String(v); } get textContent(){ return this.text; } }
function world(opts){
  opts = opts || {};
  const ls = new Map(), els = {}, secure = new Map(), calls = [];
  const $ = s => els[s] || (els[s] = new N());
  const store = { get: async o => { calls.push("get"); return secure.has(o.key) ? { value: secure.get(o.key) } : {}; }, set: async o => { calls.push("set"); if(opts.failSet) throw new Error("nope"); secure.set(o.key, o.value); }, remove: async o => { calls.push("remove"); secure.delete(o.key); } };
  const ctx = { console, Date, Math, Number, String, Array, Set, Map, JSON, Object, Promise, setTimeout, clearTimeout, setInterval, clearInterval, Uint8Array, TextEncoder, atob, btoa, crypto: nodeCrypto.webcrypto, window: {}, $, el: (t, c, x) => { const n = new N(); n.text = x || ""; return n; },
    localStorage: { getItem: k => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)), removeItem: k => ls.delete(k) },
    document: { addEventListener(){}, visibilityState: "visible" }, isNative: !!opts.native, nativePlugin: n => (opts.native && n === "WnLock" ? opts.lock || null : null), showTab(){}, TS_KEY: "wn_ts" };
  ctx.LS = (k, d) => { try{ return Object.assign({}, d, JSON.parse(ctx.localStorage.getItem(k) || "{}")); }catch(_){ return d; } };
  ctx.LSset = (k, v) => { ctx.localStorage.setItem(k, JSON.stringify(v)); return true; };
  ctx.secureStore = () => (opts.noStore ? null : store);
  vm.createContext(ctx);
  return { ctx, ls, secure, calls, els, run: (f, extra) => vm.runInContext(fs.readFileSync(path.join(ROOT, "js/features/" + f), "utf8"), ctx, { filename: f }), g: n => vm.runInContext(n, ctx) };
}

// ---------- vault-math ----------
{
  const w = world(); w.run("vault-math.js");
  const cfg = { source: "me", sendAl: true, al: { clientId: "123", clientSecret: "shh-secret", token: "tok-al-123456", user: "alt", userId: 9 }, mal: { clientId: "malid", clientSecret: "", access: "tok-mal-abcdef", refresh: "ref-mal-zzzz", pending: { verifier: "v", state: "s" }, redirect: "http://localhost", user: "me" }, dcUrl: "https://discord.com/api/webhooks/123456789/abcDEF-token_1", dcAnime: "", dcOn: true };
  const { pub, sec } = w.g("vSplit")(cfg);
  eq("split keeps the plain settings and removes every secret from them", [pub.source, pub.al.user, pub.al.userId, pub.mal.redirect, pub.mal.user, pub.dcOn, pub.al.token, pub.al.clientSecret, pub.mal.access, pub.mal.pending, pub.dcUrl], ["me", "alt", 9, "http://localhost", "me", true, undefined, undefined, undefined, undefined, undefined]);
  eq("the secret part holds only secrets that have a value", [sec.al.clientId, sec.al.clientSecret, sec.al.token, sec.mal.access, sec.mal.refresh, sec.mal.pending.verifier, sec.dcUrl, "clientSecret" in sec.mal, "dcAnime" in sec], ["123", "shh-secret", "tok-al-123456", "tok-mal-abcdef", "ref-mal-zzzz", "v", cfg.dcUrl, false, false]);
  eq("merge gives back exactly the original settings", canon(w.g("vMerge")(pub, sec)), canon(JSON.parse(JSON.stringify(cfg, (k, v) => (v === "" ? undefined : v)))));
  eq("merge lets the secret win over a plain copy left behind", w.g("vMerge")({ al: { token: "old", user: "x" } }, { al: { token: "new" } }).al, { token: "new", user: "x" });
  eq("an emptied secret is dropped from the vault (a disconnect really forgets it)", w.g("vSplit")({ al: { token: "", user: "" } }).sec, {});
  const m = w.g("vMask");
  eq("a key shows only its last 3 characters, a short one nothing, a webhook only its last 4", [m("abcdefghij"), m("12345"), m("https://discord.com/api/webhooks/123456789/abcDEF-token_1"), m("")], ["••••hij", "••••", "webhook …en_1", ""]);
  const r = w.g("vRedact")("failed for https://discord.com/api/webhooks/1/abc-DEF with Bearer abc.def-ghi and shh-secret, access_token=zzz999&x=1 {\"refresh_token\":\"qqq\"}", sec);
  yes("redaction removes webhook links, bearer tokens, token fields and known secret values", !/abc-DEF|abc\.def|shh-secret|zzz999|qqq/.test(r) && /\[webhook\]/.test(r) && /\[hidden\]/.test(r));
  eq("the fingerprint is stable, different per link and says nothing readable", [w.g("vHash")("a") === w.g("vHash")("a"), w.g("vHash")("a") !== w.g("vHash")("b"), /^[0-9a-f]{16}$/.test(w.g("vHash")("https://discord.com/api/webhooks/1/x"))], [true, true, true]);
}
// ---------- vault.js with a working encrypted store ----------
(async () => {
  {
    const w = world({ native: true }); w.run("vault-math.js"); w.run("vault.js");
    w.ls.set("wn_ts", JSON.stringify({ source: "me", al: { clientId: "1", clientSecret: "plainsecret", token: "plaintoken", user: "alt" }, dcUrl: "https://discord.com/api/webhooks/1/abc" }));
    w.ctx.tsFill = () => {}; w.ctx.tsRenderStatus = () => {}; w.els["#setSync"] = Object.assign(new N(), { hidden: true });
    await w.g("vaultHydrate")();
    const left = JSON.parse(w.ls.get("wn_ts")), blob = JSON.parse(w.secure.get("wn_ts_secret"));
    yes("an old plain copy is moved into the vault and then removed from normal storage", w.g("vault.secure") && blob.al.token === "plaintoken" && blob.dcUrl.endsWith("/abc") && !/plaintoken|plainsecret|webhooks/.test(w.ls.get("wn_ts")) && left.al.user === "alt" && left.source === "me");
    w.ctx.TS_KEY = "wn_ts";
    w.g("tsWrite")({ source: "me", al: { clientSecret: "newsecret", token: "tok2", user: "alt" }, mal: { access: "m1", refresh: "m2", user: "me" }, dcOn: true });
    await w.g("vault.queue");
    eq("a write sends the secrets to the vault and only the rest to normal storage", [!/newsecret|tok2|"m1"|"m2"/.test(w.ls.get("wn_ts")), JSON.parse(w.secure.get("wn_ts_secret")).al.token, JSON.parse(w.secure.get("wn_ts_secret")).mal.access], [true, "tok2", "m1"]);
    eq("what the engine reads is the merge of both", w.g("vMerge")(JSON.parse(w.ls.get("wn_ts")), w.g("vault.cache")).al.clientSecret, "newsecret");
    w.g("vaultWipe")(); await new Promise(r => setTimeout(r, 5));
    eq("wiping removes the vault copy and the memory copy", [w.secure.has("wn_ts_secret"), JSON.stringify(w.g("vault.cache"))], [false, "{}"]);
  }
  {
    const w = world({ native: true, failSet: true }); w.run("vault-math.js"); w.run("vault.js");
    w.ls.set("wn_ts", JSON.stringify({ al: { token: "keepme" } })); w.ctx.tsFill = () => {}; w.els["#setSync"] = Object.assign(new N(), { hidden: true });
    await w.g("vaultHydrate")();
    eq("if the vault cannot be written, the plain copy is kept and nothing is lost", [w.g("vault.secure"), JSON.parse(w.ls.get("wn_ts")).al.token], [false, "keepme"]);
  }
  {
    const w = world({ noStore: true }); w.run("vault-math.js"); w.run("vault.js");
    w.ls.set("wn_ts", JSON.stringify({ al: { token: "t" } }));
    await w.g("vaultHydrate")(); w.g("tsWrite")({ al: { token: "t2" } });
    eq("with no encrypted store nothing changes: settings stay in normal storage", [w.g("vault.secure"), JSON.parse(w.ls.get("wn_ts")).al.token, w.g("vault.ready")], [false, "t2", true]);
  }
  // ---------- lock-math ----------
  {
    const w = world(); w.run("lock-math.js"); const ok = w.g("lkPinOk");
    eq("PIN rules: 4 to 8 digits, not all the same, not a run", [ok("1357").ok, ok("123").ok, ok("123456789").ok, ok("1111").ok, ok("1234").ok, ok("9876").ok, ok("12a4").ok, ok("246802").ok], [true, false, false, false, false, false, false, true]);
    const d = w.g("lkDelay"); eq("no delay for four wrong tries, then it grows to an hour", [d(0), d(4), d(5), d(6), d(7), d(8), d(9), d(40)], [0, 0, 30, 60, 300, 900, 3600, 3600]);
    const n = w.g("lkNeeded"), cfg = { pin: { x: 1 }, relock: 5, import: true }, now = 1e9;
    eq("no PIN set: nothing is asked", n("sync", { pin: null, relock: 5, import: true }, { unlocked: false }, now), false);
    eq("a PIN is asked when locked, and not after unlocking until the time away passes", [n("sync", cfg, { unlocked: false, last: now }, now), n("sync", cfg, { unlocked: true, last: now - 60000 }, now), n("sync", cfg, { unlocked: true, last: now - 6 * 60000 }, now)], [true, false, true]);
    eq("with 'every time', leaving the page means asking again and Import always asks", [n("sync", { pin: {}, relock: 0, import: true }, { unlocked: true, last: now, onPage: true }, now), n("sync", { pin: {}, relock: 0, import: true }, { unlocked: true, last: now, onPage: false }, now), n("import", { pin: {}, relock: 0, import: true }, { unlocked: true, last: now, onPage: true }, now)], [false, true, true]);
    eq("the import button is only locked when that option is on", n("import", { pin: {}, relock: 5, import: false }, { unlocked: false }, now), false);
  }
  // ---------- lock.js ----------
  {
    const calls = [], lockPlugin = { available: async () => ({ available: true }), secure: async o => { calls.push(o.on); }, unlock: async () => ({}) };
    const w = world({ native: true, lock: lockPlugin }); for(const f of ["vault-math.js", "lock-math.js", "vault.js", "lock.js"]) w.run(f);
    const rec = await w.g("lkMake")("2468");
    yes("the PIN is stored only as a salted hash that checks out", !JSON.stringify(rec).includes("2468") && rec.iter >= 100000 && rec.salt.length > 10 && await w.g("lkCheck")("2468", rec) && !(await w.g("lkCheck")("2469", rec)));
    const rec2 = await w.g("lkMake")("2468"); yes("the same PIN gets a different salt and hash each time", rec.salt !== rec2.salt && rec.hash !== rec2.hash);
    // gate through the real submit code
    w.g("lkSave")({ pin: rec });
    const asked = w.g("lockAsk")("sync"); w.els["#lkPin"].value = "0000"; await w.g("lkSubmit")();
    eq("a wrong PIN is refused, counted and the page stays closed", [JSON.parse(w.ls.get("wn_lock")).fails, w.g("lk.unlocked"), /Wrong PIN/.test(w.els["#lkErr"].text)], [1, false, true]);
    w.els["#lkPin"].value = "2468"; await w.g("lkSubmit")();
    eq("the right PIN opens it, resets the count and answers yes", [await asked, w.g("lk.unlocked"), JSON.parse(w.ls.get("wn_lock")).fails], [true, true, 0]);
    eq("once open, asking again is not needed within the time", w.g("lockNeeded")("sync"), false);
    for(let i = 0; i < 5; i++){ w.g("lk").unlocked = false; const a = w.g("lockAsk")("sync"); w.els["#lkPin"].value = "1357"; await w.g("lkSubmit")(); if(i < 4) w.g("lkClose")(false); await Promise.resolve(); void a; }
    const st = JSON.parse(w.ls.get("wn_lock")); yes("five wrong tries in a row start a pause", st.fails >= 5 && st.until > Date.now());
    w.g("lkClose")(false);
    w.g("lockPage")("set-sync"); w.g("lockPage")("settings");
    eq("the screenshot block is switched on when the page opens and off when it closes", calls, [true, false]);
    w.ls.set("wn_ts", "{}"); w.ls.set("wn_ts_state_anime", "{}"); w.secure.set("wn_ts_secret", "{}"); w.g("vault.secure = true"); w.g("lockReset")(); await new Promise(r => setTimeout(r, 5));
    eq("forgetting the PIN erases the keys, the memory, the lock and the vault", [w.ls.has("wn_ts"), w.ls.has("wn_ts_state_anime"), w.ls.has("wn_lock"), w.secure.has("wn_ts_secret")], [false, false, false, false]);
  }
  // ---------- wiring ----------
  const sync = read("js/features/sync.js"), boot = read("boot.js"), tabs = read("js/core/tabs.js");
  yes("every write of the Triple Sync settings goes through the vault, and no webhook link is used as a storage key", !/LSset\(TS_KEY/.test(sync) && /vHash\(w\)/.test(sync) && !/t\[w \+ "\|"/.test(sync));
  yes("the keys are never put back in the form when they are encrypted, and Connect still works with a saved key", /inp\.value = ""; inp\.placeholder = saved/.test(sync) && /tsNow\("#tsAlSecret"\)/.test(sync) && /tsNow\("#tsAlId"\)/.test(sync) && /tsNow\("#tsMalId"\)/.test(sync));
  yes("auto-sync waits for the keys to load", /await vaultReady\(\)/.test(sync));
  yes("the page asks for the PIN before it opens, and Import Lists is locked too", /lockNeeded\("sync"\)/.test(tabs) && /data-lock="import"/.test(read("views/settings/account.html")) && /lockAsk\(b\.dataset\.lock\)/.test(read("js/features/settings.js")));
  yes("the vault is loaded after the login, and signing out wipes it and the lock", /await vaultHydrate\(\)/.test(read("js/core/start.js")) && /vaultWipe\(\)/.test(read("js/core/session.js")) && /"wn_lock"/.test(read("js/core/session.js")));
  yes("the files load in order: the maths before sync.js, the glue after", boot.indexOf("vault-math.js") > 0 && boot.indexOf("vault-math.js") < boot.indexOf("js/features/sync.js") && boot.indexOf("lock-math.js") < boot.indexOf("js/features/sync.js") && boot.indexOf("js/features/vault.js") > boot.indexOf("js/features/sync.js"));
  yes("bug reports never carry a webhook link or token", /diagRedact/.test(read("js/core/diagnostics.js")) && /diagPush = t => \{ window\.__wnErrors\.push\(diagRedact\(t\)\)/.test(read("js/core/diagnostics.js")));
  yes("the PIN is never written anywhere: only the hash record is saved", !/localStorage\.setItem\([^)]*pin/i.test(read("js/features/lock.js")) && /lkSave\(\{ pin: await lkMake\(pin\)/.test(read("js/features/lock.js")));
  console.log("\n" + pass + " passed, " + fail + " failed"); process.exit(fail ? 1 : 0);
})();
