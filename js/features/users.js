/* js/features/users.js: other people's profiles, and the Followers and Following lists */
// ---------- People: Followers / Following lists and profiles of other users ----------
const ustack = [];   // pages shown in the #user overlay: { kind: "list" | "profile" | "stats" | "mlist", ... }
const affCache = new Map();
const U_LIST_Q = mode => "query($id:Int!,$p:Int){Page(page:$p,perPage:30){pageInfo{hasNextPage} " + mode + "(userId:$id,sort:USERNAME){id name avatar{large} bannerImage isFollowing isFollower}}}";
const U_Q = "query($id:Int!){User(id:$id){id name siteUrl about(asHtml:false) bannerImage avatar{large} options{profileColor} isFollowing isFollower statistics{anime{count episodesWatched minutesWatched meanScore} manga{count chaptersRead volumesRead meanScore}}}}";
const U_TOGGLE_Q = "mutation($id:Int){ToggleFollow(userId:$id){id isFollowing}}";
const AFF_Q = "query($u:String,$t:MediaType,$c:Int){MediaListCollection(userName:$u,type:$t,chunk:$c,perChunk:500){hasNextChunk lists{entries{mediaId score(format:POINT_100)}}}}";

const uMsg = err => isNetErr(err) ? "no connection" : err.message;
const meId = () => state.uid || (profMe && profMe.id) || 0;
const myName = () => state.user || savedName();
const uTag = u => (u.isFollowing && u.isFollower ? "Mutual" : u.isFollower ? "Follows you" : "");
const aniLink = name => "https://anilist.co/user/" + encodeURIComponent(name);

// ----- the overlay and its page stack -----
function userShow(){
  const box = $("#user"), top = ustack[ustack.length - 1];
  if(!top){ box.hidden = true; box.replaceChildren(); return; }
  if(!top.root){ top.root = el("div", "uroot"); ({ list: uBuildList, stats: uBuildStats, profile: uBuildProfile, mlist: uBuildMediaList })[top.kind](top); }
  box.hidden = false; box.replaceChildren(top.root); box.scrollTop = top.scroll || 0;
}
function userPush(p){ const cur = ustack[ustack.length - 1]; if(cur) cur.scroll = $("#user").scrollTop; ustack.push(p); userShow(); }
function userPop(){ ustack.pop(); userShow(); }
function userCloseAll(){ ustack.length = 0; userShow(); }
function openUserList(mode, id, name){ userCloseAll(); userPush({ kind: "list", mode, id, name }); }
function openUser(id, name){ userCloseAll(); userPush({ kind: "profile", id, name }); }
function uBar(title){
  const bar = el("div", "utop"), b = el("button", "uback", ustack.length > 1 ? "←" : "✕");
  b.setAttribute("aria-label", ustack.length > 1 ? "Back" : "Close"); b.onclick = userPop; bar.append(b);
  if(title) bar.append(el("h2", null, title)); return bar;
}

// ----- follow / unfollow -----
async function toggleFollow(u){
  const { json } = await gql(U_TOGGLE_Q, { id: u.id }), r = json.data && json.data.ToggleFollow;
  if(!r) throw new Error((json.errors && json.errors[0] && json.errors[0].message) || "No answer");
  u.isFollowing = r.isFollowing; toast((r.isFollowing ? "Following " : "Unfollowed ") + u.name); return r.isFollowing;
}

// ----- Followers / Following list -----
function uCard(u){
  const c = el("div", "ucard"), av = el("img", "uav"), nm = el("span", "uname", u.name), tag = el("span", "utag"), kb = el("button", "ukebab", "⋮");
  const banner = safeUrl(u.bannerImage); if(banner){ c.classList.add("ub"); c.style.backgroundImage = "linear-gradient(rgba(0,0,0,.58),rgba(0,0,0,.58)),url(" + JSON.stringify(banner) + ")"; }
  av.src = safeUrl(u.avatar && u.avatar.large); av.alt = ""; av.loading = "lazy";
  const sync = () => { tag.textContent = u.id !== meId() && u.isFollowing && u.isFollower ? "Mutual" : ""; }; sync();   // lists only mark mutual follows, like AniList apps do
  kb.setAttribute("aria-label", "More about " + u.name);
  c.onclick = e => { if(!e.target.closest(".ukebab")) userPush({ kind: "profile", id: u.id, name: u.name }); };
  kb.onclick = () => uMenu(u, sync);
  const info = el("div", "uinfo"); info.append(nm, tag); c.append(av, info, kb); return c;
}
function uMenu(u, after){
  const sh = el("div", "usheet"), box = el("div", "usheetbox"); box.append(el("h3", null, u.name));
  const add = (text, fn) => { const b = el("button", "go alt", text); b.onclick = async () => { sh.remove(); await fn(); }; box.append(b); };
  add("View profile", () => userPush({ kind: "profile", id: u.id, name: u.name }));
  if(u.id !== meId()) add(u.isFollowing ? "Unfollow" : "Follow", async () => { try{ await toggleFollow(u); after(); }catch(err){ toast("Couldn't change that: " + uMsg(err)); } });
  add("View on AniList", () => openExternal(aniLink(u.name)));
  const cancel = el("button", "lslink", "Cancel"); cancel.onclick = () => sh.remove(); box.append(cancel);
  sh.onclick = e => { if(e.target === sh) sh.remove(); }; sh.append(box); $("#user").append(sh);
}
function uBuildList(page){
  const root = page.root, list = el("div", "ulist"), status = el("p", "sub"), more = el("button", "go alt", "Load more");
  root.append(uBar(page.mode === "followers" ? "Followers" : "Following"), list, status, more); more.hidden = true; page.p = 1;
  const load = async () => {
    more.disabled = true; if(page.p === 1) status.textContent = "Loading…";
    try{
      const { json } = await gql(U_LIST_Q(page.mode), { id: page.id, p: page.p }), pg = json.data && json.data.Page;
      if(!pg) throw new Error((json.errors && json.errors[0] && json.errors[0].message) || "No data");
      for(const u of pg[page.mode] || []) list.append(uCard(u));
      status.textContent = list.children.length ? "" : (page.mode === "followers" ? "No followers yet." : "Not following anyone yet.");
      more.textContent = "Load more"; more.hidden = !(pg.pageInfo && pg.pageInfo.hasNextPage); page.p++;
    }catch(err){ status.textContent = "Couldn't load the list: " + uMsg(err); more.textContent = "Try again"; more.hidden = false; }
    more.disabled = false;
  };
  more.onclick = load; load();
}

// ----- shared taste: Pearson correlation of the scores you both gave -----
async function scoreMap(name, type){
  const key = (name + "|" + type).toLowerCase(); if(affCache.has(key)) return affCache.get(key);
  const map = new Map();
  for(let c = 1; c <= 4; c++){
    const { json } = await gql(AFF_Q, { u: name, t: type, c }), col = json.data && json.data.MediaListCollection;
    if(!col) throw new Error((json.errors && json.errors[0] && json.errors[0].message) || "No data");
    for(const l of col.lists || []) for(const e of l.entries || []) if(e.score > 0) map.set(e.mediaId, e.score);
    if(!col.hasNextChunk) break;
  }
  affCache.set(key, map); return map;
}
function affinityOf(a, b){
  const xs = [], ys = [];
  for(const [id, s] of a){ const t = b.get(id); if(t){ xs.push(s); ys.push(t); } }
  const n = xs.length; if(n < 5) return { n, pct: null };
  const mx = xs.reduce((p, c) => p + c, 0) / n, my = ys.reduce((p, c) => p + c, 0) / n;
  let sxy = 0, sxx = 0, syy = 0; for(let i = 0; i < n; i++){ sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  if(!sxx || !syy) return { n, pct: null };
  return { n, pct: Math.max(0, Math.round(sxy / Math.sqrt(sxx * syy) * n / (n + 5) * 100)) };
}

// ----- a person's anime or manga list (read-only) -----
const U_LIST_F = "mediaId status progress repeat score(format:POINT_100) updatedAt media{id siteUrl title{romaji english native} countryOfOrigin coverImage{large} format status episodes chapters averageScore popularity genres startDate{year}}";
const U_SORT_NAMES = [["UPDATED", "Updated"], ["SCORE", "Score"], ["TITLE", "Title"]];
const uListMsg = err => /private/i.test(err.message || "") ? "This person keeps their list private." : /not found|404/i.test(err.message || "") ? "This list could not be found." : uMsg(err);
// Titles in the shape the list cards use, once each (AniList repeats a title that is in several custom lists).
function uEntries(raw){
  const seen = new Map();
  for(const e of raw || []) if(e && e.media && !seen.has(e.mediaId)) seen.set(e.mediaId, { id: e.mediaId, status: e.status, progress: e.progress || 0, repeat: e.repeat || 0, score: e.score || 0, updatedAt: e.updatedAt || 0, notes: "", priority: 0, custom: [], m: e.media });
  return [...seen.values()];
}
// What to show for the chosen status, search words and sort, plus how many titles each status has (counts ignore the search, like the status tabs of your own list).
function uMediaView(entries, f){
  const counts = { ALL: entries.length }; for(const e of entries) counts[e.status] = (counts[e.status] || 0) + 1;
  const q = String(f.q || "").trim().toLowerCase(), cmp = SORTS[f.sort] || SORTS.UPDATED;
  const rows = entries.filter(e => (f.status === "ALL" || e.status === f.status) && (!q || [e.m.title && e.m.title.romaji, e.m.title && e.m.title.english, e.m.title && e.m.title.native].some(t => t && String(t).toLowerCase().includes(q)))).sort(cmp);
  return { counts, rows };
}
function uBuildMediaList(page){
  const root = page.root, types = el("div", "row umtypes"), stat = el("div", "umstat"), sorts = el("div", "row umsort"), search = el("input", "umsearch"), cards = el("div"), more = el("button", "go alt", "Show more"), msg = el("div", "msg");
  search.type = "search"; search.placeholder = "Search this list"; search.autocomplete = "off"; search.setAttribute("aria-label", "Search this list");
  more.hidden = true; msg.hidden = true;
  Object.assign(page, { type: page.type || "anime", data: {}, status: "ALL", q: "", sort: "UPDATED", shown: LIST_BATCH });
  root.append(uBar((page.name || "User") + "\u2019s list"), types, stat, sorts, search, msg, cards, more);
  for(const [t, label] of [["anime", "Anime"], ["manga", "Manga"]]){ const b = el("button", "chip", label); b.dataset.v = t; b.onclick = () => { if(page.type === t) return; Object.assign(page, { type: t, status: "ALL", q: "", shown: LIST_BATCH }); search.value = ""; go(); }; types.append(b); }
  for(const [k, label] of U_SORT_NAMES){ const b = el("button", "chip", label); b.dataset.v = k; b.onclick = () => { page.sort = k; page.shown = LIST_BATCH; draw(); }; sorts.append(b); }
  search.oninput = () => { page.q = search.value; page.shown = LIST_BATCH; draw(); };
  more.onclick = () => { page.shown += LIST_BATCH; draw(); };
  const say = (text, retry) => { msg.replaceChildren(); msg.append(el("b", null, text)); if(retry){ const r = el("button", "go alt", "Try again"); r.onclick = () => go(true); msg.append(r); } msg.hidden = false; cards.replaceChildren(); stat.replaceChildren(); more.hidden = true; };
  function draw(){
    const type = page.type, all = page.data[type]; if(!all) return;
    types.querySelectorAll(".chip").forEach(c => c.setAttribute("aria-pressed", String(c.dataset.v === type)));
    sorts.querySelectorAll(".chip").forEach(c => c.setAttribute("aria-pressed", String(c.dataset.v === page.sort)));
    const { counts, rows } = uMediaView(all, page); msg.hidden = true; stat.replaceChildren();
    const labels = STATUS_LABEL(type);
    for(const k of ["ALL"].concat(STATUS_ORDER.filter(s => counts[s]))){ const c = el("button", "chip", k === "ALL" ? "All" : labels[k] || k); c.append(el("i", null, String(counts[k] || 0))); c.setAttribute("aria-pressed", String(page.status === k)); c.onclick = () => { page.status = k; page.shown = LIST_BATCH; draw(); }; stat.append(c); }
    if(page.status !== "ALL" && !counts[page.status]) page.status = "ALL";
    cards.className = "umcards " + lyBodyClass();
    if(!all.length){ cards.replaceChildren(); msg.replaceChildren(el("b", null, "Nothing on this " + type + " list yet.")); msg.hidden = false; more.hidden = true; return; }
    if(!rows.length){ cards.replaceChildren(); msg.replaceChildren(el("b", null, "No titles match.")); msg.hidden = false; more.hidden = true; return; }
    const shown = Math.min(page.shown, rows.length);
    cards.replaceChildren(...rows.slice(0, shown).map(e => lcard(e, type, true))); more.hidden = shown >= rows.length;
  }
  async function go(force){
    const type = page.type; types.querySelectorAll(".chip").forEach(c => c.setAttribute("aria-pressed", String(c.dataset.v === type)));
    if(page.data[type] && !force){ draw(); return; }
    stat.replaceChildren(); more.hidden = true; msg.hidden = true; cards.className = "umcards " + lyBodyClass(); cards.replaceChildren(...Array.from({ length: lyRows() ? 6 : 9 }, () => el("div", "lcard skel")));
    try{ page.data[type] = uEntries(await collection(page.name, type.toUpperCase(), "", U_LIST_F)); if(page.type === type) draw(); }
    catch(err){ if(page.type === type) say(uListMsg(err), !/private/i.test(err.message || "")); }
  }
  go();
}

// ----- another person's profile -----
const uRow = label => { const r = el("div", "prow"), v = el("b", null, "–"); r.append(el("span", null, label), v); return [r, v]; };
function uBuildProfile(page){
  const root = page.root, card = el("div", "pcard"), banner = el("div", "pbanner"), av = el("img", "pavatar"), name = el("h2", "ph pname", page.name || ""), chips = el("div", "uchips"), acts = el("div", "uacts");
  av.alt = ""; av.hidden = true; card.append(banner, av, name, chips, acts);
  const cell = (label, fn) => { const b = el(fn ? "button" : "div"), n = el("b", null, "–"); b.append(n, el("span", null, label)); if(fn) b.onclick = fn; return [b, n]; };
  const openMine = type => () => { if(page.id === meId()){ userCloseAll(); showTab(type); } else userPush({ kind: "mlist", id: page.id, name: page.name, type }); };   // your own lists are the Anime and Manga tabs
  const [cA, nA] = cell("Anime", openMine("anime")), [cM, nM] = cell("Manga", openMine("manga")), [cFo, nFo] = cell("Following", () => userPush({ kind: "list", mode: "following", id: page.id, name: page.name })), [cFe, nFe] = cell("Followers", () => userPush({ kind: "list", mode: "followers", id: page.id, name: page.name }));
  const counts = el("div", "pcounts"); counts.append(cA, cM, cFo, cFe);
  const status = el("p", "sub warn"); status.hidden = true; status.onclick = () => { status.hidden = true; load(); };
  const aff = el("div", "card prows"), [rAA, vAA] = uRow("Anime"), [rAM, vAM] = uRow("Manga"); aff.style.marginTop = "0"; aff.append(rAA, rAM);
  const stats = el("div", "card prows"); stats.style.marginTop = "0";
  const rows = {}; for(const [k, label] of [["ta", "Total Anime"], ["ep", "Episodes Watched"], ["dw", "Days Watched"], ["am", "Anime Mean Score"], ["tm", "Total Manga"], ["cr", "Chapters Read"], ["vr", "Volumes Read"], ["mm", "Manga Mean Score"]]){ const [r, v] = uRow(label); rows[k] = v; stats.append(r); }
  const detail = el("div", "lshead"), dl = el("button", "lslink", "View Detail Statistics"); dl.onclick = () => userPush({ kind: "stats", id: page.id, name: page.v ? page.v.name : page.name }); detail.append(el("h3", null, "Stats"), dl);
  const bioBox = el("div"), bio = el("div", "clamp"), more = el("button", "pmore", "More"); bioBox.hidden = true;
  more.onclick = () => { bio.classList.toggle("open"); more.textContent = bio.classList.contains("open") ? "Less" : "More"; };
  const bc = el("div", "card"); bc.style.marginTop = "0"; bc.append(bio, more); bioBox.append(el("div", "q", "Bio"), bc);
  root.append(uBar(""), card, status, counts, el("div", "q", "Affinity"), aff, detail, stats, el("p", "sub", "Affinity compares the scores you both gave to the same titles. It needs at least 5 shared scores."), bioBox);

  const drawActs = v => {
    chips.replaceChildren(); acts.replaceChildren();
    const t = v.id === meId() ? "" : uTag(v); if(t){ const c = el("span", "utag", t); chips.append(c); }
    if(v.id !== meId()){
      const f = el("button", "uact" + (v.isFollowing ? "" : " pri"), v.isFollowing ? "Following ✓" : "Follow");
      f.onclick = async () => { f.disabled = true; try{ await toggleFollow(v); }catch(err){ toast("Couldn't change that: " + uMsg(err)); } drawActs(v); };
      const m = el("button", "uact", "Message"); m.onclick = () => { const n = v.name; userCloseAll(); showTab("chat"); openChat(n); };
      acts.append(f, m);
    }
    const w = el("button", "uact", "View on AniList"); w.onclick = () => openExternal(safeUrl(v.siteUrl) || aniLink(v.name)); acts.append(w);
  };
  const paint = v => {
    name.textContent = v.name; profLook(card, banner, av, v); drawActs(v);
    const a = (v.statistics || {}).anime || {}, m = (v.statistics || {}).manga || {};
    nA.textContent = fmtN(a.count); nM.textContent = fmtN(m.count);
    rows.ta.textContent = fmtN(a.count); rows.ep.textContent = fmtN(a.episodesWatched); rows.dw.textContent = a.minutesWatched != null ? (a.minutesWatched / 1440).toFixed(2) : "–"; rows.am.textContent = fmtMean(a.meanScore);
    rows.tm.textContent = fmtN(m.count); rows.cr.textContent = fmtN(m.chaptersRead); rows.vr.textContent = fmtN(m.volumesRead); rows.mm.textContent = fmtMean(m.meanScore);
    const text = cleanAbout(v.about); bioBox.hidden = !text; bio.textContent = text; more.hidden = text.length < 220;
  };
  const load = async () => {
    try{
      const { json } = await gql(U_Q, { id: page.id }), v = json.data && json.data.User;
      if(!v) throw new Error((json.errors && json.errors[0] && json.errors[0].message) || "Profile not found");
      page.v = v; page.name = v.name; paint(v);
      gql(FOLLOW_Q, { id: page.id }).then(r => { const j = r.json.data; if(j){ nFo.textContent = fmtN(j.fo && j.fo.pageInfo && j.fo.pageInfo.total); nFe.textContent = fmtN(j.fe && j.fe.pageInfo && j.fe.pageInfo.total); } }).catch(() => {});
      if(v.id === meId()){ vAA.textContent = vAM.textContent = "That's you"; return; }
      for(const [type, out] of [["ANIME", vAA], ["MANGA", vAM]]){
        out.textContent = "Calculating…";
        Promise.all([scoreMap(myName(), type), scoreMap(v.name, type)]).then(([mine, theirs]) => { const r = affinityOf(mine, theirs); out.textContent = r.pct == null ? "Not enough shared scores" : r.pct + "%  (" + r.n + " shared)"; }).catch(() => { out.textContent = "Couldn't calculate"; });
      }
    }catch(err){ status.textContent = "Couldn't load this profile: " + uMsg(err) + ". Tap to try again."; status.hidden = false; }
  };
  load();
}

// ----- a person's full statistics -----
function uBuildStats(page){
  const body = el("div"), root = page.root; root.append(uBar((page.name || "User") + "'s stats"), body);
  const go = async force => {
    body.replaceChildren(el("div", "msg", "Loading statistics…"));
    try{ drawAniStats(body, await loadAniStats(force, page.id), () => go(true)); }
    catch(err){ const m = el("div", "msg state"); m.append(el("b", null, "Couldn't load these statistics"), el("span", null, uMsg(err))); const b = el("button", "go alt", "Try again"); b.onclick = () => go(true); m.append(b); body.replaceChildren(m); }
  };
  go(false);
}
