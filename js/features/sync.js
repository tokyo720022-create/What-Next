/* js/features/sync.js: AniList Triple Sync (Settings > AniList Triple Sync, switched on in App Settings > Advanced).
   Source AniList list -> a target AniList account + MyAnimeList. The maths is in triple-math.js. */
// ---------- AniList Triple Sync ----------
const TS_KEY = "wn_ts", TS_AL_PIN = "https://anilist.co/api/v2/oauth/pin";
const TS_KINDS = { anime: { type: "ANIME", label: "Anime", mal: "anime" }, manga: { type: "MANGA", label: "Manga", mal: "manga" } };
const TS_F = "mediaId status progress progressVolumes repeat private notes score(format:POINT_100) startedAt{year month day} completedAt{year month day} updatedAt media{id idMal title{romaji english}}";
const TS_AL_SAVE = "mutation($mediaId:Int,$status:MediaListStatus,$progress:Int,$progressVolumes:Int,$scoreRaw:Int,$repeat:Int,$private:Boolean,$notes:String,$startedAt:FuzzyDateInput,$completedAt:FuzzyDateInput){SaveMediaListEntry(mediaId:$mediaId,status:$status,progress:$progress,progressVolumes:$progressVolumes,scoreRaw:$scoreRaw,repeat:$repeat,private:$private,notes:$notes,startedAt:$startedAt,completedAt:$completedAt){id}}";
const TS_AL_FIND = "query($m:Int,$u:Int){MediaList(mediaId:$m,userId:$u){id}}";
const TS_AL_DELETE = "mutation($id:Int){DeleteMediaListEntry(id:$id){deleted}}";
const tsSleep = ms => new Promise(r => setTimeout(r, ms));
const tsGap = ms => tsSleep(window.__tsGap != null ? window.__tsGap : ms);   // the pause between sends keeps AniList (90 a minute) and MyAnimeList happy; tests shorten it
let tsBusy = false, tsStopFlag = false;
const tsCfg = () => LS(TS_KEY, {}) || {};
const tsPatch = (group, o) => { const c = tsCfg(); c[group] = Object.assign({}, c[group], o); LSset(TS_KEY, c); };
const tsMem = k => LS("wn_ts_state_" + k, {}) || {};
const tsLog = t => { const p = $("#syncLog"); p.hidden = false; p.textContent += t + "\n"; p.scrollTop = p.scrollHeight; };
const tsLogClear = () => { $("#syncLog").textContent = ""; };
const tsTargets = c => [c.sendAl !== false && c.al && c.al.token ? "al" : "", c.sendMal !== false && c.mal && c.mal.access ? "mal" : ""].filter(Boolean);

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
    return { status: r.status, ok: r.ok, body };
  }
}
const tsFatal = msg => { const e = new Error(msg); e.fatal = true; return e; };
async function tsAl(query, vars, token){
  const r = await tsReq("https://graphql.anilist.co", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: "Bearer " + token }, body: JSON.stringify({ query, variables: vars }) });
  const b = r.body && typeof r.body === "object" ? r.body : {}, err = b.errors && b.errors[0];
  if(r.status === 401 || (err && /invalid token/i.test(err.message || ""))) throw tsFatal("The target AniList login has expired. Connect it again.");
  if(err){ const e = new Error(err.message || "AniList error"); e.status = err.status || r.status; throw e; }
  if(!r.ok) throw new Error("AniList " + r.status);
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
    if(r.status === 401 && n === 0){ await tsMalRefresh(); m = tsCfg().mal; continue; }
    return r;
  }
}

// ----- sending one title -----
async function tsPushAl(it, k, ms, c){
  if(!c.add && !ms.e){   // "add titles that aren't on the target yet" is off: only update ones that are already there
    let found = null;
    try{ found = (await tsAl(TS_AL_FIND, { m: it.mediaId, u: c.al.userId }, c.al.token)).MediaList; }
    catch(e){ if(e.fatal || e.net || (e.status && e.status !== 404)) throw e; }
    if(!found) return "skipped";
    ms.e = found.id;
  }
  const d = await tsAl(TS_AL_SAVE, tsAlVars(it, TS_KINDS[k].type), c.al.token);
  ms.e = d.SaveMediaListEntry.id; return "sent";
}
async function tsPushMal(it, k, ms, c){
  const id = it.media && it.media.idMal, kind = TS_KINDS[k].mal;
  if(!id) return "nomal";
  if(!c.add && !ms.x){
    const r = await tsMal("GET", "/" + kind + "/" + id + "?fields=my_list_status");
    if(!(r.ok && r.body && r.body.my_list_status && r.body.my_list_status.status)) return "skipped";
    ms.x = 1;
  }
  const r = await tsMal("PUT", "/" + kind + "/" + id + "/my_list_status", tsMalFields(it, TS_KINDS[k].type, !!ms.m));
  if(r.status === 404) return "nomal";   // MyAnimeList doesn't know this id
  if(!r.ok) throw new Error("MyAnimeList " + r.status + (r.body && r.body.message ? ": " + r.body.message : ""));
  return "sent";
}
async function tsRemove(r, k, targets, c){
  if(targets.includes("al") && r.a){
    let id = r.e;
    if(!id){ try{ const d = await tsAl(TS_AL_FIND, { m: Number(r.id), u: c.al.userId }, c.al.token); id = d.MediaList && d.MediaList.id; }catch(e){ if(e.fatal || e.net) throw e; } }
    if(id) await tsAl(TS_AL_DELETE, { id }, c.al.token);
  }
  if(targets.includes("mal") && r.m && r.i){
    const x = await tsMal("DELETE", "/" + TS_KINDS[k].mal + "/" + r.i + "/my_list_status");
    if(!x.ok && x.status !== 404) throw new Error("MyAnimeList " + x.status);
  }
}

// ----- a run -----
function tsRenderStatus(){
  const c = tsCfg(), line = k => { const m = tsMem(k); return TS_KINDS[k].label + ": " + (m.last_run ? new Date(m.last_run).toLocaleString() + " · " + Object.keys(m.media || {}).length + " titles remembered" : "never synced"); };
  const al = c.al && c.al.token, mal = c.mal && c.mal.access;
  $("#syncStatus").textContent = "Source: " + (c.source || state.user || "not set") + "\nTargets: " + ([al ? "AniList (" + c.al.user + ")" : "", mal ? "MyAnimeList (" + (c.mal.user || "connected") + ")" : ""].filter(Boolean).join(", ") || "none connected yet") + "\n" + line("anime") + "\n" + line("manga");
  $("#tsAlState").textContent = al ? "Connected as " + c.al.user + "." : "Not connected."; $("#tsAlForget").hidden = !al;
  $("#tsMalState").textContent = mal ? "Connected as " + (c.mal.user || "your account") + "." : "Not connected."; $("#tsMalForget").hidden = !mal;
}
function tsFill(){
  const c = tsCfg(), al = c.al || {}, mal = c.mal || {};
  $("#tsSource").value = c.source || ""; $("#tsSource").placeholder = state.user || "your AniList username";
  $("#tsAlId").value = al.clientId || ""; $("#tsAlSecret").value = al.clientSecret || "";
  $("#tsMalId").value = mal.clientId || ""; $("#tsMalSecret").value = mal.clientSecret || ""; $("#tsMalRedirect").value = mal.redirect || "http://localhost";
  $("#tsSendAl").checked = c.sendAl !== false; $("#tsSendMal").checked = c.sendMal !== false; $("#tsAdd").checked = c.add !== false;
  $("#tsRemove").checked = !!c.remove; $("#tsAuto").checked = !!c.auto;
}
function tsSaveForm(){
  const c = tsCfg(); c.source = $("#tsSource").value.trim();
  c.al = Object.assign({}, c.al, { clientId: $("#tsAlId").value.trim(), clientSecret: $("#tsAlSecret").value.trim() });
  c.mal = Object.assign({}, c.mal, { clientId: $("#tsMalId").value.trim(), clientSecret: $("#tsMalSecret").value.trim(), redirect: $("#tsMalRedirect").value.trim() || "http://localhost" });
  c.sendAl = $("#tsSendAl").checked; c.sendMal = $("#tsSendMal").checked; c.add = $("#tsAdd").checked; c.remove = $("#tsRemove").checked; c.auto = $("#tsAuto").checked;
  LSset(TS_KEY, c);
}
function tsSetBusy(on){ tsBusy = on; $("#syncNow").disabled = on; $("#syncNowManga").disabled = on; $("#syncStop").hidden = !on; }

async function tsRun(k, modeForFirst){
  if(tsBusy) return;
  const c = tsCfg(), targets = tsTargets(c), src = (c.source || state.user || "").trim(), K = TS_KINDS[k];
  tsLogClear();
  if(!advancedOn()) return tsLog("Turn on Advanced features in App Settings first.");
  if(!src) return tsLog("Set a source AniList username first.");
  if(!targets.length) return tsLog("Connect a target AniList account or MyAnimeList first, and tick where to send.");
  tsSetBusy(true); tsStopFlag = false;
  const mem = tsMem(k), media = mem.media || {}, first = tsFirstTargets(media, targets), modes = {};
  for(const t of targets) modes[t] = first.includes(t) ? (modeForFirst || "baseline") : "delta";
  let sentAl = 0, sentMal = 0, skipped = 0, noMal = 0, failed = 0, stopped = false;
  try{
    tsLog("Reading " + K.label.toLowerCase() + " list of " + src + "…");
    const raw = await collection(src, K.type, "", TS_F), seen = new Set(), entries = [];
    for(const e of raw){ if(!e || !e.media || seen.has(e.mediaId)) continue; seen.add(e.mediaId); entries.push(e); }
    if(!entries.length && Object.keys(media).length) throw new Error("AniList returned an empty list for " + src + ", so nothing was changed.");
    const plan = tsPlanMulti(entries, media, targets, modes), work = plan.work, now = plan.now;
    const names = { al: "target AniList", mal: "MyAnimeList" };
    tsLog(entries.length + " titles read. " + (work.length ? work.length + " to send." : "Nothing to send.") + (first.length && modes[first[0]] === "baseline" ? " First run for " + first.map(t => names[t]).join(" and ") + ": remembering your list, sending nothing." : ""));
    const save = () => LSset("wn_ts_state_" + k, { v: 1, last_run: mem.last_run || 0, media: now });
    let i = 0;
    for(const w of work){
      if(tsStopFlag){ stopped = true; break; }
      i++; const ms = now[w.id], title = (w.entry.media.title && (w.entry.media.title.english || w.entry.media.title.romaji)) || "#" + w.id;
      $("#syncStatus").textContent = K.label + ": sending " + i + " of " + work.length + "…";
      try{
        if(w.need.includes("al")){ const r = await tsPushAl(w.entry, k, ms, c); if(r === "sent") sentAl++; else skipped++; ms.a = w.fp; await tsGap(700); }
        if(w.need.includes("mal")){ const r = await tsPushMal(w.entry, k, ms, c); if(r === "sent") sentMal++; else if(r === "nomal") noMal++; else skipped++; ms.m = w.fp; await tsGap(350); }
      }catch(e){
        failed++; tsLog("Failed: " + title + " (" + e.message + ")");
        if(e.fatal || e.net){ tsLog("Stopped. " + e.message); stopped = true; break; }
      }
      if(i % 15 === 0) save();
    }
    // titles that are gone from the source
    let removed = 0;
    if(!stopped && plan.removed.length){
      if(c.remove && !tsRemovalLooksWrong(plan.removed.length, Object.keys(media).length)){
        for(const r of plan.removed){ try{ await tsRemove(r, k, targets, c); removed++; await tsGap(500); }catch(e){ failed++; tsLog("Couldn't remove #" + r.id + " (" + e.message + ")"); if(e.fatal || e.net){ stopped = true; break; } } }
      }else if(c.remove){ tsLog(plan.removed.length + " titles disappeared from the source, which looks wrong. Nothing was removed from the targets. Check the source username."); for(const r of plan.removed) now[r.id] = { ...(media[r.id] || {}), keep: 1 }; }
    }
    LSset("wn_ts_state_" + k, { v: 1, last_run: Date.now(), media: now });
    tsLog((stopped ? "Stopped. " : "Done. ") + (targets.includes("al") ? sentAl + " sent to AniList. " : "") + (targets.includes("mal") ? sentMal + " sent to MyAnimeList. " : "") + (skipped ? skipped + " left alone (not on the target). " : "") + (noMal ? noMal + " have no MyAnimeList page. " : "") + (removed ? removed + " removed. " : "") + failed + " failed.");
  }catch(e){ tsLog("Sync stopped: " + e.message); }
  finally{ tsSetBusy(false); tsRenderStatus(); }
}
function tsStart(k){
  if(tsBusy) return;
  if(!advancedOn()){ tsLogClear(); return tsLog("Turn on Advanced features in App Settings first."); }
  const c = tsCfg(), targets = tsTargets(c);
  if(!targets.length){ tsLogClear(); return tsLog("Connect a target AniList account or MyAnimeList first, and tick where to send."); }
  const first = tsFirstTargets(tsMem(k).media || {}, targets), names = { al: "target AniList", mal: "MyAnimeList" };
  if(first.length) pickSheet("First sync to " + first.map(t => names[t]).join(" and "), [["all", "Copy my whole list (overwrites matching titles there)"], ["baseline", "Only send changes from now on"]], "", v => tsRun(k, v));
  else tsRun(k, "delta");
}
async function maybeAutoSync(){
  if(!advancedOn()) return;
  const c = tsCfg(); if(!c.auto || !tsTargets(c).length) return;
  for(const k of ["anime", "manga"]){
    const m = tsMem(k); if(!m.last_run) continue;   // the first run is always started by hand
    if(Date.now() - m.last_run > 3 * 3600 * 1000) await tsRun(k, "delta");
  }
}

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
  tsPatch("mal", { pending: { verifier, state: st } });
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
    const form = { client_id: m.clientId, grant_type: "authorization_code", code, redirect_uri: m.redirect || "http://localhost", code_verifier: m.pending.verifier }; if(m.clientSecret) form.client_secret = m.clientSecret;
    const r = await tsReq("https://myanimelist.net/v1/oauth2/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(form).toString() }, 1);
    if(!r.ok || !r.body || !r.body.access_token) throw new Error("MyAnimeList said: " + ((r.body && (r.body.message || r.body.error)) || "no token") + ". Check the client ID, secret and redirect URL.");
    tsPatch("mal", { access: r.body.access_token, refresh: r.body.refresh_token || "", expires: Date.now() + (r.body.expires_in || 2592000) * 1000, pending: null });
    const me = await tsMal("GET", "/users/@me"); const name = me.ok && me.body && me.body.name;
    tsPatch("mal", { user: name || "" }); $("#tsMalCode").value = ""; tsLog("Connected to MyAnimeList" + (name ? " as " + name : "") + ".");
  }catch(e){ tsLog("Couldn't connect: " + e.message); }
  tsRenderStatus();
};
$("#tsMalForget").onclick = () => { tsPatch("mal", { access: "", refresh: "", expires: 0, user: "", pending: null }); tsLogClear(); tsLog("MyAnimeList disconnected."); tsRenderStatus(); };

$("#tsSave").onclick = () => { tsSaveForm(); tsLogClear(); tsLog("Settings saved on this device."); tsRenderStatus(); };
$("#tsReset").onclick = () => { try{ localStorage.removeItem("wn_ts_state_anime"); localStorage.removeItem("wn_ts_state_manga"); }catch(_){} tsRenderStatus(); $("#syncLog").hidden = true; };
$("#syncNow").onclick = () => tsStart("anime");
$("#syncNowManga").onclick = () => tsStart("manga");
$("#syncStop").onclick = () => { tsStopFlag = true; tsLog("Stopping after this title…"); };
