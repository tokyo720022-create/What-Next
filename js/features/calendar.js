/* js/features/calendar.js: Airing calendar (Discover > Calendar) */
// ---------- Calendar ----------
const CZ_Q = "query($p:Int,$from:Int,$to:Int){Page(page:$p,perPage:50){pageInfo{hasNextPage} airingSchedules(airingAt_greater:$from,airingAt_lesser:$to,sort:TIME){id airingAt episode media{id type format isAdult season seasonYear title{romaji english} coverImage{large} bannerImage mediaListEntry{status} externalLinks{site url type color icon isDisabled}}}}}";
const cz = { date: new Date(), onlyList: false, onlySeason: false, adult: false, items: [], token: 0, cache: new Map() };
try{ const s = JSON.parse(localStorage.getItem("wn_cz") || "null"); if(s){ cz.onlyList = !!s.onlyList; cz.onlySeason = !!s.onlySeason; cz.adult = !!s.adult; } }catch(_){}
const czSave = () => { try{ localStorage.setItem("wn_cz", JSON.stringify({ onlyList: cz.onlyList, onlySeason: cz.onlySeason, adult: cz.adult })); }catch(_){} };
const czInput = d => dayKey(d);
function czWhen(at){
  const diff = at - Date.now() / 1000, a = Math.abs(diff), n = a < 3600 ? Math.max(1, Math.round(a / 60)) : a < 86400 ? Math.round(a / 3600) : Math.round(a / 86400);
  const unit = a < 3600 ? "minute" : a < 86400 ? "hour" : "day", txt = n + " " + unit + (n === 1 ? "" : "s");
  return diff >= 0 ? "in " + txt : txt + " ago";
}
function czCard(x){
  const m = x.media, c = el("div", "czcard"), bg = safeUrl(m.bannerImage) || safeUrl(m.coverImage && m.coverImage.large);
  if(bg) c.style.backgroundImage = "linear-gradient(rgba(10,12,24,.72),rgba(10,12,24,.82)),url(" + JSON.stringify(bg) + ")";
  const at = new Date(x.airingAt * 1000), time = el("div", "cztime", at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }));
  const info = el("div", "czinfo"); info.append(el("b", null, tt(m)), el("span", "czep", "Ep. " + x.episode + " " + czWhen(x.airingAt)));
  const chip = statusChip(m); if(chip) info.append(chip);
  const seen = new Set(), links = el("div", "czlinks");
  for(const l of m.externalLinks || []){
    if(l.type !== "STREAMING" || l.isDisabled || seen.has(l.site)) continue; seen.add(l.site);
    const a = el("button", "czlink"); if(/^#[0-9a-f]{3,8}$/i.test(l.color || "")){ a.style.borderColor = l.color; a.style.color = l.color; }
    const ic = safeUrl(l.icon); if(ic){ const i = new Image(); i.src = ic; i.alt = ""; i.width = 18; i.height = 18; a.append(i); }
    a.append(l.site); a.onclick = ev => { ev.stopPropagation(); openExternal(l.url); }; links.append(a);
  }
  if(links.children.length) info.append(links);
  c.append(time, info); c.onclick = ev => { if(!ev.target.closest("button")) openMedia(m.id); }; return c;
}
function czRender(){
  const box = $("#czList"); box.replaceChildren();
  const now = new Date(), season = curSeason(now), year = now.getFullYear();
  const list = cz.items.filter(x => (cz.adult || !x.media.isAdult) && (!cz.onlyList || ["CURRENT", "PLANNING", "REPEATING"].includes(x.media.mediaListEntry && x.media.mediaListEntry.status)) && (!cz.onlySeason || (x.media.season === season && x.media.seasonYear === year)));
  if(!list.length){ box.append(dxEmpty(cz.items.length ? "Nothing matches these filters on this day." : "Nothing airs on this day.")); return; }
  for(const x of list) box.append(czCard(x));
}
function czBar(){
  $("#czDate").value = czInput(cz.date);
  $("#czList2").setAttribute("aria-pressed", String(cz.onlyList)); $("#czSeason").setAttribute("aria-pressed", String(cz.onlySeason)); $("#czAdult").setAttribute("aria-pressed", String(cz.adult));
  $("#czToday").hidden = czInput(cz.date) === czInput(new Date());
}
async function czLoad(){
  const day = new Date(cz.date); day.setHours(0, 0, 0, 0); const from = Math.floor(day.getTime() / 1000) - 1, to = from + 86400 + 1, key = String(from), token = ++cz.token; czBar();
  if(cz.cache.has(key) && Date.now() - cz.cache.get(key).at < 300000){ cz.items = cz.cache.get(key).items; czRender(); return; }
  $("#czList").replaceChildren(el("div", "msg", "Loading the schedule…"));
  try{
    const all = [];
    for(let p = 1; p <= 4; p++){
      const { json } = await gql(CZ_Q, { p, from, to }), pg = json.data && json.data.Page;
      if(!pg) throw new Error((json.errors && json.errors[0] && json.errors[0].message) || "No data");
      if(token !== cz.token) return; all.push(...pg.airingSchedules); if(!pg.pageInfo.hasNextPage) break;
    }
    cz.cache.set(key, { at: Date.now(), items: all }); cz.items = all; czRender();
  }catch(err){ if(token !== cz.token) return; $("#czList").replaceChildren(dxEmpty(/Failed to fetch|NetworkError|Load failed/i.test(err.message) ? "Couldn't reach AniList. Check your connection." : err.message, czLoad)); }
}
const czShift = n => { const d = new Date(cz.date); d.setDate(d.getDate() + n); cz.date = d; czLoad(); };
$("#czPrev").onclick = () => czShift(-1); $("#czNext").onclick = () => czShift(1);
$("#czToday").onclick = () => { cz.date = new Date(); czLoad(); };
$("#czDate").onchange = () => { const v = $("#czDate").value; if(!v) return; const [y, m, d] = v.split("-").map(Number); cz.date = new Date(y, m - 1, d, 12); czLoad(); };
$("#czList2").onclick = () => { cz.onlyList = !cz.onlyList; czSave(); czBar(); czRender(); };
$("#czSeason").onclick = () => { cz.onlySeason = !cz.onlySeason; czSave(); czBar(); czRender(); };
$("#czAdult").onclick = () => { cz.adult = !cz.adult; czSave(); czBar(); czRender(); };
function calendarOpen(){ czLoad(); }
