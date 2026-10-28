/* js/features/calendar.js: Airing calendar. A month grid of posters and a week list you can mark episodes in. */
// ---------- Calendar ----------
const CZ_Q = "query($p:Int,$from:Int,$to:Int){Page(page:$p,perPage:50){pageInfo{hasNextPage} airingSchedules(airingAt_greater:$from,airingAt_lesser:$to,sort:TIME){id airingAt episode media{id type format episodes isAdult season seasonYear title{romaji english native} countryOfOrigin coverImage{medium large} bannerImage mediaListEntry{status progress repeat startedAt{year month day} completedAt{year month day}}}}}}";
const cz = { month: new Date(), sel: new Date(), view: "month", chip: "all", onlyList: false, onlySeason: false, adult: false, items: [], cache: [], token: 0 };
cz.month = new Date(cz.month.getFullYear(), cz.month.getMonth(), 1);
try{ const s = JSON.parse(localStorage.getItem("wn_cz") || "null"); if(s){ cz.view = s.view === "list" ? "list" : "month"; cz.onlyList = !!s.onlyList; cz.onlySeason = !!s.onlySeason; cz.adult = !!s.adult; } }catch(_){}
const czSave = () => { try{ localStorage.setItem("wn_cz", JSON.stringify({ view: cz.view, onlyList: cz.onlyList, onlySeason: cz.onlySeason, adult: cz.adult })); }catch(_){} };
const czDay = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const czAdd = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const czMon = d => czAdd(czDay(d), -((d.getDay() + 6) % 7));
const czSame = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const czTs = d => Math.floor(d.getTime() / 1000);
const czMonthName = d => d.toLocaleDateString([], { month: "long" });
const czTime = at => new Date(at * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const CZ_ICON_GRID = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3.5" y="3.5" width="17" height="17" rx="2.5"/><path d="M3.5 9.5h17M3.5 15h17M9.5 3.5v17M15 3.5v17"/></svg>';
const CZ_ICON_LIST = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3.5" y="3.5" width="17" height="17" rx="2.5"/><path d="M3.5 9h17M3.5 14.5h17"/></svg>';
function czWhen(at){
  const diff = at - Date.now() / 1000, a = Math.abs(diff), n = a < 3600 ? Math.max(1, Math.round(a / 60)) : a < 86400 ? Math.round(a / 3600) : Math.round(a / 86400);
  const unit = a < 3600 ? "minute" : a < 86400 ? "hour" : "day", txt = n + " " + unit + (n === 1 ? "" : "s");
  return diff >= 0 ? "in " + txt : txt + " ago";
}
function czRange(){
  if(cz.view === "list"){ const start = czMon(cz.sel); return { start, end: czAdd(start, 7), rows: 1 }; }
  const first = new Date(cz.month.getFullYear(), cz.month.getMonth(), 1), days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const rows = Math.ceil(((first.getDay() + 6) % 7 + days) / 7), start = czMon(first);
  return { start, end: czAdd(start, rows * 7), rows };
}
function czFiltered(){
  const now = new Date(), season = curSeason(now), year = now.getFullYear();
  return cz.items.filter(x => {
    const m = x.media, st = m.mediaListEntry && m.mediaListEntry.status;
    if(!cz.adult && m.isAdult) return false;
    if(cz.onlyList && !["CURRENT", "PLANNING", "REPEATING"].includes(st)) return false;
    if(cz.onlySeason && !(m.season === season && m.seasonYear === year)) return false;
    if(cz.chip === "premiere" && x.episode !== 1) return false;
    if(cz.chip === "finale" && !(m.episodes && x.episode === m.episodes)) return false;
    return true;
  });
}

// ----- header -----
function czHeader(){
  const d = cz.view === "list" ? cz.sel : cz.month, today = new Date();
  $("#czMonth").textContent = czMonthName(d); $("#czYear").textContent = String(d.getFullYear());
  $("#czTodayNum").textContent = String(today.getDate());
  $("#czView").innerHTML = cz.view === "month" ? CZ_ICON_GRID : CZ_ICON_LIST;
  document.querySelectorAll("#calendar .czchips .chip").forEach(c => c.setAttribute("aria-pressed", String(c.dataset.c === cz.chip)));
  const n = [cz.onlyList, cz.onlySeason, cz.adult].filter(Boolean).length; $("#czFilterN").hidden = !n; $("#czFilterN").textContent = n;
}

// ----- month grid -----
function czMonthView(r, byDay){
  const box = el("div", "czmonth"), head = el("div", "czwd"), mon = czMon(new Date());
  for(let i = 0; i < 7; i++) head.append(el("span", null, czAdd(mon, i).toLocaleDateString([], { weekday: "short" })));
  const grid = el("div", "czcells"), today = new Date();
  for(let i = 0; i < r.rows * 7; i++){
    const d = czAdd(r.start, i), list = byDay.get(dayKey(d)) || [], c = el("button", "czcell" + (d.getMonth() !== cz.month.getMonth() ? " dim" : "") + (czSame(d, today) ? " today" : ""));
    c.dataset.day = dayKey(d); c.setAttribute("aria-label", d.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" }) + ", " + list.length + " episodes");
    c.append(el("b", null, String(d.getDate())));
    const posters = el("div", "czposters");
    for(const x of list.slice(0, 4)){ const im = el("img"); im.src = (x.media.coverImage && (x.media.coverImage.medium || x.media.coverImage.large)) || ""; im.alt = ""; im.loading = "lazy"; posters.append(im); }
    c.append(posters); if(list.length > 4) c.append(el("span", "czmore", "+" + (list.length - 4)));
    c.onclick = () => { cz.sel = d; cz.view = "list"; czSave(); czLoad(); };
    grid.append(c);
  }
  box.append(head, grid); return box;
}

// ----- week list -----
function czCheck(x, foot){
  const m = x.media, e = m.mediaListEntry, st = e && e.status; foot.replaceChildren();
  if(!(st === "CURRENT" || st === "REPEATING")) return;
  const done = (e.progress || 0) >= x.episode, aired = x.airingAt * 1000 <= Date.now();
  if(done){ const b = el("button", "czchk on", "✓"); b.disabled = true; b.setAttribute("aria-label", "Episode " + x.episode + " is marked as watched"); foot.append(b); return; }
  if(!aired || (e.progress || 0) < x.episode - 1) return;   // only the next episode you can watch
  const b = el("button", "czchk", "✓"); b.setAttribute("aria-label", "Mark episode " + x.episode + " as watched");
  b.onclick = async ev => {
    ev.stopPropagation(); b.disabled = true;
    const patch = trackRules({ status: e.status, progress: e.progress || 0, repeat: e.repeat || 0, startedAt: e.startedAt, completedAt: e.completedAt }, m.episodes || 0, { progress: x.episode });   // same start and finish rules as everywhere else
    const r = await trackSave(m.id, "anime", patch, { quiet: true });
    if(r.ok || r.queued){ for(const y of cz.items) if(y.media.id === m.id && y.media.mediaListEntry) y.media.mediaListEntry.progress = x.episode; czCheck(x, foot); toast("Episode " + x.episode + " marked as watched"); }
    else { b.disabled = false; toast("Couldn't save: " + ((r.error && r.error.message) || "error")); }
  };
  foot.append(b);
}
function czCard(x){
  const m = x.media, c = el("div", "czc"), im = el("div", "czimg"), img = el("img"), st = m.mediaListEntry && m.mediaListEntry.status;
  img.src = safeUrl(m.bannerImage) || (m.coverImage && (m.coverImage.large || m.coverImage.medium)) || ""; img.alt = ""; img.loading = "lazy";
  im.append(img, el("span", "czpill", czTime(x.airingAt)));
  if(st){ const dot = el("i", "czdot s-" + st); dot.title = (ST_LABEL[st] || [st, st])[0]; im.append(dot); }
  const row = el("div", "czrow"), txt = el("div", "cztxt"), foot = el("div", "czfoot");
  const t = el("b", null, tt(m)); const sub = el("small", null, "E" + x.episode + " · " + (appCfg().relative ? czWhen(x.airingAt) : ((st && (ST_LABEL[st] || [st, st])[0]) || norm(m.format) || "TV")));
  txt.append(t, sub); row.append(txt, foot); czCheck(x, foot);
  c.append(im, row); c.onclick = ev => { if(!ev.target.closest("button")) openMedia(m.id); }; return c;
}
function czWeekView(r, byDay){
  const box = el("div"), strip = el("div", "czweek"), today = new Date(), secs = [];
  for(let i = 0; i < 7; i++){
    const d = czAdd(r.start, i), list = byDay.get(dayKey(d)) || [], on = czSame(d, cz.sel);
    const b = el("button", "czday" + (on ? " on" : "") + (czSame(d, today) ? " today" : "")); b.dataset.day = dayKey(d);
    b.append(el("span", null, d.toLocaleDateString([], { weekday: "short" })), el("b", null, String(d.getDate())), el("span", null, d.toLocaleDateString([], { month: "short" })), el("em", null, "▦ +" + list.length));
    const sec = el("div", "czsec"); sec.dataset.day = dayKey(d);
    const h = el("h3", "czh" + (on ? " on" : ""), d.toLocaleDateString([], { weekday: "long" }) + ", " + d.getDate() + " " + d.toLocaleDateString([], { month: "short" })); sec.append(h);
    if(list.length){ const g = el("div", "czgrid"); for(const x of list) g.append(czCard(x)); sec.append(g); } else sec.append(el("p", "sub", "Nothing airs on this day."));
    b.onclick = () => { cz.sel = d; czSave(); czHeader(); strip.querySelectorAll(".czday").forEach(z => z.classList.toggle("on", z === b)); box.querySelectorAll(".czh").forEach(z => z.classList.toggle("on", z.parentNode === sec)); window.scrollTo({ top: Math.max(0, sec.getBoundingClientRect().top + window.scrollY - 160), behavior: "smooth" }); };
    strip.append(b); secs.push(sec);
  }
  box.append(strip, ...secs); return box;
}

// ----- loading -----
function czRender(){
  const r = czRange(), byDay = new Map();
  for(const x of czFiltered().sort((a, b) => a.airingAt - b.airingAt)){ const k = dayKey(new Date(x.airingAt * 1000)); if(!byDay.has(k)) byDay.set(k, []); byDay.get(k).push(x); }
  const body = $("#czBody"); body.replaceChildren(cz.view === "month" ? czMonthView(r, byDay) : czWeekView(r, byDay)); czHeader();
  if(cz.view === "list"){ const sec = body.querySelector('.czsec[data-day="' + dayKey(cz.sel) + '"]'); if(sec) requestAnimationFrame(() => window.scrollTo({ top: Math.max(0, sec.getBoundingClientRect().top + window.scrollY - 160) })); }
}
async function czLoad(){
  const r = czRange(), from = czTs(r.start) - 1, to = czTs(r.end), token = ++cz.token; czHeader();
  const hit = cz.cache.find(c => c.from <= from && c.to >= to && Date.now() - c.at < 300000);
  if(hit){ cz.items = hit.items.filter(x => x.airingAt > from && x.airingAt < to); czRender(); return; }
  $("#czBody").replaceChildren(el("div", "msg", "Loading the schedule…"));
  try{
    const all = [];
    for(let p = 1; p <= 14; p++){
      const { json } = await gql(CZ_Q, { p, from, to }), pg = json.data && json.data.Page;
      if(!pg) throw new Error((json.errors && json.errors[0] && json.errors[0].message) || "No data");
      if(token !== cz.token) return; all.push(...pg.airingSchedules); if(!pg.pageInfo.hasNextPage) break;
    }
    cz.cache = cz.cache.filter(c => Date.now() - c.at < 300000).slice(-3); cz.cache.push({ from, to, at: Date.now(), items: all }); cz.items = all; czRender();
  }catch(err){ if(token !== cz.token) return; $("#czBody").replaceChildren(dxEmpty(/Failed to fetch|NetworkError|Load failed/i.test(err.message) ? "Couldn't reach AniList. Check your connection." : err.message, czLoad)); }
}

// ----- controls -----
$("#czPrev").onclick = () => czStep(-1); $("#czNext").onclick = () => czStep(1);
function czStep(n){
  if(cz.view === "list"){ cz.sel = czAdd(cz.sel, 7 * n); cz.month = new Date(cz.sel.getFullYear(), cz.sel.getMonth(), 1); }
  else { cz.month = new Date(cz.month.getFullYear(), cz.month.getMonth() + n, 1); }
  czLoad();
}
$("#czTodayBtn").onclick = () => { cz.sel = new Date(); cz.month = new Date(cz.sel.getFullYear(), cz.sel.getMonth(), 1); czLoad(); };
$("#czView").onclick = () => {
  if(cz.view === "month"){ if(!(cz.sel.getFullYear() === cz.month.getFullYear() && cz.sel.getMonth() === cz.month.getMonth())) cz.sel = new Date(cz.month); cz.view = "list"; }
  else { cz.month = new Date(cz.sel.getFullYear(), cz.sel.getMonth(), 1); cz.view = "month"; }
  czSave(); czLoad();
};
document.querySelector("#calendar .czchips").addEventListener("click", ev => { const b = ev.target.closest(".chip"); if(!b) return; cz.chip = b.dataset.c; czHeader(); czRender(); });
$("#czTitle").onclick = () => {
  let y = (cz.view === "list" ? cz.sel : cz.month).getFullYear(); const sh = el("div", "dsheet"), box = el("div", "dsheetbox"), yr = el("div", "czyear"), grid = el("div", "czmonths");
  const draw = () => { yr.replaceChildren(); const p = el("button", "rmicon", "‹"), n = el("button", "rmicon", "›"); p.onclick = () => { y--; draw(); }; n.onclick = () => { y++; draw(); }; yr.append(p, el("b", null, String(y)), n);
    grid.replaceChildren(); for(let m = 0; m < 12; m++){ const b = el("button", "chip", new Date(2000, m, 1).toLocaleDateString([], { month: "short" })); b.setAttribute("aria-pressed", String(y === cz.month.getFullYear() && m === cz.month.getMonth()));
      b.onclick = () => { sh.remove(); cz.month = new Date(y, m, 1); cz.sel = new Date(y, m, czSame(new Date(), cz.month) ? new Date().getDate() : 1); czLoad(); }; grid.append(b); } };
  draw(); box.append(el("div", "dgrip"), el("h3", null, "Choose a month"), yr, grid); sh.onclick = e => { if(e.target === sh) sh.remove(); }; sh.append(box); document.body.append(sh);
};
$("#czFilter").onclick = () => {
  const sh = el("div", "dsheet"), box = el("div", "dsheetbox"); box.append(el("div", "dgrip"), el("h3", null, "Filters"));
  const row = (label, key) => { const r = el("label", "lsrow"), c = el("input", "lssw"); c.type = "checkbox"; c.checked = cz[key]; c.onchange = () => { cz[key] = c.checked; czSave(); czHeader(); czRender(); }; r.append(el("span", null, label), c, el("i", "lsck")); return r; };
  box.append(row("Only my Watching and Planning list", "onlyList"), row("Only from the current season", "onlySeason"), row("Show adult content", "adult"));
  const done = el("button", "go", "Done"); done.onclick = () => sh.remove(); box.append(done); sh.onclick = e => { if(e.target === sh) sh.remove(); }; sh.append(box); document.body.append(sh);
};
function calendarOpen(){ czLoad(); }
