/* js/features/app-settings.js: Settings > App Settings (theme, appearance, lists, titles, privacy) */
// ---------- App Settings ----------
const NAME_OPTS = [["", "Follow AniList"], ["ROMAJI", "Romaji"], ["ENGLISH", "English"], ["NATIVE", "Native"]];
for(const k of ["JP", "KR", "CN", "TW"]) fillSel("#appName" + k, NAME_OPTS);
// theme cards
for(const th of THEMES){
  const b = el("button", "thm"); b.type = "button"; b.dataset.id = th.id; b.setAttribute("aria-pressed", "false");
  b.style.setProperty("--t0", th.v["--bg"]); b.style.setProperty("--t1", th.g[0]); b.style.setProperty("--t2", th.g[1]);
  const nm = el("span", "thn"); nm.append(th.name); if(th.special) nm.append(el("em", "thsp", "Special"));
  b.append(el("span", "thsw"), nm, el("span", "thnote", th.note));
  b.onclick = () => setTheme(th.id);
  $("#themeGrid").append(b);
}
function fillApp(){
  const c = appCfg();
  $("#appAvatar").checked = c.avatar === "circle"; $("#appSplash").checked = !!c.splash; $("#appRelative").checked = !!c.relative;
  $("#appAllAnime").value = c.allpos.anime; $("#appAllManga").value = c.allpos.manga;
  for(const k of ["JP", "KR", "CN", "TW"]) $("#appName" + k).value = c.naming[k] || "";
  chipSet("#appSize", c.size);
}
const redrawTitles = () => { mcache.clear(); trendAt = 0; if(lists[curType] && lists[curType].entries) renderList(); };
$("#appAvatar").onchange = () => setApp({ avatar: $("#appAvatar").checked ? "circle" : "square" });
$("#appSplash").onchange = () => setApp({ splash: $("#appSplash").checked });
$("#appRelative").onchange = () => setApp({ relative: $("#appRelative").checked });
$("#appSize").addEventListener("click", ev => { const b = ev.target.closest(".chip"); if(!b) return; setApp({ size: b.dataset.v }); chipSet("#appSize", b.dataset.v); });
for(const [id, type] of [["#appAllAnime", "anime"], ["#appAllManga", "manga"]]) $(id).onchange = () => { setApp({ allpos: Object.assign(appCfg().allpos, { [type]: $(id).value }) }); if(lists[type] && lists[type].entries && curType === type) renderList(); };
for(const k of ["JP", "KR", "CN", "TW"]) $("#appName" + k).onchange = () => { setApp({ naming: Object.assign(appCfg().naming, { [k]: $("#appName" + k).value }) }); redrawTitles(); };
$("#appReset").onclick = () => {
  const b = $("#appReset");
  if(b.dataset.armed !== "1"){ b.dataset.armed = "1"; b.textContent = "Tap again to reset"; setTimeout(() => { b.dataset.armed = ""; b.textContent = "Reset app settings to default"; }, 3500); return; }
  b.dataset.armed = ""; b.textContent = "Reset app settings to default";
  LSset("wn_app", {}); LSset("wn_theme", { id: THEME_DEFAULT }); applyApp(); applyTheme(); fillLook(); fillApp(); redrawTitles();
  $("#appMsg").textContent = "App settings were reset.";
};
