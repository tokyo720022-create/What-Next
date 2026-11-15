/* js/features/relmap-order.js: the watch or read order of a franchise, worked out from the relation map data. No screen code, so it can be unit tested.
   It answers: in what order were these released, which of them are the main story (prequel and sequel links), which one comes next for you, and what is left. */
const RMO_MAIN = ["PREQUEL", "SEQUEL"];
const RMO_DONE = ["COMPLETED", "REPEATING"];
const RMO_GROUP = { SOURCE: "core", PARENT: "core", PREQUEL: "core", SEQUEL: "core", ADAPTATION: "core", CHARACTER: "character" };   // everything else is "related", as in the map

// Release date as a number that sorts: a missing day or month counts as late in that period, a missing year sorts last.
const rmoDate = m => { const d = (m && m.startDate) || {}; return (d.year || 9999) * 10000 + (d.month || 12) * 100 + (d.day || 28); };
const rmoGroup = t => RMO_GROUP[t] || "related";
const rmoEdges = (g, id) => ((g.nodes.get(id) && g.nodes.get(id).relations && g.nodes.get(id).relations.edges) || []).filter(e => e && e.node && g.nodes.has(e.node.id));

// The main story: every title reachable from the root through prequel and sequel links alone, of the same kind (anime or manga).
function rmoMain(g, root){
  const type = g.nodes.get(root).type, seen = new Set([root]), queue = [root];
  while(queue.length){
    const id = queue.shift();
    for(const e of rmoEdges(g, id)){
      const n = g.nodes.get(e.node.id);
      if(!RMO_MAIN.includes(e.relationType) || n.type !== type || seen.has(n.id)) continue;
      seen.add(n.id); queue.push(n.id);
    }
  }
  return seen;
}
const rmoPlan = m => (m.type === "MANGA" ? m.chapters : m.episodes) || 0;

// show: { core, related, character } as in the map. Returns the titles in release order and where you are in the main story.
function rmoBuild(g, root, show){
  const rootM = g.nodes.get(root); if(!rootM) return { items: [], others: [], summary: { main: 0, done: 0, next: null, label: "", started: false } };
  const via = new Map([[root, ""]]), queue = [root];   // how each title is linked to the one it was found from
  while(queue.length){
    const id = queue.shift();
    for(const e of rmoEdges(g, id)){
      if(via.has(e.node.id) || !show[rmoGroup(e.relationType)]) continue;
      via.set(e.node.id, e.relationType); queue.push(e.node.id);
    }
  }
  const main = rmoMain(g, root), all = [...via.keys()].map(id => g.nodes.get(id)).filter(Boolean);
  const mk = m => { const le = m.mediaListEntry || null; return { m, id: m.id, rel: via.get(m.id), main: main.has(m.id), isRoot: m.id === root, status: le ? le.status : null, progress: le ? (le.progress || 0) : 0, total: rmoPlan(m), upcoming: m.status === "NOT_YET_RELEASED", next: false, first: false }; };
  const byDate = (a, b) => rmoDate(a.m) - rmoDate(b.m) || a.id - b.id;
  const items = all.filter(m => m.type === rootM.type).map(mk).sort(byDate), others = all.filter(m => m.type !== rootM.type).map(mk).sort(byDate);
  const line = items.filter(x => x.main), done = line.filter(x => RMO_DONE.includes(x.status)).length, started = line.some(x => x.status && x.status !== "PLANNING");
  // the next title for you: the first released main-story title you have not finished or dropped
  const next = line.find(x => !x.upcoming && !RMO_DONE.includes(x.status) && x.status !== "DROPPED") || null;
  if(next){ next.next = true; next.first = !started; }
  const left = line.filter(x => x.upcoming).length;
  const label = !line.length ? "" : next ? (started ? "Next up: " : "Start with: ") + "" : done === line.length ? "You have finished the main story." : left ? "You are caught up. " + left + " more " + (left === 1 ? "is" : "are") + " on the way." : "You have seen all you plan to.";
  return { items, others, summary: { main: line.length, done, next: next ? next.id : null, label, started, upcoming: left } };
}
