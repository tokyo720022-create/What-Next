/* js/core/tabs.js: bottom tabs, screen switching, blur covers */
// ---------- Tabs and cover blur ----------
const SCREENS = { pick: "#pickWrap", anime: "#lists", manga: "#lists", discover: "#discover", seasonal: "#seasonal", calendar: "#calendar", schedule: "#schedule", profile: "#profile", stats: "#stats", chat: "#chat", settings: "#settings", "set-app": "#setApp", "set-anilist": "#setAnilist", "set-lists": "#setLists", "set-sync": "#setSync", "set-account": "#setAccount", "set-about": "#setAbout" };
const TAB_OF = { seasonal: "discover", calendar: "discover", stats: "profile", chat: "profile", settings: "profile", "set-app": "profile", "set-anilist": "profile", "set-lists": "profile", "set-sync": "profile", "set-account": "profile", "set-about": "profile" };
function showTab(t){
  const shown = SCREENS[t];
  new Set(Object.values(SCREENS)).forEach(id => { $(id).hidden = id !== shown; });
  document.querySelectorAll("#tabs .tab").forEach(c => c.setAttribute("aria-pressed", String(c.dataset.v === (TAB_OF[t] || t))));
  if(t === "discover") discoverOpen();
  if(t === "seasonal") seasonalOpen();
  if(t === "calendar") calendarOpen();
  if(t === "pick") loadTrending();
  if(t === "schedule") renderSchedule();
  if(t === "stats") showStats();
  if(t === "chat") renderRecent();
  if(t === "profile") renderProfile();
  if(t === "set-app"){ $("#hideCount").textContent = hide.size ? hide.size + " hidden title(s)." : "No hidden titles."; fillLook(); fillApp(); }
  if(t === "set-sync"){ fillCfg(); renderSyncStatus(); }
  if(t === "set-anilist") loadAniSettings();
  if(t === "set-lists") lsLoad(false);
  if(t === "set-account") fillAccount();
  if(t === "anime" || t === "manga") openList(t);
  window.scrollTo(0, 0);
}
$("#tabs").addEventListener("click", ev => {
  const b = ev.target.closest(".tab"); if(b) showTab(b.dataset.v);
});
function setBlur(on){
  document.body.classList.toggle("blur", on);
  $("#blurBtn").setAttribute("aria-pressed", String(on));
  $("#blurBtn").textContent = on ? "Blur: on" : "Blur covers";
  try{ localStorage.setItem("wn_blur", on ? "1" : "0"); }catch(_){}
}
$("#blurBtn").onclick = () => setBlur(!document.body.classList.contains("blur"));
try{ setBlur(localStorage.getItem("wn_blur") === "1"); }catch(_){}
