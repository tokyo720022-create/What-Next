/* js/features/schedule-stats.js: Schedule tab, Stats, daily goal */
// ---------- Round 2: schedule, stats, goal ----------
const el = (t, c, x) => { const n = document.createElement(t); if(c) n.className = c; if(x != null) n.textContent = x; return n; };
const dayKey = (d = new Date()) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
function days(){ try{ return JSON.parse(localStorage.getItem("wn_days") || "{}"); }catch(_){ return {}; } }
function goal(){ return Number(localStorage.getItem("wn_goal")) || 1; }
// Counts come from two places: what you mark in this app, and your AniList activity (so updates made on AniList or other apps count too).
const actName = () => "actdays_" + acctUser();   // account cache, 14 days; the time inside is when the counts were last loaded
function actDays(){ const o = cacheGetAs("acct", actName(), CACHE_OK.actdays); return o && o.days ? o : { at: 0, days: {}, since: {} }; }
function dayCount(k, d, a){ d = d || days(); a = a || actDays(); return Math.max(d[k] || 0, ((a.days || {})[k] || 0) + ((a.since || {})[k] || 0)); }
function bumpDay(n, key){
  const k = key || dayKey(), d = days(), a = actDays(); a.since = a.since || {};
  d[k] = Math.max(0, (d[k] || 0) + n); a.since[k] = Math.max(0, (a.since[k] || 0) + n);
  try{ localStorage.setItem("wn_days", JSON.stringify(d)); }catch(_){}
  cacheSet("acct", actName(), a);
}
function streak(){
  const d = days(), a = actDays(), g = goal(), c = new Date(); let n = 0;
  if(dayCount(dayKey(c), d, a) < g) c.setDate(c.getDate() - 1);
  while(dayCount(dayKey(c), d, a) >= g){ n++; c.setDate(c.getDate() - 1); }
  return n;
}
function bestStreak(){
  const d = days(), a = actDays(), g = goal(), keys = [...new Set([...Object.keys(d), ...Object.keys(a.days || {})])].filter(k => dayCount(k, d, a) >= g).sort();
  let best = 0, run = 0, prev = null;
  for(const k of keys){ const t = new Date(k + "T12:00:00"); run = prev && Math.round((t - prev) / 86400000) === 1 ? run + 1 : 1; best = Math.max(best, run); prev = t; }
  return best;
}
const ACT_Q = "query($id:Int!,$p:Int,$from:Int){Page(page:$p,perPage:50){pageInfo{hasNextPage} activities(userId:$id,type_in:[ANIME_LIST,MANGA_LIST],createdAt_greater:$from,sort:ID_DESC){... on ListActivity{id status progress createdAt}}}}";
function actUnits(a){   // episodes or chapters in one activity ("watched episode", progress "4 - 6" = 3)
  const s = String(a.status || "").toLowerCase();
  if(/episode|chapter/.test(s)){ const m = String(a.progress || "").match(/(\d+)\s*-\s*(\d+)/); return m ? Math.abs(+m[2] - +m[1]) + 1 : 1; }
  return s === "completed" ? 1 : 0;
}
async function loadActivityDays(force){
  const cur = actDays(); if(!force && Date.now() - cur.at < 300000) return cur.days;
  const id = await myId(), from = Math.floor(Date.now() / 1000) - 45 * 86400, out = {};
  for(let p = 1; p <= 4; p++){
    const { json } = await gql(ACT_Q, { id, p, from }), pg = json.data && json.data.Page;
    if(!pg) throw new Error((json.errors && json.errors[0] && json.errors[0].message) || "No data");
    for(const x of pg.activities || []){ if(!x || !x.createdAt) continue; const k = dayKey(new Date(x.createdAt * 1000)); out[k] = (out[k] || 0) + actUnits(x); }
    if(!(pg.pageInfo && pg.pageInfo.hasNextPage)) break;
  }
  cacheSet("acct", actName(), { at: Date.now(), days: out, since: {} });
  return out;
}
function fmtIn(secs){
  if(secs <= 0) return "now";
  const d = Math.floor(secs / 86400), h = Math.floor(secs % 86400 / 3600), m = Math.floor(secs % 3600 / 60);
  return d ? d + "d " + h + "h" : h ? h + "h " + m + "m" : m + "m";
}

// Schedule: airing anime from your list, grouped by day. Day chips jump to one day, the second row narrows to Watching or Planning.
const schS = { day: "all", status: "all" };
function renderSchedule(){
  const box = $("#schedList"), strip = $("#schDays"), sub = $("#schSub"); box.replaceChildren(); strip.replaceChildren();
  document.querySelectorAll("#schFilter .chip").forEach(c => c.setAttribute("aria-pressed", String(c.dataset.v === schS.status)));
  const all = state.items.filter(e => e.media.nextAiringEpisode && e.media.nextAiringEpisode.airingAt && !hide.has(e.media.id))
    .sort((a, b) => a.media.nextAiringEpisode.airingAt - b.media.nextAiringEpisode.airingAt);
  if(!all.length){
    sub.textContent = ""; strip.hidden = true; $("#schFilter").hidden = true;
    box.append(el("div", "msg", "No airing anime on your list right now. If you just updated the app, log out and back in to fetch air times. AniList doesn't give manga chapter dates."));
    return;
  }
  strip.hidden = false; $("#schFilter").hidden = false;
  const keep = e => schS.status === "all" || (schS.status === "watching" ? e.status === "CURRENT" || e.status === "REPEATING" : e.status === "PLANNING");
  const rows = all.filter(keep), today = new Date(), groups = new Map(); today.setHours(0, 0, 0, 0);
  for(const e of rows){
    const at = new Date(e.media.nextAiringEpisode.airingAt * 1000), dd = Math.round((new Date(at.getFullYear(), at.getMonth(), at.getDate()) - today) / 86400000), key = dayKey(dd <= 0 ? today : at);   // anything already out counts as Today
    if(!groups.has(key)) groups.set(key, { dd, at, rows: [] });
    groups.get(key).rows.push(e);
  }
  if(schS.day !== "all" && !groups.has(schS.day)) schS.day = "all";
  const dayName = g => g.dd <= 0 ? "Today" : g.dd === 1 ? "Tomorrow" : g.at.toLocaleDateString([], { weekday: "long" });
  const dayShort = g => g.dd <= 0 ? "Today" : g.dd === 1 ? "Tmrw" : g.at.toLocaleDateString([], { weekday: "short" });
  const addChip = (v, text, n) => { const c = el("button", "chip", text); c.dataset.v = v; c.setAttribute("aria-pressed", String(schS.day === v)); c.append(el("i", null, String(n))); strip.append(c); };
  addChip("all", "All", rows.length); for(const [k, g] of groups) addChip(k, dayShort(g), g.rows.length);
  let waitingTotal = 0;
  for(const [k, g] of groups){
    if(schS.day !== "all" && schS.day !== k) continue;
    const head = el("div", "schday"); head.append(el("b", null, dayName(g)), el("span", null, g.dd <= 0 ? today.toLocaleDateString([], { month: "short", day: "numeric" }) : g.at.toLocaleDateString([], { month: "short", day: "numeric" })), el("i", null, g.rows.length + (g.rows.length === 1 ? " episode" : " episodes")));
    box.append(head);
    for(const e of g.rows){
      const x = e.media, n = x.nextAiringEpisode, at = new Date(n.airingAt * 1000), secs = n.airingAt - Date.now() / 1000, aired = Math.max(0, n.episode - 1);
      const waiting = e.status !== "PLANNING" ? Math.max(0, aired - e.progress) : 0; waitingTotal += waiting;
      const card = el("div", "schcard"); card.setAttribute("role", "button"); card.tabIndex = 0;
      const poster = el("div", "schposter"), img = new Image(); img.alt = ""; img.loading = "lazy"; img.src = (x.coverImage && x.coverImage.large) || "";
      poster.append(img, el("span", "schep", "EP " + n.episode));
      const info = el("div", "schinfo"), time = at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      info.append(el("div", "scht", tt(x)), el("div", "schmeta", "Episode " + n.episode + (appCfg().relative ? " · " + time : "")));
      if(e.status !== "PLANNING" && aired > 0){
        const tr = el("div", "schtrack"), fill = el("i"); fill.style.width = Math.min(100, Math.round(e.progress / aired * 100)) + "%"; tr.append(fill);
        info.append(el("div", "schprog", "Watched " + Math.min(e.progress, aired) + " of " + aired + " aired"), tr);
      }
      const pills = el("div", "schpills");
      pills.append(el("span", "schpill when" + (secs <= 0 ? " now" : secs < 10800 ? " soon" : ""), appCfg().relative ? fmtIn(secs) : at.toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })));
      if(waiting > 0) pills.append(el("span", "schpill", waiting + " waiting for you"));
      if(e.status === "PLANNING") pills.append(el("span", "schpill plan", "Planning"));
      info.append(pills); card.append(poster, info);
      card.onclick = () => openMedia(x.id); card.onkeydown = ev => { if(ev.key === "Enter" || ev.key === " "){ ev.preventDefault(); openMedia(x.id); } };
      box.append(card);
    }
  }
  if(!rows.length) box.append(el("div", "msg", "Nothing airing for this filter. Try All."));
  sub.textContent = rows.length + (rows.length === 1 ? " episode" : " episodes") + " airing" + (waitingTotal ? " · " + waitingTotal + " waiting for you" : "");
}
$("#schDays").addEventListener("click", ev => { const c = ev.target.closest(".chip"); if(c){ schS.day = c.dataset.v; renderSchedule(); } });
$("#schFilter").addEventListener("click", ev => { const c = ev.target.closest(".chip"); if(c){ schS.status = c.dataset.v; schS.day = "all"; renderSchedule(); } });

async function renderStats(){
  const box = $("#statsBody"); box.replaceChildren();
  let mins = 0, titles = 0;
  for(const e of state.items){
    const x = e.media, anime = x.type === "ANIME";
    const total = anime ? (x.episodes || (x.nextAiringEpisode ? x.nextAiringEpisode.episode - 1 : 0)) : (x.chapters || 0);
    const left = total - e.progress;
    if(left > 0){ mins += left * (anime ? (x.duration || 24) : MIN_PER_CHAPTER); titles++; }
  }
  const goalBox = el("div", "card pgtoday"), weekBox = el("div", "card"), contBox = el("div"), note = el("p", "sub pgnote");
  const drawGoal = () => {
    const done = dayCount(dayKey()), goalN = goal(), st = streak(), best = bestStreak();
    goalBox.replaceChildren();
    const q = el("div", "q", "Today"); q.style.marginTop = "0"; goalBox.append(q);
    const gr = el("div", "goalrow"), ring = el("div", "ring");
    ring.style.setProperty("--p", Math.min(100, Math.round(done / goalN * 100))); ring.append(el("span", null, done + "/" + goalN));
    const txt = el("div"); txt.append(el("b", null, done >= goalN ? "Goal reached" : (goalN - done) + " more to reach your goal"), el("p", "sub", st + " day streak · best " + Math.max(best, st)));
    gr.append(ring, txt); goalBox.append(gr);
    const chips = el("div", "row"); chips.style.marginTop = "14px";
    for(const opt of [1, 2, 3, 5, 10]){
      const b = el("button", "chip", opt + "/day"); b.setAttribute("aria-pressed", String(goalN === opt));
      b.onclick = () => { try{ localStorage.setItem("wn_goal", opt); }catch(_){} drawGoal(); drawWeek(); };
      chips.append(b);
    }
    goalBox.append(chips);
  };
  const drawWeek = () => {
    weekBox.replaceChildren(); const q = el("div", "q", "Last 7 days"); q.style.marginTop = "0"; weekBox.append(q);
    const goalN = goal(), cols = [], now = new Date();
    for(let i = 6; i >= 0; i--){ const d = new Date(now); d.setDate(d.getDate() - i); cols.push({ d, n: dayCount(dayKey(d)), today: i === 0 }); }
    const top = Math.max(goalN, ...cols.map(c => c.n), 1), chart = el("div", "pgweek");
    for(const c of cols){
      const col = el("div", "pgday" + (c.today ? " today" : "") + (c.n >= goalN ? " met" : "")), bar = el("i");
      bar.style.height = Math.max(c.n ? 8 : 3, Math.round(c.n / top * 100)) + "%";
      const bw = el("div", "pgbar"); bw.append(bar);
      col.append(el("em", null, String(c.n)), bw, el("span", null, c.d.toLocaleDateString([], { weekday: "narrow" })));
      chart.append(col);
    }
    weekBox.append(chart, el("p", "sub", "Bars in colour reached your goal of " + goalN + "."));
  };
  const drawCont = () => {
    contBox.replaceChildren();
    const rows = state.items.filter(e => e.status === "CURRENT" || e.status === "REPEATING").sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 8);
    if(!rows.length) return;
    contBox.append(el("div", "q", "Continue"));
    const card = el("div", "card pgcont"); card.style.marginTop = "0";
    for(const e of rows){
      const x = e.media, anime = x.type === "ANIME", total = x.episodes || x.chapters || 0, avail = anime && x.nextAiringEpisode ? x.nextAiringEpisode.episode - 1 : (total || Infinity);
      const row = el("div", "pgrow"), img = el("img"); img.src = (x.coverImage && x.coverImage.large) || ""; img.alt = ""; img.loading = "lazy";
      const info = el("div", "pginfo"), t = el("b", null, tt(x)); t.onclick = () => openMedia(x.id);
      const bar = el("div", "pgp"), fill = el("i"); fill.style.width = total ? Math.min(100, Math.round(e.progress / total * 100)) + "%" : "0%"; bar.append(fill);
      info.append(t, el("span", null, (anime ? "Episode " : "Chapter ") + e.progress + (total ? " of " + total : "")), bar);
      const b = el("button", "mini", e.progress >= avail ? "Up to date" : "+1"); b.disabled = e.progress >= avail;
      b.onclick = async () => { b.disabled = true; await track(x.id, anime ? "anime" : "manga", { progress: e.progress + 1 }); drawGoal(); drawWeek(); drawCont(); };
      row.append(img, info, b); card.append(row);
    }
    contBox.append(card);
  };
  const tiles = el("div", "tiles");
  const mk = (big, small) => { const t = el("div", "tile"), b = el("b", null, big); t.append(b, el("span", null, small)); tiles.append(t); return b; };
  mk(Math.round(mins / 60).toLocaleString() + " h", "backlog"); mk(String(titles), "titles queued");
  const monthB = mk("…", "finished this month");
  drawGoal(); drawWeek(); drawCont();
  box.append(goalBox, weekBox, contBox, el("div", "q", "Backlog"), tiles, note);

  loadActivityDays(false).then(() => { note.textContent = "Counts include updates you make on AniList."; drawGoal(); drawWeek(); })
    .catch(() => { note.textContent = "Couldn't read your AniList activity, so these counts are from this app only."; });
  try{
    const part = "{lists{entries{mediaId completedAt{year month}}}}";
    const { json } = await gql("query($u:String){a:MediaListCollection(userName:$u,type:ANIME,status:COMPLETED)" + part + " m:MediaListCollection(userName:$u,type:MANGA,status:COMPLETED)" + part + "}", { u: state.user });
    const now = new Date(), ids = new Set();
    for(const k of ["a", "m"]) for(const l of (json.data && json.data[k] && json.data[k].lists) || []) for(const en of l.entries){
      if(en.completedAt && en.completedAt.year === now.getFullYear() && en.completedAt.month === now.getMonth() + 1) ids.add(en.mediaId);
    }
    monthB.textContent = String(ids.size);
  }catch(_){ monthB.textContent = "–"; }
}
