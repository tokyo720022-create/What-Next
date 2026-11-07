/* js/features/profile-extra.js: Profile > Tendencies and Favourites, and refreshing the whole Profile screen */
// ---------- Tendencies ----------
// The basic fields always work. The extra ones (formats, studios, countries, time spent) make the Tendencies richer; if AniList refuses them, the basic query is used.
const TEND_BASIC = "count meanScore statuses{status count} genres(limit:40,sort:COUNT_DESC){genre count meanScore} tags(limit:40,sort:COUNT_DESC){tag{name category} count meanScore} releaseYears{releaseYear count meanScore} startYears{startYear count}";
const TEND_PLUS = " minutesWatched episodesWatched chaptersRead volumesRead formats{format count} countries{country count} studios(limit:6,sort:COUNT_DESC){studio{name} count meanScore}";
const tendQ = plus => "query{Viewer{statistics{anime{" + TEND_BASIC + (plus ? TEND_PLUS : "") + "} manga{" + TEND_BASIC + (plus ? TEND_PLUS : "") + "}}}}";
const TEND_FRESH = 6 * 3600000, FAV_FRESH = 6 * 3600000;   // saved Tendencies and Favourites are shown at once and refreshed quietly after 6 hours
const pe = { tend: null, tendP: null, tendKind: "anime", favKind: "anime", fav: {}, favP: {} };
const offlineMsg = err => isNetErr(err) ? "Couldn't reach AniList. Check your connection." : err.message;

function tendRender(){
  const box = $("#tendList"); box.replaceChildren();
  document.querySelectorAll("#tendKinds .chip").forEach(c => c.setAttribute("aria-pressed", String(c.dataset.v === pe.tendKind)));
  const stat = pe.tend && pe.tend[pe.tendKind], lines = tzTendencies(stat, pe.tendKind);
  if(!lines.length){ box.append(el("p", "pfmuted", "Not enough " + pe.tendKind + " on your list yet to see tendencies.")); return; }
  const bars = tzTopGenres(stat, 5);
  if(bars.length){
    box.append(el("div", "pfgrp", "Top genres"));
    const wrap = el("div", "tgbars");
    for(const g of bars){
      const row = el("div", "tgrow"), track = el("div", "tgbar"), fill = el("i");
      fill.style.width = Math.max(3, g.pct) + "%"; fill.style.background = (typeof AS_GENRE_COLORS !== "undefined" && AS_GENRE_COLORS[g.name]) || "var(--sakura)";
      track.append(fill); row.append(el("span", "tgname", g.name), track, el("span", "tgval", g.pct + "%" + (g.mean ? " · " + g.mean : "")));
      wrap.append(row);
    }
    box.append(wrap, el("p", "pfnote tgnote", "Share of your titles with the genre · your average score for it"));
  }
  let group = "";
  for(const l of lines){
    if(l.group !== group){ group = l.group; box.append(el("div", "pfgrp", group === "taste" ? "Taste" : "Habits")); }
    const [a, hl, b] = l.parts, row = el("div", "pftitem"), strong = el("b", "pfhl"), parts = hl.split("/"), icon = el("span", "pficon", l.icon);
    icon.setAttribute("aria-hidden", "true");
    parts.forEach((x, i) => { strong.append(x + (i < parts.length - 1 ? "/" : "")); if(i < parts.length - 1) strong.append(document.createElement("wbr")); });   // lets a long "A/B/C" wrap after a slash
    row.append(icon, a, strong, b); box.append(row);
  }
}
function tendLoad(){
  if(pe.tend){ tendRender(); return Promise.resolve(); }
  if(pe.tendP) return pe.tendP;
  const name = "tend_" + acctUser(), saved = cacheMetaAs("acct", name, CACHE_OK.stats);
  let quiet = false;
  if(saved){
    pe.tend = saved.d;
    try{ tendRender(); quiet = true; }catch(_){ pe.tend = null; cacheDel("acct", name); }   // a damaged saved copy is thrown away
    if(quiet && saved.age < TEND_FRESH) return Promise.resolve();
  }
  if(!quiet) $("#tendList").replaceChildren(el("p", "pfmuted", "Reading your stats…"));
  pe.tendP = (async () => {
    try{
      let { json } = await gql(tendQ(true), {}), st = json.data && json.data.Viewer && json.data.Viewer.statistics;
      if(!st) ({ json } = await gql(tendQ(false), {})), st = json.data && json.data.Viewer && json.data.Viewer.statistics;   // without the extras
      if(!st) throw new Error("AniList said: " + ((json.errors && json.errors[0] && json.errors[0].message) || "no data"));
      pe.tend = st; cacheSet("acct", name, st); tendRender();
    }catch(err){ if(!quiet) { pe.tend = null; $("#tendList").replaceChildren(dxEmpty(offlineMsg(err), () => { pe.tendP = null; tendLoad(); })); } }   // offline with a saved copy: keep showing it
    pe.tendP = null;
  })();
  return pe.tendP;
}
$("#tendKinds").addEventListener("click", ev => { const b = ev.target.closest(".chip"); if(!b) return; pe.tendKind = b.dataset.v; if(pe.tend) tendRender(); });

// ---------- Favourites ----------
const FAV_BITS = { anime: "id title{romaji english native} countryOfOrigin coverImage{large}", manga: "id title{romaji english native} countryOfOrigin coverImage{large}",
  characters: "id name{full native} image{large}", staff: "id name{full native} image{large}", studios: "id name" };
const FAV_EMPTY = { anime: "No favourite anime yet.", manga: "No favourite manga yet.", characters: "No favourite characters yet.", staff: "No favourite staff yet.", studios: "No favourite studios yet." };
const favQ = kind => "query($p:Int){Viewer{favourites{" + kind + "(page:$p,perPage:12){pageInfo{hasNextPage} nodes{" + FAV_BITS[kind] + "}}}}}";
function favOpen(kind, n){
  if(kind === "anime" || kind === "manga") return openMedia(n.id);
  openEntity(kind === "characters" ? "character" : kind === "staff" ? "staff" : "studio", n.id);
}
function favTile(kind, n){
  if(kind === "studios"){ const b = el("button", "favstudio", n.name); b.onclick = () => favOpen(kind, n); return b; }
  const b = el("button", "favt"), img = el("img"), media = kind === "anime" || kind === "manga";
  img.src = (media ? n.coverImage && n.coverImage.large : n.image && n.image.large) || ""; img.alt = ""; img.loading = "lazy";
  b.append(img, el("span", "favn", media ? tt(n) : (n.name && n.name.full) || "")); b.onclick = () => favOpen(kind, n); return b;
}
function favRender(){
  const kind = pe.favKind, d = pe.fav[kind], grid = $("#favGrid");
  document.querySelectorAll("#favKinds .chip").forEach(c => c.setAttribute("aria-pressed", String(c.dataset.v === kind)));
  grid.replaceChildren(); $("#favMore").hidden = true;
  if(!d){ grid.append(el("p", "pfmuted", "Loading…")); return; }
  if(d.err){ grid.append(dxEmpty(d.err, () => { delete pe.fav[kind]; favLoad(false); })); return; }
  if(!d.nodes.length){ grid.append(el("p", "pfmuted", FAV_EMPTY[kind])); return; }
  const wrap = el("div", kind === "studios" ? "favstudios" : "favgrid"); for(const n of d.nodes) wrap.append(favTile(kind, n));
  grid.append(wrap); $("#favMore").hidden = !d.more;
}
function favLoad(more){
  const kind = pe.favKind, fname = "fav_" + kind + "_" + acctUser();
  let d = pe.fav[kind], quiet = false;
  if(!d && !more){   // a saved first page shows at once; after 6 hours it is also refreshed quietly
    const saved = cacheMetaAs("acct", fname, CACHE_OK.fav);
    if(saved){ d = pe.fav[kind] = saved.d; try{ favRender(); quiet = true; }catch(_){ delete pe.fav[kind]; d = undefined; cacheDel("acct", fname); } if(quiet && saved.age < FAV_FRESH) return Promise.resolve(); }
  }
  if(d && !d.err && !more && !quiet){ favRender(); return Promise.resolve(); }
  if(pe.favP[kind]) return pe.favP[kind];
  const page = more && d ? d.page + 1 : 1;
  if(!d) favRender();
  pe.favP[kind] = (async () => {
    try{
      const { json } = await gql(favQ(kind), { p: page }), f = json.data && json.data.Viewer && json.data.Viewer.favourites && json.data.Viewer.favourites[kind];
      if(!f) throw new Error("AniList said: " + ((json.errors && json.errors[0] && json.errors[0].message) || "no data"));
      const base = quiet ? [] : (d ? d.nodes : []), seen = new Set(base.map(n => n.id)), nodes = base.concat(f.nodes.filter(n => !seen.has(n.id)));
      pe.fav[kind] = { nodes, page, more: !!(f.pageInfo && f.pageInfo.hasNextPage) };
      cacheSet("acct", fname, pe.fav[kind]);
    }catch(err){ if(!quiet) pe.fav[kind] = { nodes: [], page: 0, more: false, err: offlineMsg(err) }; }   // offline with a saved copy: keep it
    delete pe.favP[kind]; if(pe.favKind === kind) favRender();
  })();
  return pe.favP[kind];
}
$("#favKinds").addEventListener("click", ev => { const b = ev.target.closest(".chip"); if(!b) return; pe.favKind = b.dataset.v; favLoad(false); });
$("#favMore").onclick = () => { $("#favMore").disabled = true; favLoad(true).then(() => { $("#favMore").disabled = false; }); };

// Called whenever the Profile screen opens. Everything is kept for the session, so this is cheap after the first time.
function profExtras(){ if(!auth.token) return Promise.resolve(); return Promise.all([tendLoad(), favLoad(false)]); }
// Swipe down on Profile: forget what was kept and load it all again.
async function profRefresh(){ profLoaded = false; pe.tend = null; pe.fav = {}; cacheDel("acct", "tend_" + acctUser()); cacheDelPrefix("acct", "fav_"); await Promise.all([renderProfile(), profExtras()]); }
