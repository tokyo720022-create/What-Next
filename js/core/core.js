/* js/core/core.js: core state, loading your list, and the Pick engine */

const $ = s => document.querySelector(s);
const MIN_PER_CHAPTER = 6; // rough guess for reading speed
const state = { user: "", kind: "BOTH", time: 30, genre: "ALL", adult: "ALL", items: [], skipped: new Set(), fromCache: false, shownId: 0 };   // fromCache: the saved pool is on screen while the fresh list loads

// Build genre chips from the genres that actually appear in the user's list.
function buildGenres(keep){
  const prev = state.genre;
  const counts = new Map();
  for(const e of state.items) for(const g of e.media.genres || []) counts.set(g, (counts.get(g) || 0) + 1);
  const names = ["ALL", ...[...counts.entries()].sort((a,b) => b[1] - a[1]).map(x => x[0])];
  state.genre = keep && names.includes(prev) ? prev : "ALL";   // keep your chip when the fresh list replaces the saved one
  const row = $("#genres");
  row.replaceChildren(...names.map(g => {
    const b = document.createElement("button");
    b.className = "chip"; b.dataset.v = g;
    b.setAttribute("aria-pressed", String(g === state.genre));
    b.textContent = g === "ALL" ? "Any" : g;
    return b;
  }));
}

const QUERY = `
query($u:String){
  anime:MediaListCollection(userName:$u,type:ANIME,status_in:[CURRENT,REPEATING,PLANNING]){lists{entries{status progress media{...M}}}}
  manga:MediaListCollection(userName:$u,type:MANGA,status_in:[CURRENT,REPEATING,PLANNING]){lists{entries{status progress media{...M}}}}
}
fragment M on Media{
  id type siteUrl title{romaji english native} countryOfOrigin coverImage{extraLarge large}
  episodes chapters duration averageScore genres isAdult status startDate{year month day} nextAiringEpisode{episode airingAt}
}`;

function msg(text){
  const d = document.createElement("div");
  d.className = "msg"; d.textContent = text;
  $("#result").replaceChildren(d);
}

const poolName = user => "pool_" + String(user || acctUser()).toLowerCase();
// Show the saved Pick pool at once (before AniList answers), so there is no empty screen after the logo.
function paintFromCache(name, items){
  state.items = items; state.user = name; state.fromCache = true;
  buildGenres();
  $("#whoName").textContent = name;
  $("#setup").hidden = true; $("#app").hidden = false;
  $("#result").replaceChildren(); pick();
}
async function loadList(user){
  if(!state.fromCache) msg("Loading your list…");
  try{
    const entries = [];
    for(const t of ["ANIME", "MANGA"]) entries.push(...await collection(user, t, "status_in:[CURRENT,REPEATING,PLANNING]", ENTRY_F));
    const seen = new Map();
    for(const e of entries){ if(!seen.has(e.media.id)) seen.set(e.media.id, e); }
    state.items = [...seen.values()];
    cacheSet("acct", poolName(user), state.items);
    state.user = user;
    const painted = state.fromCache; state.fromCache = false;
    buildGenres(painted);
    $("#whoName").textContent = user;
    $("#setup").hidden = true; $("#app").hidden = false;
    if(!state.items.length) return msg("Your lists have nothing in Watching, Reading, or Planning yet.");
    if(painted && state.shownId && state.items.some(e => e.media.id === state.shownId)) return;   // the saved pick is still good: leave it on screen
    $("#result").replaceChildren();
    pick();
  }catch(err){
    const painted = state.fromCache; state.fromCache = false;
    if(painted && state.items.length){ $("#whoName").textContent = isNetErr(err) ? "Offline" : user; return; }   // keep the saved pick, don't replace it with an error
    const cached = cacheGetAs("acct", poolName(user), CACHE_OK.pool);
    if(cached && cached.length && isNetErr(err)){
      state.items = cached; state.user = user; buildGenres();
      $("#whoName").textContent = "Offline";
      $("#setup").hidden = true; $("#app").hidden = false; $("#result").replaceChildren(); return pick();
    }
    msg(isNetErr(err) ? "Couldn't reach AniList. Check your connection and try again." : err.message);
  }finally{ readyNow(); }
}

// A title is "out" once AniList no longer calls it not-yet-released and its start date has passed.
function isOut(m){
  if(m.status === "NOT_YET_RELEASED") return false;
  const d = m.startDate;
  if(d && d.year && new Date(d.year, (d.month || 1) - 1, d.day || 1) > new Date()) return false;
  return true;
}
// Work out whether an entry fits the time you have, and what to do. Titles that are not out yet, or episodes that have not aired yet, never count.
function plan(e){
  const m = e.media, isAnime = m.type === "ANIME";
  if(!isOut(m)) return null;
  const unit = isAnime ? (m.duration || 24) : MIN_PER_CHAPTER;
  let available = isAnime
    ? (m.nextAiringEpisode ? m.nextAiringEpisode.episode - 1 : (m.episodes || Infinity))
    : (m.chapters || Infinity);
  const left = available - e.progress;
  if(left <= 0) return null;
  const n = Math.min(Math.floor(state.time / unit), left, isAnime ? 8 : 30);
  if(n < 1) return null;
  const from = e.progress + 1, to = e.progress + n;
  const range = n === 1 ? String(from) : from + "–" + to;
  return {
    isAnime, n, minutes: Math.round(n * unit),
    action: (isAnime ? "Watch episode " : "Read chapter ") + range,
    progress: e.progress, to, total: isAnime ? m.episodes : m.chapters
  };
}

let wildMode = false;
function candidates(wild){
  const out = [];
  for(const e of state.items){
    if(hide.has(e.media.id)) continue;
    if(!wild){
      if(state.kind !== "BOTH" && e.media.type !== state.kind) continue;
      if(state.genre !== "ALL" && !(e.media.genres || []).includes(state.genre)) continue;
      if(state.adult === "ONLY" && !e.media.isAdult) continue;
      if(state.adult === "HIDE" && e.media.isAdult) continue;
    }
    const p = plan(e); if(!p) continue;
    const base = e.status === "PLANNING" ? 50 : e.status === "REPEATING" ? 40 : 100;
    out.push({e, p, score: wild ? Math.random() : base + (e.media.averageScore || 60) / 2 + Math.random() * 30});
  }
  return out.sort((a,b) => b.score - a.score);
}
function pick(wild){
  if(!state.items.length) return;
  wildMode = !!wild;
  const cands = candidates(wildMode);
  if(!cands.length) return msg("Nothing matches. Try a different time or genre, or open Filters.");
  let pool = cands.filter(c => !state.skipped.has(c.e.media.id));
  if(!pool.length){ state.skipped.clear(); pool = cands; }
  show(pool[0]);
}
function lineup(){
  if(!state.items.length) return;
  const budget = state.time; let left = budget; const rows = [];
  for(const c of candidates(false)){
    state.time = left; const p = plan(c.e); state.time = budget;
    if(p){ rows.push({e: c.e, p}); left -= p.minutes; if(left < 10) break; }
  }
  if(!rows.length) return msg("Nothing fits. Try more time or different filters.");
  const box = $("#result"); box.replaceChildren();
  const h = document.createElement("p"); h.className = "q"; h.textContent = "Your lineup · about " + (budget - left) + " of " + budget + " min"; box.append(h);
  rows.forEach(({e, p}) => {
    const d = document.createElement("div"); d.className = "msg"; d.style.marginTop = "8px";
    const a = document.createElement("a"); a.href = e.media.siteUrl; a.target = "_blank"; a.rel = "noopener"; a.style.fontWeight = "700";
    a.textContent = tt(e.media);
    d.append(a, document.createElement("br"), p.action + " · " + p.minutes + " min"); box.append(d);
  });
}

function show({e,p}){
  const m = e.media, title = m.title.english || m.title.romaji; state.shownId = m.id;
  const hero = el("div", "hero");
  const bg = el("div", "bg"); bg.style.backgroundImage = "url(" + JSON.stringify(m.coverImage.extraLarge || m.coverImage.large) + ")";
  const inn = el("div", "in");
  const img = new Image(); img.alt = ""; img.className = "poster"; img.src = m.coverImage.extraLarge || m.coverImage.large;
  const info = el("div", "hinfo");
  const chips = el("div", "hchips");   // score, format and up to three genres as little chips
  if(m.averageScore) chips.append(el("span", "hchip sc", "★ " + m.averageScore + "%"));
  if(m.format) chips.append(el("span", "hchip", m.format.replace(/_/g, " ")));
  (m.genres || []).slice(0, 3).forEach(g => chips.append(el("span", "hchip", g)));
  const a = el("button", "hlink", "Details ›"); a.onclick = () => openMedia(m.id);
  const tag = el("span", "tag", (p.isAnime ? "Anime" : "Manga") + (e.status === "PLANNING" ? " · Planning" : e.status === "NEW" ? " · New for you" : "")); tag.dataset.k = p.isAnime ? "anime" : "manga";
  info.append(tag, el("h2", null, title), chips, a);
  inn.append(img, info);
  const act = el("div", "act"), arow = el("div", "actrow");
  arow.append(el("span", null, "⏱ About " + p.minutes + " min"));
  act.append(el("div", "actlab", "Up next"), el("div", "actmain", p.action), arow);
  if(p.total && e.status !== "NEW"){
    const tr = el("div", "track"), f = el("i"); f.style.width = Math.min(100, Math.round(p.progress / p.total * 100)) + "%"; tr.append(f);
    arow.append(el("span", null, "📍 You're at " + p.progress + " of " + p.total)); act.append(tr);
  }else if(e.status !== "PLANNING" && e.status !== "NEW"){ arow.append(el("span", null, "📍 You're at " + p.progress)); }
  hero.append(bg, inn, act);
  const bar = el("div", "btns");
  const fresh = e.status === "NEW", next = () => fresh ? tastePick() : pick(wildMode);   // "NEW" = suggested from your taste, not on your lists
  if(auth.token && fresh){ const add = el("button", "go", "Add to Planning"); add.onclick = () => addPlanning(m.id, add, p.isAnime ? "anime" : "manga"); bar.append(add); }
  else if(auth.token){ const mark = el("button", "go", "Mark as done"); mark.onclick = () => markDone(e, p, mark); bar.append(mark); }
  const again = el("button", "chip", "Another"); again.onclick = () => { state.skipped.add(m.id); next(); };
  const hideB = el("button", "chip", "Hide"); hideB.onclick = () => { hide.add(m.id); saveHide(); next(); };
  bar.append(again, hideB);
  $("#result").replaceChildren(hero, bar);
}

function wireChips(id, key){
  $(id).addEventListener("click", ev => {
    const b = ev.target.closest(".chip"); if(!b) return;
    $(id).querySelectorAll(".chip").forEach(c => c.setAttribute("aria-pressed", String(c === b)));
    state[key] = key === "time" ? Number(b.dataset.v) : b.dataset.v;
    state.skipped.clear(); pick();
  });
}
wireChips("#kinds", "kind"); wireChips("#times", "time"); wireChips("#genres", "genre"); wireChips("#adult", "adult");

$("#pickBtn").onclick = () => { state.skipped.clear(); pick(); };
