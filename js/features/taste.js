/* js/features/taste.js: Taste report (Pick > Your taste report). The maths lives in taste-math.js. */
// ---------- Taste report ----------
const TZ_F = "status score(format:POINT_100) media{id isAdult siteUrl title{romaji english native} countryOfOrigin coverImage{large} genres tags{name rank isMediaSpoiler} averageScore popularity startDate{year}}";
const TZ_REF_Q = "query TasteRef($p:Int,$t:MediaType){Page(page:$p,perPage:50){media(type:$t,sort:POPULARITY_DESC,isAdult:false){id genres tags{name rank isMediaSpoiler}}}}";
const TZ_REF_PAGES = 4, TZ_REF_DAYS = 7;
const tz = { type: "anime", token: 0, cache: {} };
const tzKind = () => tz.type === "manga" ? "manga" : "anime";

// The "average fan" sample: the most popular titles on AniList. Kept on this device for a week.
async function tzRef(type){
  const key = "wn_taste_ref_" + type;
  try{ const c = JSON.parse(localStorage.getItem(key) || "null"); if(c && Date.now() - c.t < TZ_REF_DAYS * 864e5 && c.items && c.items.length) return c.items; }catch(_){}
  const items = [];
  for(let p = 1; p <= TZ_REF_PAGES; p++){
    const { json } = await gql(TZ_REF_Q, { p, t: type.toUpperCase() }), pg = json.data && json.data.Page;
    if(!pg) throw new Error("AniList said: " + ((json.errors && json.errors[0] && json.errors[0].message) || "no data"));
    for(const m of pg.media) items.push({ genres: m.genres || [], tags: (m.tags || []).filter(t => t.rank >= 50 && !t.isMediaSpoiler).map(t => ({ name: t.name, rank: t.rank })) });
    if(pg.media.length < 50) break;
  }
  try{ localStorage.setItem(key, JSON.stringify({ t: Date.now(), items })); }catch(_){}
  return items;
}

const tzSum = () => LS("wn_taste_sum", {});
function tzEntry(){
  const s = tzSum(), a = s.anime;
  $("#tasteTitle").textContent = a ? a.name : "Your taste report";
  $("#tasteSub").textContent = a ? a.type + " · " + a.code + " · tap for the full report" : "Find your archetype and taste type";
}

function tzSlider(pos){
  const s = el("div", "tzslider"), dot = el("i"); dot.style.left = Math.round(pos * 100) + "%"; s.append(dot); return s;
}
function tzTile(m, label){
  const b = el("button", "tzt"), img = el("img");
  img.src = (m.coverImage && m.coverImage.large) || ""; img.alt = ""; img.loading = "lazy";
  b.append(img); if(label) b.append(el("span", "tzchip" + (label.includes("rare") || label === "Rare" ? " gold" : ""), label));
  b.append(el("span", "tzname", tt(m))); b.onclick = () => openMedia(m.id); return b;
}
function tzRow(title, tiles){
  const w = el("div", "tzshow"); if(!tiles.length) return w;
  const row = el("div", "tzrow"); for(const t of tiles) row.append(tzTile(t.m, t.label));
  w.append(el("h4", "tzsh", title), row); return w;
}
function tzTheme(t){
  const r = el("div", "tzth"), bar = el("div", "tzbar"), fill = el("b"), up = t.lift >= 1, w = Math.round(tzMag(t.lift) * 50);
  fill.style.width = w + "%"; fill.style[up ? "left" : "right"] = "50%"; if(!up) fill.className = "neg";
  bar.append(fill); r.append(el("span", "tzthn", t.name), bar, el("span", "tzthx" + (up ? " up" : ""), tzX(t.lift))); return r;
}

function tzRender(rep){
  const body = $("#tzBody"); body.replaceChildren();
  const kind = tzKind();
  if(!rep.ready){ body.append(el("div", "msg", "Add or finish at least " + TZ_MIN_TITLES + " " + kind + " titles and your taste report will appear here. You have " + rep.n + " so far.")); return; }
  // archetype
  const hero = el("div", "tzcard tzhero");
  hero.append(el("span", "tzk", "Archetype"), el("h3", "tzbig", rep.arch.name), el("p", "tzlead", rep.arch.line));
  if(rep.arch.tag){
    const hl = el("div", "tzhl"), txt = el("p", null, "You like "), strong = el("b", null, rep.arch.tag), mid = document.createTextNode(" " + kind + " "), x = el("b", "tzx", tzX(rep.arch.lift));
    txt.append(strong, mid, x, " more than the average fan"); hl.append(txt);
    const cv = el("div", "tzcovers"); for(const m of rep.arch.covers){ const i = el("img"); i.src = (m.coverImage && m.coverImage.large) || ""; i.alt = ""; cv.append(i); }
    hl.append(cv); hero.append(hl);
  }
  const th = el("div", "tzths"); for(const t of rep.themes.up.concat(rep.themes.down)) th.append(tzTheme(t));
  if(th.childNodes.length) hero.append(el("span", "tzk tzk2", "Theme index"), th);
  body.append(hero);
  // personality type
  const ty = el("div", "tzcard"), head = el("div", "tzhead"); head.append(el("h3", "tzbig", rep.typeName), el("span", "tzcode", rep.code));
  ty.append(el("span", "tzk", "Personality type"), head, el("p", "tzlead", rep.typeLine));
  body.append(ty);
  // four sliders
  rep.axes.forEach((a, i) => {
    const c = el("div", "tzcard"), top = el("div", "tzax");
    top.append(el("span", "tzl", a.letter));
    const poles = el("div", "tzpoles"), lean = a.known ? (a.pos < 0.5 ? 0 : 1) : -1;
    poles.append(el("span", "tzp" + (lean === 0 ? " on" : ""), a.left.name), tzSlider(a.pos), el("span", "tzp" + (lean === 1 ? " on" : ""), a.right.name));
    c.append(top, poles);
    c.append(el("p", "tzcap", a.known ? (a.pos < 0.5 ? a.capL : a.capR).replace("{kind}", kind) : "Rate at least " + TZ_MIN_SCORED + " titles to sharpen this one."));
    if(i === 0 && a.pos < 0.5) c.append(tzRow("Hidden gems", rep.gems));
    if(i === 1) c.append(tzRow(rep.fresh ? "Newer" : "Older", rep.years));
    if(i === 2){
      const bar = el("div", "tzgbar"), legend = el("div", "tzlegend");
      rep.genres.bars.forEach((g, k) => { if(!g.pct) return; const s = el("b"); s.style.flex = String(g.pct); s.className = "g" + "abcde"[k]; bar.append(s); const li = el("span", "tzlg", g.name + " " + g.pct + "%"); li.prepend(el("i", "g" + "abcde"[k])); legend.append(li); });
      c.append(bar, legend, tzRow(a.pos < 0.5 ? "Various genres" : "Favourite genres", rep.genres.picks));
    }
    if(i === 3 && a.known && rep.gaps.length){
      c.append(el("h4", "tzsh", "Biggest gaps"));
      for(const g of rep.gaps){
        const r = el("button", "tzgap"), img = el("img"), info = el("span", "tzginfo");
        img.src = (g.m.coverImage && g.m.coverImage.large) || ""; img.alt = "";
        info.append(el("b", null, tt(g.m)), el("span", null, "You " + g.you.toFixed(1) + " · Fans " + g.fans.toFixed(1)));
        r.append(img, info, el("span", "tzdiff" + (g.diff < 0 ? " neg" : ""), (g.diff > 0 ? "+" : "−") + Math.abs(g.diff).toFixed(1)));
        r.onclick = () => openMedia(g.m.id); c.append(r);
      }
    }
    body.append(c);
  });
  // vibes
  const vb = el("div", "tzcard"); vb.append(el("h3", "tzbig sm", "Your vibe"));
  for(const v of rep.vibes){
    const r = el("div", "tzvibe"), on = Math.abs(v.pos - 0.5) < 0.04 ? -1 : v.pos < 0.5 ? 0 : 1;
    const side = (s, i, cls) => { const d = el("div", "tzvs " + cls + (on === i ? " on" : "")); d.append(el("b", null, s.name), el("small", null, s.note)); return d; };
    r.append(side(v.left, 0, "l"), tzSlider(v.pos), side(v.right, 1, "r")); vb.append(r);
  }
  vb.append(el("p", "tzfoot", "Each side is compared with the average fan. In the middle, both sides pull equally."));
  body.append(vb);
  const share = el("button", "go", "Share my taste report"); share.onclick = () => tzShare(rep); body.append(share);
  body.append(el("p", "tzfoot", "Based on " + rep.n + " " + kind + " titles in your list (" + rep.scored + " rated), compared with the most popular titles on AniList."));
}

async function tzShare(rep){
  const text = tzShareText(rep);
  try{ if(navigator.share){ await navigator.share({ title: "My taste report", text }); return; } }catch(e){ if(e && e.name === "AbortError") return; }
  try{ await navigator.clipboard.writeText(text); toast("Copied your taste report"); }catch(_){ toast("Couldn't share from here"); }
}

async function tzLoad(){
  const type = tz.type, token = ++tz.token, body = $("#tzBody");
  document.querySelectorAll("#tzKinds .chip").forEach(c => c.setAttribute("aria-pressed", String(c.dataset.v === type)));
  if(tz.cache[type]){ tzRender(tz.cache[type]); return; }
  body.replaceChildren(el("div", "msg", "Reading your " + type + " list…"));
  try{
    if(!state.user) throw new Error("Failed to fetch");
    const entries = await collection(state.user, type.toUpperCase(), "status_in:[COMPLETED,CURRENT,REPEATING,PAUSED,DROPPED]", TZ_F);
    if(token !== tz.token) return;
    const rep = tzBuild(entries, await tzRef(type), type, new Date().getFullYear());
    if(token !== tz.token) return;
    tz.cache[type] = rep; tzRender(rep);
    if(rep.ready){ const s = tzSum(); s[type] = { name: rep.arch.name, code: rep.code, type: rep.typeName }; LSset("wn_taste_sum", s); tzEntry(); }
  }catch(err){
    if(token !== tz.token) return;
    body.replaceChildren(dxEmpty(/Failed to fetch|NetworkError|Load failed/i.test(err.message) ? "Couldn't reach AniList. Check your connection." : err.message, tzLoad));
  }
}
function tasteOpen(){ tzLoad(); }
$("#tzKinds").addEventListener("click", ev => { const b = ev.target.closest(".chip"); if(!b || b.dataset.v === tz.type) return; tz.type = b.dataset.v; tzLoad(); });
$("#tasteBtn").onclick = () => showTab("taste");
tzEntry();
