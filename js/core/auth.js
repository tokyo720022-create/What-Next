/* js/core/auth.js: AniList requests, login (Android deep link), back button, log out */
// ---------- AniList login (implicit grant: the token comes back through the whatnext://auth link) ----------
const auth = { token: null };
try{ auth.token = localStorage.getItem("wn_token"); }catch(_){}

// Every AniList request goes through here: a time limit, a short wait-and-retry when AniList says "slow down" (429) or is briefly down,
// and errors marked .net when AniList can't be reached, so the screens can fall back to saved data.
const GQL_URL = "https://graphql.anilist.co", GQL_TIMEOUT = 25000, GQL_RETRY = [429, 502, 503, 504];
function gqlOnce(body, headers){
  return new Promise((ok, bad) => {
    const ctl = typeof AbortController === "function" ? new AbortController() : null;
    const timer = setTimeout(() => { try{ if(ctl) ctl.abort(); }catch(_){} const e = new Error("AniList took too long to answer. Check your connection and try again."); e.net = true; bad(e); }, GQL_TIMEOUT);
    (async () => {
      const res = await fetch(GQL_URL, { method: "POST", headers, body, signal: ctl ? ctl.signal : undefined });
      let json = null; try{ json = await res.json(); }catch(_){}
      return { res, json };
    })().then(v => { clearTimeout(timer); ok(v); }, e => { clearTimeout(timer); if(e && !e.net) e.net = true; bad(e); });
  });
}
const pacer = makePacer({ now: () => Date.now(), sleep, maxWait: 45000 });
async function gql(query, variables){
  const headers = { "Content-Type": "application/json", "Accept": "application/json" };
  if(auth.token) headers.Authorization = "Bearer " + auth.token;
  const body = JSON.stringify({ query, variables }), isChange = /^\s*mutation/i.test(query);
  // A change that may already have gone through must not be sent twice: a follow or favourite toggle would flip back, and a message would be posted twice.
  // After a 429 AniList did not process the request, so that retry is always safe. After a gateway error (502-504) only changes that end the same when repeated are retried.
  const repeatable = !isChange || /\b(SaveMediaListEntry|DeleteMediaListEntry|UpdateUser)\(/.test(query);
  let out;
  for(let attempt = 0; ; attempt++){
    await pacer.pace(isChange);   // waits when the per-minute limit is used up (and after a 429), so AniList never has to say "too many requests"
    out = await gqlOnce(body, headers);
    const h = out.res.headers, hv = k => Number(h && h.get && h.get(k));
    if(hv("X-RateLimit-Limit") > 0) pacer.setLimit(hv("X-RateLimit-Limit"));
    if(out.res.status === 429) pacer.setHold((hv("Retry-After") > 0 ? hv("Retry-After") : 60) * 1000);
    if(typeof crumb === "function") crumb("AniList " + crumbOp(query) + " " + out.res.status);
    if(GQL_RETRY.includes(out.res.status) && attempt < 2 && (out.res.status === 429 || repeatable)){
      const wait = out.res.status === 429 ? pacer.holdLeft() : Math.round(1500 * (attempt + 1) * (0.8 + Math.random() * 0.4));   // 1.2 to 1.8 s, then 2.4 to 3.6 s
      if(wait <= 10000){ await sleep(wait); continue; }
    }
    break;
  }
  const { res, json } = out;
  if(!json){
    if(res.status === 429) throw pacer.busy(pacer.holdLeft());
    const e = new Error(res.ok ? "AniList sent an answer the app couldn't read. Try again." : "AniList is having trouble right now (" + res.status + "). Try again soon.");
    e.net = true; throw e;
  }
  // "Invalid token" (or a 401) means the login is really refused. "Unauthorized" can also just mean "this one thing is private", so for that the login is
  // checked with a small request of its own before the person is signed out.
  const errs = json.errors || [], sure = res.status === 401 || errs.some(x => /invalid token/i.test(x.message || "") || x.status === 400 && /token/i.test(x.message || ""));
  const unsure = !sure && errs.some(x => /unauthenticated|unauthorized/i.test(x.message || ""));
  if(auth.token && (sure || (unsure && await loginRefused(headers)))){ clearAuth(); throw new Error("AniList didn't accept your login. Log in again."); }
  if(res.status === 429) throw pacer.busy(pacer.holdLeft());
  if(GQL_RETRY.includes(res.status)){ const e = new Error("AniList is having trouble right now (" + res.status + "). Try again soon."); e.net = true; throw e; }
  return { res, json };
}

async function loginRefused(headers){
  try{
    const o = await gqlOnce(JSON.stringify({ query: "query{Viewer{id}}", variables: {} }), headers);
    if(o.res.status === 401) return true;
    if(!o.json) return false;   // no clear answer: do not sign anyone out on a guess
    if(o.json.data && o.json.data.Viewer) return false;
    return (o.json.errors || []).some(x => /invalid token|unauthenticated|unauthorized/i.test(x.message || "") || x.status === 400 && /token/i.test(x.message || ""));
  }catch(_){ return false; }
}

// Logged out: only the login screen. Logged in: tabs and app.
function syncAuthUI(){
  const on = !!auth.token;
  $("#whoBar").hidden = !on;
  $("#tabs").hidden = !on;
  $("#setup").hidden = on;
  if(!on){ showTab("pick"); $("#app").hidden = true; }
}
function clearAuth(){
  auth.token = null;
  try{ localStorage.removeItem("wn_token"); }catch(_){}
  syncAuthUI();
}
async function markDone(e, p, btn){
  btn.disabled = true; btn.textContent = "Saving…";
  const r = await track(e.media.id, p.isAnime ? "anime" : "manga", { progress: p.to }, { quiet: true });
  if(!r.ok && !r.queued){ btn.disabled = false; btn.textContent = "Couldn't save: " + ((r.error && r.error.message) || "unknown error"); return; }
  state.skipped.clear();
  if(e.status === "COMPLETED") return afterFinish(e);
  pick();
  const t = document.createElement("div"); t.className = "msg";
  t.textContent = (r.queued ? "Saved on this device: " : "Saved to AniList: ") + tt(e.media) + " is now at " + e.progress + ". Here's the next pick.";
  $("#result").prepend(t);
}

// ---------- Login: the client ID is built in, like other AniList apps ----------
const CFG0 = window.WN_CONFIG || {};   // set in config.js
const CLIENT_APP = String(CFG0.clientApp || "54060");   // built-in default, so login works even without config.js
const APP_REDIRECT = "whatnext://auth";
const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
const nativePlugin = n => window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins[n];
const clientId = () => CLIENT_APP;
function loginErr(t){ $("#loginErr").textContent = t; }
// Only web pages open from here. Links come from AniList data that anyone can edit, so a "whatnext://auth#access_token=..." link, a javascript: link or
// another app's link must never get through. A plain http:// link is upgraded to https://.
function openExternal(url){
  url = String(url || "").trim().replace(/^http:\/\//i, "https://");
  if(!/^https:\/\//i.test(url)) return;
  const B = isNative && nativePlugin("Browser");
  if(B && B.open){ try{ return B.open({ url }); }catch(_){} }
  window.open(url, "_blank", "noopener");
}
async function startLogin(){
  const id = clientId();
  if(!id) return loginErr("Login isn't set up in this build yet. The developer needs to add the AniList Client ID.");
  const state = markLoginStarted(); if(!state) return loginErr("The phone has no room left to start a login. Free some space and try again.");
  const url = "https://anilist.co/api/v2/oauth/authorize?client_id=" + encodeURIComponent(id) + "&response_type=token&state=" + state;
  // No redirect_uri here: AniList uses the Redirect URL saved on the client (whatnext://auth), and sending one switches it to a different login type.
  const B = nativePlugin("Browser");
  if(B && B.open){ try{ return await B.open({ url }); }catch(_){} }
  openExternal(url);
}
$("#loginBtn").onclick = startLogin;
$("#registerBtn").onclick = () => openExternal("https://anilist.co/signup");
// The login link can be opened by any web page or app on the phone, so a token is only taken if the person tapped Log in in the last 10 minutes, and only once.
const LOGIN_WINDOW_MS = 600000;
// AniList accepts a "state" value on the login page and (as far as its documentation says) hands it back with the token. It is checked when it comes back; if it does not
// come back, the 10-minute, once-only rule above still protects the login.
const loginNonce = () => { try{ const a = new Uint8Array(16); crypto.getRandomValues(a); return Array.from(a, b => b.toString(16).padStart(2, "0")).join(""); }catch(_){ return String(Math.random()).slice(2) + String(Date.now()); } };
function markLoginStarted(){ try{ const st = loginNonce(); localStorage.setItem("wn_login_at", String(Date.now())); localStorage.setItem("wn_login_state", st); return st; }catch(_){ return ""; } }
function loginExpected(){ try{ const t = Number(localStorage.getItem("wn_login_at")) || 0; return t > 0 && Date.now() - t >= 0 && Date.now() - t < LOGIN_WINDOW_MS; }catch(_){ return false; } }
function handleAuthUrl(url){
  if(!url || url.indexOf(APP_REDIRECT.split("://")[0] + "://") !== 0) return;
  if(!loginExpected()) return;   // nobody just tapped Log in: ignore the link
  const q = new URLSearchParams(url.split("#")[1] || url.split("?")[1] || ""), t = q.get("access_token");
  if(!t) return;
  let want = ""; try{ want = localStorage.getItem("wn_login_state") || ""; }catch(_){}
  if(want && q.get("state") && q.get("state") !== want) return;   // AniList sent back a different state: this login was not started here
  try{ localStorage.removeItem("wn_login_at"); localStorage.removeItem("wn_login_state"); }catch(_){}
  try{ localStorage.setItem("wn_token", t); }catch(_){ return loginErr("Couldn't save your login: the phone has no room left."); }
  sessionTouch();   // a fresh login starts the 14-day clock again
  try{ localStorage.removeItem("wn_name"); }catch(_){}   // whose saved list is this? start() finds out from AniList before showing any
  try{ const B = nativePlugin("Browser"); if(B && B.close) B.close(); }catch(_){}
  location.reload();
}
if(isNative){
  const A = nativePlugin("App");
  if(A && A.addListener){
    A.addListener("appUrlOpen", ev => handleAuthUrl(ev.url));
    A.addListener("appStateChange", st => { if(st && st.isActive) sessionResume(); else cacheFlushSoon(); });
    A.addListener("backButton", () => {
      const sheet = document.querySelector(".dsheet,.usheet");
      if(sheet) sheet.remove();
      else if(!$("#editor").hidden) editorBack();
      else if(!$("#qv").hidden) $("#qv").hidden = true;
      else if(!$("#fsheet").hidden) $("#fsheet").hidden = true;
      else if(!$("#csheet").hidden) $("#csheet").hidden = true;
      else if(!$("#media").hidden) closeMedia();   // the title page is above the people screens, so it closes first
      else if(!$("#user").hidden) userPop();
      else if(!$("#relmap").hidden) closeRelMap();
      else if(!$("#taste").hidden) showTab("profile");
      else if(!$("#seasonal").hidden || !$("#calendar").hidden) showTab("discover");
      else if(!$("#discover").hidden && dx.mode !== "hub") dmShow("hub");
      else if(SUBS.some(id => !$(id).hidden)) showTab("settings");
      else if(!$("#settings").hidden || !$("#stats").hidden || !$("#chat").hidden) showTab("profile");
      else if($("#pickWrap").hidden) showTab("pick");
      else if(A.exitApp) A.exitApp();
    });
    if(A.getLaunchUrl) A.getLaunchUrl().then(r => r && handleAuthUrl(r.url)).catch(() => {});
  }
}
$("#appsLink").onclick = () => openExternal("https://anilist.co/settings/apps");
// Log out lives in Settings > Account. The first tap asks, the second tap logs out.
let logoutArmed = false;
$("#logout").onclick = () => {
  const b = $("#logout");
  if(!logoutArmed){ logoutArmed = true; b.textContent = "Tap again to log out"; setTimeout(() => { logoutArmed = false; b.textContent = "Log out"; }, 3500); return; }
  logoutArmed = false; b.textContent = "Log out";
  wipeAccountData();
};
