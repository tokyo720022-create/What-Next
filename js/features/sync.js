/* js/features/sync.js: AniList Triple Sync (Settings > AniList Triple Sync, switched on in App Settings > Advanced features).
   Source AniList list -> a target AniList account + MyAnimeList, with an optional Discord report. The maths is in triple-math.js. */
// ---------- AniList Triple Sync ----------
const TS_KEY = "wn_ts", TS_AL_PIN = "https://anilist.co/api/v2/oauth/pin";
const TS_KINDS = { anime: { type: "ANIME", label: "Anime", mal: "anime" }, manga: { type: "MANGA", label: "Manga", mal: "manga" } };
// One place for the defaults, so the screen and the engine always agree.
const TS_DEF = { sendAl: true, sendMal: true, add: true, protect: true, remove: false, skipAdultMal: false, auto: false, autoHours: 3, dcOn: true, dcQuiet: true, dcTitles: false, dcUrl: "", source: "" };
const TS_F = "mediaId status progress progressVolumes repeat private notes score(format:POINT_100) startedAt{year month day} completedAt{year month day} updatedAt media{id idMal isAdult title{romaji english}}";
const TS_AL_SAVE = "mutation($mediaId:Int,$status:MediaListStatus,$progress:Int,$progressVolumes:Int,$scoreRaw:Int,$repeat:Int,$private:Boolean,$notes:String,$startedAt:FuzzyDateInput,$completedAt:FuzzyDateInput){SaveMediaListEntry(mediaId:$mediaId,status:$status,progress:$progress,progressVolumes:$progressVolumes,scoreRaw:$scoreRaw,repeat:$repeat,private:$private,notes:$notes,startedAt:$startedAt,completedAt:$completedAt){id}}";
const TS_AL_READ = "query($m:Int,$u:Int){MediaList(mediaId:$m,userId:$u){id status progress progressVolumes repeat private notes score(format:POINT_100) startedAt{year month day} completedAt{year month day}}}";
const TS_AL_DELETE = "mutation($id:Int){DeleteMediaListEntry(id:$id){deleted}}";
const TS_NAMES = { al: "AniList", mal: "MyAnimeList" };
const tsSleep = ms => new Promise(r => setTimeout(r, ms));
const tsGap = ms => tsSleep(window.__tsGap != null ? window.__tsGap : ms);   // the pause between sends keeps AniList (90 a minute) and MyAnimeList happy; tests shorten it
let tsBusy = false, tsStopFlag = false, tsWakeLock = null;
const tsRaw = () => LS(TS_KEY, {}) || {};
const tsCfg = () => Object.assign({}, TS_DEF, tsRaw());
const tsPatch = (group, o) => { const c = tsRaw(); c[group] = Object.assign({}, c[group], o); LSset(TS_KEY, c); };
const tsMem = k => LS("wn_ts_state_" + k, {}) || {};
const tsFails = k => { try{ const v = JSON.parse(localStorage.getItem("wn_ts_fail_" + k) || "[]"); return Array.isArray(v) ? v : []; }catch(_){ return []; } };   // LS() would turn the list into an object
const tsLog = t => { const p = $("#syncLog"); p.hidden = false; p.textContent += t + "\n"; p.scrollTop = p.scrollHeight; };
const tsLogClear = () => { $("#syncLog").textContent = ""; };
const tsNote = t => { $("#syncStatus").textContent = t; };
const tsTargets = c => [c.sendAl && c.al && c.al.token ? "al" : "", c.sendMal && c.mal && c.mal.access ? "mal" : ""].filter(Boolean);
const tsSrcName = c => (c.source || state.user || "").trim();
// The targets that will really be used: never the AniList account that is also the source.
const tsActive = c => tsTargets(c).filter(t => !(t === "al" && (c.al.user || "").toLowerCase() === tsSrcName(c).toLowerCase()));
// Who the memory should belong to: the source and the target accounts in use.
const tsIdent = (c, targets) => ({ src: tsSrcName(c).toLowerCase(), al: targets.includes("al") ? c.al.userId : 0, mal: targets.includes("mal") ? (c.mal.userId || c.mal.user || "") : "" });

// The old Discord Sync page kept its webhooks and memory under other names. Bring one webhook over, then remove the rest.
(function tsMigrateOld(){   // runs while the scripts load, so it must not use helpers from scripts that load later (LS, LSset)
  let old = null; try{ old = JSON.parse(localStorage.getItem("wn_cfg") || "null"); }catch(_){}
  if(old && typeof old === "object"){
    let c = {}; try{ c = JSON.parse(localStorage.getItem(TS_KEY) || "{}") || {}; }catch(_){}
    const hook = [old.logHook, old.hook, old.mangaHook, old.vipHook].find(h => h && tsWebhookOk(h));
    if(hook && !c.dcUrl) c.dcUrl = hook;
    if(old.source && !c.source) c.source = String(old.source).trim();
    try{ localStorage.setItem(TS_KEY, JSON.stringify(c)); }catch(_){}
  }
  for(const k of ["wn_cfg", "wn_sync_anime", "wn_sync_manga"]) try{ localStorage.removeItem(k); }catch(_){}
})();

// ----- network -----
function tsNetErr(){
  const e = new Error(isNative ? "Couldn't reach the server. Check your connection." : "This service blocks websites. Use the Android app for this step.");
  e.net = true; return e;
}
async function tsReq(url, o, tries = 3){
  for(let i = 0; i < tries; i++){
    let r; try{ r = await fetch(url, o); }catch(_){ throw tsNetErr(); }
    if([429, 500, 502, 503, 504].includes(r.status) && i < tries - 1){ const ra = parseFloat(r.headers.get("Retry-After")); await tsSleep(Math.max(1500, (isNaN(ra) ? 2 + i * 2 : ra) * 1000)); continue; }
    const txt = await r.text(); let body = null; try{ body = txt ? JSON.parse(txt) : null; }catch(_){ body = txt; }
    return { status: r.status, ok: r.ok, body, headers: r.headers };
  }
}
const tsFatal = msg => { const e = new Error(msg); e.fatal = true; return e; };
const tsHttpErr = (svc, r) => { const b = r.body && typeof r.body === "object" ? r.body : {}, e = new Error(svc + " " + r.status + (b.message || b.error ? ": " + (b.message || b.error) : "")); e.status = r.status; return e; };
// AniList allows about 90 requests a minute per network address, shared with the rest of the app. Slow down when the answers say we are close.
const tsRate = { left: null, reset: 0 };
async function tsAl(query, vars, token){
  if(tsRate.left != null && tsRate.left < 12){
    const wait = tsRate.reset * 1000 - Date.now(); tsRate.left = null;
    if(wait > 0){ tsNote("Waiting for AniList's rate limit…"); await tsSleep(Math.min(65000, wait + 500)); }
  }
  const r = await tsReq("https://graphql.anilist.co", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: "Bearer " + token }, body: JSON.stringify({ query, variables: vars }) });
  const left = parseInt(r.headers && r.headers.get("x-ratelimit-remaining")), reset = parseInt(r.headers && r.headers.get("x-ratelimit-reset"));
  if(!isNaN(left)){ tsRate.left = left; tsRate.reset = isNaN(reset) ? 0 : reset; }
  const b = r.body && typeof r.body === "object" ? r.body : {}, err = b.errors && b.errors[0];
  if(r.status === 401 || (err && /invalid token/i.test(err.message || ""))) throw tsFatal("The target AniList login has expired. Connect it again.");
  if(err){ const e = new Error(err.message || "AniList error"); e.status = err.status || r.status; throw e; }
  if(!r.ok){ const e = new Error("AniList " + r.status); e.status = r.status; throw e; }
  return b.data;
}
async function tsMalRefresh(){
  const m = tsCfg().mal || {};
  if(!m.refresh) throw tsFatal("The MyAnimeList login has expired. Connect it again.");
  const form = { client_id: m.clientId, grant_type: "refresh_token", refresh_token: m.refresh }; if(m.clientSecret) form.client_secret = m.clientSecret;
  const r = await tsReq("https://myanimelist.net/v1/oauth2/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(form).toString() });
  if(!r.ok || !r.body || !r.body.access_token) throw tsFatal("The MyAnimeList login has expired. Connect it again.");
  tsPatch("mal", { access: r.body.access_token, refresh: r.body.refresh_token || m.refresh, expires: Date.now() + (r.body.expires_in || 2592000) * 1000 });
}
async function tsMal(method, path, form){
  let m = tsCfg().mal || {};
  if(!m.access) throw tsFatal("MyAnimeList isn't connected.");
  if(m.expires && Date.now() > m.expires - 86400000 && m.refresh){ await tsMalRefresh(); m = tsCfg().mal; }
  for(let n = 0; n < 2; n++){
    const h = { Authorization: "Bearer " + m.access, Accept: "application/json" }; if(form) h["Content-Type"] = "application/x-www-form-urlencoded";
    const r = await tsReq("https://api.myanimelist.net/v2" + path, { method, headers: h, body: form ? new URLSearchParams(form).toString() : undefined });
    if(r.status === 401){ if(n === 0){ await tsMalRefresh(); m = tsCfg().mal; continue; } throw tsFatal("MyAnimeList refused the login. Connect it again."); }
    return r;
  }
}

// ----- sending one title. Each returns what happened: sent, same, ahead, skipped, nomal or adult -----
async function tsPushAl(it, k, ms, c){
  const type = TS_KINDS[k].type; let vars = tsAlVars(it, type);
  if(c.protect || !c.add){   // read the target first: to leave titles alone that aren't there, and to never overwrite one that is further along
    let cur = null;
    try{ cur = (await tsAl(TS_AL_READ, { m: it.mediaId, u: c.al.userId }, c.al.token)).MediaList; }catch(e){ if(e.status !== 404) throw e; }
    if(!cur){ if(!c.add) return "skipped"; }
    else{
      ms.e = cur.id;
      if(c.protect){ const m = tsMergeAl(it, cur, type); if(m.skip) return "ahead"; if(m.same) return "same"; vars = m.vars; }
    }
  }
  const d = await tsAl(TS_AL_SAVE, vars, c.al.token);
  ms.e = d.SaveMediaListEntry.id; return "sent";
}
async function tsPushMal(it, k, ms, c){
  const id = it.media && it.media.idMal, kind = TS_KINDS[k].mal, type = TS_KINDS[k].type;
  if(c.skipAdultMal && it.media && it.media.isAdult) return "adult";
  if(!id) return "nomal";
  let fields = tsMalFields(it, type, !!ms.m);
  if(c.protect || !c.add){
    const g = await tsMal("GET", "/" + kind + "/" + id + "?fields=my_list_status");
    if(g.status === 404) return "nomal";
    if(!g.ok) throw tsHttpErr("MyAnimeList", g);
    const cur = g.body && g.body.my_list_status && g.body.my_list_status.status ? g.body.my_list_status : null;
    if(!cur){ if(!c.add) return "skipped"; }
    else if(c.protect){ const m = tsMergeMal(fields, cur, type); if(m.skip) return "ahead"; if(m.same) return "same"; fields = m.fields; }
  }
  const r = await tsMal("PUT", "/" + kind + "/" + id + "/my_list_status", fields);
  if(r.status === 404) return "nomal";   // MyAnimeList doesn't know this id
  if(r.status === 403){ const e = tsHttpErr("MyAnimeList", r); e.message = "MyAnimeList refused this title (it may be age-restricted)"; throw e; }
  if(!r.ok) throw tsHttpErr("MyAnimeList", r);
  return "sent";
}
async function tsRemove(r, k, targets, c){
  if(targets.includes("al") && r.a){
    let id = r.e;
    if(!id){ try{ const d = await tsAl(TS_AL_READ, { m: Number(r.id), u: c.al.userId }, c.al.token); id = d.MediaList && d.MediaList.id; }catch(e){ if(e.status !== 404) throw e; } }
    if(id) await tsAl(TS_AL_DELETE, { id }, c.al.token);
  }
  if(targets.includes("mal") && r.m && r.i){
    const x = await tsMal("DELETE", "/" + TS_KINDS[k].mal + "/" + r.i + "/my_list_status");
    if(!x.ok && x.status !== 404) throw tsHttpErr("MyAnimeList", x);
  }
}

// ----- keep the screen on while a long sync runs -----
async function tsWake(on){
  try{
    if(on){ if(navigator.wakeLock && !tsWakeLock) tsWakeLock = await navigator.wakeLock.request("screen"); }
    else if(tsWakeLock){ const w = tsWakeLock; tsWakeLock = null; await w.release(); }
  }catch(_){ tsWakeLock = null; }
}
document.addEventListener("visibilitychange", () => { if(tsBusy && document.visibilityState === "visible" && !tsWakeLock) tsWake(true); });

// ----- Discord -----
async function tsDiscordPost(url, payload){
  const post = body => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  let r; try{ r = await post(payload); }catch(_){ throw tsNetErr(); }
  if(r.status === 400){   // a forum channel wants a thread name
    let b = null; try{ b = await r.clone().json(); }catch(_){}
    if(b && b.code === 220001) r = await post(Object.assign({ thread_name: "AniList Triple Sync · " + new Date().toLocaleDateString() }, payload));
  }
  if(r.status === 429){ let ra = 2; try{ ra = (await r.clone().json()).retry_after || 2; }catch(_){} await tsSleep(Math.min(10, ra) * 1000); r = await post(payload); }
  if(!r.ok) throw new Error("Discord " + r.status);
}

// ----- problems that stay after the run (rejected or failed titles) -----
function tsStoreProblems(k, stats, okKeys){
  const keep = tsFails(k).filter(p => !okKeys.has(p.id + "|" + p.t) && !stats.problems.some(n => n.id === p.id && n.t === p.t));
  LSset("wn_ts_fail_" + k, keep.concat(stats.problems.map(p => ({ ...p, at: Date.now() }))).slice(-100));
}

// ----- a run -----
async function tsReadSource(src, K){
  let raw;
  try{ raw = await collection(src, K.type, "", TS_F); }
  catch(e){
    if(/User not found/i.test(e.message) && src.toLowerCase() !== (state.user || "").toLowerCase()) throw new Error("Couldn't read " + src + "'s " + K.label.toLowerCase() + " list. Check the spelling. Private lists can only be read for the account you are logged in with.");
    throw e;
  }
  const seen = new Set(), entries = [];
  for(const e of raw){ if(!e || !e.media || seen.has(e.mediaId)) continue; seen.add(e.mediaId); entries.push(e); }
  return entries;
}
async function tsRun(k, modeForFirst, opts = {}){
  if(tsBusy){ if(!opts.auto){ tsLogClear(); tsLog("A sync is already running. Wait for it to finish, or tap Stop."); } return false; }
  const K = TS_KINDS[k];
  if(!opts.auto){ tsSaveForm(); if(!opts.append) tsLogClear(); }
  const c = tsCfg(), src = tsSrcName(c), srcL = src.toLowerCase();
  if(!advancedOn()){ tsLog("Turn on Advanced features in App Settings first."); return false; }
  if(!src){ tsLog("Set a source AniList username first."); return false; }
  const targets = tsActive(c);
  if(tsTargets(c).includes("al") && !targets.includes("al")) tsLog("Skipping the target AniList: it is the same account as the source.");
  if(!targets.length){ tsLog("Connect a target AniList account or MyAnimeList first, and tick where to send."); return false; }
  tsSetBusy(true); tsStopFlag = false; await tsWake(true);
  const t0 = Date.now(), okKeys = new Set(), st = { sentAl: 0, sentMal: 0, same: 0, ahead: 0, skipped: 0, noMal: 0, adult: 0, rejected: 0, failed: 0, removed: 0, titles: [], problems: [] };
  let stopped = false, ran = false;
  try{
    tsLog((opts.preview ? "Preview: reading the " : "Reading the ") + K.label.toLowerCase() + " list of " + src + "…");
    const entries = await tsReadSource(src, K), mem0 = tsMem(k);
    const rec = tsReconcile(mem0, tsIdent(c, targets));
    rec.notes.forEach(n => tsLog(n));
    const media = rec.media, first = tsFirstTargets(media, targets), modes = {};
    if(opts.auto && first.length) return false;   // a first copy to an account is always started by hand
    for(const t of targets) modes[t] = first.includes(t) ? (modeForFirst || "baseline") : "delta";
    if(!entries.length && Object.keys(media).length) throw new Error("AniList returned an empty list for " + src + ", so nothing was changed.");
    const plan = tsPlanMulti(entries, media, targets, modes), work = plan.work, now = plan.now, gone = plan.removed;
    const needs = t => work.filter(w => w.need.includes(t));
    // ----- preview: say what would happen and stop -----
    if(opts.preview){
      tsLog(entries.length + " titles read. Nothing is sent in a preview.");
      for(const t of targets){
        const list = needs(t), tag = first.includes(t) ? " (first run: the whole list)" : "";
        let line = TS_NAMES[t] + tag + ": " + list.length + " title(s) would be " + (c.protect || !c.add ? "checked and sent if needed" : "sent");
        if(t === "mal"){ const none = list.filter(w => !(w.entry.media && w.entry.media.idMal)).length, adult = c.skipAdultMal ? list.filter(w => w.entry.media && w.entry.media.isAdult).length : 0; line += ". " + none + " have no MyAnimeList page" + (adult ? ", " + adult + " adult titles are skipped" : ""); }
        tsLog(line + ".");
      }
      if(gone.length) tsLog(gone.length + " title(s) are gone from the source. " + (c.remove ? "They would be removed from the targets." : "They would be forgotten, not removed."));
      ran = true; return true;
    }
    tsLog(entries.length + " titles read. " + (work.length ? work.length + " to send." : "Nothing to send.") + (first.length && modes[first[0]] === "baseline" ? " First run for " + first.map(t => TS_NAMES[t]).join(" and ") + ": remembering your list, sending nothing." : ""));
    let pend = [], i = 0;
    const save = lastRun => LSset("wn_ts_state_" + k, { v: 2, last_run: lastRun, src: srcL, ids: rec.ids, pend, media: now });
    if(c.remove) for(const r of gone) now[r.id] = media[r.id];   // titles waiting to be removed stay remembered until they really are removed
    const count = (t, res, title) => {
      if(res === "sent"){ if(t === "al") st.sentAl++; else st.sentMal++; if(st.titles.length < 60) st.titles.push(title + " → " + TS_NAMES[t]); }
      else if(res === "nomal") st.noMal++; else if(res in st) st[res]++;
    };
    let halt = false;
    for(const w of work){
      if(tsStopFlag){ stopped = true; break; }
      i++; const ms = now[w.id], title = (w.entry.media.title && (w.entry.media.title.english || w.entry.media.title.romaji)) || "#" + w.id;
      tsNote(K.label + ": sending " + i + " of " + work.length + "…");
      for(const t of ["al", "mal"]){
        if(halt || !w.need.includes(t)) continue;
        try{
          count(t, await (t === "al" ? tsPushAl : tsPushMal)(w.entry, k, ms, c), title);
          ms[t === "al" ? "a" : "m"] = w.fp; okKeys.add(w.id + "|" + t);
          await tsGap(t === "al" ? 700 : 350);
        }catch(e){
          const kind = tsErrKind(e);
          if(kind === "reject"){ st.rejected++; ms.rj = Object.assign({}, ms.rj, { [t]: w.fp }); st.problems.push({ id: w.id, title, t, msg: e.message, kind: "rejected" }); tsLog("Rejected by " + TS_NAMES[t] + ": " + title + " (" + e.message + "). It won't be retried until it changes."); }
          else if(kind === "transient"){ st.failed++; st.problems.push({ id: w.id, title, t, msg: e.message, kind: "failed" }); tsLog("Failed: " + title + " (" + e.message + "). It will be retried next time."); }
          else{ st.failed++; tsLog("Stopped. " + e.message); halt = true; stopped = true; }
        }
      }
      if(halt) break;
      if(i % 15 === 0) save(mem0.last_run || 0);
    }
    // ----- titles that are gone from the source -----
    if(!stopped && gone.length && c.remove){
      if(tsRemovalLooksWrong(gone.length, Object.keys(media).length) && !opts.forceRemove){
        pend = gone.map(r => r.id);
        tsLog(gone.length + " titles disappeared from the source at once, which looks wrong. Nothing was removed from the targets. Use the buttons under the log to remove them or to keep them.");
      }else{
        for(const r of gone){
          if(tsStopFlag){ stopped = true; break; }
          try{ await tsRemove(r, k, targets, c); delete now[r.id]; st.removed++; await tsGap(500); }
          catch(e){ st.failed++; tsLog("Couldn't remove #" + r.id + " (" + e.message + "). It will be tried again next time."); if(e.fatal || e.net){ tsLog("Stopped. " + e.message); stopped = true; break; } }
        }
      }
    }
    save(stopped ? (mem0.last_run || 0) : Date.now());   // a run that was stopped does not count as synced
    tsStoreProblems(k, st, okKeys);
    const seconds = Math.round((Date.now() - t0) / 1000);
    tsLog((stopped ? "Stopped. " : "Done. ") + (targets.includes("al") ? st.sentAl + " sent to AniList. " : "") + (targets.includes("mal") ? st.sentMal + " sent to MyAnimeList. " : "")
      + (st.same ? st.same + " already up to date. " : "") + (st.ahead ? st.ahead + " left alone (the target is further along). " : "") + (st.skipped ? st.skipped + " left alone (not on the target). " : "") + (st.noMal ? st.noMal + " have no MyAnimeList page. " : "") + (st.adult ? st.adult + " adult titles skipped. " : "")
      + (st.removed ? st.removed + " removed. " : "") + (st.rejected ? st.rejected + " rejected. " : "") + st.failed + " failed.");
    ran = !stopped;
    if(c.dcOn && c.dcUrl && tsWebhookOk(c.dcUrl)){
      const report = { kind: K.label, source: src, targets: targets.map(t => TS_NAMES[t]), ...st, titles: c.dcTitles ? st.titles : [], seconds, stopped };
      if(!(c.dcQuiet && tsQuiet(report))){
        try{ await tsDiscordPost(c.dcUrl, { username: "AniList Triple Sync", embeds: [tsReport(report)] }); tsLog("Report sent to Discord."); }
        catch(e){ tsLog("Couldn't post to Discord (" + e.message + ")."); }
      }
    }
  }catch(e){ tsLog("Sync stopped: " + e.message); }
  finally{ tsSetBusy(false); await tsWake(false); tsRenderStatus(); }
  return ran;
}
async function tsSeq(kinds, mode, opts = {}){
  for(let i = 0; i < kinds.length; i++){
    const ok = await tsRun(kinds[i], mode, Object.assign({ append: i > 0 }, opts));
    if(!ok) break;
  }
}
function tsStart(kinds, preview){
  if(tsBusy){ tsLogClear(); return tsLog("A sync is already running. Wait for it to finish, or tap Stop."); }
  tsSaveForm(); tsLogClear();
  if(!advancedOn()) return tsLog("Turn on Advanced features in App Settings first.");
  const c = tsCfg(), targets = tsActive(c);
  if(!targets.length) return tsLog(tsTargets(c).length ? "Skipping the target AniList: it is the same account as the source. Connect another account or MyAnimeList." : "Connect a target AniList account or MyAnimeList first, and tick where to send.");
  if(preview) return tsSeq(kinds, "all", { preview: true, append: true });
  const first = [...new Set(kinds.flatMap(k => tsFirstTargets(tsReconcile(tsMem(k), tsIdent(c, targets)).media, targets)))];   // a newly connected account counts as a first run too
  if(first.length) pickSheet("First sync to " + first.map(t => ({ al: "target AniList", mal: "MyAnimeList" })[t]).join(" and "), [["all", "Copy my whole list (never overwrites a title that is further along there)"], ["baseline", "Only send changes from now on"]], "", v => tsSeq(kinds, v, { append: true }));
  else tsSeq(kinds, "delta", { append: true });
}
async function maybeAutoSync(){
  if(!advancedOn()) return;
  const c = tsCfg(); if(!c.auto || !tsActive(c).length) return;
  for(const k of ["anime", "manga"]){
    const m = tsMem(k); if(!m.last_run) continue;   // the first run is always started by hand
    if(Date.now() - m.last_run > Math.max(1, Number(c.autoHours) || 3) * 3600 * 1000) await tsRun(k, "delta", { auto: true });
  }
}

// ----- titles waiting to be removed, and titles that had problems -----
async function tsPendingRemove(k){ await tsSeq([k], "delta", { forceRemove: true }); }
function tsPendingForget(k){
  const m = tsMem(k); for(const id of m.pend || []) delete (m.media || {})[id]; m.pend = [];
  LSset("wn_ts_state_" + k, m); tsRenderStatus();
}
function tsRetryProblems(){
  for(const k of ["anime", "manga"]){
    const m = tsMem(k); let changed = false;
    for(const p of tsFails(k)) if(m.media && m.media[p.id] && m.media[p.id].rj){ delete m.media[p.id].rj; changed = true; }
    if(changed) LSset("wn_ts_state_" + k, m);
    try{ localStorage.removeItem("wn_ts_fail_" + k); }catch(_){}
  }
  tsLogClear(); tsLog("Problem titles will be tried again on the next sync."); tsRenderStatus();
}
function tsRenderStatus(){
  const c = tsCfg(), line = k => { const m = tsMem(k); return TS_KINDS[k].label + ": " + (m.last_run ? new Date(m.last_run).toLocaleString() + " · " + Object.keys(m.media || {}).length + " titles remembered" : "never synced"); };
  const al = c.al && c.al.token, mal = c.mal && c.mal.access;
  $("#syncStatus").textContent = "Source: " + (c.source || state.user || "not set") + "\nTargets: " + ([al ? "AniList (" + c.al.user + ")" : "", mal ? "MyAnimeList (" + (c.mal.user || "connected") + ")" : ""].filter(Boolean).join(", ") || "none connected yet") + "\n" + line("anime") + "\n" + line("manga");
  $("#tsAlState").textContent = al ? "Connected as " + c.al.user + "." : "Not connected."; $("#tsAlForget").hidden = !al;
  $("#tsMalState").textContent = mal ? "Connected as " + (c.mal.user || "your account") + "." : "Not connected."; $("#tsMalForget").hidden = !mal;
  // titles waiting for a decision
  const pb = $("#syncPending"); pb.replaceChildren();
  for(const k of ["anime", "manga"]){
    const n = (tsMem(k).pend || []).length; if(!n) continue;
    const box = el("div", "tspend"), rm = el("button", "chip", "Remove them"), keep = el("button", "chip", "Keep them");
    box.append(el("p", "sub", TS_KINDS[k].label + ": " + n + " titles are gone from the source but are still on the targets. Remove them there too?"));
    rm.onclick = () => { if(rm.dataset.armed !== "1"){ rm.dataset.armed = "1"; rm.textContent = "Tap again to remove"; setTimeout(() => { rm.dataset.armed = ""; rm.textContent = "Remove them"; }, 4000); return; } tsPendingRemove(k); };
    keep.onclick = () => tsPendingForget(k);
    const row = el("div", "tsrow"); row.append(rm, keep); box.append(row); pb.append(box);
  }
  pb.hidden = !pb.childNodes.length;
  // problem titles
  const all = ["anime", "manga"].flatMap(k => tsFails(k).map(p => ({ ...p, k }))), list = $("#syncProblemList"); list.replaceChildren();
  $("#syncProblems").hidden = !all.length; $("#syncProblemsHead").textContent = "Problems (" + all.length + ")";
  for(const p of all.slice(-30).reverse()){ const r = el("div", "tsfail"); r.append(el("b", null, p.title), el("span", null, TS_KINDS[p.k].label + " · " + TS_NAMES[p.t] + " · " + (p.kind === "rejected" ? "rejected, not retried until it changes" : "failed, will retry") + " · " + p.msg)); list.append(r); }
}

// ----- the settings form -----
function tsFill(){
  const c = tsCfg(), al = c.al || {}, mal = c.mal || {};
  $("#tsSource").value = c.source || ""; $("#tsSource").placeholder = state.user || "your AniList username";
  $("#tsAlId").value = al.clientId || ""; $("#tsAlSecret").value = al.clientSecret || "";
  $("#tsMalId").value = mal.clientId || ""; $("#tsMalSecret").value = mal.clientSecret || ""; $("#tsMalRedirect").value = mal.redirect || "http://localhost";
  $("#tsDcUrl").value = c.dcUrl || ""; $("#tsDcOn").checked = !!c.dcOn; $("#tsDcQuiet").checked = !!c.dcQuiet; $("#tsDcTitles").checked = !!c.dcTitles;
  for(const [id, key] of [["#tsSendAl", "sendAl"], ["#tsSendMal", "sendMal"], ["#tsAdd", "add"], ["#tsProtect", "protect"], ["#tsRemove", "remove"], ["#tsSkipAdultMal", "skipAdultMal"], ["#tsAuto", "auto"]]) $(id).checked = !!c[key];
  $("#tsAutoHours").value = String(c.autoHours);
}
// Saves what the form shows. Called whenever something changes and before every sync, so the screen and the engine never disagree.
function tsSaveForm(){
  const c = tsRaw(), url = $("#tsDcUrl").value.trim();
  c.source = $("#tsSource").value.trim();
  c.al = Object.assign({}, c.al, { clientId: $("#tsAlId").value.trim(), clientSecret: $("#tsAlSecret").value.trim() });
  c.mal = Object.assign({}, c.mal, { clientId: $("#tsMalId").value.trim(), clientSecret: $("#tsMalSecret").value.trim(), redirect: $("#tsMalRedirect").value.trim() || "http://localhost" });
  if(!url || tsWebhookOk(url)) c.dcUrl = url; else tsLog("That isn't a Discord webhook link, so it was not saved.");
  c.dcOn = $("#tsDcOn").checked; c.dcQuiet = $("#tsDcQuiet").checked; c.dcTitles = $("#tsDcTitles").checked;
  for(const [id, key] of [["#tsSendAl", "sendAl"], ["#tsSendMal", "sendMal"], ["#tsAdd", "add"], ["#tsProtect", "protect"], ["#tsRemove", "remove"], ["#tsSkipAdultMal", "skipAdultMal"], ["#tsAuto", "auto"]]) c[key] = $(id).checked;
  c.autoHours = Number($("#tsAutoHours").value) || 3;
  LSset(TS_KEY, c);
}
function tsSetBusy(on){ tsBusy = on; for(const id of ["#syncNow", "#syncNowManga", "#syncBoth", "#syncPreview"]) $(id).disabled = on; $("#syncStop").hidden = !on; }
document.querySelectorAll("#setSync input:not(.tscode), #setSync select").forEach(x => x.addEventListener("change", () => { tsSaveForm(); tsRenderStatus(); }));

// ----- connecting the two accounts -----
function tsOpenUrl(u){ const B = isNative && nativePlugin("Browser"); if(B) B.open({ url: u }); else window.open(u, "_blank", "noopener"); }
function tsRand(n){ const ch = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~", a = new Uint8Array(n); crypto.getRandomValues(a); return Array.from(a, x => ch[x % ch.length]).join(""); }
$("#tsAlOpen").onclick = () => {
  tsLogClear(); const id = $("#tsAlId").value.trim();
  if(!id) return tsLog("Enter your AniList client ID first.");
  tsSaveForm(); tsOpenUrl("https://anilist.co/api/v2/oauth/authorize?client_id=" + encodeURIComponent(id) + "&redirect_uri=" + encodeURIComponent(TS_AL_PIN) + "&response_type=code");
  tsLog("Log in with the account you want to copy TO, then paste the code AniList shows.");
};
$("#tsAlConnect").onclick = async () => {
  tsLogClear(); tsSaveForm();
  const id = $("#tsAlId").value.trim(), secret = $("#tsAlSecret").value.trim(), { code } = tsParseCode($("#tsAlCode").value);
  if(!id || !secret) return tsLog("Enter the client ID and the client secret.");
  if(!code) return tsLog("Paste the code AniList showed you.");
  try{
    const r = await tsReq("https://anilist.co/api/v2/oauth/token", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ grant_type: "authorization_code", client_id: id, client_secret: secret, redirect_uri: TS_AL_PIN, code }) }, 1);
    const tok = r.body && r.body.access_token;
    if(!tok) throw new Error("AniList said: " + ((r.body && (r.body.hint || r.body.message || r.body.error)) || "no token") + ". Check the client ID, secret and redirect URL.");
    const v = (await tsAl("query{Viewer{id name}}", {}, tok)).Viewer, src = (tsCfg().source || state.user || "").toLowerCase();
    if(v.name.toLowerCase() === src) throw new Error("That is the same account as the source. Log in with the account you want to copy to.");
    tsPatch("al", { token: tok, user: v.name, userId: v.id }); $("#tsAlCode").value = ""; tsLog("Connected to AniList as " + v.name + ".");
  }catch(e){ tsLog("Couldn't connect: " + e.message); }
  tsRenderStatus();
};
$("#tsAlForget").onclick = () => { tsPatch("al", { token: "", user: "", userId: 0 }); tsLogClear(); tsLog("Target AniList disconnected."); tsRenderStatus(); };
$("#tsMalOpen").onclick = () => {
  tsLogClear(); const id = $("#tsMalId").value.trim(), redirect = $("#tsMalRedirect").value.trim() || "http://localhost";
  if(!id) return tsLog("Enter your MyAnimeList client ID first.");
  tsSaveForm(); const verifier = tsRand(64), st = tsRand(16);
  tsPatch("mal", { pending: { verifier, state: st, redirect } });   // the redirect used here is the one used to finish the login, even if the box is edited in between
  tsOpenUrl("https://myanimelist.net/v1/oauth2/authorize?response_type=code&client_id=" + encodeURIComponent(id) + "&code_challenge=" + verifier + "&code_challenge_method=plain&state=" + st + "&redirect_uri=" + encodeURIComponent(redirect));
  tsLog("Approve the app. You'll land on your redirect URL; copy that whole address (or just the code in it) and paste it below.");
};
$("#tsMalConnect").onclick = async () => {
  tsLogClear(); tsSaveForm();
  const c = tsCfg(), m = c.mal || {}, { code, state: st } = tsParseCode($("#tsMalCode").value);
  if(!m.clientId) return tsLog("Enter your MyAnimeList client ID first.");
  if(!code) return tsLog("Paste the link (or the code) MyAnimeList sent you back with.");
  if(!m.pending || !m.pending.verifier) return tsLog("Tap \"Open MyAnimeList login\" first, then paste what it sends back.");
  if(st && m.pending.state && st !== m.pending.state) return tsLog("That link doesn't belong to this login attempt. Open the login again and use the new link.");
  try{
    const form = { client_id: m.clientId, grant_type: "authorization_code", code, redirect_uri: m.pending.redirect || m.redirect || "http://localhost", code_verifier: m.pending.verifier }; if(m.clientSecret) form.client_secret = m.clientSecret;
    const r = await tsReq("https://myanimelist.net/v1/oauth2/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(form).toString() }, 1);
    if(!r.ok || !r.body || !r.body.access_token) throw new Error("MyAnimeList said: " + ((r.body && (r.body.message || r.body.error)) || "no token") + ". Check the client ID, secret and redirect URL.");
    tsPatch("mal", { access: r.body.access_token, refresh: r.body.refresh_token || "", expires: Date.now() + (r.body.expires_in || 2592000) * 1000, pending: null });
    const me = await tsMal("GET", "/users/@me"), name = me.ok && me.body && me.body.name;
    tsPatch("mal", { user: name || "", userId: (me.ok && me.body && me.body.id) || 0 }); $("#tsMalCode").value = ""; tsLog("Connected to MyAnimeList" + (name ? " as " + name : "") + ".");
  }catch(e){ tsLog("Couldn't connect: " + e.message); }
  tsRenderStatus();
};
$("#tsMalForget").onclick = () => { tsPatch("mal", { access: "", refresh: "", expires: 0, user: "", userId: 0, pending: null }); tsLogClear(); tsLog("MyAnimeList disconnected."); tsRenderStatus(); };
$("#tsDcTest").onclick = async () => {
  tsLogClear(); tsSaveForm(); const url = tsCfg().dcUrl;
  if(!url) return tsLog("Paste a Discord webhook link first.");
  try{ await tsDiscordPost(url, { username: "AniList Triple Sync", embeds: [{ title: "AniList Triple Sync", description: "This is a test message. Reports from your syncs will look like this.", color: 5763719, footer: { text: "What Next?" } }] }); tsLog("Test message sent to Discord."); }
  catch(e){ tsLog("Couldn't post to Discord (" + e.message + "). Check the webhook link."); }
};

$("#tsSave").onclick = () => { tsSaveForm(); tsLogClear(); tsLog("Settings saved on this device."); tsRenderStatus(); };
$("#tsReset").onclick = () => { for(const k of ["wn_ts_state_anime", "wn_ts_state_manga", "wn_ts_fail_anime", "wn_ts_fail_manga"]) try{ localStorage.removeItem(k); }catch(_){} tsRenderStatus(); $("#syncLog").hidden = true; };
$("#syncNow").onclick = () => tsStart(["anime"]);
$("#syncNowManga").onclick = () => tsStart(["manga"]);
$("#syncBoth").onclick = () => tsStart(["anime", "manga"]);
$("#syncPreview").onclick = () => tsStart(["anime", "manga"], true);
$("#syncStop").onclick = () => { tsStopFlag = true; tsLog("Stopping after this title…"); };
$("#syncRetry").onclick = tsRetryProblems;
$("#syncProblemsClear").onclick = () => { for(const k of ["anime", "manga"]) try{ localStorage.removeItem("wn_ts_fail_" + k); }catch(_){} tsRenderStatus(); };
