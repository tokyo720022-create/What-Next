/* js/features/notify.js: release reminders (phone notifications) and the Notifications settings page.
   Reminders are scheduled on the phone with the Capacitor Local Notifications plugin, so they arrive even when the app is closed.
   Alerts for changes to titles on your list (a sequel added and so on) come from an optional Kotlin add-on (WnNotify) that checks AniList in the background. */
// ---------- Settings ----------
const NF_DEF = { reminders: true, h3: true, m30: true, live: true, today: true, updates: true, social: false, asked: false };
const nfCfg = () => Object.assign({}, NF_DEF, LS("wn_notify", {}) || {});
const nfSet = patch => LSset("wn_notify", Object.assign(nfCfg(), patch));
const nfLocal = () => (isNative ? nativePlugin("LocalNotifications") : null);

// ---------- Permission, channel ----------
// ask: show the Android permission box when it has not been shown yet. force: show it now even if it was shown before (a button was tapped).
async function nfAllowed(LN, ask, force){
  let p; try{ p = await LN.checkPermissions(); }catch(_){ return false; }
  if(p && p.display === "granted") return true;
  if(!(force || (ask && p && p.display !== "denied" && !nfCfg().asked))) return false;
  nfSet({ asked: true });
  try{ p = await LN.requestPermissions(); }catch(_){ return false; }
  return !!p && p.display === "granted";
}
async function nfChannel(LN){
  try{ await LN.createChannel({ id: "wn_release", name: "Release reminders", description: "Before and when episodes of your anime air", importance: 4, visibility: 1, vibration: true }); }catch(_){}
}
async function nfClear(LN){
  try{
    const p = await LN.getPending(), list = ((p && p.notifications) || []).map(n => ({ id: n.id }));
    if(list.length) await LN.cancel({ notifications: list });
  }catch(_){}
}

// ---------- Planning ----------
const NF_SCHED_Q = "query($ids:[Int],$to:Int,$p:Int){Page(page:$p,perPage:50){pageInfo{hasNextPage} airingSchedules(mediaId_in:$ids,notYetAired:true,airingAt_lesser:$to,sort:TIME){mediaId episode airingAt}}}";
async function nfSchedules(ids, to){
  const rows = [];
  if(!ids.length) return rows;
  for(let p = 1; p <= 6; p++){
    const { json } = await gql(NF_SCHED_Q, { ids, to, p }), pg = json.data && json.data.Page;
    if(!pg) throw new Error((json.errors && json.errors[0] && json.errors[0].message) || "No data");
    rows.push(...(pg.airingSchedules || []));
    if(!(pg.pageInfo && pg.pageInfo.hasNextPage)) break;
  }
  return rows;
}
let nfBusy = false, nfSig = "", nfAt = 0, nfTimer = 0;
// Plan again soon (a burst of list changes plans once). The plan is skipped when nothing that matters changed in the last 3 hours.
function nfSoon(delay){ clearTimeout(nfTimer); nfTimer = setTimeout(() => { nfPlan(false).catch(() => {}); }, delay == null ? 20000 : delay); }
async function nfPlan(force){
  const LN = nfLocal();
  if(!LN || !auth.token || nfBusy) return;
  nfBusy = true;
  try{
    const c = nfCfg();
    if(!c.reminders){ await nfClear(LN); nfSig = ""; return; }
    if(!(await nfAllowed(LN, true, false))) return;
    const items = state.items.filter(e => !hide.has(e.media.id)), sig = nfSignature(items, c);
    if(!force && sig === nfSig && Date.now() - nfAt < 3 * 3600000) return;
    const now = Math.floor(Date.now() / 1000);
    const ids = items.filter(e => e.media.type === "ANIME" && NF_LIST_STATUS.includes(e.status) && e.media.status !== "FINISHED" && e.media.status !== "CANCELLED").map(e => e.media.id);
    let rows = [];
    try{ rows = await nfSchedules(ids, now + NF_HORIZON); }catch(_){}   // without the schedule, the next episode of each show (already in your list) still gets its reminders
    const clock = s => new Date(s * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    const specs = nfBuild(items, rows, c, now, tt, clock);
    await nfChannel(LN); await nfClear(LN);
    if(specs.length) await LN.schedule({ notifications: specs.map(s => ({ id: s.id, title: s.title, body: s.body, channelId: "wn_release", smallIcon: "ic_stat_whatnext", schedule: { at: new Date(s.at * 1000), allowWhileIdle: true }, extra: { mid: s.mid } })) });
    nfSig = sig; nfAt = Date.now();
    if(typeof crumb === "function") crumb("reminders planned " + specs.length);
  }catch(err){ if(typeof crumb === "function") crumb("reminders failed"); }
  finally{ nfBusy = false; }
}

// ---------- Background alerts (Kotlin add-on) ----------
function nfBg(){
  const P = isNative ? nativePlugin("WnNotify") : null;
  if(!P || typeof P.configure !== "function") return;
  const c = nfCfg(), types = nfTypes(c);
  try{ P.configure({ enabled: !!auth.token && types.length > 0, types: types.join(",") }).catch(() => {}); }catch(_){}
}
// Signed out: nothing may be left on the phone for this account.
function nfSignedOut(){
  nfSig = ""; clearTimeout(nfTimer);
  const LN = nfLocal(); if(LN) nfClear(LN);
  const P = isNative ? nativePlugin("WnNotify") : null;
  try{ if(P && typeof P.configure === "function") P.configure({ enabled: false, types: "" }).catch(() => {}); }catch(_){}
}

// ---------- Opening from a notification ----------
let nfWant = false, nfReady = false;
function nfGo(){ if(nfWant && nfReady && auth.token){ nfWant = false; showTab("notifications"); } }
// whatnext://notifications is what the background alerts open. It only shows the list, and only after login.
function nfOpenUrl(url){
  if(!/^whatnext:\/\/notifications\/?$/i.test(String(url || ""))) return false;
  nfWant = true; nfGo(); return true;
}
function nfStarted(){ nfReady = true; nfGo(); nfBadge(); nfBg(); nfSoon(4000); }
let nfResumeAt = 0;
function nfResume(){ if(!auth.token || Date.now() - nfResumeAt < 120000) return; nfResumeAt = Date.now(); nfBadge(); nfSoon(2000); }
try{
  const LN0 = nfLocal();
  if(LN0 && LN0.addListener) LN0.addListener("localNotificationActionPerformed", ev => {
    const x = ev && ev.notification && ev.notification.extra, id = x && Number(x.mid);
    if(id > 0 && auth.token) openMedia(id);
  });
}catch(_){}

// ---------- Settings page ----------
const NF_SWITCHES = { nfReminders: "reminders", nfH3: "h3", nfM30: "m30", nfLive: "live", nfToday: "today", nfUpdates: "updates", nfSocial: "social" };
async function nfFill(){
  const c = nfCfg(), LN = nfLocal(), st = $("#nfStatus"), box = $("#nfTimes");
  for(const id in NF_SWITCHES) $("#" + id).checked = !!c[NF_SWITCHES[id]];
  box.hidden = !c.reminders;
  $("#nfTest").hidden = $("#nfAllow").hidden = !LN;
  if(!LN){ st.textContent = "Phone notifications work in the Android app. In a browser you can still read your AniList notifications."; return; }
  let text = "", granted = false;
  try{ const p = await LN.checkPermissions(); granted = p && p.display === "granted"; }catch(_){}
  if(!granted) text = "Notifications are not allowed for this app yet. Tap Allow notifications.";
  else{
    let n = 0; try{ const p = await LN.getPending(); n = ((p && p.notifications) || []).length; }catch(_){}
    text = n ? n + " reminder" + (n === 1 ? " is" : "s are") + " waiting on this phone." : (c.reminders ? "No reminders are waiting: nothing on your list airs in the next two weeks." : "Reminders are off.");
  }
  st.textContent = text; $("#nfAllow").hidden = granted;
}
function nfChanged(){
  const c = {}; for(const id in NF_SWITCHES) c[NF_SWITCHES[id]] = $("#" + id).checked;
  nfSet(c); $("#nfTimes").hidden = !c.reminders;
  nfBg(); nfSig = ""; nfPlan(true).then(nfFill, nfFill);
}
for(const id in NF_SWITCHES) $("#" + id).onchange = nfChanged;
$("#nfAllow").onclick = async () => {
  const LN = nfLocal(); if(!LN) return;
  const ok = await nfAllowed(LN, true, true);
  if(!ok) $("#nfStatus").textContent = "Android did not show the permission box. Open your phone's Settings > Apps > What Next? > Notifications and allow them.";
  else{ nfSig = ""; await nfPlan(true); nfFill(); }
};
$("#nfTest").onclick = async () => {
  const LN = nfLocal(), st = $("#nfStatus"); if(!LN) return;
  if(!(await nfAllowed(LN, true, true))){ st.textContent = "Notifications are not allowed for this app yet. Open your phone's Settings > Apps > What Next? > Notifications."; return; }
  try{
    await nfChannel(LN);
    await LN.schedule({ notifications: [{ id: 1, title: "What Next?", body: "Test: release reminders look like this.", channelId: "wn_release", smallIcon: "ic_stat_whatnext", schedule: { at: new Date(Date.now() + 5000), allowWhileIdle: true } }] });
    st.textContent = "A test notification arrives in about 5 seconds. Close the app to see it the way a real reminder shows.";
  }catch(_){ st.textContent = "The test could not be scheduled."; }
};
