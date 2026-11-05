/* js/core/start.js: app start */
window.addEventListener("online", () => { if(typeof flushPending === "function") flushPending(); });

// Older builds registered a service worker (from the web version). Remove any that is still on the phone.
try{
  if("serviceWorker" in navigator) navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister())).catch(() => {});
  if(window.caches) caches.keys().then(ks => ks.forEach(k => caches.delete(k))).catch(() => {});
}catch(_){}
legacyCleanup();

(async function start(){
  cacheSweep();                                              // delete anything saved for too long
  if(auth.token && sessionExpired()) await signOutExpired(); // not used for 14 days: sign out before anything is shown or asked
  else if(auth.token) sessionTouch();
  syncAuthUI();
  if(!auth.token){ readyNow(); return; }
  let sn = ""; try{ sn = localStorage.getItem("wn_name") || ""; }catch(_){}
  if(sn){
    $("#whoName").textContent = sn;                          // show your name while AniList answers
    const pool = cacheGet("acct", poolName(sn));
    if(Array.isArray(pool) && pool.length){ paintFromCache(sn, pool); readyNow(); }   // and your saved Pick, so the screen is never empty after the logo
  }
  try{
    const { json } = await gql("query{Viewer{id name}}", {});
    const name = json.data && json.data.Viewer && json.data.Viewer.name;
    if(!name) throw new Error((json.errors && json.errors[0] && json.errors[0].message) || "AniList didn't answer. Try again.");   // a real bad token is already handled inside gql()
    accountCheck(json.data.Viewer.id);                       // a different account on this phone starts clean
    state.user = name; state.uid = json.data.Viewer.id;
    try{ localStorage.setItem("wn_name", name); }catch(_){}
    loadList(name);
    loadTrending();
    syncAniOptions();
    flushPending();
    setTimeout(maybeAutoSync, 3000);
  }catch(err){
    let cn = ""; try{ cn = localStorage.getItem("wn_name") || ""; state.uid = Number(localStorage.getItem("wn_uid")) || 0; }catch(_){}
    if(cn && auth.token){ state.user = cn; return loadList(cn); }
    readyNow(); loginErr(err.message); syncAuthUI();
  }
})();
