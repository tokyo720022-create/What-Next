/* js/features/anistats.js: Stats > Overview. Your AniList statistics, anime and manga side by side. */
// ---------- AniList statistics (Overview) ----------
const AS_FIELDS = "count meanScore minutesWatched episodesWatched chaptersRead volumesRead statuses{status count} formats{format count} scores{score count} genres(limit:60,sort:COUNT_DESC){genre count}";
const AS_TAGS = " tags(limit:500,sort:COUNT_DESC){tag{name category} count}";
const asBody = tags => "statistics{anime{" + AS_FIELDS + (tags ? AS_TAGS : "") + "} manga{" + AS_FIELDS + (tags ? AS_TAGS : "") + "}}";
const asQuery = (tags, uid) => uid ? "query($id:Int!){User(id:$id){" + asBody(tags) + "}}" : "query{Viewer{" + asBody(tags) + "}}";
const AS_GENRE_COLORS = { Action: "#f29a9b", Adventure: "#f1c95a", Comedy: "#a5e46d", Drama: "#c59cf2", Ecchi: "#f47cb7", Fantasy: "#93a3f7", Hentai: "#e98bd7", Horror: "#ea866e", "Mahou Shoujo": "#e6a6f3", Mecha: "#76c9c3", Music: "#82d3f2", Mystery: "#a99ef2", Psychological: "#dca9e3", Romance: "#f6a5a5", "Sci-Fi": "#6fc6f6", "Slice of Life": "#cbdb6e", Sports: "#f2ab6e", Supernatural: "#72d3a6", Thriller: "#db8d8d" };
const AS_PALETTE = ["#c3f26b", "#b0bcff", "#f1d98a", "#e8a8d0", "#eaa994", "#8fd8d0", "#c9a6f0", "#f2b36f"];
const AS_STATUS = { CURRENT: ["Watching", "Reading"], REPEATING: ["Rewatching", "Rereading"], PLANNING: ["Planning", "Planning"], COMPLETED: ["Completed", "Completed"], PAUSED: ["Paused", "Paused"], DROPPED: ["Dropped", "Dropped"] };
const AS_DEMOS = ["Shounen", "Shoujo", "Josei", "Seinen", "Kids"];
const asNiceFormat = f => String(f || "").split("_").map(w => w[0] + w.slice(1).toLowerCase()).join(" ").replace(/^Tv\b/, "TV").replace(/^Ova$/, "OVA").replace(/^Ona$/, "ONA");
const asGenreColor = g => { if(AS_GENRE_COLORS[g]) return AS_GENRE_COLORS[g]; let h = 0; for(const c of g) h = (h * 31 + c.charCodeAt(0)) % 360; return "hsl(" + h + " 70% 72%)"; };
const asPct = (n, total) => total ? (Math.round(n / total * 1000) / 10).toFixed(1) + "%" : "0.0%";

const asCache = new Map();   // "me" or a user id -> { st, at }
let asBusy = false, statsSeg = "overview";

async function loadAniStats(force, uid){
  const key = uid || "me", hit = asCache.get(key);
  if(hit && !force && Date.now() - hit.at < 600000) return hit.st;
  try{
    const ask = tags => gql(asQuery(tags, uid), uid ? { id: uid } : {});
    let { json } = await ask(true);
    const pick = j => j.data && (uid ? j.data.User : j.data.Viewer);
    if(!pick(json)) ({ json } = await ask(false));   // retry without tags if AniList refuses the big request
    const root = pick(json), st = root && root.statistics;
    if(!st) throw new Error((json.errors && json.errors[0] && json.errors[0].message) || "No data");
    asCache.set(key, { st, at: Date.now() }); capMap(asCache, 20);
    if(!uid) cacheSet("acct", "stats_me_" + acctUser(), st);   // your own statistics are saved for 14 days
    return st;
  }catch(err){
    const saved = !uid && isNetErr(err) ? cacheGetAs("acct", "stats_me_" + acctUser(), CACHE_OK.object) : null;
    if(saved){ asCache.set(key, { st: saved, at: Date.now() - 540000 }); return saved; }   // offline: show the saved statistics, ask again in a minute
    throw err;
  }
}

// ----- small drawing helpers -----
function asBars(rows, total, box){   // rows: [{label, n, color}]
  for(const r of rows){
    const head = el("div", "asgl"), name = el("span", null, r.label + " (" + r.n + ")"), pct = el("em", null, asPct(r.n, total));
    name.style.color = r.color; head.append(name, pct);
    const track = el("div", "asgb"), fill = el("i"); fill.style.width = Math.max(1, r.n / total * 100) + "%"; fill.style.background = r.color; track.append(fill);
    const row = el("div", "asg"); row.append(head, track); box.append(row);
  }
}
function asDonut(rows, total, box){
  const NS = "http://www.w3.org/2000/svg", svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 100 100"); svg.setAttribute("class", "asdonut"); svg.setAttribute("role", "img");
  const R = 38, C = 2 * Math.PI * R; let off = 0;
  rows.forEach((r, i) => {
    r.color = r.color || AS_PALETTE[i % AS_PALETTE.length];
    const len = C * r.n / total, c = document.createElementNS(NS, "circle");
    for(const [k, v] of Object.entries({ cx: 50, cy: 50, r: R, fill: "none", stroke: r.color, "stroke-width": 14, "stroke-dasharray": len + " " + (C - len), "stroke-dashoffset": -off, transform: "rotate(-90 50 50)" })) c.setAttribute(k, v);
    svg.append(c); off += len;
  });
  const legend = el("div", "asleg");
  for(const r of rows){
    const row = el("div", "asli"), dot = el("i"), name = el("span", null, r.label + " (" + r.n + ")"), pct = el("em", null, asPct(r.n, total));
    dot.style.background = r.color; row.append(dot, name, pct); legend.append(row);
  }
  box.append(svg, legend);
}

// ----- one section per row, anime on the left and manga on the right -----
function asSections(st){
  const side = key => {
    const s = st[key] || {}, total = s.count || 0, anime = key === "anime", ix = anime ? 0 : 1;
    const demo = (s.tags || []).filter(t => t.tag && (t.tag.category === "Demographic" || AS_DEMOS.includes(t.tag.name)));
    const demoRows = AS_DEMOS.map(d => ({ label: d, n: (demo.find(t => t.tag.name === d) || {}).count || 0 })).filter(r => r.n > 0);
    const known = demoRows.reduce((a, r) => a + r.n, 0);
    if(s.tags && demoRows.length) demoRows.push({ label: "Not specified", n: Math.max(0, total - known) });
    return {
      total,
      summary: anime ? [[total.toLocaleString(), "Total anime"], [(s.minutesWatched / 1440).toFixed(1), "Days watched"], [Number(s.meanScore || 0).toFixed(2), "Mean score"]]
                     : [[total.toLocaleString(), "Total manga"], [(s.chaptersRead || 0).toLocaleString(), "Chapters read"], [Number(s.meanScore || 0).toFixed(2), "Mean score"]],
      genres: (s.genres || []).slice(0, 15).map(g => ({ label: g.genre, n: g.count, color: asGenreColor(g.genre) })),
      status: (s.statuses || []).slice().sort((a, b) => b.count - a.count).map(x => ({ label: (AS_STATUS[x.status] || [x.status, x.status])[ix], n: x.count })),
      demo: demoRows.filter(r => r.n > 0),
      formats: (s.formats || []).slice().sort((a, b) => b.count - a.count).map(x => ({ label: asNiceFormat(x.format), n: x.count })),
      tags: (s.tags || []).filter(t => t.tag && t.tag.category !== "Demographic" && !AS_DEMOS.includes(t.tag.name)).slice(0, 12).map((t, i) => ({ label: t.tag.name, n: t.count, color: AS_PALETTE[i % AS_PALETTE.length] })),
      scores: (s.scores || []).filter(x => x.score > 0).sort((a, b) => a.score - b.score).map(x => ({ label: String(x.score), n: x.count, color: "#b0bcff" })),
    };
  };
  return [side("anime"), side("manga")];
}

function drawAniStats(box, st, onRefresh){
  const S = asSections(st);
  box.replaceChildren();
  const head = el("div", "asrow"); head.append(el("h3", "asttl", "Anime"), el("h3", "asttl", "Manga")); box.append(head);
  const sums = el("div", "asrow");
  for(const s of S){ const c = el("div", "asum"); for(const [big, small] of s.summary){ const r = el("div"); r.append(el("b", null, big), el("span", null, small)); c.append(r); } sums.append(c); }
  box.append(sums);
  const section = (title, key, kind, minRows) => {
    if(!S.some(s => s[key] && s[key].length >= (minRows || 1))) return;
    const row = el("div", "asrow");
    for(const s of S){
      const cell = el("div", "asbox"); cell.append(el("h4", null, title));
      if(s[key] && s[key].length >= (minRows || 1)) (kind === "bars" ? asBars : asDonut)(s[key], s.total || 1, cell);
      else cell.append(el("p", "sub", "Nothing to show"));
      row.append(cell);
    }
    box.append(row);
  };
  section("Genres", "genres", "bars"); section("Status", "status", "donut"); section("Demographics", "demo", "donut"); section("Formats", "formats", "donut");
  section("Tags", "tags", "bars"); section("Scores", "scores", "bars");
  if(onRefresh){ const f = el("button", "mini", "Refresh"); f.onclick = onRefresh; box.append(f); }
}

async function renderAniStats(force){
  const box = $("#anistatsBody"); if(asBusy) return;
  if(!asCache.get("me")) box.replaceChildren(el("div", "msg", "Loading your AniList statistics…"));
  asBusy = true;
  try{
    drawAniStats(box, await loadAniStats(force), () => { renderAniStats(true); });
  }catch(err){
    const m = el("div", "msg state"); m.append(el("b", null, "Couldn't load your statistics"), el("span", null, isNetErr(err) ? "No connection." : err.message));
    const b = el("button", "go alt", "Try again"); b.onclick = () => renderAniStats(true); m.append(b); box.replaceChildren(m);
  }finally{ asBusy = false; }
}

function showStats(){
  document.querySelectorAll("#statsSeg .chip").forEach(c => c.setAttribute("aria-pressed", String(c.dataset.s === statsSeg)));
  $("#anistatsBody").hidden = statsSeg !== "overview"; $("#statsBody").hidden = statsSeg !== "progress";
  if(statsSeg === "overview") renderAniStats(false); else renderStats();
}
document.querySelectorAll("#statsSeg .chip").forEach(c => { c.onclick = () => { statsSeg = c.dataset.s; showStats(); }; });
