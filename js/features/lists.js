/* js/features/lists.js: Anime and Manga lists, filter and customise sheets */
// ---------- AniList collection reader (handles AniList's 500-entry chunks) ----------
const ENTRY_F = "status progress repeat startedAt{year month day} completedAt{year month day} media{id type isAdult siteUrl title{romaji english native} countryOfOrigin coverImage{extraLarge large} episodes chapters duration averageScore genres status startDate{year month day} nextAiringEpisode{episode airingAt}}";
async function collection(user, type, filter, fields){
  const out = []; let chunk = 1, more = true;
  while(more){
    const q = "query($u:String,$t:MediaType,$c:Int){MediaListCollection(userName:$u,type:$t,chunk:$c,perChunk:500" + (filter ? "," + filter : "") + "){hasNextChunk lists{entries{" + fields + "}}}}";
    const { res, json } = await gql(q, { u: user, t: type, c: chunk });
    const col = json.data && json.data.MediaListCollection;
    if(!col) throw new Error(res.status === 404 ? "User not found. Check the spelling of your username." : "AniList said: " + ((json.errors && json.errors[0].message) || "no data"));
    for(const l of col.lists || []) out.push(...l.entries);
    more = col.hasNextChunk; chunk++;
    if(more) await sleep(700);
  }
  return out;
}

// ---------- Anime and manga lists ----------
const STATUS_LABEL = t => ({ CURRENT: t === "anime" ? "Watching" : "Reading", PLANNING: "Planning", COMPLETED: "Completed", PAUSED: "Paused", DROPPED: "Dropped", REPEATING: t === "anime" ? "Rewatching" : "Rereading" });
const STATUS_ORDER = ["CURRENT", "REPEATING", "PLANNING", "PAUSED", "COMPLETED", "DROPPED"];
const LIST_F = "mediaId status progress repeat customLists(asArray:true) startedAt{year month day} completedAt{year month day} score(format:POINT_100) updatedAt media{id siteUrl title{romaji english native} countryOfOrigin coverImage{large} format status episodes chapters averageScore popularity genres countryOfOrigin startDate{year}}";
const FORMATS = { anime: ["TV", "TV_SHORT", "MOVIE", "SPECIAL", "OVA", "ONA", "MUSIC"], manga: ["MANGA", "NOVEL", "ONE_SHOT"] };
const LS = (k, d) => { try{ return Object.assign({}, d, JSON.parse(localStorage.getItem(k) || "{}")); }catch(_){ return Object.assign({}, d); } };
const LSset = (k, v) => { try{ localStorage.setItem(k, JSON.stringify(v)); }catch(_){} };
const defFilter = () => ({ sort: "UPDATED", format: "", mstatus: "", country: "", yFrom: "", yTo: "", cMin: "", cMax: "", score: "", gi: [], ge: [] });
const ly = LS("wn_ly", { layout: "grid", cols: 3, hideUnscored: false, hideProgress: false });
const fstore = LS("wn_lf", { persist: false, anime: null, manga: null });
const lf = { anime: (fstore.persist && fstore.anime) || defFilter(), manga: (fstore.persist && fstore.manga) || defFilter() };
const LIST_BATCH = 48;
const mkList = () => ({ entries: null, custom: "", status: "ALL", q: "", shown: LIST_BATCH, stale: false, offline: false, cachedAt: 0, rev: 0, sig: "", drawn: 0, refreshing: false });
const lists = { anime: mkList(), manga: mkList() };
let curType = "anime";
const tt = m => { const t = m.title || {}, per = appCfg().naming[m.countryOfOrigin], p = per || localStorage.getItem("wn_tlang") || "ENGLISH"; return (p === "ROMAJI" ? t.romaji : p === "NATIVE" ? (t.native || t.romaji) : t.english) || t.english || t.romaji || "Untitled"; };
const yearOf = m => (m.startDate && m.startDate.year) || 0;
const SORTS = {
  UPDATED: (a, b) => b.updatedAt - a.updatedAt, TITLE: (a, b) => tt(a.m).localeCompare(tt(b.m)), SCORE: (a, b) => b.score - a.score,
  PROGRESS: (a, b) => b.progress - a.progress, AVG: (a, b) => (b.m.averageScore || 0) - (a.m.averageScore || 0),
  POP: (a, b) => (b.m.popularity || 0) - (a.m.popularity || 0), YEAR: (a, b) => yearOf(b.m) - yearOf(a.m)
};

const lcacheKey = type => "wn_list_" + type + "_" + String(state.user || "").toLowerCase();
function readListCache(type){ try{ const r = JSON.parse(localStorage.getItem(lcacheKey(type)) || "null"); return r && Array.isArray(r.entries) ? r : null; }catch(_){ return null; } }
function writeListCache(type, entries){ try{ localStorage.setItem(lcacheKey(type), JSON.stringify({ at: Date.now(), entries })); }catch(_){} }
function clearListCaches(){ try{ Object.keys(localStorage).filter(k => k.indexOf("wn_list_") === 0).forEach(k => localStorage.removeItem(k)); }catch(_){} }
function setListNote(t){ const n = $("#listNote"); n.hidden = !t; n.textContent = t || ""; n.classList.remove("warn"); n.onclick = null; }
// If the cards are squashed (old or mismatched files), say so and offer a clean reload instead of a blank list.
let guardTimer = 0;
function guardListLayout(){
  clearTimeout(guardTimer);
  guardTimer = setTimeout(() => {
    const body = $("#listBody"), card = body && body.querySelector(".lcard:not(.skel)");
    if($("#lists").hidden || !card) return;
    const cr = card.getBoundingClientRect(), br = body.getBoundingClientRect(), pr = body.parentElement.getBoundingClientRect();
    if(cr.height >= 60 && br.width >= pr.width - 6) return;
    const n = $("#listNote"); n.hidden = false; n.classList.add("warn");
    n.textContent = "Display problem found: this copy of the app has old or mismatched files. Tap here to reload a clean copy.";
    n.onclick = () => cleanReload();
  }, 500);
}
// Names of the custom lists an entry is in. AniList sends [{name, enabled}] when asked with asArray.
function customNames(e){
  const c = e && e.customLists;
  if(Array.isArray(c)) return c.filter(x => x && x.enabled).map(x => x.name);
  if(c && typeof c === "object") return Object.keys(c).filter(k => c[k]);
  return [];
}
async function fetchEntries(type){
  const raw = await collection(state.user, type.toUpperCase(), "", LIST_F), seen = new Map();
  for(const e of raw){ if(e && e.media && !seen.has(e.mediaId)) seen.set(e.mediaId, { id: e.mediaId, status: e.status, progress: e.progress || 0, repeat: e.repeat || 0, startedAt: e.startedAt, completedAt: e.completedAt, score: e.score || 0, updatedAt: e.updatedAt || 0, custom: customNames(e), m: e.media }); }
  return [...seen.values()];
}
function showListLoading(type){
  const body = $("#listBody"); body.className = ly.layout === "rows" ? "lrows" : "lgrid cols-" + ly.cols;
  body.replaceChildren(...Array.from({ length: ly.layout === "rows" ? 6 : 9 }, () => el("div", "lcard skel")));
  $("#listStatus").replaceChildren(); $("#listMore").hidden = true; $("#listCount").textContent = "Loading…"; setListNote("");
}
function showListError(type, err){
  const offline = /Failed to fetch|NetworkError|Load failed/i.test(err.message), box = el("div", "msg state");
  box.append(el("b", null, offline ? "Can't reach AniList" : "Couldn't load your " + type + " list"), el("p", "sub", offline ? "Check your connection and try again." : err.message));
  const retry = el("button", "go", "Retry"); retry.onclick = () => { showListLoading(type); loadFresh(type); };
  box.append(retry); $("#listBody").className = ""; $("#listBody").replaceChildren(box);
  $("#listStatus").replaceChildren(); $("#listMore").hidden = true; $("#listCount").textContent = "";
}
async function loadFresh(type){
  try{
    const entries = await fetchEntries(type), L = lists[type];
    L.entries = entries; L.stale = false; L.offline = false; L.cachedAt = Date.now(); L.rev++; writeListCache(type, entries);
    if(curType === type) renderList();
  }catch(err){ if(curType === type) showListError(type, err); }
}
async function refreshList(type){
  const L = lists[type]; if(L.refreshing) return; L.refreshing = true;
  try{
    const entries = await fetchEntries(type);
    L.entries = entries; L.stale = false; L.offline = false; L.cachedAt = Date.now(); L.rev++; writeListCache(type, entries);
  }catch(_){ L.offline = true; }
  L.refreshing = false;
  if(curType === type && !$("#lists").hidden) renderList({ keepScroll: true });
}
// After an edit elsewhere: keep what is on screen, mark it stale, and refresh quietly.
function invalidateLists(){
  for(const t of ["anime", "manga"]){ if(lists[t].entries){ lists[t].stale = true; lists[t].rev++; } }
  if(!$("#lists").hidden && lists[curType].entries) refreshList(curType);
}
async function openList(type){
  curType = type; const L = lists[type];
  $("#listTitle").textContent = type === "anime" ? "Anime List" : "Manga List";
  $("#listSearch").value = L.q;
  if(L.entries){ renderList(); if(L.stale) refreshList(type); return; }
  const c = readListCache(type);
  if(c){ L.entries = c.entries; L.cachedAt = c.at; L.stale = true; renderList(); refreshList(type); return; }
  showListLoading(type); await loadFresh(type);
}
function passes(e, f, type){
  const m = e.m;
  if(f.format && m.format !== f.format) return false;
  if(f.mstatus && m.status !== f.mstatus) return false;
  if(f.country && m.countryOfOrigin !== f.country) return false;
  const y = yearOf(m), n = type === "anime" ? m.episodes : m.chapters, g = m.genres || [];
  if(f.yFrom && !(y >= +f.yFrom)) return false;
  if(f.yTo && !(y && y <= +f.yTo)) return false;
  if(f.cMin && !(n >= +f.cMin)) return false;
  if(f.cMax && !(n && n <= +f.cMax)) return false;
  if(f.score && !(m.averageScore >= +f.score)) return false;
  if(f.gi.some(x => !g.includes(x))) return false;
  if(f.ge.some(x => g.includes(x))) return false;
  return true;
}
const customCounts = entries => { const c = new Map(); entries.forEach(e => (e.custom || []).forEach(n => c.set(n, (c.get(n) || 0) + 1))); return [...c.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])); };
const statusCounts = entries => { const c = {}; entries.forEach(e => { c[e.status] = (c[e.status] || 0) + 1; }); return c; };
function emptyState(type, L){
  const box = el("div", "msg state");
  if(!L.entries.length){ box.append(el("b", null, "Your " + type + " list is empty"), el("p", "sub", "Add titles from Discover or from a media page.")); return box; }
  const filtered = L.q.trim() || L.custom || JSON.stringify(lf[type]) !== JSON.stringify(defFilter());
  box.append(el("b", null, "Nothing to show here"), el("p", "sub", filtered ? "No titles match your search or filters." : "No " + type + " entries have this status."));
  if(filtered){
    const b = el("button", "go alt", "Clear search and filters");
    b.onclick = () => { L.q = ""; L.custom = ""; $("#listSearch").value = ""; lf[type] = defFilter(); fstore[type] = lf[type]; LSset("wn_lf", fstore); L.shown = LIST_BATCH; renderList(); };
    box.append(b);
  }
  return box;
}
function renderList(opts){
  const type = curType, L = lists[type], f = lf[type], lab = STATUS_LABEL(type);
  if(!L.entries) return;
  const y = window.scrollY, q = L.q.trim().toLowerCase();
  const rows = L.entries.filter(e => passes(e, f, type) && (!L.custom || (e.custom || []).includes(L.custom)) && (!q || (tt(e.m) + " " + (e.m.title.romaji || "")).toLowerCase().includes(q)));
  const all = statusCounts(L.entries), counts = statusCounts(rows);
  const chips = $("#listStatus"); chips.replaceChildren();
  const order = ["ALL", ...STATUS_ORDER.filter(x => all[x] || x === L.status)]; if(appCfg().allpos[type] === "bottom") order.push(order.shift());
  for(const s of order){
    const n = s === "ALL" ? rows.length : (counts[s] || 0);
    const b = el("button", "chip" + (n ? "" : " dim"), (s === "ALL" ? "All" : lab[s]) + " " + n);
    b.setAttribute("aria-pressed", String(L.status === s));
    b.onclick = () => { L.status = s; L.shown = LIST_BATCH; renderList(); };
    chips.append(b);
  }
  const cb = $("#lListsBtn"), hasCustom = customCounts(L.entries).length > 0;
  cb.hidden = !(hasCustom || L.custom); cb.textContent = L.custom ? "List: " + L.custom : "Custom lists"; cb.setAttribute("aria-pressed", String(!!L.custom));
  const view = (L.status === "ALL" ? rows : rows.filter(e => e.status === L.status)).slice();
  view.sort(L.status === "ALL" && f.sort === "UPDATED" ? (a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || b.updatedAt - a.updatedAt : (SORTS[f.sort] || SORTS.UPDATED));
  $("#listCount").textContent = (L.status === "ALL" ? "All" : lab[L.status]) + (L.custom ? " · " + L.custom : "") + " (" + view.length + ")";
  const body = $("#listBody"), shown = Math.min(view.length, L.shown);
  const sig = [type, L.status, L.custom, q, JSON.stringify(f), ly.layout, ly.cols, ly.hideUnscored, ly.hideProgress, L.rev, view.length].join("|");
  if(sig === L.sig && L.drawn > 0 && L.drawn < shown){          // "Show more": add only the next batch
    view.slice(L.drawn, shown).forEach(e => body.append(lcard(e, type))); L.drawn = shown;
  }else if(!(sig === L.sig && L.drawn === shown && shown > 0)){  // anything else that changed: rebuild
    body.className = ly.layout === "rows" ? "lrows" : "lgrid cols-" + ly.cols;
    body.replaceChildren(...(view.length ? view.slice(0, shown).map(e => lcard(e, type)) : [emptyState(type, L)]));
    L.drawn = view.length ? shown : 0; L.sig = sig;
  }
  const more = $("#listMore"); more.hidden = view.length <= shown;
  more.textContent = "Show more (" + shown + " of " + view.length + ")";
  setListNote(L.offline ? "Offline. Showing your saved list" + (L.cachedAt ? " from " + new Date(L.cachedAt).toLocaleString() : "") + "." : "");
  guardListLayout();
  if(opts && opts.keepScroll) window.scrollTo(0, y);
}
function lcard(e, type){
  const m = e.m, total = type === "anime" ? m.episodes : m.chapters, lab = STATUS_LABEL(type)[e.status] || e.status;
  const card = el("div", "lcard"); card.dataset.s = e.status;
  const main = el("button", "lmain"); main.type = "button";
  main.setAttribute("aria-label", tt(m) + ", " + lab + ", " + e.progress + " of " + (total || "unknown"));
  const cover = el("div", "lcover"), img = new Image(); img.alt = ""; img.loading = "lazy"; img.decoding = "async";
  if(m.coverImage && m.coverImage.large) img.src = m.coverImage.large;
  cover.append(img, el("span", "sb", lab));
  const info = el("div", "li"), meta = el("div", "lm");
  info.append(el("div", "lt", tt(m)), el("div", "ls", lab));
  if(!(ly.hideUnscored && !e.score)) meta.append(el("span", "sc", "★ " + scoreText(e.score)));
  if(!ly.hideProgress) meta.append(el("span", "lp", e.progress + " / " + (total || "?")));
  info.append(meta);
  if(!ly.hideProgress && total){ const tr = el("div", "ltrack"), fill = el("i"); fill.style.width = Math.min(100, Math.round(e.progress / total * 100)) + "%"; tr.append(fill); info.append(tr); }
  main.append(cover, info); main.onclick = () => openMedia(m.id); card.append(main);
  if(auth.token && ["CURRENT", "REPEATING", "PLANNING", "PAUSED"].includes(e.status) && !(total && e.progress >= total)){
    const plus = el("button", "lplus", "+1"); plus.type = "button"; plus.setAttribute("aria-label", "Add one " + (type === "anime" ? "episode" : "chapter"));
    plus.onclick = ev => { ev.stopPropagation(); bumpEntry(e, type, plus); }; card.append(plus);
  }
  return card;
}
function bumpEntry(e, type, btn){
  btn.disabled = true;
  track(e.id, type, { progress: e.progress + 1 }).then(r => {
    if(!r.ok && !r.queued) setListNote("Couldn't save progress: " + ((r.error && r.error.message) || "unknown error"));
  });
}
$("#qv").addEventListener("click", ev => { if(ev.target.id === "qv") $("#qv").hidden = true; });
$("#listMore").onclick = () => { lists[curType].shown += LIST_BATCH; renderList(); };
// Open one of your custom lists (Anime or Manga screen): a sheet with every list switched on for any title, and how many titles each has.
$("#lListsBtn").onclick = () => {
  const L = lists[curType]; if(!L.entries) return;
  pickSheet("Custom lists", [["", "All lists"]].concat(customCounts(L.entries).map(([n, c]) => [n, n + " (" + c + ")"])), L.custom, v => { L.custom = v; L.shown = LIST_BATCH; renderList(); });
};
$("#lSearchBtn").onclick = () => {
  const i = $("#listSearch"); i.hidden = !i.hidden;
  if(i.hidden){ i.value = ""; lists[curType].q = ""; renderList(); } else i.focus();
};
$("#listSearch").oninput = ev => { lists[curType].q = ev.target.value; lists[curType].shown = LIST_BATCH; renderList(); };

// Filter sheet
function setTri(b, s){ b.dataset.s = s; b.setAttribute("aria-pressed", String(s === 1)); b.classList.toggle("ex", s === 2); b.textContent = (s === 1 ? "+ " : s === 2 ? "− " : "") + b.dataset.n; }
function openFilter(){
  const f = lf[curType];
  $("#fsPersist").checked = !!fstore.persist; $("#fsSort").value = f.sort;
  const opts = [["", "Any"], ...FORMATS[curType].map(x => [x, x.replace(/_/g, " ")])];
  $("#fsFormat").replaceChildren(...opts.map(([v, t]) => Object.assign(document.createElement("option"), { value: v, textContent: t })));
  $("#fsFormat").value = f.format; $("#fsStatus").value = f.mstatus; $("#fsCountry").value = f.country;
  $("#fsYFrom").value = f.yFrom; $("#fsYTo").value = f.yTo; $("#fsCMin").value = f.cMin; $("#fsCMax").value = f.cMax; $("#fsScore").value = f.score;
  $("#fsCountLabel").textContent = curType === "anime" ? "Episodes" : "Chapters";
  $("#fsGenres").replaceChildren(...GENRES.map(n => {
    const b = el("button", "chip"); b.dataset.n = n; b.style.flex = "0 0 auto"; b.style.minWidth = "0";
    setTri(b, f.gi.includes(n) ? 1 : f.ge.includes(n) ? 2 : 0); b.onclick = () => setTri(b, (+b.dataset.s + 1) % 3); return b;
  }));
  $("#fsheet").hidden = false; $("#fsheet").scrollTop = 0;
}
$("#lFilterBtn").onclick = openFilter;
$("#fsBack").onclick = () => { $("#fsheet").hidden = true; };
$("#fsReset").onclick = () => { lf[curType] = defFilter(); openFilter(); };
$("#fsApply").onclick = () => {
  const f = { sort: $("#fsSort").value, format: $("#fsFormat").value, mstatus: $("#fsStatus").value, country: $("#fsCountry").value,
    yFrom: $("#fsYFrom").value.trim(), yTo: $("#fsYTo").value.trim(), cMin: $("#fsCMin").value.trim(), cMax: $("#fsCMax").value.trim(), score: $("#fsScore").value.trim(), gi: [], ge: [] };
  document.querySelectorAll("#fsGenres .chip").forEach(b => { if(b.dataset.s === "1") f.gi.push(b.dataset.n); if(b.dataset.s === "2") f.ge.push(b.dataset.n); });
  lf[curType] = f; fstore.persist = $("#fsPersist").checked; fstore.anime = lf.anime; fstore.manga = lf.manga; LSset("wn_lf", fstore);
  lists[curType].shown = LIST_BATCH; $("#fsheet").hidden = true; renderList();
};

// Customise sheet
const chipSet = (id, v) => document.querySelectorAll(id + " .chip").forEach(c => c.setAttribute("aria-pressed", String(c.dataset.v === v)));
function saveLy(){ LSset("wn_ly", ly); renderList(); }
function openCust(){ chipSet("#csLayout", ly.layout); chipSet("#csCols", String(ly.cols)); $("#csHideUnscored").checked = ly.hideUnscored; $("#csHideProgress").checked = ly.hideProgress; $("#csheet").hidden = false; }
$("#lCustBtn").onclick = openCust; $("#custOpen").onclick = openCust;
$("#csBack").onclick = () => { $("#csheet").hidden = true; };
$("#csLayout").addEventListener("click", ev => { const b = ev.target.closest(".chip"); if(b){ ly.layout = b.dataset.v; chipSet("#csLayout", ly.layout); saveLy(); } });
$("#csCols").addEventListener("click", ev => { const b = ev.target.closest(".chip"); if(b){ ly.cols = +b.dataset.v; chipSet("#csCols", String(ly.cols)); saveLy(); } });
$("#csHideUnscored").onchange = ev => { ly.hideUnscored = ev.target.checked; saveLy(); };
$("#csHideProgress").onchange = ev => { ly.hideProgress = ev.target.checked; saveLy(); };

// Long-press the list title to see what the list actually rendered (for bug reports).
(function(){
  let t = null; const title = $("#listTitle");
  const start = () => { t = setTimeout(async () => { const p = $("#listDiag"); p.hidden = false; p.textContent = await diagReport(); }, 700); };
  const stop = () => { clearTimeout(t); };
  ["pointerdown", "touchstart"].forEach(n => title.addEventListener(n, start)); ["pointerup", "pointerleave", "touchend", "touchmove"].forEach(n => title.addEventListener(n, stop));
})();
