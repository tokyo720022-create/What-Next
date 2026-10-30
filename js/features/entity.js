/* js/features/entity.js: character, staff, and studio pages. They open from the media page and share its back stack. */
const ecache = new Map();
const KIND = { c: "character", s: "staff", t: "studio" };
const TOKEN = { character: "c", staff: "s", studio: "t" };   // never use the first letter: "staff" and "studio" both start with s
const MEDIA_BITS = "id type format title{romaji english native} countryOfOrigin coverImage{large}";
const CHAR_Q = "query($id:Int){Character(id:$id){id siteUrl name{full native} image{large} description(asHtml:false) gender age bloodType dateOfBirth{year month day} favourites isFavourite media(sort:[POPULARITY_DESC],perPage:30){pageInfo{total} edges{characterRole node{" + MEDIA_BITS + "} voiceActors{id name{full} image{medium} languageV2}}}}}";
const STAFF_Q = "query($id:Int){Staff(id:$id){id siteUrl name{full native} image{large} description(asHtml:false) primaryOccupations languageV2 homeTown gender age yearsActive dateOfBirth{year month day} favourites isFavourite staffMedia(sort:[POPULARITY_DESC],perPage:30){pageInfo{total} edges{staffRole node{" + MEDIA_BITS + "}}} characters(sort:[FAVOURITES_DESC],perPage:30){edges{role node{id name{full} image{medium}} media{id title{romaji english native} countryOfOrigin}}}}}";
const STUDIO_Q = "query($id:Int,$p:Int){Studio(id:$id){id siteUrl name favourites isFavourite media(sort:[START_DATE_DESC],page:$p,perPage:24){pageInfo{hasNextPage} edges{node{" + MEDIA_BITS + " seasonYear}}}}}";

function openEntity(kind, id){
  const tok = TOKEN[kind] + ":" + id;
  if(mstack[mstack.length - 1] !== tok) mstack.push(tok);
  showEntity(tok);
}
async function showEntity(tok){
  const box = $("#media"); box.hidden = false;
  const kind = KIND[tok[0]], id = Number(tok.slice(2));
  if(!ecache.has(tok)){
    const w = el("div", "mhead"); w.append(closeBar()); box.replaceChildren(w, el("div", "msg", "Loading…"));
    try{
      const { json } = await gql(kind === "character" ? CHAR_Q : kind === "staff" ? STAFF_Q : STUDIO_Q, kind === "studio" ? { id, p: 1 } : { id });
      const d = json.data && (json.data.Character || json.data.Staff || json.data.Studio);
      if(!d) throw new Error((json.errors && json.errors[0].message) || "Not found");
      ecache.set(tok, d);
    }catch(err){
      const w2 = el("div", "mhead"); w2.append(closeBar());
      box.replaceChildren(w2, el("div", "msg", err.message.includes("Failed to fetch") ? "No connection. Try again." : err.message)); return;
    }
  }
  if(mstack[mstack.length - 1] === tok) renderEntity(kind, ecache.get(tok));
}
const cleanBio = t => clean(String(t || "").replace(/~!([\s\S]*?)!~/g, "").replace(/__|\*\*/g, ""));

function favButton(kind, d, countEl){
  const b = el("button", "favbtn"), paint = () => { b.textContent = d.isFavourite ? "✓ Favorite" : "Set as Favorite"; b.classList.toggle("on", !!d.isFavourite); };
  paint();
  b.onclick = async () => {
    b.disabled = true;
    try{
      const v = kind === "character" ? { c: d.id } : kind === "staff" ? { s: d.id } : { t: d.id };
      const { json } = await gql("mutation($c:Int,$s:Int,$t:Int){ToggleFavourite(characterId:$c,staffId:$s,studioId:$t){studios{pageInfo{total}}}}", v);
      if(json.errors) throw new Error(json.errors[0].message);
      d.isFavourite = !d.isFavourite; d.favourites = Math.max(0, (d.favourites || 0) + (d.isFavourite ? 1 : -1));
      paint(); countEl.textContent = d.favourites.toLocaleString();
    }catch(err){ toast("Couldn't change the favourite. Check your connection."); }
    b.disabled = false;
  };
  return b;
}
function mediaCard(n, caption){
  const b = el("button", "mcard"), i = new Image(); i.alt = ""; i.loading = "lazy"; i.src = n.coverImage.large;
  b.append(i, el("span", "relb", norm(n.format || n.type)), el("b", null, tt(n)));
  if(caption) b.append(el("i", null, norm(caption)));
  b.onclick = () => openMedia(n.id); return b;
}
function personButton(node, caption, onclick){
  const b = el("button", "person"), i = new Image(); i.alt = ""; i.loading = "lazy"; i.src = node.image.medium;
  b.append(i, el("span", null, node.name.full)); if(caption) b.append(el("i", null, caption));
  b.onclick = onclick; return b;
}

function renderEntity(kind, d){
  const box = $("#media"); box.replaceChildren(); box.scrollTop = 0;
  const img = kind === "studio" ? null : d.image && d.image.large, title = kind === "studio" ? d.name : d.name.full;
  // header
  const head = el("div", "mhead"), bg = el("div", "mbg");
  bg.style.backgroundImage = img ? "url(" + JSON.stringify(img) + ")" : "var(--grad)";
  const row = el("div", "mrow"), info = el("div"); info.style.minWidth = "0";
  if(img){ const p = new Image(); p.alt = ""; p.className = "tposter"; p.src = img; row.append(p); }
  info.append(el("h1", null, title)); if(kind !== "studio" && d.name.native) info.append(el("p", null, d.name.native));
  row.append(info); head.append(bg, closeBar(), row); box.append(head);
  // numbers and the favourite button
  const st = el("div", "mstats"), favB = el("b", null, (d.favourites || 0).toLocaleString());
  const cell = (b, s) => { const c = el("div", "mcell"); c.append(b, el("span", null, s)); return c; };
  const total = kind === "character" ? d.media.pageInfo.total : kind === "staff" ? d.staffMedia.pageInfo.total : null;
  if(total != null) st.append(cell(el("b", null, String(total)), "Media"));
  st.append(cell(favB, "Favorites"), favButton(kind, d, favB)); box.append(st);
  // about
  const bio = cleanBio(d.description);
  if(bio){
    const c = el("div", "clamp", bio), t = el("button", null, "More");
    t.onclick = () => { c.classList.toggle("open"); t.textContent = c.classList.contains("open") ? "Less" : "More"; };
    box.append(msec("About", c, t));
  }
  const facts = kind === "character" ? [["Gender", d.gender], ["Age", d.age], ["Birthday", d.dateOfBirth && d.dateOfBirth.month ? fd(d.dateOfBirth) : ""], ["Blood type", d.bloodType]]
    : kind === "staff" ? [["Occupations", (d.primaryOccupations || []).join(", ")], ["Language", d.languageV2], ["Gender", d.gender], ["Age", d.age], ["Born", d.dateOfBirth && d.dateOfBirth.year ? fd(d.dateOfBirth) : ""], ["Years active", (d.yearsActive || []).join(" – ")], ["Home town", d.homeTown]] : [];
  const shown = facts.filter(f => f[1]);
  if(shown.length){ const ib = el("div"); shown.forEach(f => { const r = el("div", "irow"); r.append(el("span", null, f[0]), el("span", null, String(f[1]))); ib.append(r); }); box.append(msec("Info", ib)); }
  if(kind === "character"){
    const seen = new Map();
    d.media.edges.forEach(e => (e.voiceActors || []).forEach(v => { if(!seen.has(v.id)) seen.set(v.id, v); }));
    const vas = [...seen.values()].sort((a, b) => (a.languageV2 === "Japanese" ? 0 : 1) - (b.languageV2 === "Japanese" ? 0 : 1));
    if(vas.length) box.append(msec("Voice actors", hrow(vas.map(v => personButton(v, v.languageV2, () => openEntity("staff", v.id))))));
    if(d.media.edges.length){ const g = el("div", "mgrid"); d.media.edges.forEach(e => g.append(mediaCard(e.node, e.characterRole))); box.append(msec("Series", g)); }
  }else if(kind === "staff"){
    if(d.staffMedia.edges.length){ const g = el("div", "mgrid"); d.staffMedia.edges.forEach(e => g.append(mediaCard(e.node, e.staffRole))); box.append(msec("Media", g)); }
    const ch = (d.characters && d.characters.edges) || [];
    if(ch.length) box.append(msec("Characters", hrow(ch.map(e => personButton(e.node, e.media && e.media[0] ? tt(e.media[0]) : norm(e.role), () => openEntity("character", e.node.id))))));
  }else{
    const g = el("div", "mgrid"), sec = msec("Media", g); d.media.edges.forEach(e => g.append(mediaCard(e.node, e.node.seasonYear ? String(e.node.seasonYear) : "")));
    box.append(sec);
    if(d.media.pageInfo.hasNextPage){
      const more = el("button", "go alt", "See more"); let page = 2;
      more.onclick = async () => {
        more.disabled = true;
        try{
          const { json } = await gql(STUDIO_Q, { id: d.id, p: page });
          const c = json.data.Studio.media; d.media.edges.push(...c.edges); c.edges.forEach(e => g.append(mediaCard(e.node, e.node.seasonYear ? String(e.node.seasonYear) : "")));
          page++; if(c.pageInfo.hasNextPage) more.disabled = false; else more.remove();
        }catch(_){ more.disabled = false; toast("Couldn't load more. Check your connection."); }
      };
      box.append(more);
    }
  }
  const open = el("button", "go alt", "Open on AniList"); open.onclick = () => openExternal(d.siteUrl); box.append(open);
}
