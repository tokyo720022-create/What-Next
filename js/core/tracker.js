/* js/core/tracker.js: the one place that changes list entries.
   Rules (status, dates, rewatches) -> instant on-screen update -> save to AniList -> offline queue. */
const EMPTY_DATE = { year: null, month: null, day: null };
const POOL = ["CURRENT", "REPEATING", "PLANNING"];          // statuses the Pick screen can suggest
const fdBlank = d => !d || !d.year;
const fdToday = () => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() }; };
const isNetErr = e => /Failed to fetch|NetworkError|Load failed|network/i.test((e && e.message) || "");

// ---- Rules (pure: no screen, no network) ----
// cur: { status, progress, repeat, startedAt, completedAt }   ch: { status } or { progress }
// Returns only the fields that should change.
function trackRules(cur, total, ch){
  let st = cur.status || "PLANNING", pr = cur.progress || 0, rp = cur.repeat || 0, was = st;
  const out = {}, today = fdToday();
  if(ch.status && ch.status !== st){
    st = ch.status;
    if(st === "COMPLETED"){
      if(total) pr = total;
      if(was === "REPEATING") rp += 1;
      if(fdBlank(cur.completedAt)) out.completedAt = today;
      if(fdBlank(cur.startedAt)) out.startedAt = today;
    }else if(st === "CURRENT"){
      if(fdBlank(cur.startedAt)) out.startedAt = today;
    }else if(st === "REPEATING"){
      if(was === "COMPLETED" || (total && pr >= total)) pr = 0;
    }
  }
  if(ch.progress != null){
    pr = Math.max(0, Math.min(total || 99999, Math.round(ch.progress) || 0));
    if(pr > 0 && (st === "PLANNING" || st === "PAUSED" || st === "DROPPED")){ st = "CURRENT"; if(fdBlank(cur.startedAt) && !out.startedAt) out.startedAt = today; }
    else if(pr > 0 && st === "CURRENT" && fdBlank(cur.startedAt) && !out.startedAt) out.startedAt = today;
    if(total && pr >= total && (st === "CURRENT" || st === "REPEATING")){
      if(st === "REPEATING") rp += 1;
      st = "COMPLETED"; if(fdBlank(cur.completedAt) && !out.completedAt) out.completedAt = today;
    }else if(st === "COMPLETED" && total && pr < total){
      st = "CURRENT"; out.completedAt = EMPTY_DATE;
    }
  }
  const res = {};
  if(st !== cur.status) res.status = st;
  if(pr !== (cur.progress || 0)) res.progress = pr;
  if(rp !== (cur.repeat || 0)) res.repeat = rp;
  if(out.startedAt) res.startedAt = out.startedAt;
  if(out.completedAt) res.completedAt = out.completedAt;
  return res;
}

// ---- Score formats (AniList stores 0 to 100; people see their own format) ----
const SCORE_SPECS = {
  POINT_100: { min: 0, max: 100, step: 1, toRaw: v => Math.round(v), fromRaw: r => r, text: v => String(v) },
  POINT_10_DECIMAL: { min: 0, max: 10, step: 0.1, toRaw: v => Math.round(v * 10), fromRaw: r => Math.round(r) / 10, text: v => v.toFixed(1) },
  POINT_10: { min: 0, max: 10, step: 1, toRaw: v => Math.round(v) * 10, fromRaw: r => Math.round(r / 10), text: v => String(v) },
  POINT_5: { min: 0, max: 5, step: 1, toRaw: v => Math.round(v) * 20, fromRaw: r => Math.round(r / 20), text: v => v + "/5" },
  POINT_3: { min: 0, max: 3, step: 1, toRaw: v => ({ 0: 0, 1: 35, 2: 60, 3: 85 })[Math.round(v)] || 0, fromRaw: r => r >= 75 ? 3 : r >= 50 ? 2 : r > 0 ? 1 : 0, text: v => ["", "Disliked", "Neutral", "Liked"][v] || "" }
};
const scoreFmt = () => { try{ return localStorage.getItem("wn_scorefmt") || "POINT_10_DECIMAL"; }catch(_){ return "POINT_10_DECIMAL"; } };
const scoreSpec = () => SCORE_SPECS[scoreFmt()] || SCORE_SPECS.POINT_10_DECIMAL;
const scoreText = raw => { if(!raw) return "–"; const s = scoreSpec(); return s.text(s.fromRaw(raw)); };

// ---- Small message at the bottom of the screen ----
let toastTimer = 0;
function toast(msg, ms){
  const t = typeof document !== "undefined" && document.getElementById("toast"); if(!t) return;
  t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, ms || 3200);
}

// ---- Finding an entry wherever the app keeps a copy ----
function findEntry(id, type){
  const L = lists[type] && lists[type].entries && lists[type].entries.find(x => x.id === id);
  const P = state.items.find(x => x.media.id === id);
  const M = mcache.get(id), ME = M && M.mediaListEntry;
  const src = L || P || ME; if(!src) return null;
  const media = L ? L.m : P ? P.media : M, total = type === "anime" ? media.episodes : media.chapters;
  return { cur: { status: src.status, progress: src.progress || 0, repeat: src.repeat || 0, startedAt: src.startedAt, completedAt: src.completedAt }, total: total || null };
}
const FIELDS = ["status", "progress", "repeat", "startedAt", "completedAt"];
const savePool = () => { try{ localStorage.setItem("wn_cache", JSON.stringify(state.items)); }catch(_){} };

// Update every on-screen copy at once.
function applyLocal(id, type, patch){
  const now = Math.floor(Date.now() / 1000);
  const L = lists[type] && lists[type].entries && lists[type].entries.find(x => x.id === id);
  if(L){ FIELDS.forEach(k => { if(k in patch) L[k] = patch[k]; }); if("score" in patch) L.score = patch.score; L.updatedAt = now; lists[type].rev++; writeListCache(type, lists[type].entries); }
  const pi = state.items.findIndex(x => x.media.id === id);
  if(pi >= 0){
    const P = state.items[pi]; FIELDS.forEach(k => { if(k in patch) P[k] = patch[k]; });
    if(patch.status && !POOL.includes(patch.status)) state.items.splice(pi, 1);
    savePool();
  }
  const M = mcache.get(id);
  if(M){
    if(!M.mediaListEntry && patch.status) M.mediaListEntry = { id: null, status: patch.status, progress: 0, repeat: 0, score: 0, notes: null, private: false, priority: 0, startedAt: EMPTY_DATE, completedAt: EMPTY_DATE, customLists: {} };
    if(M.mediaListEntry){
      FIELDS.concat(["score", "notes", "priority", "private"]).forEach(k => { if(k in patch) M.mediaListEntry[k] = patch[k]; });
      if(patch.customLists){ const o = {}; patch.customLists.forEach(n => { o[n] = true; }); M.mediaListEntry.customLists = o; }
    }
  }
}
function renderAfter(id, type){
  if(typeof renderList === "function" && !$("#lists").hidden && curType === type && lists[type].entries) renderList({ keepScroll: true });
  const box = $("#media");
  if(!box.hidden && mstack[mstack.length - 1] === id && mcache.has(id)){ const y = box.scrollTop; renderMedia(mcache.get(id)); box.scrollTop = y; }
}

// ---- Save queue: absolute values, one request per title at a time, kept across restarts ----
const TRACK_Q = "mutation($mediaId:Int,$status:MediaListStatus,$progress:Int,$repeat:Int,$score:Int,$notes:String,$priority:Int,$private:Boolean,$startedAt:FuzzyDateInput,$completedAt:FuzzyDateInput,$customLists:[String]){SaveMediaListEntry(mediaId:$mediaId,status:$status,progress:$progress,repeat:$repeat,scoreRaw:$score,notes:$notes,priority:$priority,private:$private,startedAt:$startedAt,completedAt:$completedAt,customLists:$customLists){id status progress}}";
const pend = {}, inflight = new Set(), waiters = {};
try{ Object.assign(pend, JSON.parse(localStorage.getItem("wn_pending") || "{}")); }catch(_){}
const savePending = () => { try{ localStorage.setItem("wn_pending", JSON.stringify(pend)); }catch(_){} };
const pendingCount = () => Object.keys(pend).length;
function toVars(id, patch){
  const v = { mediaId: Number(id) };
  ["status", "progress", "repeat", "score", "notes", "priority", "private", "startedAt", "completedAt", "customLists"].forEach(k => { if(k in patch) v[k] = patch[k]; });
  return v;
}
function pump(id){
  return new Promise(resolve => { (waiters[id] = waiters[id] || []).push(resolve); if(!inflight.has(id)) runJob(id); });
}
async function runJob(id){
  inflight.add(id); let result = { ok: true };
  try{
    while(pend[id]){
      const job = pend[id], ver = job.ver;
      let json;
      try{ ({ json } = await gql(TRACK_Q, toVars(id, job.patch))); }
      catch(err){ if(isNetErr(err)){ result = { ok: false, queued: true }; break; } throw err; }
      if(json.errors) throw new Error(json.errors[0].message);
      if(pend[id] && pend[id].ver === ver) delete pend[id];
      const M = mcache.get(id), saved = json.data.SaveMediaListEntry;
      if(M && M.mediaListEntry && saved) M.mediaListEntry.id = saved.id;
      if(job.isNew){ mcache.delete(id); invalidateLists(); refreshPool(); }
      savePending();
    }
  }catch(err){
    const job = pend[id]; delete pend[id];
    if(job){ applyLocal(id, job.type, job.before); renderAfter(id, job.type); if(typeof bumpDay === "function") for(const [k, n] of job.bumps || []) bumpDay(-n, k); toast("Couldn't save: " + err.message, 4500); }
    result = { ok: false, error: err };
  }
  savePending(); inflight.delete(id);
  const ws = waiters[id] || []; delete waiters[id]; ws.forEach(r => r(result));
  if(typeof renderPending === "function") renderPending();
}
function flushPending(){ Object.keys(pend).forEach(id => { if(!inflight.has(id)) pump(id); }); }
let poolTimer = 0;
function refreshPool(){
  clearTimeout(poolTimer);
  poolTimer = setTimeout(async () => {
    try{
      const entries = [];
      for(const t of ["ANIME", "MANGA"]) entries.push(...await collection(state.user, t, "status_in:[CURRENT,REPEATING,PLANNING]", ENTRY_F));
      const seen = new Map(); entries.forEach(e => { if(!seen.has(e.media.id)) seen.set(e.media.id, e); });
      state.items = [...seen.values()]; savePool();
    }catch(_){}
  }, 1500);
}

// Save fields for one title. Returns a promise: { ok, queued?, error? }
function trackSave(id, type, patch, opts){
  opts = opts || {};
  const f = findEntry(id, type), cur = f ? f.cur : {};
  if(!Object.keys(patch).length) return Promise.resolve({ ok: true, none: true });
  const before = {}; Object.keys(patch).forEach(k => { before[k] = k === "score" ? ((lists[type].entries || []).find(x => x.id === id) || {}).score || 0 : cur[k]; });
  if(!f) Object.keys(before).forEach(k => { if(before[k] === undefined) delete before[k]; });
  const bump = patch.progress != null && cur.progress != null ? patch.progress - cur.progress : 0, bumpKey = typeof dayKey === "function" ? dayKey() : "";
  if(bump && typeof bumpDay === "function") bumpDay(bump, bumpKey);   // undoing a tap takes it back off today
  applyLocal(id, type, patch);
  const job = pend[id] || { type, patch: {}, before: {}, ver: 0, isNew: !f };
  Object.assign(job.patch, patch); Object.keys(before).forEach(k => { if(!(k in job.before)) job.before[k] = before[k]; });
  if(bump > 0){ job.bumps = (job.bumps || []).concat([[bumpKey, bump]]); }
  job.ver++; pend[id] = job; savePending();
  renderAfter(id, type);
  return pump(id).then(r => { if(r.queued && !opts.quiet) toast("Saved on this device. It will sync when you're online."); return r; });
}
// One change (status or progress) with all the rules applied.
function track(id, type, change, opts){
  const f = findEntry(id, type); if(!f) return Promise.resolve({ ok: false, error: new Error("Entry not found") });
  return trackSave(id, type, trackRules(f.cur, f.total, change), opts);
}
async function trackRemove(id, type, entryId){
  try{
    const { json } = await gql("mutation($id:Int){DeleteMediaListEntry(id:$id){deleted}}", { id: entryId });
    if(json.errors) throw new Error(json.errors[0].message);
  }catch(err){ return { ok: false, error: err, offline: isNetErr(err) }; }
  delete pend[id]; savePending(); mcache.delete(id);
  state.items = state.items.filter(x => x.media.id !== id); savePool();
  if(lists[type].entries){ lists[type].entries = lists[type].entries.filter(x => x.id !== id); lists[type].rev++; writeListCache(type, lists[type].entries); }
  return { ok: true };
}
function renderPending(){
  const n = pendingCount(), p = document.getElementById("pendNote");
  if(p) p.textContent = n ? n + " change" + (n > 1 ? "s are" : " is") + " waiting to sync." : "Everything is synced.";
}
