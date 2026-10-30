/* js/features/profile-extra.js: Profile > Tendencies and Favourites, and refreshing the whole Profile screen */
// ---------- Tendencies ----------
const TEND_F = "count meanScore statuses{status count} genres(limit:40,sort:COUNT_DESC){genre count meanScore} tags(limit:40,sort:COUNT_DESC){tag{name category} count meanScore} releaseYears{releaseYear count meanScore} startYears{startYear count}";
const TEND_Q = "query{Viewer{statistics{anime{" + TEND_F + "} manga{" + TEND_F + "}}}}";
const pe = { tend: null, tendP: null, tendKind: "anime", favKind: "anime", fav: {}, favP: {} };
const offlineMsg = err => /Failed to fetch|NetworkError|Load failed/i.test(err.message) ? "Couldn't reach AniList. Check your connection." : err.message;

function tendRender(){
  const box = $("#tendList"); box.replaceChildren();
  document.querySelectorAll("#tendKinds .chip").forEach(c => c.setAttribute("aria-pressed", String(c.dataset.v === pe.tendKind)));
  const lines = tzTendencies(pe.tend && pe.tend[pe.tendKind], pe.tendKind);
  if(!lines.length){ box.append(el("p", "pfmuted", "Not enough " + pe.tendKind + " on your list yet to see tendencies.")); return; }
  for(const [a, hl, b] of lines){
    const row = el("div", "pftitem"), strong = el("b", "pfhl"), parts = hl.split("/");
    parts.forEach((x, i) => { strong.append(x + (i < parts.length - 1 ? "/" : "")); if(i < parts.length - 1) strong.append(document.createElement("wbr")); });   // lets a long "A/B/C" wrap after a slash
    row.append(a, strong, b); box.append(row);
  }
}
function tendLoad(){
  if(pe.tend){ tendRender(); return Promise.resolve(); }
  if(pe.tendP) return pe.tendP;
  $("#tendList").replaceChildren(el("p", "pfmuted", "Reading your stats…"));
  pe.tendP = (async () => {
    try{
      const { json } = await gql(TEND_Q, {}), st = json.data && json.data.Viewer && json.data.Viewer.statistics;
      if(!st) throw new Error("AniList said: " + ((json.errors && json.errors[0] && json.errors[0].message) || "no data"));
      pe.tend = st; tendRender();
    }catch(err){ $("#tendList").replaceChildren(dxEmpty(offlineMsg(err), () => { pe.tendP = null; tendLoad(); })); }
    pe.tendP = null;
  })();
  return pe.tendP;
}
$("#tendKinds").addEventListener("click", ev => { const b = ev.target.closest(".chip"); if(!b) return; pe.tendKind = b.dataset.v; if(pe.tend) tendRender(); });

// ---------- Favourites ----------
const FAV_BITS = { anime: "id title{romaji english native} countryOfOrigin coverImage{large}", manga: "id title{romaji english native} countryOfOrigin coverImage{large}",
  characters: "id name{full native} image{large}", staff: "id name{full native} image{large}", studios: "id name" };
const FAV_EMPTY = { anime: "No favourite anime yet.", manga: "No favourite manga yet.", characters: "No favourite characters yet.", staff: "No favourite staff yet.", studios: "No favourite studios yet." };
const favQ = kind => "query($p:Int){Viewer{favourites{" + kind + "(page:$p,perPage:24){pageInfo{hasNextPage} nodes{" + FAV_BITS[kind] + "}}}}}";
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
  const kind = pe.favKind, d = pe.fav[kind];
  if(d && !d.err && !more){ favRender(); return Promise.resolve(); }
  if(pe.favP[kind]) return pe.favP[kind];
  const page = more && d ? d.page + 1 : 1;
  if(!d) favRender();
  pe.favP[kind] = (async () => {
    try{
      const { json } = await gql(favQ(kind), { p: page }), f = json.data && json.data.Viewer && json.data.Viewer.favourites && json.data.Viewer.favourites[kind];
      if(!f) throw new Error("AniList said: " + ((json.errors && json.errors[0] && json.errors[0].message) || "no data"));
      const seen = new Set(d ? d.nodes.map(n => n.id) : []), nodes = (d ? d.nodes : []).concat(f.nodes.filter(n => !seen.has(n.id)));
      pe.fav[kind] = { nodes, page, more: !!(f.pageInfo && f.pageInfo.hasNextPage) };
    }catch(err){ pe.fav[kind] = { nodes: [], page: 0, more: false, err: offlineMsg(err) }; }
    delete pe.favP[kind]; if(pe.favKind === kind) favRender();
  })();
  return pe.favP[kind];
}
$("#favKinds").addEventListener("click", ev => { const b = ev.target.closest(".chip"); if(!b) return; pe.favKind = b.dataset.v; favLoad(false); });
$("#favMore").onclick = () => { $("#favMore").disabled = true; favLoad(true).then(() => { $("#favMore").disabled = false; }); };

// Called whenever the Profile screen opens. Everything is kept for the session, so this is cheap after the first time.
function profExtras(){ if(!auth.token) return Promise.resolve(); return Promise.all([tendLoad(), favLoad(false)]); }
// Swipe down on Profile: forget what was kept and load it all again.
async function profRefresh(){ profLoaded = false; pe.tend = null; pe.fav = {}; await Promise.all([renderProfile(), profExtras()]); }
