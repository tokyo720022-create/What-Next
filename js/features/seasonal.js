/* js/features/seasonal.js: Seasonal Chart (Discover > Seasonal) */
// ---------- Seasonal chart ----------
const SEASONS = ["WINTER", "SPRING", "SUMMER", "FALL"];
const curSeason = (d = new Date()) => SEASONS[Math.floor(d.getMonth() / 3)];
const SZ_Q = "query($p:Int,$s:MediaSeason,$y:Int){Page(page:$p,perPage:50){pageInfo{hasNextPage} media(season:$s,seasonYear:$y,type:ANIME,isAdult:false,sort:[POPULARITY_DESC]){id type format status title{romaji english native} countryOfOrigin coverImage{large} averageScore popularity favourites trending startDate{year month day} mediaListEntry{status score(format:POINT_100)} studios(isMain:true){nodes{name}}}}}";
const SZ_FORMATS = [["TV", "TV"], ["TV_SHORT", "TV Short"], ["MOVIE", "Movie"], ["OVA", "OVA"], ["ONA", "ONA"], ["SPECIAL", "Special"], ["MUSIC", "Music"]];
const SZ_SORTS = [["TITLE", "Title"], ["MYSCORE", "Score"], ["DATE", "Release Date"], ["AVG", "Average Score"], ["POP", "Popularity"], ["FAV", "Favorites"], ["TREND", "Trending"]];
const sz = { year: new Date().getFullYear(), season: curSeason(), sort: "POP", order: "DESC", hideList: false, onlyList: false, items: [], loading: false, token: 0, cache: new Map() };
const szDate = m => { const d = m.startDate || {}; return (d.year || 9999) * 10000 + (d.month || 12) * 100 + (d.day || 31); };
const SZ_KEY = {
  TITLE: m => tt(m).toLowerCase(), MYSCORE: m => (m.mediaListEntry && m.mediaListEntry.score) || 0, DATE: szDate,
  AVG: m => m.averageScore || 0, POP: m => m.popularity || 0, FAV: m => m.favourites || 0, TREND: m => m.trending || 0,
};
function szSorted(list){
  const key = SZ_KEY[sz.sort], dir = sz.order === "DESC" ? -1 : 1;
  return list.slice().sort((a, b) => { const x = key(a), y = key(b); return (x < y ? -1 : x > y ? 1 : 0) * dir || tt(a).localeCompare(tt(b)); });
}
function szCard(m){
  const c = el("div", "szcard"), img = el("img"), info = el("div", "szinfo");
  img.src = (m.coverImage && m.coverImage.large) || ""; img.alt = ""; img.loading = "lazy";
  const studio = m.studios && m.studios.nodes && m.studios.nodes[0] && m.studios.nodes[0].name;
  info.append(el("b", null, tt(m)), el("span", "dsub", studio || ""));
  const stats = el("div", "szstats");
  for(const [icon, val] of [["★", m.averageScore || "–"], ["♥", nf(m.favourites)], ["▦", nf(m.popularity)]]){ const s = el("span"); s.append(el("i", "szi", icon), String(val)); stats.append(s); }
  info.append(stats);
  const foot = el("div", "dfoot"), draw = () => { foot.replaceChildren(); const chip = statusChip(m); foot.append(chip || planBtn(m, draw)); }; draw(); info.append(foot);
  c.append(img, info); c.onclick = ev => { if(!ev.target.closest("button")) openMedia(m.id); }; return c;
}
function szRender(){
  const box = $("#szList"); box.replaceChildren();
  const on = m => !!(m.mediaListEntry && m.mediaListEntry.status);
  const items = sz.items.filter(m => !(sz.hideList && on(m)) && !(sz.onlyList && !on(m)));
  $("#szCount").textContent = sz.loading ? "Loading…" : items.length + " title" + (items.length === 1 ? "" : "s");
  if(!items.length && !sz.loading){ box.append(dxEmpty(sz.items.length ? "Nothing matches these filters." : "No anime found for this season yet.")); return; }
  for(const [fmt, label] of SZ_FORMATS){
    const part = szSorted(items.filter(m => m.format === fmt)); if(!part.length) continue;
    box.append(el("h3", "szh", label)); for(const m of part) box.append(szCard(m));
  }
  const other = szSorted(items.filter(m => !SZ_FORMATS.some(f => f[0] === m.format))); if(other.length){ box.append(el("h3", "szh", "Other")); for(const m of other) box.append(szCard(m)); }
}
function szBar(){
  const lab = (v, pairs) => (pairs.find(p => p[0] === v) || [v, v])[1], cap = s => s[0] + s.slice(1).toLowerCase();
  $("#szYear").lastChild.textContent = String(sz.year); $("#szSeason").lastChild.textContent = cap(sz.season);
  $("#szSort").lastChild.textContent = lab(sz.sort, SZ_SORTS); $("#szOrder").lastChild.textContent = sz.order === "DESC" ? "Descending" : "Ascending";
  $("#szHide").setAttribute("aria-pressed", String(sz.hideList)); $("#szOnly").setAttribute("aria-pressed", String(sz.onlyList));
}
async function szLoad(){
  const key = sz.year + "-" + sz.season, token = ++sz.token; szBar();
  if(sz.cache.has(key)){ sz.items = sz.cache.get(key); sz.loading = false; szRender(); return; }
  sz.items = []; sz.loading = true; szRender(); $("#szList").append(el("div", "msg", "Loading the chart…"));
  try{
    const all = [];
    for(let p = 1; p <= 8; p++){
      const { json } = await gql(SZ_Q, { p, s: sz.season, y: sz.year }), pg = json.data && json.data.Page;
      if(!pg) throw new Error((json.errors && json.errors[0] && json.errors[0].message) || "No data");
      if(token !== sz.token) return;
      all.push(...pg.media);
      if(p === 1){ sz.items = all.slice(); sz.loading = true; szRender(); }
      if(!pg.pageInfo.hasNextPage) break;
    }
    sz.cache.set(key, all); sz.items = all; sz.loading = false; szRender();
  }catch(err){
    if(token !== sz.token) return; sz.loading = false;
    $("#szList").replaceChildren(dxEmpty(/Failed to fetch|NetworkError|Load failed/i.test(err.message) ? "Couldn't reach AniList. Check your connection." : err.message, szLoad)); $("#szCount").textContent = "";
  }
}
const szYears = () => { const y = new Date().getFullYear() + 1, out = []; for(let i = y; i >= 1970; i--) out.push([i, String(i)]); return out; };
$("#szYear").onclick = () => pickSheet("Year", szYears(), sz.year, v => { sz.year = Number(v); szLoad(); });
$("#szSeason").onclick = () => pickSheet("Season", SEASONS.map(s => [s, s]), sz.season, v => { sz.season = v; szLoad(); });
$("#szSort").onclick = () => pickSheet("Sort", SZ_SORTS, sz.sort, v => { sz.sort = v; szBar(); szRender(); });
$("#szOrder").onclick = () => pickSheet("Order by", [["DESC", "Descending"], ["ASC", "Ascending"]], sz.order, v => { sz.order = v; szBar(); szRender(); });
$("#szHide").onclick = () => { sz.hideList = !sz.hideList; if(sz.hideList) sz.onlyList = false; szBar(); szRender(); };
$("#szOnly").onclick = () => { sz.onlyList = !sz.onlyList; if(sz.onlyList) sz.hideList = false; szBar(); szRender(); };
function seasonalOpen(){ szLoad(); }
