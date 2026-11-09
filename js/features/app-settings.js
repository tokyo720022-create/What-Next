/* js/features/app-settings.js: Settings > App Settings (theme, appearance, lists, titles, privacy) */
// ---------- App Settings ----------
const NAME_OPTS = [["", "Follow AniList"], ["ROMAJI", "Romaji"], ["ENGLISH", "English"], ["NATIVE", "Native"]];
for(const k of ["JP", "KR", "CN", "TW"]) fillSel("#appName" + k, NAME_OPTS);
// theme picker: group chips on top, the cards of the chosen group below
let thGroup = "";
function drawThemes(){
  const cur = THEMES.find(x => x.id === themeId()), adultOk = !!appCfg().adultThemes;
  const groups = THEME_GROUPS.filter(g => !g.adult || adultOk || (cur && cur.group === g.id));   // the 18+ group stays visible while one of its themes is in use
  if(!groups.some(g => g.id === thGroup)) thGroup = cur && groups.some(g => g.id === cur.group) ? cur.group : groups[0].id;
  const bar = $("#themeGroups"), grid = $("#themeGrid"), note = $("#themeGroupNote"); bar.replaceChildren(); grid.replaceChildren();
  for(const g of groups){
    const c = el("button", "chip", g.name); c.type = "button"; c.dataset.v = g.id; c.setAttribute("aria-pressed", String(g.id === thGroup));
    c.append(el("i", null, String(THEMES.filter(t => t.group === g.id).length))); c.onclick = () => { thGroup = g.id; drawThemes(); }; bar.append(c);
  }
  const gi = groups.find(g => g.id === thGroup); note.textContent = gi.note || ""; note.hidden = !gi.note;
  for(const th of THEMES.filter(t => t.group === thGroup)){
    const b = el("button", "thm"); b.type = "button"; b.dataset.id = th.id; b.setAttribute("aria-pressed", String(th.id === themeId()));
    b.style.setProperty("--t0", th.v["--bg"]); b.style.setProperty("--t1", th.g[0]); b.style.setProperty("--t2", th.g[1]);
    const nm = el("span", "thn"); nm.append(th.name); if(th.special) nm.append(el("em", "thsp", "Special"));
    b.append(el("span", "thsw"), nm, el("span", "thnote", th.note));
    b.onclick = () => setTheme(th.id);
    grid.append(b);
  }
}
drawThemes();
$("#appAdultThemes").onchange = () => { setApp({ adultThemes: $("#appAdultThemes").checked }); drawThemes(); };
function fillApp(){
  const c = appCfg(); $("#appAdultThemes").checked = !!c.adultThemes; thGroup = ""; drawThemes();
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
