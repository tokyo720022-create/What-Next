/* js/features/relmap.js: Relation map. Draws a title's franchise as a graph (core, related and character links). */
// ---------- Relation map ----------
const RM_Q = "query($ids:[Int]){Page(perPage:50){media(id_in:$ids){id type format status isAdult title{romaji english native} countryOfOrigin coverImage{medium} averageScore seasonYear startDate{year} mediaListEntry{status} relations{edges{relationType(version:2) node{id}}}}}}";
const RM_TYPES = {
  SOURCE: { g: "core", up: true, label: "Source", color: "#f0a95b" }, PARENT: { g: "core", up: true, label: "Parent", color: "#f0a95b" },
  PREQUEL: { g: "core", up: true, label: "Prequel", color: "#6fb4f5" }, SEQUEL: { g: "core", up: false, label: "Sequel", color: "#7fd36f" },
  ADAPTATION: { g: "core", up: false, label: "Adaptation", color: "#d79af0" },
  SIDE_STORY: { g: "related", up: false, label: "Side story", color: "#f08fc0" }, SPIN_OFF: { g: "related", up: false, label: "Spin-off", color: "#9b8cf5" },
  ALTERNATIVE: { g: "related", up: false, label: "Alternative", color: "#f0c070" }, SUMMARY: { g: "related", up: false, label: "Summary", color: "#70d0c8" },
  COMPILATION: { g: "related", up: false, label: "Compilation", color: "#70d0c8" }, CONTAINS: { g: "related", up: false, label: "Contains", color: "#70d0c8" },
  OTHER: { g: "related", up: false, label: "Other", color: "#9aa3c4" }, CHARACTER: { g: "character", up: false, label: "Character", color: "#e6e07a" },
};
const RM_ORDER = Object.keys(RM_TYPES), RM_MAX = 90, RM_MAX_CHAR = 140, RM_CW = 150, RM_CH = 112, RM_GAP = 26, RM_PAD = 24;
const RM_STATUS = { CURRENT: ["Watching", "Reading"], REPEATING: ["Rewatching", "Rereading"], PLANNING: ["Planning", "Planning"], COMPLETED: ["Completed", "Completed"], PAUSED: ["Paused", "Paused"], DROPPED: ["Dropped", "Dropped"] };
const rmTypeOf = t => RM_TYPES[t] || RM_TYPES.OTHER;

const rm = { root: null, saved: [], graph: null, show: { core: true, related: true, character: false }, listView: false, z: 1, folded: new Set(), layout: null, token: 0, cache: new Map() };
try{ const s = JSON.parse(localStorage.getItem("wn_rm") || "null"); if(s) Object.assign(rm.show, { core: s.core !== false, related: s.related !== false, character: !!s.character }); }catch(_){}
const rmSave = () => { try{ localStorage.setItem("wn_rm", JSON.stringify(rm.show)); }catch(_){} };

// ----- getting the data: a few requests of up to 50 titles each, following links outward -----
function rmWanted(g, allowChar){   // ids that are linked from a loaded title but not loaded yet
  const out = new Set();
  for(const m of g.nodes.values()) for(const e of (m.relations && m.relations.edges) || []){
    if(!e.node || g.nodes.has(e.node.id) || g.tried.has(e.node.id)) continue;
    if(e.relationType === "CHARACTER" && !allowChar) continue;
    out.add(e.node.id);
  }
  return [...out];
}
async function rmGrow(g, allowChar){
  const cap = allowChar ? RM_MAX_CHAR : RM_MAX;
  for(let round = 0; round < 6 && g.nodes.size < cap; round++){
    const ids = rmWanted(g, allowChar).slice(0, Math.min(50, cap - g.nodes.size)); if(!ids.length) break;
    ids.forEach(id => g.tried.add(id));
    const { json } = await gql(RM_Q, { ids });
    const list = json.data && json.data.Page && json.data.Page.media;
    if(!list) throw new Error((json.errors && json.errors[0] && json.errors[0].message) || "No data");
    for(const m of list) g.nodes.set(m.id, m);
  }
  g.capped = rmWanted(g, allowChar).length > 0 && g.nodes.size >= cap;
}

// ----- turning the data into a drawing -----
function rmBuildTree(g, root){
  const on = t => rm.show[rmTypeOf(t).g];
  const row = new Map([[root, 0]]), kids = new Map(), info = new Map([[root, { parent: null, type: null }]]), queue = [root];
  while(queue.length){
    const id = queue.shift(), m = g.nodes.get(id); if(!m) continue;
    const edges = ((m.relations && m.relations.edges) || []).filter(e => e.node && g.nodes.has(e.node.id) && on(e.relationType) && !info.has(e.node.id))
      .sort((a, b) => RM_ORDER.indexOf(a.relationType) - RM_ORDER.indexOf(b.relationType) || ((g.nodes.get(a.node.id).seasonYear || 9999) - (g.nodes.get(b.node.id).seasonYear || 9999)));
    for(const e of edges){
      if(info.has(e.node.id)) continue;
      const t = rmTypeOf(e.relationType); info.set(e.node.id, { parent: id, type: e.relationType });
      row.set(e.node.id, row.get(id) + (t.up ? -1 : 1));
      if(!kids.has(id)) kids.set(id, []); kids.get(id).push(e.node.id); queue.push(e.node.id);
    }
  }
  return { row, kids, info };
}
function rmHidden(tree){   // titles hidden because a branch above them is folded
  const hide = new Set(), walk = id => { for(const c of tree.kids.get(id) || []){ hide.add(c); walk(c); } };
  for(const [id, ch] of tree.kids){ if(hide.has(id)) continue; for(const c of ch) if(rm.folded.has(id + "|" + tree.info.get(c).type)){ hide.add(c); walk(c); } }
  return hide;
}
function rmLayout(g, root){
  const tree = rmBuildTree(g, root), hidden = rmHidden(tree), ids = [...tree.row.keys()].filter(id => !hidden.has(id));
  const rows = new Map(); for(const id of ids){ const r = tree.row.get(id); if(!rows.has(r)) rows.set(r, []); rows.get(r).push(id); }
  const rks = [...rows.keys()].sort((a, b) => a - b), x = new Map(), step = RM_CW + RM_GAP;
  for(const r of rks) rows.get(r).forEach((id, i) => x.set(id, i * step));
  const nb = id => { const out = [], i = tree.info.get(id); if(i.parent != null && x.has(i.parent)) out.push(i.parent); for(const c of tree.kids.get(id) || []) if(x.has(c)) out.push(c); return out; };
  for(let it = 0; it < 8; it++){
    for(const r of (it % 2 ? [...rks].reverse() : rks)){
      const want = new Map(rows.get(r).map(id => { const n = nb(id); return [id, n.length ? n.reduce((a, c) => a + x.get(c), 0) / n.length : x.get(id)]; }));
      const sorted = rows.get(r).slice().sort((a, b) => want.get(a) - want.get(b)); rows.set(r, sorted);
      let prev = -Infinity; const placed = sorted.map(id => { const px = Math.max(want.get(id), prev + step); prev = px; return px; });
      const drift = sorted.reduce((a, id, i) => a + (want.get(id) - placed[i]), 0) / sorted.length;
      sorted.forEach((id, i) => x.set(id, placed[i] + drift));
    }
  }
  let minX = Infinity, maxX = -Infinity; for(const id of ids){ minX = Math.min(minX, x.get(id)); maxX = Math.max(maxX, x.get(id)); }
  for(const id of ids) x.set(id, x.get(id) - minX + RM_PAD);
  // groups of children that share a parent and a relation type
  const groups = [];
  for(const id of ids) for(const [type, list] of rmGroupBy(tree, id, hidden)) groups.push({ parent: id, type, ids: list, up: rmTypeOf(type).up });
  for(const [id, ch] of tree.kids) if(!hidden.has(id)) for(const c of ch) if(hidden.has(c) && !groups.some(q => q.parent === id && q.type === tree.info.get(c).type)) groups.push({ parent: id, type: tree.info.get(c).type, ids: [], up: rmTypeOf(tree.info.get(c).type).up });
  // vertical space between rows depends on how many labelled branches leave a title
  const need = new Map(), count = (r, side, n) => { const k = r + (side === "down" ? 0.25 : 0.75); need.set(k, Math.max(need.get(k) || 0, n)); };
  const perParent = new Map();
  for(const q of groups){ const k = q.parent + (q.up ? "u" : "d"); perParent.set(k, (perParent.get(k) || 0) + 1); q.index = perParent.get(k) - 1; }
  for(const q of groups){ const r = tree.row.get(q.parent); if(q.up) count(r - 1, "up", q.index + 1); else count(r, "down", q.index + 1); }
  const y = new Map(), gap = r => 58 + 32 * ((need.get(r + 0.25) || 0) + (need.get(r + 0.75) || 0));
  let cur = RM_PAD; for(let i = 0; i < rks.length; i++){ y.set(rks[i], cur); cur += RM_CH + gap(rks[i]); }
  const W = maxX - minX + RM_CW + RM_PAD * 2, H = cur - gap(rks[rks.length - 1]) + RM_PAD;
  return { tree, hidden, ids, x, y, groups, W, H, rks, gap, need };
}
function rmGroupBy(tree, id, hidden){
  const by = new Map(); for(const c of tree.kids.get(id) || []){ if(hidden.has(c)) continue; const t = tree.info.get(c).type; if(!by.has(t)) by.set(t, []); by.get(t).push(c); }
  return by;
}

// ----- drawing -----
const rmSvgEl = (n, a) => { const e = document.createElementNS("http://www.w3.org/2000/svg", n); for(const [k, v] of Object.entries(a)) e.setAttribute(k, v); return e; };
const rmStatusText = (m, st) => (RM_STATUS[st] || [st, st])[m.type === "MANGA" ? 1 : 0];
function rmNode(m, L, isRoot){
  const n = el("div", "rmnode" + (isRoot ? " root" : "")); n.style.left = L.x.get(m.id) + "px"; n.style.top = L.y.get(L.tree.row.get(m.id)) + "px"; n.dataset.id = m.id;
  const top = el("div", "rmtop2"), img = el("img"); img.src = (m.coverImage && m.coverImage.medium) || ""; img.alt = ""; img.loading = "lazy";
  const meta = el("div", "rmmeta"); meta.append(el("span", null, [norm(m.format) || m.type, m.seasonYear || (m.startDate && m.startDate.year)].filter(Boolean).join(" · ")), el("b", null, "★ " + (m.averageScore || "–")));
  top.append(img, meta); n.append(top, el("div", "rmttl", tt(m)));
  const foot = el("div", "rmfoot"); rmFoot(foot, m); n.append(foot);
  n.onclick = ev => { if(ev.target.closest("button")) return; openMedia(m.id); };
  return n;
}
function rmFoot(foot, m){
  foot.replaceChildren();
  const st = m.mediaListEntry && m.mediaListEntry.status;
  if(st){ foot.append(el("span", "rmst " + (st === "COMPLETED" ? "done" : "on"), "✓ " + rmStatusText(m, st))); return; }
  const b = el("button", "rmadd", "+ Add to list");
  b.onclick = async ev => {
    ev.stopPropagation(); b.disabled = true; b.textContent = "Adding…";
    const r = await trackSave(m.id, m.type === "MANGA" ? "manga" : "anime", { status: "PLANNING" }, { quiet: true });
    if(r.ok || r.queued){ m.mediaListEntry = { status: "PLANNING" }; rmFoot(foot, m); if(rm.listView) rmDrawList(); } else { b.disabled = false; b.textContent = "+ Add to list"; toast("Couldn't add: " + ((r.error && r.error.message) || "error")); }
  };
  foot.append(b);
}
function rmDraw(){
  const g = rm.graph, L = rm.layout = rmLayout(g, rm.root), inner = $("#rmInner"), svg = $("#rmSvg");
  inner.querySelectorAll(".rmnode,.rmlabel").forEach(n => n.remove()); svg.replaceChildren();
  inner.style.width = L.W + "px"; inner.style.height = L.H + "px"; svg.setAttribute("width", L.W); svg.setAttribute("height", L.H);
  for(const q of L.groups){
    const t = rmTypeOf(q.type), px = L.x.get(q.parent) + RM_CW / 2, pr = L.tree.row.get(q.parent), py = L.y.get(pr);
    const rowTop = py, rowBot = py + RM_CH, kidsX = q.ids.map(c => L.x.get(c) + RM_CW / 2);
    const mid = kidsX.length ? kidsX.reduce((a, b) => a + b, 0) / kidsX.length : px;
    const bus = q.up ? rowTop - 28 - 32 * q.index : rowBot + 28 + 32 * q.index, y0 = q.up ? rowTop : rowBot;
    const folded = rm.folded.has(q.parent + "|" + q.type);
    for(const c of q.ids){
      const cx = L.x.get(c) + RM_CW / 2, cy = q.up ? L.y.get(L.tree.row.get(c)) + RM_CH : L.y.get(L.tree.row.get(c)), dir = q.up ? -1 : 1;
      svg.append(rmSvgEl("path", { d: "M" + px + " " + y0 + " V" + bus + " H" + cx + " V" + (cy - 6 * dir), fill: "none", stroke: t.color, "stroke-width": 2, opacity: .9 }));
      svg.append(rmSvgEl("path", { d: "M" + (cx - 5) + " " + (cy - 7 * dir) + " L" + cx + " " + cy + " L" + (cx + 5) + " " + (cy - 7 * dir) + " Z", fill: t.color }));
    }
    if(!q.ids.length) svg.append(rmSvgEl("path", { d: "M" + px + " " + y0 + " V" + bus, fill: "none", stroke: t.color, "stroke-width": 2, "stroke-dasharray": "4 4" }));
    const lab = el("button", "rmlabel", t.label + (q.ids.length > 1 ? " · " + q.ids.length : "") + (folded ? " +" : ""));
    lab.style.left = mid + "px"; lab.style.top = bus + "px"; lab.style.borderColor = t.color; lab.style.color = t.color; lab.dataset.key = q.parent + "|" + q.type;
    lab.setAttribute("aria-label", (folded ? "Unfold " : "Fold ") + t.label + " branch");
    lab.onclick = () => { const k = q.parent + "|" + q.type; rm.folded.has(k) ? rm.folded.delete(k) : rm.folded.add(k); rmDraw(); };
    inner.append(lab);
  }
  for(const id of L.ids){ const m = g.nodes.get(id); if(m) inner.append(rmNode(m, L, id === rm.root)); }
  rmApplyZoom(); rmStatusLine();
}
function rmStatusLine(){
  const g = rm.graph, L = rm.layout, total = g.nodes.size, shown = L.ids.length;
  $("#rmStatus").textContent = (total - 1) + " related title" + (total === 2 ? "" : "s") + " found" + (shown < total ? " · " + shown + " shown" : "") + (g.capped ? " · map limited to the closest " + total : "");
  $("#rmSub").textContent = tt(g.nodes.get(rm.root)) + " · " + (shown - 1) + " linked";
}
function rmApplyZoom(){
  const L = rm.layout; if(!L) return;
  $("#rmInner").style.transform = "scale(" + rm.z + ")"; $("#rmSizer").style.width = L.W * rm.z + "px"; $("#rmSizer").style.height = L.H * rm.z + "px";
  $("#rmZoom").textContent = Math.round(rm.z * 100) + "%";
}
function rmZoomAt(nz, cx, cy){
  const v = $("#rmView"); nz = Math.min(1.6, Math.max(0.2, nz));
  const px = (v.scrollLeft + cx) / rm.z, py = (v.scrollTop + cy) / rm.z; rm.z = nz; rmApplyZoom();
  v.scrollLeft = px * nz - cx; v.scrollTop = py * nz - cy;
}
function rmFit(){
  const L = rm.layout, v = $("#rmView"); if(!L) return;
  rm.z = Math.min(1, Math.max(0.2, (v.clientWidth - 12) / L.W)); rmApplyZoom(); v.scrollLeft = 0; v.scrollTop = 0;
}
function rmCenterRoot(){
  const L = rm.layout, v = $("#rmView"); if(!L || !L.x.has(rm.root)) return;
  v.scrollLeft = Math.max(0, (L.x.get(rm.root) + RM_CW / 2) * rm.z - v.clientWidth / 2);
  v.scrollTop = Math.max(0, L.y.get(L.tree.row.get(rm.root)) * rm.z - 20);
}

// ----- list view -----
function rmDrawList(){
  const g = rm.graph, L = rm.layout, box = $("#rmListView"); box.replaceChildren();
  const by = new Map(); for(const id of L.tree.row.keys()){ if(id === rm.root) continue; const t = L.tree.info.get(id).type; if(!by.has(t)) by.set(t, []); by.get(t).push(id); }
  const rootM = g.nodes.get(rm.root); box.append(el("div", "q", "This title")); box.append(rmRow(rootM));
  for(const t of RM_ORDER) if(by.has(t)){ const h = el("div", "q", rmTypeOf(t).label + " · " + by.get(t).length); h.style.color = rmTypeOf(t).color; box.append(h); for(const id of by.get(t)) box.append(rmRow(g.nodes.get(id))); }
}
function rmRow(m){
  const r = el("div", "rmrow"), img = el("img"); img.src = (m.coverImage && m.coverImage.medium) || ""; img.alt = ""; img.loading = "lazy";
  const info = el("div", "rmrinfo"); info.append(el("b", null, tt(m)), el("span", null, [norm(m.format) || m.type, m.seasonYear, m.averageScore ? "★ " + m.averageScore : ""].filter(Boolean).join(" · ")));
  const foot = el("div", "rmfoot"); rmFoot(foot, m); info.append(foot);
  r.append(img, info); r.onclick = ev => { if(!ev.target.closest("button")) openMedia(m.id); }; return r;
}

// ----- opening, closing and controls -----
function rmShowMode(){
  $("#rmView").hidden = rm.listView; $("#rmListView").hidden = !rm.listView; $("#rmBar").hidden = rm.listView;
  $("#rmList").setAttribute("aria-pressed", String(rm.listView)); $("#rmList").textContent = rm.listView ? "✓ List view" : "List view";
  for(const [id, k, label] of [["#rmCore", "core", "Core"], ["#rmRel", "related", "Related"], ["#rmChar", "character", "Character"]]){ $(id).setAttribute("aria-pressed", String(rm.show[k])); $(id).textContent = (rm.show[k] ? "✓ " : "") + label; }
}
async function rmLoad(force){
  const token = ++rm.token, id = rm.root; rmShowMode();
  $("#rmStatus").textContent = "Loading the relation map…"; $("#rmTitle").textContent = "Relation map"; $("#rmSub").textContent = "";
  try{
    let g = rm.cache.get(id);
    if(!g || force){ g = { nodes: new Map(), tried: new Set([id]), capped: false, chars: false }; const { json } = await gql(RM_Q, { ids: [id] }); const first = json.data && json.data.Page && json.data.Page.media && json.data.Page.media[0]; if(!first) throw new Error((json.errors && json.errors[0] && json.errors[0].message) || "Title not found"); g.nodes.set(id, first); rm.cache.set(id, g); }
    if(token !== rm.token) return;
    if(rm.show.character && !g.chars){ await rmGrow(g, true); g.chars = true; } else await rmGrow(g, false);
    if(token !== rm.token) return;
    rm.graph = g; $("#rmTitle").textContent = "Relation map";
    if(g.nodes.size < 2 && !rm.show.character){ rm.layout = rmLayout(g, id); rmDraw(); $("#rmStatus").textContent = "This title has no related titles."; }
    else { rmDraw(); }
    if(rm.listView) rmDrawList(); else if(rm.firstFit){ rm.firstFit = false; rm.z = Math.max(0.5, Math.min(1, ($("#rmView").clientWidth - 12) / rm.layout.W)); rmApplyZoom(); rmCenterRoot(); }
  }catch(err){
    if(token !== rm.token) return;
    $("#rmStatus").textContent = "Couldn't load the map: " + (/Failed to fetch|NetworkError|Load failed/i.test(err.message) ? "no connection." : err.message) + " Tap ⟳ to try again.";
  }
}
function openRelMap(id){
  rm.saved = mstack.slice(); mstack.length = 0; $("#media").hidden = true;   // the media page comes back when you close the map
  rm.root = id; rm.folded.clear(); rm.firstFit = true; rm.z = 1; rm.graph = null; rm.layout = null;
  $("#relmap").hidden = false; $("#rmInner").querySelectorAll(".rmnode,.rmlabel").forEach(n => n.remove()); $("#rmSvg").replaceChildren(); $("#rmListView").replaceChildren();
  rmLoad(false);
}
function closeRelMap(){
  $("#relmap").hidden = true; $("#rmBranchSheet").hidden = true; rm.token++;
  mstack.length = 0; mstack.push(...rm.saved); if(mstack.length) showTop();
}
$("#rmBack").onclick = closeRelMap;
$("#rmRefresh").onclick = () => rmLoad(true);
$("#rmCtlBtn").onclick = () => { const open = $("#rmCtl").hidden; $("#rmCtl").hidden = !open; $("#rmCtlBtn").setAttribute("aria-expanded", String(open)); $("#rmCtlBtn").textContent = "Map controls " + (open ? "▴" : "▾"); };
for(const [id, k] of [["#rmCore", "core"], ["#rmRel", "related"], ["#rmChar", "character"]]) $(id).onclick = () => {
  rm.show[k] = !rm.show[k]; rmSave(); rmShowMode();
  if(k === "character" && rm.show.character && rm.graph && !rm.graph.chars) rmLoad(false); else if(rm.graph){ rmDraw(); if(rm.listView) rmDrawList(); }
};
$("#rmList").onclick = () => { rm.listView = !rm.listView; rmShowMode(); if(rm.listView && rm.graph) rmDrawList(); };
$("#rmMinus").onclick = () => { const v = $("#rmView"); rmZoomAt(rm.z / 1.25, v.clientWidth / 2, v.clientHeight / 2); };
$("#rmPlus").onclick = () => { const v = $("#rmView"); rmZoomAt(rm.z * 1.25, v.clientWidth / 2, v.clientHeight / 2); };
$("#rmFit").onclick = rmFit;
// two-finger pinch on the map
(() => {
  const v = $("#rmView"); let d0 = 0, z0 = 1;
  const dist = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  v.addEventListener("touchstart", e => { if(e.touches.length === 2){ d0 = dist(e.touches); z0 = rm.z; } }, { passive: true });
  v.addEventListener("touchmove", e => {
    if(e.touches.length !== 2 || !d0) return; e.preventDefault();
    const r = v.getBoundingClientRect(), cx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - r.left, cy = (e.touches[0].clientY + e.touches[1].clientY) / 2 - r.top;
    rmZoomAt(z0 * dist(e.touches) / d0, cx, cy);
  }, { passive: false });
  v.addEventListener("touchend", () => { d0 = 0; }, { passive: true });
})();
// branches sheet
function rmBranchSheet(){
  const list = $("#rmBranchList"); list.replaceChildren(); const L = rm.layout, g = rm.graph; if(!L) return;
  const seen = new Set();
  for(const [id, ch] of L.tree.kids){ const by = new Map(); for(const c of ch){ const t = L.tree.info.get(c).type; by.set(t, (by.get(t) || 0) + 1); }
    if(L.hidden.has(id)) continue;
    for(const [t, n] of by){ const key = id + "|" + t; if(seen.has(key)) continue; seen.add(key);
      const row = el("label", "rmbrow"), box = el("input", "lssw"); box.type = "checkbox"; box.checked = !rm.folded.has(key);
      box.onchange = () => { box.checked ? rm.folded.delete(key) : rm.folded.add(key); rmDraw(); rmBranchSheet(); };
      const name = el("span"); name.append(el("b", null, tt(g.nodes.get(id))), el("small", null, rmTypeOf(t).label + " · " + n + " title" + (n === 1 ? "" : "s")));
      row.append(name, box, el("i", "lsck")); list.append(row); } }
  if(!list.children.length) list.append(el("p", "sub", "Nothing to fold on this map."));
}
$("#rmBranches").onclick = () => { rmBranchSheet(); $("#rmBranchSheet").hidden = false; };
$("#rmBranchDone").onclick = () => { $("#rmBranchSheet").hidden = true; };
// legend
(() => { const lg = $("#rmLegend"); for(const t of RM_ORDER){ const s = el("span", "rmleg"); const d = el("i"); d.style.background = RM_TYPES[t].color; s.append(d, RM_TYPES[t].label); lg.append(s); } })();
