// Unit tests for the safety rules in js/core/auth.js (login link, links that open, when to sign out) and js/core/tracker.js (waiting edits belong to one account).
// The functions are cut out of the real files and run with small stand-ins, so a change to those files that breaks a rule fails here. Run: node tests/unit/guards.test.js
const fs = require("fs"), vm = require("vm"), path = require("path");
const read = f => fs.readFileSync(path.join(__dirname, "../..", f), "utf8");
const cut = (src, from, to) => { const a = src.indexOf(from), b = src.indexOf(to, a); if(a < 0 || b < 0) throw new Error("cannot find " + from + " .. " + to); return src.slice(a, b); };
let pass = 0, fail = 0;
const ok = (name, cond, detail) => { cond ? pass++ : fail++; console.log((cond ? "PASS " : "FAIL ") + name + (cond || !detail ? "" : "\n   " + detail)); };

// ---------- login link and links that open ----------
const auth = read("js/core/auth.js");
function loginWorld(){
  const store = new Map(); let full = false, err = "", reloads = 0; const opened = [];
  const ctx = { console, URLSearchParams, String, Number, Date,
    localStorage: { getItem: k => store.has(k) ? store.get(k) : null, setItem(k, v){ if(full) throw new Error("quota"); store.set(k, String(v)); }, removeItem: k => store.delete(k) },
    $: () => ({ set textContent(v){ err = v; }, get textContent(){ return err; } }), isNative: false, nativePlugin: () => null, APP_REDIRECT: "whatnext://auth", clientId: () => "54060",
    sessionTouch(){}, location: { reload(){ reloads++; } }, window: { open: u => opened.push(u) } };
  vm.createContext(ctx);
  vm.runInContext(cut(auth, "function loginErr", "if(isNative){").replace(/\$\("#loginBtn"\)\.onclick = startLogin;/, "").replace(/\$\("#registerBtn"\)\.onclick = [^\n]*/, ""), ctx);
  return { store, run: s => vm.runInContext(s, ctx), opened, err: () => err, reloads: () => reloads, setFull: v => { full = v; } };
}
const LINK = "whatnext://auth#access_token=ABC.def-123&token_type=Bearer";
{
  const w = loginWorld(); w.run('handleAuthUrl("' + LINK + '")');
  ok("a login link nobody asked for is ignored", !w.store.has("wn_token") && w.reloads() === 0);
}
(async () => {
  let w = loginWorld(); await w.run("startLogin()");
  ok("tapping Log in opens AniList and remembers it", w.opened.length === 1 && w.opened[0].startsWith("https://anilist.co/") && w.store.has("wn_login_at"));
  w.run('handleAuthUrl("' + LINK + '")');
  ok("the link right after the tap logs in once", w.store.get("wn_token") === "ABC.def-123" && w.reloads() === 1 && !w.store.has("wn_login_at"));
  w.store.delete("wn_token"); w.run('handleAuthUrl("' + LINK + '")');
  ok("the same link a second time is ignored", !w.store.has("wn_token"));
  w.store.set("wn_login_at", String(Date.now() - 700000)); w.run('handleAuthUrl("' + LINK + '")');
  ok("a tap more than 10 minutes ago no longer counts", !w.store.has("wn_token"));
  w.store.set("wn_login_at", String(Date.now() + 60000)); w.run('handleAuthUrl("' + LINK + '")');
  ok("a login time in the future is not trusted", !w.store.has("wn_token"));
  w.store.set("wn_login_at", String(Date.now())); w.setFull(true); w.run('handleAuthUrl("' + LINK + '")');
  ok("a full phone gives an error instead of failing quietly", /no room/.test(w.err()) && w.reloads() === 1);
  w.setFull(false);
  const bad = ["whatnext://auth#access_token=EVIL", "javascript:alert(1)", "intent://x#Intent;scheme=http;end", "file:///etc/passwd", "//evil.com", "", null, undefined];
  for(const u of bad) w.run("openExternal(" + JSON.stringify(u) + ")");
  w.run('openExternal("http://example.com/a")'); w.run('openExternal("  https://example.com/b  ")');
  ok("only web pages open, and http is upgraded to https", JSON.stringify(w.opened.slice(1)) === JSON.stringify(["https://example.com/a", "https://example.com/b"]), JSON.stringify(w.opened));

  // ---------- when to sign out ----------
  const gqlSrc = cut(auth, "async function gql(query, variables){", "// Logged out: only the login screen");
  const loginRefusedSrc = cut(auth, "async function loginRefused(headers){", "// Logged out: only the login screen");
  function gqlWorld(token, answers){
    const calls = []; let cleared = 0;
    const ctx = { console, Number, Promise, JSON, Error, Date, auth: { token }, GQL_RETRY: [500, 502, 503, 504],
      pacer: { pace: async () => {}, setLimit(){}, setHold(){}, holdLeft: () => 0, busy: () => new Error("busy") }, sleep: async () => {}, isNetErr: () => false,
      clearAuth(){ cleared++; },
      gqlOnce: async body => { const q = JSON.parse(body).query; calls.push(q); return q.includes("Viewer{id}") ? answers.viewer : answers.main; } };
    vm.createContext(ctx); vm.runInContext(gqlSrc.replace(/^async function gql[\s\S]*$/m, m => m) + "\n" + loginRefusedSrc, ctx);
    return { gql: (q) => vm.runInContext("gql", ctx)(q, {}), calls, cleared: () => cleared };
  }
  const R = (status, json) => ({ res: { status, ok: status < 400, headers: { get: () => null } }, json });
  const tryGql = async (w, q) => { try{ return { v: await w.gql(q) }; }catch(e){ return { e }; } };
  {
    const w = gqlWorld("T", { main: R(401, { errors: [{ message: "x" }] }) }); const r = await tryGql(w, "query{A}");
    ok("a 401 signs the person out", w.cleared() === 1 && !!r.e);
  }
  {
    const w = gqlWorld("T", { main: R(400, { errors: [{ message: "Invalid token", status: 400 }] }) }); const r = await tryGql(w, "query{A}");
    ok("\"Invalid token\" signs the person out, with no extra request", w.cleared() === 1 && !!r.e && w.calls.length === 1);
  }
  {
    const w = gqlWorld("T", { main: R(200, { data: null, errors: [{ message: "Unauthorized", status: 403 }] }), viewer: R(200, { data: { Viewer: { id: 5 } } }) }); const r = await tryGql(w, "query{Private}");
    ok("\"Unauthorized\" about one private thing does not sign anyone out when the login still works", w.cleared() === 0 && !r.e && w.calls.length === 2);
  }
  {
    const w = gqlWorld("T", { main: R(200, { data: null, errors: [{ message: "Unauthorized" }] }), viewer: R(200, { data: null, errors: [{ message: "Invalid token", status: 400 }] }) }); const r = await tryGql(w, "query{Private}");
    ok("\"Unauthorized\" while the login is really refused signs out", w.cleared() === 1 && !!r.e);
  }
  {
    const w = gqlWorld("T", { main: R(200, { data: null, errors: [{ message: "Unauthorized" }] }), viewer: R(200, null) }); const r = await tryGql(w, "query{Private}");
    ok("no clear answer to the check: nobody is signed out on a guess", w.cleared() === 0 && !r.e);
  }
  {
    const w = gqlWorld(null, { main: R(401, { errors: [{ message: "Invalid token" }] }) }); await tryGql(w, "query{Public}");
    ok("with no login there is nobody to sign out", w.cleared() === 0);
  }

  // ---------- waiting edits belong to one account ----------
  const tr = read("js/core/tracker.js");
  function queueWorld(stateUid, pendObj){
    const sent = []; let saved = 0;
    const ctx = { console, Number, Promise, Object, Set, Map, state: { uid: stateUid }, pend: pendObj, inflight: new Set(), waiters: {}, auth: { token: "T" }, mcache: new Map(),
      TRACK_Q: "m", toVars: id => ({ mediaId: id }), gql: async (q, v) => { sent.push(v.mediaId); return { json: { data: { SaveMediaListEntry: { id: 1 } } } }; },
      isNetErr: () => false, savePending(){ saved++; }, applyLocal(){}, renderAfter(){}, toast(){}, invalidateLists(){}, refreshPool(){}, cacheDel(){}, renderPending(){}, refreshPoolTimer: 0 };
    vm.createContext(ctx); vm.runInContext(cut(tr, "function pump(id){", "let poolTimer"), ctx);
    return { pump: id => vm.runInContext("pump", ctx)(id), flush: () => vm.runInContext("flushPending", ctx)(), sent, pend: pendObj, setUid: v => { ctx.state.uid = v; } };
  }
  const job = uid => Object.assign({ type: "anime", patch: { progress: 3 }, before: {}, ver: 1, isNew: false }, uid === undefined ? {} : { uid });
  {
    const q = queueWorld(0, { 10: job(7) }); const r = await q.pump(10);
    ok("nothing is sent before the account is known; the edit waits", q.sent.length === 0 && !!q.pend[10] && r.queued === true);
    q.setUid(7); await q.pump(10);
    ok("once the account is known, the waiting edit is sent", q.sent.join() === "10" && !q.pend[10]);
  }
  {
    const q = queueWorld(9, { 11: job(7) }); await q.pump(11);
    ok("an edit that belongs to another account is thrown away, never sent", q.sent.length === 0 && !q.pend[11]);
  }
  {
    const q = queueWorld(7, { 12: job() }); await q.pump(12);
    ok("an old edit saved before accounts were recorded is still sent", q.sent.join() === "12");
  }
  {
    const q = queueWorld(0, { 13: job(7) }); q.flush();
    ok("flushPending does nothing until the account is known", q.sent.length === 0 && !!q.pend[13]);
  }
  console.log("\n" + pass + " passed, " + fail + " failed"); process.exit(fail ? 1 : 0);
})();
