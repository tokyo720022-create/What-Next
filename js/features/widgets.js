/* js/features/widgets.js: the home screen widgets (Android): sends them a snapshot of your lists, opens the app from a tap, and the App Settings card to add them.
   The widgets themselves are drawn by the Kotlin add-on (native/kotlin/Wn*Widget.kt); what they show is worked out in widgets-math.js.
   The snapshot holds only titles, cover addresses, times and progress. It is cleared when you sign out. */
const WG_KEY = "wn_widgets", WG_DAYS = "wn_streak", WG_PICK = "wn_wg_pick";
const wgCfg = () => Object.assign({ adult: false }, LS(WG_KEY, {}) || {});
const wgPlugin = () => (isNative ? nativePlugin("WnWidget") : null);
const wgNow = () => Math.floor(Date.now() / 1000);

// ---- the days you changed something in the app, for the streak (the lists' own update times are added when they are loaded)
function wgNote(){
  const t = wgDay(wgNow()), days = LS(WG_DAYS, {}) || {}, list = Array.isArray(days.d) ? days.d : [];
  if(list.includes(t)) return;
  LSset(WG_DAYS, { d: list.concat(t).slice(-90) }); wgSoon(3000);
}
const wgOwnDays = () => { const d = LS(WG_DAYS, {}) || {}; return Array.isArray(d.d) ? d.d : []; };

// ---- today's pick: the last one Pick showed today, else the best candidate (kept for the day so it does not change on every update)
function wgPicked(e, p){
  try{
    const why = typeof pmWhy === "function" ? pmWhy(pmMem(), pmType(e), e, p, { time: state.time }, wgNow()) : [];
    LSset(WG_PICK, { day: wgDay(wgNow()), id: e.media.id, why: why.join(" · ") }); wgSoon(4000);
  }catch(_){}
}
function wgPickNow(){
  const kept = LS(WG_PICK, {}) || {}, today = wgDay(wgNow());
  let e = kept.day === today ? state.items.find(x => x.media.id === kept.id) : null, why = e ? kept.why : "";
  if(!e && typeof candidates === "function"){
    try{
      const c = candidates(false); e = c.length ? c[0].e : null;
      if(e){ const p = typeof plan === "function" ? plan(e) : {}; why = (typeof pmWhy === "function" ? pmWhy(pmMem(), pmType(e), e, p, { time: state.time }, wgNow()) : []).join(" · "); LSset(WG_PICK, { day: today, id: e.media.id, why }); }
    }catch(_){ e = null; }
  }
  return e ? { id: e.media.id, title: tt(e.media), cover: wgCover(e.media), why: why || "On your list" } : null;
}

// ---- the snapshot
function wgBuild(){
  const c = wgCfg(), L = typeof lists !== "undefined" ? lists : null;   // lists: your Anime and Manga lists, once they have been opened
  return wgSnapshot({ items: state.items, lists: { anime: (L && L.anime.entries) || [], manga: (L && L.manga.entries) || [] }, pick: wgPickNow(), days: wgOwnDays(), adult: !!c.adult, name: tt, now: wgNow() });
}
let wgTimer = 0, wgLast = "";
function wgSoon(delay){ clearTimeout(wgTimer); wgTimer = setTimeout(() => { wgPush().catch(() => {}); }, delay == null ? 15000 : delay); }
async function wgPush(){
  const P = wgPlugin(); if(!P || !auth.token || !state.items) return;
  const snap = wgBuild(), json = JSON.stringify(snap), key = JSON.stringify(Object.assign({}, snap, { at: 0 }));
  if(key === wgLast) return;   // nothing changed: the widgets already show this
  await P.update({ json }); wgLast = key;
}
function wgForget(){
  wgLast = ""; clearTimeout(wgTimer);
  const P = wgPlugin(); if(P) try{ P.clear().catch(() => {}); }catch(_){}
}

// ---- a tap on a widget opens the app on whatnext://media/123, whatnext://pick or whatnext://schedule
let wgWant = null;
function wgGo(){
  if(!wgWant || !nfReady || !auth.token) return;
  const w = wgWant; wgWant = null;
  if(w.kind === "media") openMedia(w.id); else showTab(w.kind);
}
function wgOpenUrl(url){
  const m = /^whatnext:\/\/(?:media\/(\d{1,9})|(pick|schedule))\/?$/i.exec(String(url || ""));
  if(!m) return false;
  wgWant = m[1] ? { kind: "media", id: Number(m[1]) } : { kind: m[2].toLowerCase() }; wgGo(); return true;
}

// ---- App Settings > Home screen widgets
const WG_KINDS = { wgPinAiring: "airing", wgPinContinue: "continue", wgPinUpdates: "updates", wgPinStreak: "streak", wgPinPick: "pick" };
async function wgFill(){
  const P = wgPlugin(), has = !!P;
  for(const id in WG_KINDS) $("#" + id).hidden = !has;
  $("#wgAdult").checked = !!wgCfg().adult; $("#wgAdultRow").hidden = !has;
  const st = $("#wgState");
  if(!has){ st.textContent = "Widgets are available in the Android app (the build with its add-on)."; return; }
  let n = 0; try{ const s = await P.status(); n = Object.keys(WG_KINDS).reduce((a, id) => a + (Number(s[WG_KINDS[id]]) || 0), 0); }catch(_){}
  st.textContent = n ? n + (n === 1 ? " widget is" : " widgets are") + " on your home screen." : "Tap one below, or long-press your home screen > Widgets > What Next?.";
}
for(const id in WG_KINDS) $("#" + id).onclick = async () => {
  const P = wgPlugin(); if(!P) return;
  try{
    const r = await P.pin({ kind: WG_KINDS[id] });
    toast(r && r.ok ? "Choose where to put it." : "Your launcher does not let apps add widgets. Long-press the home screen > Widgets > What Next?.", 5000);
    wgSoon(500);
  }catch(_){ toast("Couldn't add the widget."); }
};
$("#wgAdult").onchange = () => { LSset(WG_KEY, Object.assign(wgCfg(), { adult: $("#wgAdult").checked })); wgLast = ""; wgSoon(500); };
