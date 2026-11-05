/* js/core/cache.js: the smart cache and the session clock.
   Every cached item is saved with a timestamp and is deleted by itself once it is too old:
     card  (anime and manga cards, pages, charts)  3 days
     cal   (airing calendar)                        7 days
     acct  (your lists, profile, stats, activity)  14 days
   The session clock signs you out when the app has not been used for 14 days.
   Nothing in here needs the screen, so it can be tested on its own. */
const CACHE_DAY = 86400000;
const CACHE_TTL = { card: 3 * CACHE_DAY, cal: 7 * CACHE_DAY, acct: 14 * CACHE_DAY };
const CACHE_MAX = { card: 80, cal: 8, acct: 60 };           // most entries kept per class
const CACHE_ORDER = ["card", "cal", "acct"];                 // cheapest to lose first
const CACHE_PFX = "wn_c_";
const SESSION_MAX = 14 * CACHE_DAY, SESSION_KEY = "wn_last";

const cacheKeyOf = (cls, name) => CACHE_PFX + cls + "_" + name;
function cacheClassOf(key){ const m = /^wn_c_(card|cal|acct)_/.exec(key); return m ? m[1] : null; }
function cacheKeys(cls, namePrefix){
  const out = [], p = CACHE_PFX + (cls ? cls + "_" + (namePrefix || "") : "");
  try{ for(let i = 0; i < localStorage.length; i++){ const k = localStorage.key(i); if(k && k.indexOf(p) === 0) out.push(k); } }catch(_){}
  return out;
}
function cacheRemove(k){ try{ localStorage.removeItem(k); }catch(_){} }
// The time is stored at the front of every entry, so it can be read without opening the whole entry.
function cacheAtOf(k){
  try{ const s = localStorage.getItem(k), m = s && /"at":(\d+)/.exec(s.slice(0, 48)); return m ? Number(m[1]) : 0; }catch(_){ return 0; }
}
// Too old, or stamped in the future (the phone clock was changed): either way it is not trusted.
function cacheExpired(at, cls, now){
  now = now || Date.now();
  if(!at) return true;
  const age = now - at;
  return age < -60000 || age > (CACHE_TTL[cls] || 0);
}

function cacheMeta(cls, name){
  const k = cacheKeyOf(cls, name); let raw = null;
  try{ raw = localStorage.getItem(k); }catch(_){ return null; }
  if(raw === null) return null;
  let r = null; try{ r = JSON.parse(raw); }catch(_){}
  if(!r || r.v !== 1 || typeof r.at !== "number" || !("d" in r) || cacheExpired(r.at, cls)){ cacheRemove(k); return null; }
  return { d: r.d, at: r.at, age: Date.now() - r.at };
}
const cacheGet = (cls, name) => { const m = cacheMeta(cls, name); return m ? m.d : null; };

function cachePut(k, s){ try{ localStorage.setItem(k, s); return true; }catch(_){ return false; } }
// Remove the oldest entry of a class (never the one being written). Returns false when there is nothing left to remove.
function cacheEvictOldest(cls, keep){
  let oldK = null, oldAt = Infinity;
  for(const k of cacheKeys(cls)){ if(k === keep) continue; const at = cacheAtOf(k); if(at < oldAt){ oldAt = at; oldK = k; } }
  if(!oldK) return false; cacheRemove(oldK); return true;
}
function cacheTrim(cls, keep){
  const ks = cacheKeys(cls);
  while(ks.length > (CACHE_MAX[cls] || 50) && cacheEvictOldest(cls, keep)) ks.pop();
}
function cacheSet(cls, name, data){
  const k = cacheKeyOf(cls, name); let s;
  try{ s = JSON.stringify({ v: 1, at: Date.now(), c: cls, d: data }); }catch(_){ return false; }
  if(cachePut(k, s)){ cacheTrim(cls, k); return true; }
  // Storage is full: drop what is expired, then the oldest of the less important classes, then retry.
  cacheSweep(); if(cachePut(k, s)){ cacheTrim(cls, k); return true; }
  for(const c of CACHE_ORDER.slice(0, CACHE_ORDER.indexOf(cls) + 1)){
    while(cacheEvictOldest(c, k)){ if(cachePut(k, s)){ cacheTrim(cls, k); return true; } }
  }
  return false;
}

// Writes that can wait a moment (a list that changes on every tap): the last value wins, and it is flushed when the app goes to the background.
const cacheSoon = new Map();
function cacheSetSoon(cls, name, data, ms){
  const k = cacheKeyOf(cls, name), p = cacheSoon.get(k); if(p) clearTimeout(p.t);
  cacheSoon.set(k, { cls, name, data, t: setTimeout(() => { cacheSoon.delete(k); cacheSet(cls, name, data); }, ms || 700) });
}
function cacheFlushSoon(){ for(const p of [...cacheSoon.values()]){ clearTimeout(p.t); cacheSet(p.cls, p.name, p.data); } cacheSoon.clear(); }
function cacheSoonCancel(prefix){ for(const [k, p] of [...cacheSoon]){ if(k.indexOf(prefix) === 0){ clearTimeout(p.t); cacheSoon.delete(k); } } }

function cacheDel(cls, name){ cacheSoonCancel(cacheKeyOf(cls, name)); cacheRemove(cacheKeyOf(cls, name)); }
function cacheDelPrefix(cls, namePrefix){ cacheSoonCancel(CACHE_PFX + cls + "_" + (namePrefix || "")); cacheKeys(cls, namePrefix).forEach(cacheRemove); }
function cacheClear(cls){ cacheSoonCancel(CACHE_PFX + (cls ? cls + "_" : "")); const ks = cacheKeys(cls); ks.forEach(cacheRemove); return ks.length; }

// Delete everything that is too old (or unreadable). Runs when the app starts, when it comes back, and every hour.
function cacheSweep(now){
  let n = 0; now = now || Date.now();
  for(const k of cacheKeys()){
    const cls = cacheClassOf(k);
    if(!cls || cacheExpired(cacheAtOf(k), cls, now)){ cacheRemove(k); n++; }
  }
  return n;
}
function cacheStats(){
  const out = { count: 0, chars: 0, byClass: { card: 0, cal: 0, acct: 0 } };
  for(const k of cacheKeys()){
    let len = 0; try{ len = k.length + (localStorage.getItem(k) || "").length; }catch(_){}
    out.count++; out.chars += len; const c = cacheClassOf(k); if(c) out.byClass[c]++;
  }
  return out;
}

// Whose data is this? The name is part of every account cache key, so one person never sees another's.
const acctUser = () => { try{ return String(state.user || localStorage.getItem("wn_name") || "").toLowerCase(); }catch(_){ return ""; } };

// ---------- Session clock: unused for 14 days = signed out ----------
let sessionMem = 0;
function sessionLast(){ try{ return Number(localStorage.getItem(SESSION_KEY)) || 0; }catch(_){ return 0; } }
function sessionTouch(){ sessionMem = Date.now(); try{ localStorage.setItem(SESSION_KEY, String(sessionMem)); }catch(_){} }
function sessionTouchSoon(){ if(Date.now() - sessionMem > 600000) sessionTouch(); }   // taps count as use, saved at most every 10 minutes
function sessionExpired(now){
  now = now || Date.now();
  const t = sessionLast();
  if(!t) return false;                // first run after this update: start the clock, never sign anyone out for it
  if(t > now + 60000) return false;   // the phone clock was set back: don't punish the person for it
  return now - t > SESSION_MAX;
}
