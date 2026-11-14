/* js/core/session.js: signing out (by hand, or after 14 days unused) and clearing the account's data from the phone.
   The clock and the cache themselves live in cache.js. */

// What belongs to the account and goes when you sign out. App settings (theme, layout, filters, daily goal) stay.
const ACCOUNT_KEYS = ["wn_name", "wn_uid", "wn_pending", "wn_chats", "wn_hide", "wn_days", "wn_taste_sum", "wn_tlang", "wn_scorefmt",
  "wn_ts", "wn_ts_threads", "wn_ts_state_anime", "wn_ts_state_manga", "wn_ts_fail_anime", "wn_ts_fail_manga", "wn_cfg", "wn_sync_anime", "wn_sync_manga", "wn_lybg", "wn_nf_seen"];
// Saved by older versions of the app, before the smart cache. They are never read any more.
const LEGACY_KEYS = ["wn_cache", "wn_profile", "wn_actdays", "wn_tagcol", "wn_taste_ref_anime", "wn_taste_ref_manga", "wn_client"];

function legacyCleanup(){
  try{ LEGACY_KEYS.forEach(k => localStorage.removeItem(k)); for(let i = localStorage.length - 1; i >= 0; i--){ const k = localStorage.key(i); if(k && k.indexOf("wn_list_") === 0) localStorage.removeItem(k); } }catch(_){}
}

// Forget everything the app holds in memory about the account.
function wipeMemory(){
  const run = f => { try{ f(); }catch(_){} };
  run(() => { state.items = []; state.user = ""; state.uid = 0; state.skipped.clear(); state.fromCache = false; state.shownId = 0; });
  run(() => { lists.anime = mkList(); lists.manga = mkList(); });
  run(() => { for(const k of Object.keys(pend)) delete pend[k]; });
  run(() => hide.clear());
  for(const m of [() => mcache, () => ecache, () => asCache, () => affCache, () => sz.cache, () => rm.cache, () => pt.pools]) run(() => m().clear());
  run(() => { cz.cache = []; cz.items = []; tz.cache = {}; });
  run(() => { profLoaded = false; profMe = null; trendAt = 0; });
  run(() => userCloseAll());
  run(() => { $("#result").replaceChildren(); $("#dlist").replaceChildren(); });
}
// Storage and memory, without touching the login or the screen (used when a different account logs in).
function wipeAccountStorage(){
  cacheSoonCancel(CACHE_PFX);
  try{ ACCOUNT_KEYS.forEach(k => localStorage.removeItem(k)); }catch(_){}
  try{ if(typeof lyBg !== "undefined" && lyBg){ lyBg = ""; applyListBg(); } }catch(_){}   // the list background picture belongs to the account too
  cacheClear(); legacyCleanup(); wipeMemory();
}
// Sign out: the token, the saved data and the screens. reason "expired" explains why on the login screen.
function wipeAccountData(reason, lost){
  wipeAccountStorage();
  try{ localStorage.removeItem(SESSION_KEY); }catch(_){}
  clearAuth();
  loginErr(reason === "expired" ? "You were signed out because the app wasn't used for 14 days. Log in again." + (lost ? " " + lost + (lost === 1 ? " change" : " changes") + " could not be sent to AniList and " + (lost === 1 ? "was" : "were") + " discarded." : "") : "");
}
// Changes that were waiting to sync get one last try (with a time limit), then the account is signed out.
async function signOutExpired(){
  try{ if(typeof pendingCount === "function" && pendingCount() && auth.token) await Promise.race([Promise.all(Object.keys(pend).map(id => pump(id))), sleep(10000)]); }catch(_){}
  let left = 0; try{ left = typeof pendingCount === "function" ? pendingCount() : 0; }catch(_){}
  wipeAccountData("expired", left);
}
// A different account logged in on this phone: nothing of the old one may stay.
function accountCheck(uid){
  let prev = ""; try{ prev = localStorage.getItem("wn_uid") || ""; }catch(_){}
  if(prev && String(uid) !== prev) wipeAccountStorage();
  try{ localStorage.setItem("wn_uid", String(uid)); }catch(_){}
}

// Coming back to the app (or opening it): sign out if it was unused too long, otherwise restart the clock and sweep the cache.
function sessionResume(){
  if(!auth.token) return;
  if(sessionExpired()){ signOutExpired(); return; }
  sessionTouch(); cacheSweep();
}
document.addEventListener("visibilitychange", () => { if(document.visibilityState === "visible") sessionResume(); else cacheFlushSoon(); });
window.addEventListener("pagehide", cacheFlushSoon);
document.addEventListener("pointerdown", () => { if(auth.token) sessionTouchSoon(); }, { capture: true, passive: true });
setInterval(() => cacheSweep(), 3600000);
