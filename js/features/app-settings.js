/* js/features/app-settings.js: Settings > App Settings (theme, appearance, lists, titles, privacy) */
// ---------- App Settings ----------
const NAME_OPTS = [["", "Follow AniList"], ["ROMAJI", "Romaji"], ["ENGLISH", "English"], ["NATIVE", "Native"]];
for(const k of ["JP", "KR", "CN", "TW"]) fillSel("#appName" + k, NAME_OPTS);
// Theme library: a search box, then one drawer per category. Drawers are built from the theme data (themeCategories() in theme.js), never from a fixed list.
let thOpen = new Set(), thQuery = "";
const thCurCat = () => { const c = themeCategories().find(x => x.themes.some(t => t.id === themeId())); return c ? c.id : ""; };
function drawThemes(){
  const root = $("#themeGrid"), adultOk = !!appCfg().adultThemes, q = thQuery.trim().toLowerCase(), curCat = thCurCat(); let any = false;
  root.replaceChildren();
  for(const c of themeCategories()){
    if(c.adult && !adultOk && c.id !== curCat) continue;   // the 18+ drawer stays visible while one of its themes is in use
    const list = q ? c.themes.filter(t => (t.name + " " + t.note + " " + c.name).toLowerCase().includes(q)) : c.themes;
    if(!list.length) continue; any = true;
    const open = !!q || thOpen.has(c.id), d = el("div", "thdr" + (open ? " open" : "")), h = el("button", "thdh"), dots = el("span", "thdots");
    d.dataset.g = c.id; h.type = "button"; h.dataset.g = c.id; h.setAttribute("aria-expanded", String(open)); h.setAttribute("aria-controls", "thb-" + c.id);
    list.slice(0, 5).forEach(t => { const i = el("i"); i.style.setProperty("--c", t.g[0]); dots.append(i); });
    h.append(el("span", "thdn", c.name), el("span", "thcur", "Active"), dots, el("span", "thdc", String(list.length)), el("i", "thdx"));
    const body = el("div", "thdb"), inner = el("div", "thdi"), cards = el("div", "thcards"); body.id = "thb-" + c.id;
    if(c.note) inner.append(el("p", "thnote", c.note));
    for(const th of list){
      const b = el("button", "thm"), tx = el("span", "thtx"), nm = el("span", "thn"); b.type = "button"; b.dataset.id = th.id; b.setAttribute("aria-pressed", String(th.id === themeId()));
      b.style.setProperty("--t0", th.v["--bg"]); b.style.setProperty("--t1", th.g[0]); b.style.setProperty("--t2", th.g[1]);
      nm.append(th.name); if(th.special) nm.append(el("em", "thsp", "Special"));
      tx.append(nm, el("span", "thnote", th.note)); b.append(el("span", "thsw"), tx, el("i", "thck"));
      b.onclick = () => setTheme(th.id); cards.append(b);
    }
    inner.append(cards); body.append(inner); d.append(h, body);
    h.onclick = () => { const on = !d.classList.contains("open"); d.classList.toggle("open", on); h.setAttribute("aria-expanded", String(on)); if(!q){ if(on) thOpen.add(c.id); else thOpen.delete(c.id); } };
    root.append(d);
  }
  $("#themeEmpty").hidden = any; $("#themeEmpty").textContent = "No theme or category matches \u201c" + thQuery.trim() + "\u201d.";
  markThemeDrawers();
}
// the drawer that holds the theme in use says "Active"
function markThemeDrawers(){ const cur = themeId(); document.querySelectorAll("#themeGrid .thdr").forEach(d => { if(d.querySelector('.thm[data-id="' + cur + '"]')) d.dataset.cur = "1"; else delete d.dataset.cur; }); }
drawThemes();
$("#themeSearch").oninput = ev => { thQuery = ev.target.value; drawThemes(); };
$("#appAdultThemes").onchange = () => { setApp({ adultThemes: $("#appAdultThemes").checked }); drawThemes(); };
function fillApp(){
  const c = appCfg(); $("#appAdultThemes").checked = !!c.adultThemes; thQuery = ""; $("#themeSearch").value = ""; thOpen = new Set([thCurCat()]); drawThemes();   // opens on the drawer of the theme in use
  $("#appAvatar").checked = c.avatar === "circle"; $("#appSplash").checked = !!c.splash; $("#appAdvanced").checked = !!c.advanced; $("#appRelative").checked = !!c.relative;
  $("#appAllAnime").value = c.allpos.anime; $("#appAllManga").value = c.allpos.manga;
  for(const k of ["JP", "KR", "CN", "TW"]) $("#appName" + k).value = c.naming[k] || "";
  chipSet("#appSize", c.size);
}
const redrawTitles = () => { mcache.clear(); trendAt = 0; if(lists[curType] && lists[curType].entries) renderList(); };
$("#appAvatar").onchange = () => setApp({ avatar: $("#appAvatar").checked ? "circle" : "square" });
$("#appSplash").onchange = () => setApp({ splash: $("#appSplash").checked });
$("#appAdvanced").onchange = () => setApp({ advanced: $("#appAdvanced").checked });
$("#appRelative").onchange = () => setApp({ relative: $("#appRelative").checked });
$("#appSize").addEventListener("click", ev => { const b = ev.target.closest(".chip"); if(!b) return; setApp({ size: b.dataset.v }); chipSet("#appSize", b.dataset.v); });
for(const [id, type] of [["#appAllAnime", "anime"], ["#appAllManga", "manga"]]) $(id).onchange = () => { setApp({ allpos: Object.assign(appCfg().allpos, { [type]: $(id).value }) }); if(lists[type] && lists[type].entries && curType === type) renderList(); };
for(const k of ["JP", "KR", "CN", "TW"]) $("#appName" + k).onchange = () => { setApp({ naming: Object.assign(appCfg().naming, { [k]: $("#appName" + k).value }) }); redrawTitles(); };
$("#appReset").onclick = () => {
  const b = $("#appReset");
  if(b.dataset.armed !== "1"){ b.dataset.armed = "1"; b.textContent = "Tap again to reset"; setTimeout(() => { b.dataset.armed = ""; b.textContent = "Reset app settings to default"; }, 3500); return; }
  b.dataset.armed = ""; b.textContent = "Reset app settings to default";
  LSset("wn_app", {}); LSset("wn_theme", { id: THEME_DEFAULT }); applyApp(); applyTheme(); fillApp(); redrawTitles();
  $("#appMsg").textContent = "App settings were reset.";
};
