/* js/features/pick-taste.js: "For my taste" pick. New titles that suit your taste report and are NOT on your lists. */
// ---------- Pick for my taste ----------
// onList:false makes AniList leave out everything on your lists, whatever its status. Titles that are not released yet are left out too.
const PT_BITS = "id type siteUrl title{romaji english native} countryOfOrigin coverImage{extraLarge large} format status episodes chapters duration averageScore popularity genres isAdult startDate{year month day} nextAiringEpisode{episode airingAt} tags{name rank isMediaSpoiler}";
const PT_Q = "query PickTaste($p:Int,$t:MediaType,$g:[String],$tags:[String],$adult:Boolean){Page(page:$p,perPage:50){media(type:$t,genre_in:$g,tag_in:$tags,onList:false,isAdult:$adult,status_not:NOT_YET_RELEASED,averageScore_greater:65,sort:[POPULARITY_DESC]){" + PT_BITS + "}}}";
const pt = { token: 0, pools: new Map() };

// Score a candidate by how much of your taste it shares (genres you watch most, themes you love) plus how well it is rated.
function ptScore(m, genres, themes){
  let s = 0; const mg = m.genres || [], mt = tzTags(m);
  for(const g of genres) if(mg.includes(g.name)) s += g.pct / 10;
  for(const t of themes) if(mt.includes(t.name)) s += Math.min(5, t.lift) * 1.2;
  return s + (m.averageScore || 60) / 25;
}
async function ptPool(type){
  const rep = await tzGet(type);
  if(!rep.ready) return { notReady: rep.n, items: [] };
  const genres = state.genre !== "ALL" ? [{ name: state.genre, pct: 40 }] : rep.genres.bars.filter(b => b.name !== "Others" && b.pct).slice(0, 3);
  const themes = rep.themes.up;
  const key = [type, genres.map(g => g.name).join(","), themes.map(t => t.name).join(","), state.adult].join("|");
  if(pt.pools.has(key)) return { items: pt.pools.get(key) };
  const base = { t: type.toUpperCase(), p: 1 }; if(state.adult !== "ALL") base.adult = state.adult === "ONLY";
  const seen = new Map();
  const queries = [{ g: genres.map(g => g.name) }];
  if(themes.length && state.genre === "ALL") queries.push({ tags: themes.map(t => t.name) });
  for(const q of queries){
    const { json } = await gql(PT_Q, Object.assign({}, base, q)), pg = json.data && json.data.Page;
    if(!pg) throw new Error("AniList said: " + ((json.errors && json.errors[0] && json.errors[0].message) || "no data"));
    for(const m of pg.media) if(!seen.has(m.id)) seen.set(m.id, m);
  }
  const items = [...seen.values()].map(m => ({ m, score: ptScore(m, genres, themes) })).sort((a, b) => b.score - a.score);
  pt.pools.set(key, items); return { items };
}

async function tastePick(){
  const box = $("#result"), token = ++pt.token;
  box.replaceChildren(el("div", "msg", "Finding something new for your taste…"));
  try{
    const types = state.kind === "BOTH" ? ["anime", "manga"] : [state.kind.toLowerCase()];
    const pools = []; let notReady = 0;
    for(const t of types){ const r = await ptPool(t); if(r.notReady != null) notReady = Math.max(notReady, r.notReady); pools.push(...r.items); }
    if(token !== pt.token) return;
    if(!pools.length && notReady) return msg("Add or finish at least " + TZ_MIN_TITLES + " titles first, so there is a taste to match. You have " + notReady + " so far.");
    const cands = [];
    for(const { m, score } of pools){
      if(hide.has(m.id) || state.skipped.has(m.id)) continue;
      const e = { status: "NEW", progress: 0, media: m }, p = plan(e);
      if(p) cands.push({ e, p, score });
    }
    if(!cands.length){
      if(state.skipped.size){ state.skipped.clear(); return tastePick(); }
      return msg("Nothing new fits. Try a different time or genre, or open Filters.");
    }
    cands.sort((a, b) => b.score - a.score);
    const top = cands.slice(0, 12);                       // pick at random among the best matches so "Another" gives variety
    show(top[Math.floor(Math.random() * top.length)]);
  }catch(err){
    if(token !== pt.token) return;
    msg(/Failed to fetch|NetworkError|Load failed/i.test(err.message) ? "Couldn't reach AniList. Check your connection and try again." : err.message);
  }
}
$("#tastePickBtn").onclick = () => { state.skipped.clear(); tastePick(); };
