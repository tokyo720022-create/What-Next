/* js/features/discover.js: Discover tab. Live search, Explore (anime, manga, characters, staff, studios, users), filters, For you, Rediscover */
// ---------- Discover ----------
const GENRES = ["Action","Adventure","Comedy","Drama","Ecchi","Fantasy","Hentai","Horror","Mahou Shoujo","Mecha","Music","Mystery","Psychological","Romance","Sci-Fi","Slice of Life","Sports","Supernatural","Thriller"];

// ----- shared helpers (also used by Seasonal and Calendar) -----
const ST_LABEL = { CURRENT: ["Watching", "Reading"], REPEATING: ["Rewatching", "Rereading"], PLANNING: ["Planning", "Planning"], COMPLETED: ["Completed", "Completed"], PAUSED: ["Paused", "Paused"], DROPPED: ["Dropped", "Dropped"] };
const nf = n => (n == null ? "–" : Number(n).toLocaleString());
function statusChip(m){
  const st = m.mediaListEntry && m.mediaListEntry.status; if(!st) return null;
  const c = el("span", "dst s-" + st), d = el("i"); c.append(d, (ST_LABEL[st] || [st, st])[m.type === "MANGA" ? 1 : 0]); return c;
}
function planBtn(m, after){   // + Planning, only ever for titles that are not on your list
  const b = el("button", "mini dplan", "+ Planning");
  b.onclick = async ev => {
    ev.stopPropagation(); b.disabled = true; b.textContent = "Adding…";
    const r = await trackSave(m.id, m.type === "MANGA" ? "manga" : "anime", { status: "PLANNING" }, { quiet: true });
    if(r.ok || r.queued){ m.mediaListEntry = { status: "PLANNING" }; after(); } else { b.disabled = false; b.textContent = "+ Planning"; toast("Couldn't add: " + ((r.error && r.error.message) || "error")); }
  };
  return b;
}
function pickSheet(title, pairs, current, onPick){   // bottom sheet with one tap choices
  const sh = el("div", "dsheet"), box = el("div", "dsheetbox"); box.append(el("div", "dgrip"));
  if(title) box.append(el("h3", null, title));
  for(const [v, label] of pairs){ const b = el("button", "dopt" + (String(v) === String(current) ? " on" : ""), label); b.onclick = () => { sh.remove(); onPick(v); }; box.append(b); }
  sh.onclick = e => { if(e.target === sh) sh.remove(); }; sh.append(box); document.body.append(sh); return sh;
}

// ----- state -----
const DK = [["anime", "Anime"], ["manga", "Manga"], ["characters", "Characters"], ["staff", "Staff"], ["studios", "Studios"], ["users", "Users"]];
const dxDefault = kind => kind === "anime" || kind === "manga" ? { sort: "POPULARITY_DESC", genres: [], tags: [], year: "", season: "", format: "", status: "", country: "", source: "", onList: "", adult: "HIDE" } : { sort: "FAVOURITES_DESC", birthday: false };
const dx = { kind: "anime", q: "", page: 1, hasNext: false, busy: false, token: 0, rank: 0, mode: "hub", f: {} };
for(const [k] of DK) dx.f[k] = dxDefault(k);
try{ const s = JSON.parse(localStorage.getItem("wn_dfilters") || "null"); if(s) for(const k of Object.keys(dx.f)) if(s[k]) dx.f[k] = Object.assign(dxDefault(k), s[k]); }catch(_){}
const dxSave = () => { try{ localStorage.setItem("wn_dfilters", JSON.stringify(dx.f)); }catch(_){} };

const DX_MEDIA = "id type format status isAdult title{romaji english native} countryOfOrigin coverImage{large} averageScore popularity favourites seasonYear episodes chapters genres mediaListEntry{status} studios(isMain:true){nodes{name}}";
const DX_Q = {
  media: "query($p:Int,$type:MediaType,$q:String,$sort:[MediaSort],$genres:[String],$tags:[String],$year:Int,$season:MediaSeason,$format:MediaFormat,$status:MediaStatus,$country:CountryCode,$source:MediaSource,$adult:Boolean,$onList:Boolean,$statusNot:MediaStatus){Page(page:$p,perPage:30){pageInfo{hasNextPage} media(type:$type,search:$q,sort:$sort,genre_in:$genres,tag_in:$tags,seasonYear:$year,season:$season,format:$format,status:$status,countryOfOrigin:$country,source:$source,isAdult:$adult,onList:$onList,status_not:$statusNot){" + DX_MEDIA + "}}}",
  characters: "query($p:Int,$q:String,$sort:[CharacterSort],$bd:Boolean){Page(page:$p,perPage:30){pageInfo{hasNextPage} characters(search:$q,sort:$sort,isBirthday:$bd){id name{full native} image{large} favourites}}}",
  staff: "query($p:Int,$q:String,$sort:[StaffSort]){Page(page:$p,perPage:30){pageInfo{hasNextPage} staff(search:$q,sort:$sort){id name{full native} image{large} favourites primaryOccupations}}}",
  studios: "query($p:Int,$q:String,$sort:[StudioSort]){Page(page:$p,perPage:30){pageInfo{hasNextPage} studios(search:$q,sort:$sort){id name favourites isAnimationStudio media(sort:POPULARITY_DESC,isMain:true,perPage:1){nodes{coverImage{medium}}}}}}",
  users: "query($p:Int,$q:String){Page(page:$p,perPage:30){pageInfo{hasNextPage} users(search:$q){id name avatar{large} bannerImage isFollowing isFollower}}}",
};
function dxBuild(){
  const k = dx.kind, f = dx.f[k], q = dx.q.trim(), v = { p: dx.page };
  if(q) v.q = q;
  if(k === "anime" || k === "manga"){
    v.type = k.toUpperCase(); v.sort = [q && f.sort === "POPULARITY_DESC" ? "SEARCH_MATCH" : f.sort];
    if(f.genres.length) v.genres = f.genres; if(f.tags.length) v.tags = f.tags;
    if(f.year) v.year = +f.year; if(f.season && k === "anime") v.season = f.season; if(f.format) v.format = f.format; if(f.status) v.status = f.status;
    if(f.country) v.country = f.country; if(f.source) v.source = f.source;
    if(f.adult === "HIDE") v.adult = false; else if(f.adult === "ONLY") v.adult = true;
    if(f.onList === "HIDE") v.onList = false; else if(f.onList === "ONLY") v.onList = true;
    if(!q && !f.status && !f.year && f.sort === "POPULARITY_DESC") v.statusNot = "NOT_YET_RELEASED";
    return [DX_Q.media, v];
  }
  v.sort = [q ? "SEARCH_MATCH" : f.sort];
  if(k === "characters" && f.birthday) v.bd = true;
  return [DX_Q[k], v];
}
const dxKey = k => (k === "anime" || k === "manga" ? "media" : k);
const dxLabel = k => DK.find(x => x[0] === k)[1];

// ----- cards -----
function dxRank(n){ return n ? el("span", "drank", String(n)) : null; }
function dxMediaCard(m, rank, opts){
  opts = opts || {};
  const c = el("div", "dcard"), cov = el("div", "dcov"), img = el("img"), info = el("div", "dinfo");
  img.src = (m.coverImage && m.coverImage.large) || ""; img.alt = ""; img.loading = "lazy"; cov.append(img); const r = dxRank(rank); if(r) cov.append(r);
  const studio = m.studios && m.studios.nodes && m.studios.nodes[0] && m.studios.nodes[0].name;
  info.append(el("b", null, tt(m)), el("span", "dsub", [norm(m.format) || m.type, m.seasonYear, studio, m.episodes ? m.episodes + " ep" : m.chapters ? m.chapters + " ch" : ""].filter(Boolean).join(" · ")));
  const stats = el("div", "dstat"); stats.append(el("span", null, "★ " + (m.averageScore || "–")), el("span", null, "♥ " + nf(m.favourites))); info.append(stats);
  const foot = el("div", "dfoot"), draw = () => { foot.replaceChildren(); const chip = statusChip(m); if(chip) foot.append(chip); else foot.append(planBtn(m, draw)); if(opts.hideBtn){ const x = el("button", "mini", "Not interested"); x.onclick = ev => { ev.stopPropagation(); hide.add(m.id); saveHide(); c.remove(); }; foot.append(x); } };
  draw(); info.append(foot); c.append(cov, info); c.onclick = ev => { if(!ev.target.closest("button")) openMedia(m.id); }; return c;
}
function dxPersonCard(kind, it, rank){
  const c = el("div", "dcard"), cov = el("div", "dcov"), img = el("img"), info = el("div", "dinfo");
  const pic = kind === "studios" ? (it.media && it.media.nodes && it.media.nodes[0] && it.media.nodes[0].coverImage && it.media.nodes[0].coverImage.medium) : (it.image && it.image.large);
  img.src = pic || ""; img.alt = ""; img.loading = "lazy"; cov.append(img); const r = dxRank(rank); if(r) cov.append(r);
  const name = kind === "studios" ? it.name : it.name.full;
  info.append(el("b", null, name));
  const sub = kind === "staff" ? (it.primaryOccupations || []).join(", ") : kind === "studios" ? (it.isAnimationStudio ? "Animation studio" : "Studio") : (it.name.native || "");
  if(sub) info.append(el("span", "dsub", sub));
  const stats = el("div", "dstat"); stats.append(el("span", null, "♥ " + nf(it.favourites))); info.append(stats);
  c.append(cov, info); c.onclick = () => openEntity({ characters: "character", staff: "staff", studios: "studio" }[kind], it.id); return c;
}
function dxEmpty(text, retry){
  const m = el("div", "msg state"); m.append(el("span", null, text));
  if(retry){ const b = el("button", "go alt", "Try again"); b.onclick = retry; m.append(b); } return m;
}

// ----- loading: ranking when the box is empty, live search while typing -----
function dxTitle(){ const q = dx.q.trim(); $("#dTitle").textContent = q ? "Results for “" + q + "”" : "Explore " + dxLabel(dx.kind); }
async function dxLoad(reset){
  const list = $("#dlist"), more = $("#dmore");
  if(reset){ dx.page = 1; dx.rank = 0; dx.token++; dx.hasNext = false; more.hidden = true; list.replaceChildren(el("div", "msg", "Searching…")); dxTitle(); }
  else if(dx.busy || !dx.hasNext) return;
  const token = dx.token, kind = dx.kind, q = dx.q.trim(); dx.busy = true;
  try{
    if(kind === "users" && !q){ list.replaceChildren(dxEmpty("Type a name to find AniList users.")); dx.busy = false; return; }
    const [query, vars] = dxBuild(), { json } = await gql(query, vars);
    if(token !== dx.token) return;
    const pg = json.data && json.data.Page; if(!pg) throw new Error((json.errors && json.errors[0] && json.errors[0].message) || "No data");
    if(reset) list.replaceChildren();
    let items = pg[dxKey(kind)] || [];
    if(kind === "anime" || kind === "manga") items = items.filter(m => !hide.has(m.id));
    for(const it of items){
      const rank = q ? 0 : ++dx.rank;
      list.append(kind === "anime" || kind === "manga" ? dxMediaCard(it, rank) : kind === "users" ? uCard(it) : dxPersonCard(kind, it, rank));
    }
    if(!list.children.length) list.append(dxEmpty(q ? "Nothing found for “" + q + "”. Try different words or fewer filters." : "No results. Try fewer filters."));
    dx.hasNext = !!(pg.pageInfo && pg.pageInfo.hasNextPage); dx.page++;
  }catch(err){
    if(token !== dx.token) return;
    list.replaceChildren(dxEmpty(/Failed to fetch|NetworkError|Load failed/i.test(err.message) ? "Couldn't reach AniList. Check your connection." : err.message, () => dxLoad(true))); dx.hasNext = false;
  }finally{
    if(token === dx.token){ dx.busy = false; more.hidden = !(dx.hasNext && !("IntersectionObserver" in window)); dxWatch(); }
  }
}
let dxObs = null;
function dxWatch(){ if(dxObs){ dxObs.disconnect(); dxObs.observe($("#dSentinel")); } }
if("IntersectionObserver" in window){ dxObs = new IntersectionObserver(es => { if(es.some(e => e.isIntersecting) && dx.mode === "hub" && !$("#discover").hidden) dxLoad(false); }, { rootMargin: "400px" }); dxObs.observe($("#dSentinel")); }
$("#dmore").onclick = () => dxLoad(false);

// typing searches by itself after a short pause
let dxTimer = 0;
$("#dq").addEventListener("input", () => {
  clearTimeout(dxTimer);
  dxTimer = setTimeout(() => { dx.q = $("#dq").value; $("#dTiles").hidden = !!dx.q.trim(); dxLoad(true); }, 350);
});
$("#dq").addEventListener("keydown", e => { if(e.key === "Enter"){ clearTimeout(dxTimer); dx.q = $("#dq").value; $("#dTiles").hidden = !!dx.q.trim(); dxLoad(true); $("#dq").blur(); } });
$("#dKinds").addEventListener("click", ev => {
  const b = ev.target.closest(".chip"); if(!b || b.dataset.k === dx.kind) return;
  dx.kind = b.dataset.k; $("#dKinds").querySelectorAll(".chip").forEach(c => c.setAttribute("aria-pressed", String(c === b)));
  $("#dq").placeholder = "Search " + dxLabel(dx.kind).toLowerCase(); dxBadge(); dxLoad(true);
});

// ----- filters -----
const dxChanged = (k, f) => { const d = dxDefault(k); return Object.keys(d).filter(x => JSON.stringify(f[x]) !== JSON.stringify(d[x])).length; };
function dxBadge(){ const n = dxChanged(dx.kind, dx.f[dx.kind]), b = $("#dFilterN"); b.hidden = !n; b.textContent = n; $("#dFilterBtn").hidden = dx.kind === "users"; }
const DX_YEARS = [["", "Any year"], ...Array.from({ length: new Date().getFullYear() + 2 - 1960 }, (_, i) => { const y = new Date().getFullYear() + 1 - i; return [String(y), String(y)]; })];
const DX_OPTS = {
  sortMedia: [["POPULARITY_DESC", "Popularity"], ["TRENDING_DESC", "Trending"], ["SCORE_DESC", "Average score"], ["FAVOURITES_DESC", "Favorites"], ["START_DATE_DESC", "Newest"], ["START_DATE", "Oldest"], ["TITLE_ROMAJI", "Title A to Z"], ["UPDATED_AT_DESC", "Recently updated"]],
  season: [["", "Any season"], ["WINTER", "Winter"], ["SPRING", "Spring"], ["SUMMER", "Summer"], ["FALL", "Fall"]],
  formatAnime: [["", "Any format"], ["TV", "TV"], ["TV_SHORT", "TV short"], ["MOVIE", "Movie"], ["SPECIAL", "Special"], ["OVA", "OVA"], ["ONA", "ONA"], ["MUSIC", "Music"]],
  formatManga: [["", "Any format"], ["MANGA", "Manga"], ["NOVEL", "Light novel"], ["ONE_SHOT", "One shot"]],
  status: [["", "Any status"], ["RELEASING", "Releasing"], ["FINISHED", "Finished"], ["NOT_YET_RELEASED", "Not yet released"], ["CANCELLED", "Cancelled"], ["HIATUS", "Hiatus"]],
  country: [["", "Any country"], ["JP", "Japan"], ["KR", "South Korea"], ["CN", "China"], ["TW", "Taiwan"]],
  source: [["", "Any source"], ["ORIGINAL", "Original"], ["MANGA", "Manga"], ["LIGHT_NOVEL", "Light novel"], ["VISUAL_NOVEL", "Visual novel"], ["VIDEO_GAME", "Video game"], ["NOVEL", "Novel"], ["WEB_NOVEL", "Web novel"], ["DOUJINSHI", "Doujinshi"], ["ANIME", "Anime"], ["LIVE_ACTION", "Live action"], ["GAME", "Game"], ["COMIC", "Comic"], ["MULTIMEDIA_PROJECT", "Multimedia project"], ["PICTURE_BOOK", "Picture book"], ["OTHER", "Other"]],
  onList: [["", "Everything"], ["HIDE", "Hide series on my list"], ["ONLY", "Only series on my list"]],
  adult: [["HIDE", "Hide 18+"], ["ALL", "Include 18+"], ["ONLY", "Only 18+"]],
  sortChar: [["FAVOURITES_DESC", "Favorites"], ["ID_DESC", "Newest"]], sortStaff: [["FAVOURITES_DESC", "Favorites"], ["ID_DESC", "Newest"]], sortStudio: [["FAVOURITES_DESC", "Favorites"], ["NAME", "Name"], ["ID_DESC", "Newest"]],
};
function dxSelectRow(label, value, pairs, fn){
  const row = el("label", "lsrow"), s = el("select", "lssel");
  for(const [v, t] of pairs){ const o = el("option", null, t); o.value = v; s.append(o); }
  s.value = value; s.onchange = () => fn(s.value); row.append(el("span", null, label), s); return row;
}
async function dxTagList(){
  try{ const c = JSON.parse(localStorage.getItem("wn_tagcol") || "null"); if(c && Date.now() - c.at < 7 * 86400000 && c.tags.length) return c.tags; }catch(_){}
  const { json } = await gql("query{MediaTagCollection{name category isAdult}}", {});
  const tags = (json.data && json.data.MediaTagCollection) || []; if(!tags.length) throw new Error("No tags");
  try{ localStorage.setItem("wn_tagcol", JSON.stringify({ at: Date.now(), tags })); }catch(_){}
  return tags;
}
function dxTagPicker(draft, done){
  const sh = el("div", "dsheet"), box = el("div", "dsheetbox tall"); box.append(el("div", "dgrip"), el("h3", null, "Tags"));
  const inp = el("input"); inp.placeholder = "Search tags"; inp.autocomplete = "off"; const list = el("div", "dtaglist"); box.append(inp, list);
  const fin = el("button", "go", "Done"); fin.onclick = () => { sh.remove(); done(); }; box.append(fin);
  const draw = tags => { list.replaceChildren(); const q = inp.value.trim().toLowerCase();
    for(const t of tags.filter(t => (draft.adult !== "HIDE" || !t.isAdult) && (!q || t.name.toLowerCase().includes(q))).slice(0, 120)){
      const r = el("label", "dtag"), c = el("input"); c.type = "checkbox"; c.checked = draft.tags.includes(t.name);
      c.onchange = () => { draft.tags = c.checked ? [...draft.tags, t.name] : draft.tags.filter(x => x !== t.name); };
      const nm = el("span"); nm.append(el("b", null, t.name), el("small", null, t.category || "")); r.append(c, nm); list.append(r); } };
  dxTagList().then(tags => { draw(tags); inp.oninput = () => draw(tags); }).catch(() => list.append(el("p", "sub", "Couldn't load tags. Check your connection.")));
  sh.onclick = e => { if(e.target === sh){ sh.remove(); done(); } }; sh.append(box); document.body.append(sh);
}
function dxFilterSheet(){
  const k = dx.kind, draft = JSON.parse(JSON.stringify(dx.f[k])), sh = el("div", "dsheet"), box = el("div", "dsheetbox tall"), body = el("div");
  box.append(el("div", "dgrip"), el("h3", null, "Filters · " + dxLabel(k)), body); sh.append(box);
  const draw = () => {
    body.replaceChildren(); const media = k === "anime" || k === "manga";
    if(media){
      body.append(dxSelectRow("Sort", draft.sort, DX_OPTS.sortMedia, v => { draft.sort = v; }));
      const gl = el("div", "q", "Genres"); body.append(gl); const gc = el("div", "dgenres");
      for(const g of GENRES){ const c = el("button", "chip", g); c.setAttribute("aria-pressed", String(draft.genres.includes(g))); c.onclick = () => { draft.genres = draft.genres.includes(g) ? draft.genres.filter(x => x !== g) : [...draft.genres, g]; c.setAttribute("aria-pressed", String(draft.genres.includes(g))); }; gc.append(c); }
      body.append(gc);
      const tg = el("button", "go alt", draft.tags.length ? "Tags: " + draft.tags.slice(0, 3).join(", ") + (draft.tags.length > 3 ? " +" + (draft.tags.length - 3) : "") : "Choose tags"); tg.onclick = () => dxTagPicker(draft, draw); body.append(tg);
      body.append(dxSelectRow("Year", draft.year, DX_YEARS, v => { draft.year = v; }));
      if(k === "anime") body.append(dxSelectRow("Season", draft.season, DX_OPTS.season, v => { draft.season = v; }));
      body.append(dxSelectRow("Format", draft.format, k === "anime" ? DX_OPTS.formatAnime : DX_OPTS.formatManga, v => { draft.format = v; }),
        dxSelectRow("Status", draft.status, DX_OPTS.status, v => { draft.status = v; }), dxSelectRow("Country", draft.country, DX_OPTS.country, v => { draft.country = v; }),
        dxSelectRow("Source", draft.source, DX_OPTS.source, v => { draft.source = v; }), dxSelectRow("On my list", draft.onList, DX_OPTS.onList, v => { draft.onList = v; }),
        dxSelectRow("18+ content", draft.adult, DX_OPTS.adult, v => { draft.adult = v; draw(); }));
    }else{
      body.append(dxSelectRow("Sort", draft.sort, k === "characters" ? DX_OPTS.sortChar : k === "staff" ? DX_OPTS.sortStaff : DX_OPTS.sortStudio, v => { draft.sort = v; }));
      if(k === "characters"){ const r = el("label", "lsrow"), c = el("input", "lssw"); c.type = "checkbox"; c.checked = draft.birthday; c.onchange = () => { draft.birthday = c.checked; }; r.append(el("span", null, "Birthday today"), c, el("i", "lsck")); body.append(r); }
    }
  };
  draw();
  const bar = el("div", "dsheetbar"), reset = el("button", "go alt", "Reset"), apply = el("button", "go", "Apply");
  reset.onclick = () => { Object.assign(draft, dxDefault(k)); draw(); };
  apply.onclick = () => { dx.f[k] = draft; dxSave(); sh.remove(); dxBadge(); dxLoad(true); };
  bar.append(reset, apply); box.append(bar);
  sh.onclick = e => { if(e.target === sh) sh.remove(); }; document.body.append(sh);
}
$("#dFilterBtn").onclick = dxFilterSheet;

// ----- For you and Rediscover -----
const DM = { type: "anime", page: 1, hasNext: false };
function dmShow(mode){
  dx.mode = mode; $("#dHub").hidden = mode !== "hub"; $("#dMode").hidden = mode === "hub"; window.scrollTo(0, 0);
  if(mode === "hub") return;
  $("#dmTitle").textContent = mode === "foryou" ? "For you" : "Rediscover";
  $("#dmType").hidden = mode !== "foryou"; DM.page = 1; dmLoad(true);
}
async function dmLoad(reset){
  const list = $("#dmlist"), more = $("#dmMore");
  if(reset){ list.replaceChildren(el("div", "msg", dx.mode === "foryou" ? "Finding titles you may like…" : "Checking your paused and dropped titles…")); more.hidden = true; }
  try{
    if(dx.mode === "foryou"){
      const g = topGenres(), vars = { p: DM.page, type: DM.type.toUpperCase(), sort: ["TRENDING_DESC"], adult: false, onList: false, statusNot: "NOT_YET_RELEASED" }; if(g.length) vars.genres = g;
      const { json } = await gql(DX_Q.media, vars), pg = json.data && json.data.Page; if(!pg) throw new Error((json.errors && json.errors[0] && json.errors[0].message) || "No data");
      if(reset) list.replaceChildren();
      for(const m of pg.media.filter(m => !hide.has(m.id))) list.append(dxMediaCard(m, 0, { hideBtn: true }));
      if(!list.children.length) list.append(dxEmpty("Nothing new to suggest right now."));
      DM.hasNext = pg.pageInfo.hasNextPage; DM.page++; more.hidden = !DM.hasNext;
    }else{
      const part = "{lists{entries{score(format:POINT_100) media{...M}}}}";
      const { json } = await gql("query($u:String){a:MediaListCollection(userName:$u,type:ANIME,status_in:[PAUSED,DROPPED])" + part + " m:MediaListCollection(userName:$u,type:MANGA,status_in:[PAUSED,DROPPED])" + part + "} fragment M on Media{" + DX_MEDIA + "}", { u: state.user });
      if(json.errors && !json.data) throw new Error((json.errors[0] && json.errors[0].message) || "No data");
      const seen = new Map();
      for(const k of ["a", "m"]) for(const l of (json.data[k] && json.data[k].lists) || []) for(const en of l.entries){ if(!hide.has(en.media.id) && !seen.has(en.media.id)) seen.set(en.media.id, { m: en.media, s: en.score || en.media.averageScore || 0 }); }
      const rows = [...seen.values()].sort((a, b) => b.s - a.s).slice(0, 20);
      list.replaceChildren(...(rows.length ? rows.map(r => dxMediaCard(r.m, 0)) : [dxEmpty("Nothing paused or dropped on your list.")]));
    }
  }catch(err){ list.replaceChildren(dxEmpty(/Failed to fetch|NetworkError|Load failed/i.test(err.message) ? "Couldn't reach AniList. Check your connection." : err.message, () => dmLoad(true))); more.hidden = true; }
}
$("#dmBack").onclick = () => dmShow("hub");
$("#dmMore").onclick = () => dmLoad(false);
$("#dmType").addEventListener("click", ev => { const b = ev.target.closest(".chip"); if(!b) return; DM.type = b.dataset.k; $("#dmType").querySelectorAll(".chip").forEach(c => c.setAttribute("aria-pressed", String(c === b))); DM.page = 1; dmLoad(true); });
$("#dTiles").addEventListener("click", ev => {
  const b = ev.target.closest(".dtile"); if(!b) return;
  if(b.dataset.to) showTab(b.dataset.to); else dmShow(b.dataset.mode);
});

function discoverOpen(){
  if(dx.mode !== "hub") dmShow("hub");
  $("#dq").placeholder = "Search " + dxLabel(dx.kind).toLowerCase(); dxBadge();
  if(!$("#dlist").children.length) dxLoad(true);
}
