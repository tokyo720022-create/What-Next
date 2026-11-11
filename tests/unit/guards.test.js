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
    sessionTouch(){}, location: { reload(){ reloads++; } }, window: { open: u => opened.push(u) }, Uint8Array, Array, crypto: { getRandomValues(a){ for(let i = 0; i < a.length; i++) a[i] = i + 10; return a; } } };
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
  {
    const v = loginWorld(); await v.run("startLogin()"); const st = v.store.get("wn_login_state");
    ok("the login page address carries a state value that is kept", /^[0-9a-f]{32}$/.test(st) && v.opened[0].includes("&state=" + st));
    v.run('handleAuthUrl("whatnext://auth#access_token=ABC&state=WRONG")');
    ok("a different state coming back is ignored, and the login can still finish", !v.store.has("wn_token") && v.store.has("wn_login_at"));
    v.run('handleAuthUrl("whatnext://auth#access_token=ABC&state=' + st + '")');
    ok("the matching state logs in, once", v.store.get("wn_token") === "ABC" && !v.store.has("wn_login_state") && !v.store.has("wn_login_at"));
    const u = loginWorld(); await u.run("startLogin()"); u.run('handleAuthUrl("' + LINK + '")');
    ok("if AniList does not send the state back, the login still works", u.store.get("wn_token") === "ABC.def-123");
  }
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
    const ctx = { console, Number, Promise, JSON, Error, Date, auth: { token }, GQL_RETRY: [429, 502, 503, 504],
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

  // ---------- a change that may already have gone through is never sent twice ----------
  {
    const R2 = (status, json) => ({ res: { status, ok: status < 400, headers: { get: () => null } }, json });
    const count = async (query, status) => { const w = gqlWorld("T", { main: R2(status, null) }); await tryGql(w, query); return w.calls.length; };
    ok("a follow toggle is not resent after a gateway error", await count("mutation($id:Int){ToggleFollow(userId:$id){id}}", 502) === 1);
    ok("a favourite toggle is not resent after a gateway error", await count("mutation($a:Int){ToggleFavourite(animeId:$a){anime{nodes{id}}}}", 503) === 1);
    ok("a chat message is not sent twice after a gateway error", await count("mutation($r:Int,$m:String){SaveMessageActivity(recipientId:$r,message:$m){id}}", 504) === 1);
    ok("a list edit is retried after a gateway error (same result when repeated)", await count("mutation($mediaId:Int,$progress:Int){SaveMediaListEntry(mediaId:$mediaId,progress:$progress){id}}", 502) === 3);
    ok("a settings change is retried after a gateway error", await count("mutation($about:String){UpdateUser(about:$about){id}}", 503) === 3);
    ok("a plain read is retried after a gateway error", await count("query{Media(id:1){id}}", 502) === 3);
    ok("a toggle IS retried after 429, because AniList did not process it", await count("mutation($id:Int){ToggleFollow(userId:$id){id}}", 429) === 3);
  }

  // ---------- breadcrumbs in the bug report ----------
  {
    const dsrc = read("js/core/diagnostics.js"), dctx = { console, String, Date, Array, RegExp };
    vm.createContext(dctx); vm.runInContext(cut(dsrc, "const crumbs = [];", "async function diagReport"), dctx);
    const op = q => vm.runInContext("crumbOp", dctx)(q), crumb = x => vm.runInContext("crumb", dctx)(x), list = () => vm.runInContext("crumbs", dctx);
    ok("a breadcrumb names the AniList operation, not the request", op("query($id:Int){Media(id:$id){id}}") === "Media" && op("mutation($mediaId:Int){SaveMediaListEntry(mediaId:$mediaId){id}}") === "change SaveMediaListEntry" && op("") === "request" && op(null) === "request");
    ok("a breadcrumb never contains variables or the token", !op("query($t:String){Media(search:$t,secret:\"abc123\"){id}}").includes("abc123") && !op("{Viewer{id}} Bearer SECRETTOKEN").includes("SECRETTOKEN"));
    for(let i = 0; i < 45; i++) crumb("screen " + i);
    ok("only the last 30 steps are kept, each with a time", list().length === 30 && /^\d\d:\d\d:\d\d screen 44$/.test(list()[29]) && list()[0].endsWith("screen 15"));
    crumb("x".repeat(500)); ok("a long step is cut short", list()[list().length - 1].length <= 89);
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

  // ---------- smaller covers for thumbnails ----------
  const compat = read("js/core/compat.js"), cctx = { console, String };
  vm.createContext(cctx); vm.runInContext(compat.slice(compat.indexOf("const thumbUrl")), cctx);
  const L = "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx12345-AbC.jpg", M = "https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx12345-AbC.jpg";
  ok("a large cover address gets its medium twin", vm.runInContext("thumbUrl", cctx)(L) === M);
  ok("other addresses and empty values are left alone", vm.runInContext("thumbUrl", cctx)("https://img.test/c1.jpg") === "https://img.test/c1.jpg" && vm.runInContext("thumbUrl", cctx)("") === "" && vm.runInContext("thumbUrl", cctx)(null) === null);
  const img = () => ({ src: "", decoding: "", onerror: null }), sc = (i, u, small) => vm.runInContext("setCover", cctx)(i, u, small);
  { const i = img(); sc(i, L, true); const first = i.src; i.onerror(); ok("a thumbnail asks for the medium file first and falls back to the original if it is missing", first === M && i.src === L && i.onerror === null && i.decoding === "async"); }
  { const i = img(); sc(i, L, false); ok("a normal cover keeps the large file", i.src === L && i.onerror === null); }
  { const i = img(); sc(i, "https://img.test/c1.jpg", true); ok("a cover that has no medium twin is used as it is", i.src === "https://img.test/c1.jpg" && i.onerror === null); }

  // ---------- somebody else's list: what is shown ----------
  const users = read("js/features/users.js");
  const uctx = { console, String, Map, Array, SORTS: { UPDATED: (a, b) => b.updatedAt - a.updatedAt, SCORE: (a, b) => b.score - a.score, TITLE: (a, b) => a.m.title.romaji.localeCompare(b.m.title.romaji) } };
  vm.createContext(uctx); vm.runInContext(cut(users, "function uEntries(raw){", "function uBuildMediaList(page){"), uctx);
  const E = (id, status, score, upd, romaji, o = {}) => ({ mediaId: id, status, score, updatedAt: upd, progress: 1, media: { id, title: Object.assign({ romaji, english: null, native: null }, o) } });
  const raw = [E(1, "CURRENT", 90, 5, "Alpha"), E(2, "COMPLETED", 70, 9, "Beta", { english: "Bravo Story" }), E(1, "CURRENT", 90, 5, "Alpha"), E(3, "COMPLETED", 100, 1, "Gamma", { native: "ガンマ" }), { mediaId: 4, status: "PLANNING" }, E(5, "PLANNING", 0, 3, "Delta")];
  const ent = vm.runInContext("uEntries", uctx)(raw), view = f => vm.runInContext("uMediaView", uctx)(ent, f), ids = r => r.rows.map(e => e.id).join();
  ok("each title is listed once, and entries without a title are dropped", ent.length === 4 && ent.map(e => e.id).sort().join() === "1,2,3,5");
  ok("All shows every title, newest update first", ids(view({ status: "ALL", q: "", sort: "UPDATED" })) === "2,1,5,3");
  ok("a status shows only its titles", ids(view({ status: "COMPLETED", q: "", sort: "SCORE" })) === "3,2");
  ok("status counts ignore the search words", JSON.stringify(view({ status: "ALL", q: "alpha", sort: "UPDATED" }).counts) === JSON.stringify({ ALL: 4, CURRENT: 1, COMPLETED: 2, PLANNING: 1 }));
  ok("search finds romaji, English and native titles, in any case", ids(view({ status: "ALL", q: "ALPHA", sort: "TITLE" })) === "1" && ids(view({ status: "ALL", q: " bravo ", sort: "TITLE" })) === "2" && ids(view({ status: "ALL", q: "ガン", sort: "TITLE" })) === "3");
  ok("search and status work together; no match gives an empty list", ids(view({ status: "PLANNING", q: "alpha", sort: "TITLE" })) === "" && ids(view({ status: "PLANNING", q: "del", sort: "TITLE" })) === "5");
  ok("sort by title is alphabetical", ids(view({ status: "ALL", q: "", sort: "TITLE" })) === "1,2,5,3");
  ok("an unknown sort falls back to last updated", ids(view({ status: "ALL", q: "", sort: "NOPE" })) === "2,1,5,3");
  console.log("\n" + pass + " passed, " + fail + " failed"); process.exit(fail ? 1 : 0);
})();
