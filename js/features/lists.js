/* js/features/lists.js: Anime and Manga lists, filter and customise sheets */
// ---------- AniList collection reader (handles AniList's 500-entry chunks) ----------
const ENTRY_F = "status progress repeat startedAt{year month day} completedAt{year month day} media{id type isAdult siteUrl title{romaji english native} countryOfOrigin coverImage{large} episodes chapters duration averageScore genres status startDate{year month day} nextAiringEpisode{episode airingAt}}";
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
const LIST_F = "mediaId status progress repeat customLists(asArray:true) startedAt{year month day} completedAt{year month day} score(format:POINT_100) updatedAt notes priority media{id siteUrl title{romaji english native} countryOfOrigin coverImage{large} format status episodes chapters averageScore popularity genres countryOfOrigin startDate{year}}";
const FORMATS = { anime: ["TV", "TV_SHORT", "MOVIE", "SPECIAL", "OVA", "ONA", "MUSIC"], manga: ["MANGA", "NOVEL", "ONE_SHOT"] };
const LS = (k, d) => { try{ return Object.assign({}, d, JSON.parse(localStorage.getItem(k) || "{}")); }catch(_){ return Object.assign({}, d); } };
const LSset = (k, v) => { try{ localStorage.setItem(k, JSON.stringify(v)); return true; }catch(_){ warnStorage("settings"); return false; } };   // when storage is full the settings can't be kept: say so
const defFilter = () => ({ sort: "UPDATED", format: "", mstatus: "", country: "", yFrom: "", yTo: "", cMin: "", cMax: "", score: "", gi: [], ge: [] });
const LY_TYPES = ["linear", "grid", "simplified", "album"];   // List type: Linear = cover and details in a row, Grid = covers, Simplified = text only, Album = big covers with the title on top
const ly = LS("wn_ly", { layout: "grid", cols: 3, hideUnscored: false, hideProgress: false, quick: true, hideAir: false, showNotes: false, showPriority: false });
if(ly.layout === "rows") ly.layout = "linear";   // saved by an older version, when the choice was Grid or List
if(!LY_TYPES.includes(ly.layout)) ly.layout = "grid";
const lyRows = () => ly.layout === "linear" || ly.layout === "simplified";
const lyBodyClass = () => (ly.layout === "linear" ? "lrows" : ly.layout === "simplified" ? "lrows lsimp" : ly.layout === "album" ? "lgrid lalbum cols-" + ly.cols : "lgrid cols-" + ly.cols);
const LYBG_KEY = "wn_lybg";   // the background picture is kept apart from the other options, because it is large
let lyBg = ""; try{ lyBg = localStorage.getItem(LYBG_KEY) || ""; }catch(_){}
const fstore = LS("wn_lf", { persist: false, anime: null, manga: null });
const lf = { anime: (fstore.persist && fstore.anime) || defFilter(), manga: (fstore.persist && fstore.manga) || defFilter() };
const LIST_BATCH = 24;   // titles drawn at a time; "Show more" adds the next 24
const mkList = () => ({ entries: null, custom: "", status: "ALL", q: "", shown: LIST_BATCH, stale: false, offline: false, refreshErr: "", cachedAt: 0, rev: 0, sig: "", drawn: 0, refreshing: false });
const lists = { anime: mkList(), manga: mkList() };
let curType = "anime";
const tt = m => { const t = m.title || {}, per = appCfg().naming[m.countryOfOrigin], p = per || localStorage.getItem("wn_tlang") || "ENGLISH"; return (p === "ROMAJI" ? t.romaji : p === "NATIVE" ? (t.native || t.romaji) : t.english) || t.english || t.romaji || "Untitled"; };
const yearOf = m => (m.startDate && m.startDate.year) || 0;
const SORTS = {
  UPDATED: (a, b) => b.updatedAt - a.updatedAt, TITLE: (a, b) => tt(a.m).localeCompare(tt(b.m)), SCORE: (a, b) => b.score - a.score,
  PROGRESS: (a, b) => b.progress - a.progress, AVG: (a, b) => (b.m.averageScore || 0) - (a.m.averageScore || 0),
  POP: (a, b) => (b.m.popularity || 0) - (a.m.popularity || 0), YEAR: (a, b) => yearOf(b.m) - yearOf(a.m)
};

// Saved copy of each list (account cache, 14 days). Written a moment after the last change, so tapping +1 many times saves once.
const lcacheName = type => "list_" + type + "_" + acctUser();
function readListCache(type){ const m = cacheMetaAs("acct", lcacheName(type), CACHE_OK.list); return m ? { at: m.at, entries: m.d.entries } : null; }
function writeListCache(type, entries){ cacheSetSoon("acct", lcacheName(type), { entries }, 800); }
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
  for(const e of raw){ if(e && e.media && !seen.has(e.mediaId)) seen.set(e.mediaId, { id: e.mediaId, status: e.status, progress: e.progress || 0, repeat: e.repeat || 0, startedAt: e.startedAt, completedAt: e.completedAt, score: e.score || 0, updatedAt: e.updatedAt || 0, notes: String(e.notes || "").slice(0, 300), priority: e.priority || 0, custom: customNames(e), m: e.media }); }
  return [...seen.values()];
}
function showListLoading(type){
  const body = $("#listBody"); body.className = lyBodyClass(); body.dataset.list = "";
  body.replaceChildren(...Array.from({ length: lyRows() ? 6 : 9 }, () => el("div", "lcard skel")));
  $("#listStatus").replaceChildren(); $("#listMore").hidden = true; $("#listCount").textContent = "Loading…"; setListNote("");
}
function showListError(type, err){
  const offline = isNetErr(err), box = el("div", "msg state");
  box.append(el("b", null, offline ? "Can't reach AniList" : "Couldn't load your " + type + " list"), el("p", "sub", offline ? "Check your connection and try again." : err.message));
  const retry = el("button", "go", "Retry"); retry.onclick = () => { showListLoading(type); loadFresh(type); };
  box.append(retry); $("#listBody").className = ""; $("#listBody").dataset.list = ""; $("#listBody").replaceChildren(box);
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
    L.entries = entries; L.stale = false; L.offline = false; L.refreshErr = ""; L.cachedAt = Date.now(); L.rev++; writeListCache(type, entries);
  }catch(err){ if(isNetErr(err)){ L.offline = true; L.refreshErr = ""; } else L.refreshErr = err.message; }   // only "can't reach AniList" counts as offline
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
    const b = el("button", "chip" + (n ? "" : " dim")); b.dataset.s = s;   // data-s colours the little dot in front of the name
    b.append((s === "ALL" ? "All" : lab[s]) + " ", el("span", "cnt", String(n)));
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
  const sig = [type, L.status, L.custom, q, JSON.stringify(f), ly.layout, ly.cols, ly.hideUnscored, ly.hideProgress, ly.hideAir, ly.showNotes, ly.showPriority, ly.quick, L.rev, view.length].join("|");
  // Anime and Manga share this one box, so a list may only skip redrawing when the box still shows ITS cards (body.dataset.list).
  // Without that check, going back to a list that had not changed left the other list's cards on screen.
  const mine = body.dataset.list === type;
  if(mine && sig === L.sig && L.drawn > 0 && L.drawn < shown){   // "Show more": add only the next batch
    view.slice(L.drawn, shown).forEach(e => body.append(lcard(e, type))); L.drawn = shown;
  }else if(!(mine && sig === L.sig && L.drawn === shown && shown > 0)){  // anything else that changed: rebuild
    body.className = lyBodyClass(); body.dataset.list = type;
    body.replaceChildren(...(view.length ? view.slice(0, shown).map(e => lcard(e, type)) : [emptyState(type, L)]));
    L.drawn = view.length ? shown : 0; L.sig = sig;
  }
  const more = $("#listMore"); more.hidden = view.length <= shown;
  more.textContent = "Show more (" + shown + " of " + view.length + ")";
  setListNote(L.offline ? "Offline. Showing your saved list" + (L.cachedAt ? " from " + new Date(L.cachedAt).toLocaleString() : "") + "." : L.refreshErr ? "Couldn't refresh your list (" + L.refreshErr + "). Showing your saved copy." : "");
  guardListLayout();
  if(opts && opts.keepScroll) window.scrollTo(0, y);
}
// Airing anime: "3 new" when episodes are out that you have not watched, otherwise when the next one airs.
function airIn(secs){ return secs <= 0 ? "now" : secs < 3600 ? Math.max(1, Math.round(secs / 60)) + "m" : secs < 86400 ? Math.round(secs / 3600) + "h" : Math.round(secs / 86400) + "d"; }
function airBadge(e, type){
  const a = e.m.nextAiringEpisode;
  if(type !== "anime" || !a || !a.airingAt || !a.episode || ["COMPLETED", "DROPPED"].includes(e.status)) return null;
  const behind = a.episode - 1 - e.progress, watching = ["CURRENT", "REPEATING"].includes(e.status);
  const b = el("span", "lair" + (watching && behind >= 1 ? " new" : ""), watching && behind >= 1 ? behind + " new" : "Ep " + a.episode + " · " + airIn(a.airingAt - Date.now() / 1000));
  b.title = "Episode " + a.episode + " airs " + new Date(a.airingAt * 1000).toLocaleString();
  return b;
}
// Little markers on a card: "Note" when the entry has a note, and its priority (AniList: 1-2 low, 3-4 medium, 5 high).
function lflags(e){
  const out = [];
  if(ly.showNotes && e.notes && e.notes.trim()){ const n = el("span", "lflag", "✎ Note"); n.title = "This title has a note"; out.push(n); }
  if(ly.showPriority && e.priority > 0){ const lvl = e.priority >= 5 ? "High" : e.priority >= 3 ? "Medium" : "Low"; out.push(el("span", "lflag lpri-" + lvl.toLowerCase(), "▲ " + lvl)); }
  return out;
}
// Long press on a card: quick view with progress buttons. holdAt remembers when it fired so the lift of the finger is not read as a tap.
let holdAt = 0;
function attachHold(node, fn){
  let t = 0, x0 = 0, y0 = 0; const stop = () => { clearTimeout(t); t = 0; };
  node.addEventListener("pointerdown", ev => {
    if(ev.button) return; x0 = ev.clientX; y0 = ev.clientY; stop();
    t = setTimeout(() => { t = 0; holdAt = Date.now(); try{ if(navigator.vibrate) navigator.vibrate(12); }catch(_){} fn(); }, 450);
  });
  node.addEventListener("pointermove", ev => { if(t && (Math.abs(ev.clientX - x0) > 10 || Math.abs(ev.clientY - y0) > 10)) stop(); });   // the finger is scrolling
  ["pointerup", "pointercancel", "pointerleave"].forEach(n => node.addEventListener(n, stop));
  node.addEventListener("contextmenu", ev => ev.preventDefault());   // no "save image" menu on a long press
}
let qvKey = null, qvAt = 0;
function openQuick(id, type){ qvKey = { id, type }; qvAt = Date.now(); drawQuick(); }
function drawQuick(){
  const k = qvKey, L = k && lists[k.type], e = L && L.entries && L.entries.find(x => x.id === k.id), box = $("#qvBox");
  if(!e){ $("#qv").hidden = true; return; }
  const m = e.m, type = k.type, total = type === "anime" ? m.episodes : m.chapters, lab = STATUS_LABEL(type)[e.status] || e.status;
  box.replaceChildren();
  const head = el("div", "qvhead"), img = new Image(); img.alt = ""; if(m.coverImage && m.coverImage.large) img.src = m.coverImage.large;
  const txt = el("div", "qvtxt"); txt.append(el("b", null, tt(m)), el("span", "sub", lab + " · ★ " + scoreText(e.score)));
  head.append(img, txt); box.append(head);
  const unit = type === "anime" ? "episode" : "chapter", row = el("div", "qvprog");
  const minus = el("button", "chip", "−1"), plus = el("button", "chip", "+1"), num = el("span", "qvnum", e.progress + " / " + (total || "?"));
  minus.type = plus.type = "button"; minus.setAttribute("aria-label", "Remove one " + unit); plus.setAttribute("aria-label", "Add one " + unit);
  minus.disabled = !auth.token || e.progress <= 0; plus.disabled = !auth.token || !!(total && e.progress >= total);
  const step = d => { minus.disabled = plus.disabled = true; track(e.id, type, { progress: e.progress + d }).then(r => { if(!r.ok && !r.queued) toast("Couldn't save progress: " + ((r.error && r.error.message) || "unknown error")); drawQuick(); }); };
  minus.onclick = () => step(-1); plus.onclick = () => step(1);
  row.append(minus, num, plus); box.append(row);
  const stat = el("div", "row qvstat");
  for(const [k, name] of Object.entries(STATUS_LABEL(type))){
    const c = el("button", "chip", name); c.type = "button"; c.setAttribute("aria-pressed", String(e.status === k)); c.disabled = !auth.token;
    c.onclick = () => { if(e.status === k) return; track(e.id, type, { status: k }).then(r => { if(!r.ok && !r.queued) toast("Couldn't change the status: " + ((r.error && r.error.message) || "unknown error")); drawQuick(); }); };
    stat.append(c);
  }
  box.append(stat);
  const bits = [];
  if(e.priority > 0) bits.push("Priority: " + (e.priority >= 5 ? "High" : e.priority >= 3 ? "Medium" : "Low"));
  if(e.repeat) bits.push((type === "anime" ? "Rewatched " : "Reread ") + e.repeat + "×");
  if(bits.length) box.append(el("p", "sub", bits.join(" · ")));
  if(e.notes && e.notes.trim()) box.append(el("p", "qvnote", e.notes.length >= 300 ? e.notes.trim() + "…" : e.notes.trim()));
  const open = el("button", "go", "Open page"); open.type = "button"; open.onclick = () => { $("#qv").hidden = true; openMedia(m.id); };
  box.append(open);
  $("#qv").hidden = false;
}
// ro = read-only: somebody else's list (no +1 button, no quick view to change things)
function lcard(e, type, ro){
  const m = e.m, total = type === "anime" ? m.episodes : m.chapters, lab = STATUS_LABEL(type)[e.status] || e.status;
  const card = el("div", "lcard"); card.dataset.s = e.status;
  const main = el("button", "lmain"); main.type = "button";
  main.setAttribute("aria-label", tt(m) + ", " + lab + ", " + e.progress + " of " + (total || "unknown"));
  const cover = el("div", "lcover"), img = new Image(); img.alt = ""; img.loading = "lazy";
  if(m.coverImage && m.coverImage.large && ly.layout !== "simplified") setCover(img, m.coverImage.large, ly.layout === "linear");   // Simplified has no covers, so none are downloaded; Linear shows a 64px cover, so it gets the small file
  cover.append(img, el("span", "sb", lab));
  const air = ly.hideAir ? null : airBadge(e, type); if(air) cover.append(air);
  const info = el("div", "li"), meta = el("div", "lm");
  info.append(el("div", "lt", tt(m)), el("div", "ls", lab + (air && ly.layout === "simplified" ? " · " + air.textContent : "")));   // Simplified has no cover to carry the airing badge
  const flags = lflags(e); if(flags.length){ const fr = el("div", "lflags"); fr.append(...flags); info.append(fr); }
  if(!(ly.hideUnscored && !e.score)) meta.append(el("span", "sc", "★ " + scoreText(e.score)));
  if(!ly.hideProgress) meta.append(el("span", "lp", e.progress + " / " + (total || "?")));
  info.append(meta);
  if(!ly.hideProgress && total){ const tr = el("div", "ltrack"), fill = el("i"); fill.style.width = Math.min(100, Math.round(e.progress / total * 100)) + "%"; tr.append(fill); info.append(tr); }
  main.append(cover, info); main.onclick = () => { if(Date.now() - holdAt < 800) return; openMedia(m.id); }; card.append(main);   // the tap that ends a long press must not also open the page
  if(ly.quick && !ro) attachHold(main, () => openQuick(e.id, type));
  if(!ro && auth.token && ["CURRENT", "REPEATING", "PLANNING", "PAUSED"].includes(e.status) && !(total && e.progress >= total)){
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
$("#qv").addEventListener("click", ev => { if(ev.target.id === "qv" && Date.now() - qvAt > 350) $("#qv").hidden = true; });
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
const CS_FLAGS = { csQuick: "quick", csHideUnscored: "hideUnscored", csHideAir: "hideAir", csShowNotes: "showNotes", csShowPriority: "showPriority", csHideProgress: "hideProgress" };
function drawBgState(){
  const has = !!lyBg;
  $("#csBgPrev").style.backgroundImage = has ? 'url("' + lyBg + '")' : ""; $("#csBgPrev").hidden = !has;
  $("#csBgNote").textContent = has ? "Image set. It shows behind your Anime and Manga lists." : "No image selected"; $("#csBgClear").hidden = !has;
}
function applyListBg(){ const b = $("#listBg"); b.style.backgroundImage = lyBg ? 'url("' + lyBg + '")' : ""; b.hidden = !lyBg; $("#lists").classList.toggle("hasbg", !!lyBg); }   // "hasbg" lets the status bar match the dimmed picture instead of showing as a dark stripe
// A phone photo is too big to keep as it is: it is shrunk to at most 1600 px on the long side and saved as a JPEG.
function readBgFile(file){
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      try{
        const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); res(c.toDataURL("image/jpeg", 0.72));
      }catch(err){ URL.revokeObjectURL(url); rej(err); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("The app can't read that file as a picture.")); };
    img.src = url;
  });
}
function openCust(){
  chipSet("#csLayout", ly.layout); chipSet("#csCols", String(ly.cols)); $("#csColsBox").hidden = !(ly.layout === "grid" || ly.layout === "album");
  for(const [id, k] of Object.entries(CS_FLAGS)) $("#" + id).checked = !!ly[k];
  drawBgState(); $("#csheet").hidden = false; $("#csheet").scrollTop = 0;
}
$("#lCustBtn").onclick = openCust; $("#custOpen").onclick = openCust;
$("#csBack").onclick = () => { $("#csheet").hidden = true; };
$("#csLayout").addEventListener("click", ev => { const b = ev.target.closest(".chip"); if(b && LY_TYPES.includes(b.dataset.v)){ ly.layout = b.dataset.v; chipSet("#csLayout", ly.layout); $("#csColsBox").hidden = !(ly.layout === "grid" || ly.layout === "album"); saveLy(); } });
$("#csCols").addEventListener("click", ev => { const b = ev.target.closest(".chip"); if(b){ ly.cols = +b.dataset.v; chipSet("#csCols", String(ly.cols)); saveLy(); } });
for(const [id, k] of Object.entries(CS_FLAGS)) $("#" + id).onchange = ev => { ly[k] = ev.target.checked; saveLy(); };
$("#csBgPick").onclick = () => { $("#csBgFile").value = ""; $("#csBgFile").click(); };
$("#csBgFile").onchange = async ev => {
  const f = ev.target.files && ev.target.files[0]; if(!f) return;
  try{
    const data = await readBgFile(f);
    try{ localStorage.setItem(LYBG_KEY, data); }catch(_){ toast("Couldn't save the picture: the phone has no room left for it."); return; }
    lyBg = data; applyListBg(); drawBgState();
  }catch(err){ toast(err.message || "Couldn't use that picture."); }
};
$("#csReset").onclick = () => {
  Object.assign(ly, { layout: "grid", cols: 3, hideUnscored: false, hideProgress: false, quick: true, hideAir: false, showNotes: false, showPriority: false });
  lyBg = ""; try{ localStorage.removeItem(LYBG_KEY); }catch(_){} applyListBg(); LSset("wn_ly", ly); renderList(); openCust();
};
$("#csBgClear").onclick = () => { lyBg = ""; try{ localStorage.removeItem(LYBG_KEY); }catch(_){} applyListBg(); drawBgState(); };
applyListBg();

// Long-press the list title to see what the list actually rendered (for bug reports).
(function(){
  let t = null; const title = $("#listTitle");
  const start = () => { t = setTimeout(async () => { const p = $("#listDiag"); p.hidden = false; p.textContent = await diagReport(); }, 700); };
  const stop = () => { clearTimeout(t); };
  ["pointerdown", "touchstart"].forEach(n => title.addEventListener(n, start)); ["pointerup", "pointerleave", "touchend", "touchmove"].forEach(n => title.addEventListener(n, stop));
})();
