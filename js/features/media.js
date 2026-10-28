/* js/features/media.js: media detail page */
// ---------- Media pages, list editor, trending ----------
const MEDIA_Q = "query($id:Int){Media(id:$id){id idMal type siteUrl isAdult title{romaji english native} synonyms bannerImage coverImage{extraLarge color} description(asHtml:false) format status episodes chapters volumes duration season seasonYear startDate{year month day} endDate{year month day} source countryOfOrigin averageScore meanScore popularity favourites isFavourite genres rankings{rank type context allTime} tags{name rank isMediaSpoiler isGeneralSpoiler description} studios{edges{isMain node{id name isAnimationStudio}}} nextAiringEpisode{airingAt episode} trailer{id site} externalLinks{site url type} characters(sort:[ROLE,RELEVANCE],perPage:14){edges{role node{id siteUrl name{full} image{medium}}}} staff(sort:[RELEVANCE],perPage:14){edges{role node{id siteUrl name{full} image{medium}}}} relations{edges{relationType node{id type format title{romaji english native} countryOfOrigin coverImage{large}}}} recommendations(sort:RATING_DESC,perPage:12){nodes{rating mediaRecommendation{id type format title{romaji english native} countryOfOrigin coverImage{large} averageScore seasonYear episodes chapters}}} mediaListEntry{id status progress score(format:POINT_100) repeat notes private priority startedAt{year month day} completedAt{year month day} customLists}}}";
const TREND_Q = "query($t:MediaType){Page(perPage:12){media(type:$t,sort:TRENDING_DESC,isAdult:false){id type title{romaji english native} countryOfOrigin bannerImage coverImage{extraLarge} averageScore favourites genres description(asHtml:false) studios(isMain:true){nodes{name}} staff(sort:[RELEVANCE],perPage:3){edges{node{name{full}}}}}}}";
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const mcache = new Map(), mstack = [];
const fd = d => (!d || !d.year) ? "?" : (d.day ? d.day + " " : "") + (d.month ? MON[d.month - 1] + " " : "") + d.year;
const dIn = d => d && d.year && d.month && d.day ? d.year + "-" + String(d.month).padStart(2, "0") + "-" + String(d.day).padStart(2, "0") : "";
const dOut = v => { if(!v) return { year: null, month: null, day: null }; const [y, m, d] = v.split("-").map(Number); return { year: y, month: m, day: d }; };
const clean = t => String(t || "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&#0?39;|&rsquo;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
const norm = x => String(x || "").replace(/_/g, " ");
function gtag(g){
  let h = 0; for(const c of g) h = (h * 31 + c.charCodeAt(0)) % 360;
  const s = el("span", "gtag", g); s.style.background = "hsl(" + h + " 45% 34%)"; return s;
}
function hrow(items){ const r = el("div", "hscroll"); r.append(...items); return r; }
function msec(title, body, action){
  const s = el("div", "msec"), h = el("h3", null, title);
  if(action) h.append(action);
  s.append(h, body); return s;
}

function openMedia(id){ if(mstack[mstack.length - 1] !== id) mstack.push(id); showMedia(id); }
function showTop(){ const t = mstack[mstack.length - 1]; if(typeof t === "number") showMedia(t); else showEntity(t); }
function closeMedia(){ mstack.pop(); if(mstack.length) showTop(); else $("#media").hidden = true; }
function closeBar(){
  const bar = el("div", "mbar"), x = el("button", "mbtn", "✕"); x.setAttribute("aria-label", "Close"); x.onclick = closeMedia;
  bar.append(x); return bar;
}
async function showMedia(id){
  const box = $("#media"); box.hidden = false;
  if(!mcache.has(id)){
    const w = el("div", "mhead"); w.append(closeBar()); box.replaceChildren(w, el("div", "msg", "Loading…"));
    try{
      const { json } = await gql(MEDIA_Q, { id });
      const m = json.data && json.data.Media;
      if(!m) throw new Error((json.errors && json.errors[0].message) || "Not found");
      mcache.set(id, m);
    }catch(err){
      const w2 = el("div", "mhead"); w2.append(closeBar());
      box.replaceChildren(w2, el("div", "msg", err.message.includes("Failed to fetch") ? "No connection. Try again." : err.message)); return;
    }
  }
  if(mstack[mstack.length - 1] === id) renderMedia(mcache.get(id));
}

function peopleEdges(edges, kind){
  return edges.map(x => { const b = el("button", "person"), i = new Image(); i.alt = ""; i.loading = "lazy"; i.src = x.node.image.medium; b.append(i, el("span", null, x.node.name.full), el("i", null, norm(x.role))); b.onclick = () => openEntity(kind, x.node.id); return b; });
}
function moreButton(m, field, kind, row){
  const b = el("button", null, "See more"); let page = 2;
  b.onclick = async () => {
    b.disabled = true;
    try{
      const sort = field === "characters" ? "ROLE,RELEVANCE" : "RELEVANCE";
      const { json } = await gql("query($id:Int,$p:Int){Media(id:$id){" + field + "(sort:[" + sort + "],page:$p,perPage:14){pageInfo{hasNextPage} edges{role node{id siteUrl name{full} image{medium}}}}}}", { id: m.id, p: page });
      const c = json.data.Media[field]; row.append(...peopleEdges(c.edges, kind)); page++;
      if(c.pageInfo.hasNextPage) b.disabled = false; else b.remove();
    }catch(_){ b.disabled = false; toast("Couldn't load more. Check your connection."); }
  };
  return b;
}
function renderMedia(m){
  const box = $("#media"), type = m.type === "ANIME" ? "anime" : "manga", lab = STATUS_LABEL(type), e = m.mediaListEntry;
  const total = type === "anime" ? m.episodes : m.chapters;
  box.replaceChildren(); box.scrollTop = 0;
  // header
  const head = el("div", "mhead"), bg = el("div", "mbg");
  bg.style.backgroundImage = "url(" + JSON.stringify(m.bannerImage || m.coverImage.extraLarge) + ")";
  const row = el("div", "mrow"), poster = new Image(); poster.alt = ""; poster.className = "tposter"; poster.src = m.coverImage.extraLarge;
  const info = el("div"); info.style.minWidth = "0";
  info.append(el("h1", null, tt(m)), el("p", null, m.seasonYear || (m.startDate && m.startDate.year) || ""), el("p", null, [norm(m.format), total ? total + (type === "anime" ? " episodes" : " chapters") : ""].filter(Boolean).join(" • ")));
  if(m.nextAiringEpisode){
    const n = m.nextAiringEpisode;
    info.append(el("p", null, "Ep. " + n.episode + " on " + new Date(n.airingAt * 1000).toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) + " · in " + fmtIn(n.airingAt - Date.now() / 1000)));
  }
  row.append(poster, info); head.append(bg, closeBar(), row); box.append(head);
  // stats + status
  const st = el("div", "mstats");
  const cell = (b, s) => { const c = el("div", "mcell"); c.append(el("b", null, b), el("span", null, s)); return c; };
  const sbtn = el("button", "mstatus", e ? (lab[e.status] || e.status) : "Add to list");
  sbtn.onclick = () => { if(auth.token) openEditor(m); };
  st.append(cell(m.averageScore || "–", "Score"), cell((m.favourites || 0).toLocaleString(), "Favorites"), sbtn);
  box.append(st);
  if(e && auth.token && e.status !== "COMPLETED" && !(total && e.progress >= total)){
    const unit = type === "anime" ? "episode" : "chapter", row = el("div"), minus = el("button", "go alt", "−1"), plus = el("button", "go alt", "+1 " + unit + "  (now " + e.progress + (total ? " / " + total : "") + ")");
    row.style.cssText = "display:flex;gap:10px;margin-top:14px"; minus.style.cssText = "width:64px;flex:none;margin:0"; plus.style.cssText = "flex:1;margin:0";
    minus.disabled = e.progress <= 0; minus.setAttribute("aria-label", "Remove one " + unit);
    minus.onclick = () => { track(m.id, type, { progress: e.progress - 1 }); };
    plus.onclick = () => { track(m.id, type, { progress: e.progress + 1 }); };
    row.append(minus, plus); box.append(row);
  }
  if(m.genres && m.genres.length){ const g = el("div", "gtags"); g.style.marginTop = "16px"; m.genres.forEach(x => g.append(gtag(x))); box.append(g); }
  // rankings, trailer, where to watch
  const extras = el("div"); extras.style.marginTop = "14px";
  (m.rankings || []).filter(r => r.allTime || r.type === "RATED").slice(0, 3).forEach(r => extras.append(el("span", "rk", "#" + r.rank + " " + r.context)));
  if(m.trailer && m.trailer.id){
    const url = m.trailer.site === "youtube" ? "https://www.youtube.com/watch?v=" + m.trailer.id : m.trailer.site === "dailymotion" ? "https://www.dailymotion.com/video/" + m.trailer.id : "";
    if(url){ const t = el("button", "rk", "▶ Trailer"); t.style.border = "0"; t.style.cursor = "pointer"; t.style.color = "var(--ink)"; t.onclick = () => openExternal(url); extras.append(t); }
  }
  if(extras.children.length) box.append(extras);
  // synopsis
  const desc = clean(m.description);
  if(desc){
    const c = el("div", "clamp", desc), t = el("button", null, "More");
    t.onclick = () => { c.classList.toggle("open"); t.textContent = c.classList.contains("open") ? "Less" : "More"; };
    box.append(msec("Synopsis", c, t));
  }
  // characters and staff
  if(m.characters && m.characters.edges.length){ const row = hrow(peopleEdges(m.characters.edges, "character")); box.append(msec("Characters", row, moreButton(m, "characters", "character", row))); }
  // info
  const rows = [["Romaji", m.title.romaji], ["English", m.title.english], ["Native", m.title.native], ["Synonyms", (m.synonyms || []).join(", ")],
    ["Format", norm(m.format)], [type === "anime" ? "Episodes" : "Chapters", total], type === "anime" ? ["Episode duration", m.duration ? m.duration + " minutes" : ""] : ["Volumes", m.volumes],
    ["Source", norm(m.source)], ["Status", norm(m.status)], ["Start date", fd(m.startDate)], ["End date", fd(m.endDate)],
    ["Season", m.season ? titleCase(m.season) + " " + (m.seasonYear || "") : ""],
    ["Country", { JP: "Japan", KR: "South Korea", CN: "China", TW: "Taiwan" }[m.countryOfOrigin] || m.countryOfOrigin]];
  const ib = el("div");
  rows.filter(r => r[1]).forEach(r => { const d = el("div", "irow"); d.append(el("span", null, r[0]), el("span", null, String(r[1]))); ib.append(d); });
  const studios = (m.studios && m.studios.edges) || [];
  const linkRow = (label, list) => { if(!list.length) return; const d = el("div", "irow"), c = el("div", "links"); list.forEach(x => { const b = el("button", "lk", x.node.name); b.onclick = () => openEntity("studio", x.node.id); c.append(b); }); d.append(el("span", null, label), c); ib.append(d); };
  linkRow("Studios", studios.filter(x => x.node.isAnimationStudio)); linkRow("Producers", studios.filter(x => !x.node.isAnimationStudio));
  const sr = el("div", "stat4");
  [[m.averageScore ? m.averageScore + "%" : "–", "Average"], [m.meanScore ? m.meanScore + "%" : "–", "Mean"], [m.popularity ? m.popularity.toLocaleString() : "–", "Popularity"], [(m.favourites || 0).toLocaleString(), "Favorites"]].forEach(([b, s]) => { const c = el("div"); c.append(el("b", null, b), el("span", null, s)); sr.append(c); });
  ib.append(sr);
  box.append(msec("Info", ib));
  // tags
  const tags = (m.tags || []).slice(), tb = el("div");
  let spoilers = false;
  const drawTags = () => {
    tb.replaceChildren(...tags.filter(t => spoilers || !(t.isMediaSpoiler || t.isGeneralSpoiler)).map(t => { const r = el("div", "trow"); r.title = t.description || ""; r.append(el("span", null, t.name), el("em", null, t.rank + "%")); return r; }));
  };
  if(tags.length){
    const sp = el("button", null, "Show spoilers"); sp.onclick = () => { spoilers = !spoilers; sp.textContent = spoilers ? "Hide spoilers" : "Show spoilers"; drawTags(); };
    drawTags(); box.append(msec("Tags", tb, sp));
  }
  // where to watch or read
  const links = (m.externalLinks || []).filter(l => l.type === "STREAMING");
  if(links.length){
    const w = el("div");
    links.forEach(l => { const b = el("button", "rk", l.site); b.style.border = "0"; b.style.cursor = "pointer"; b.style.color = "var(--ink)"; b.onclick = () => openExternal(l.url); w.append(b); });
    box.append(msec(type === "anime" ? "Where to watch" : "Where to read", w));
  }
  if(m.staff && m.staff.edges.length){ const row = hrow(peopleEdges(m.staff.edges, "staff")); box.append(msec("Staff", row, moreButton(m, "staff", "staff", row))); }
  // relations
  const rel = (m.relations && m.relations.edges || []).map(r => {
    const b = el("button", "relc"), i = new Image(); i.alt = ""; i.loading = "lazy"; i.src = r.node.coverImage.large;
    b.append(i, el("span", "relb", norm(r.relationType)), el("b", null, tt(r.node)), el("i", null, norm(r.node.format)));
    b.onclick = () => openMedia(r.node.id); return b;
  });
  if(rel.length){ const mp = el("button", null, "Relation map ›"); mp.onclick = () => openRelMap(m.id); box.append(msec("Relations", hrow(rel), mp)); }
  // recommendations
  const rec = ((m.recommendations && m.recommendations.nodes) || []).filter(n => n.mediaRecommendation).map(n => {
    const r = n.mediaRecommendation, b = el("button", "relc"), i = new Image(); i.alt = ""; i.loading = "lazy"; i.src = r.coverImage.large;
    b.append(i, el("b", null, tt(r)), el("i", null, [r.seasonYear, r.averageScore ? "★ " + r.averageScore : "", n.rating ? "👍 " + n.rating : ""].filter(Boolean).join(" · ")));
    b.onclick = () => openMedia(r.id); return b;
  });
  if(rec.length) box.append(msec("Recommendations", hrow(rec)));
  const open = el("button", "go alt", "Open on AniList"); open.onclick = () => openExternal(m.siteUrl); box.append(open);
}
