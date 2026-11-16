/* js/features/pickmem.js: Pick Memory on the screen: the "why" chips under a pick, the three reaction buttons, the settings switches and the one-time start from your list.
   The maths is in pickmem-math.js. Everything is kept on this phone (wn_pickmem) and nothing is sent anywhere; the only request is reading your own list once. */
const PM_KEY = "wn_pickmem", PM_SNOOZE = "wn_pm_snooze";
const PM_F = "status score(format:POINT_100) media{id genres countryOfOrigin episodes chapters startDate{year}}";
let pmCache = null;
const pmNow = () => Math.floor(Date.now() / 1000);
const pmType = e => (e.media.type === "MANGA" ? "manga" : "anime");
function pmMem(){
  if(pmCache) return pmCache;
  const s = LS(PM_KEY, {}) || {}, d = pmEmpty();
  pmCache = Object.assign(d, s, { boot: Object.assign(d.boot, s.boot), react: Object.assign(d.react, s.react), anime: s.anime || {}, manga: s.manga || {} });
  return pmCache;
}
function pmStore(m){ pmCache = m; LSset(PM_KEY, m); }
function pmForget(){ pmCache = null; pmTried.clear(); }   // signing out: the saved copy is removed with the other account data
const pmSnoozeMap = () => LS(PM_SNOOZE, {}) || {};

// ---- what Pick uses (core.js) ----
const pmScore = e => { const m = pmMem(); return m.on ? pmBonus(m, pmType(e), e.media, pmNow()) : 0; };
const pmSnoozedNow = id => pmSnoozed(pmSnoozeMap(), id, pmDay(pmNow()));
// 1 in 7 picks (when Pick Memory is on) is one of the next best, so the same taste does not repeat forever.
const pmExplore = len => pmExploreIndex(len, Math.random, pmMem().on);

// ---- reading your own list once, so there is no cold start ----
const pmTried = new Set();
async function pmEnsureBoot(){
  const mem = pmMem();
  if(!mem.on || !mem.learn || !auth.token || !state.user) return;
  for(const type of ["anime", "manga"]){
    if(mem.boot[type] || pmTried.has(type)) continue;
    pmTried.add(type);   // one try per type each time the app is opened
    try{
      const entries = await collection(state.user, type.toUpperCase(), "status_in:[COMPLETED,CURRENT,REPEATING,PAUSED,DROPPED]", PM_F);
      pmStore(pmBoot(pmMem(), type, entries, pmNow()));
    }catch(_){ /* next time */ }
  }
}

// ---- a reaction ----
function pmReact(e, p, target){
  const mem = pmMem();
  if(!mem.on) return { note: "Pick Memory is off. Turn it on in App Settings." };
  if(!mem.learn) return { note: "Learning is paused in App Settings." };
  const type = pmType(e), skip = new Set(state.genre !== "ALL" ? ["genre:" + state.genre] : []);
  const r = pmLearn(mem, type, e.media, target, 1, pmNow(), skip);
  if(!r.changes.length) return { note: "Nothing new to learn from this one." };
  pmStore(r.mem);
  return { note: (target > 0 ? "Learned: more " : "Learned: less ") + pmLabel(r.top, type), r, type };
}
// "Why this pick" chips (under the card).
function pmWhyRow(e, p, explore){
  const why = pmWhy(pmMem(), pmType(e), e, p, { time: state.time, explore: !!explore }, pmNow());
  if(!why.length) return null;
  const row = el("div", "pmwhy"); row.append(el("span", "pmwl", "Why this pick"));
  for(const w of why) row.append(el("span", "pmchip" + (/^You like|change of pace/.test(w) ? " learned" : ""), w));
  return row;
}
// The three reactions. next() shows another suggestion.
function pmFeedbackRow(e, p, next){
  const box = el("div", "pmfb"), row = el("div", "pmbtns"), note = el("p", "pmnote"), id = e.media.id;
  note.setAttribute("aria-live", "polite");
  const btn = (cls, icon, text) => { const b = el("button", "pmb " + cls); b.type = "button"; b.append(el("span", "pmi", icon), el("span", null, text)); return b; };
  const up = btn("up", "👍", "Great pick"), no = btn("no", "👎", "Not for me"), later = btn("later", "⏭", "Not today");
  up.onclick = () => {
    const r = pmReact(e, p, 1); up.setAttribute("aria-pressed", "true"); note.textContent = r.note + " ";
    if(r.r){
      up.disabled = true;
      const undo = el("button", "pmundo", "Undo"); undo.type = "button";
      undo.onclick = () => { pmStore(pmUndo(pmMem(), r.type, r.r.changes)); up.disabled = false; up.setAttribute("aria-pressed", "false"); note.textContent = "Undone."; };
      note.append(undo);
    }
  };
  no.onclick = () => { const r = pmReact(e, p, -1); state.skipped.add(id); toast(r.note); next(); };
  later.onclick = () => { LSset(PM_SNOOZE, pmSnoozeAdd(pmSnoozeMap(), id, pmDay(pmNow()))); state.skipped.add(id); toast("Set aside until tomorrow."); next(); };
  row.append(up, no, later); box.append(el("div", "pmq", "Was this a good pick?"), row, note);
  return box;
}

// ---- App Settings > Pick Memory ----
function pmFill(){
  const m = pmMem(), a = m.react.anime || 0, b = m.react.manga || 0;
  $("#pmOn").checked = !!m.on; $("#pmLearn").checked = !!m.learn;
  $("#pmStat").textContent = "Learned from " + a + (a === 1 ? " reaction" : " reactions") + " on anime and " + b + " on manga. Started from your list: " + (m.boot.anime && m.boot.manga ? "yes." : m.boot.anime || m.boot.manga ? "partly." : "not yet (it reads your list the next time you use Pick).");
}
$("#pmOn").onchange = () => { const m = pmMem(); m.on = $("#pmOn").checked; pmStore(m); };
$("#pmLearn").onchange = () => { const m = pmMem(); m.learn = $("#pmLearn").checked; pmStore(m); };
$("#pmReset").onclick = () => {
  const b = $("#pmReset");
  if(b.dataset.armed !== "1"){ b.dataset.armed = "1"; b.textContent = "Tap again to erase what it learned"; setTimeout(() => { b.dataset.armed = ""; b.textContent = "Reset what it learned"; }, 4000); return; }
  b.dataset.armed = ""; b.textContent = "Reset what it learned";
  const old = pmMem(), fresh = pmEmpty(); fresh.on = old.on; fresh.learn = old.learn; pmStore(fresh); pmTried.clear(); pmFill();   // it starts again from your list
};
