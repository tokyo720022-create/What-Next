/* js/features/refresh.js: swipe down to refresh the screen you are on */
// ---------- Swipe down to refresh ----------
const PTR_ARM = 52;    // how far the circle has to travel before letting go refreshes
const ptr = { box: null, dot: null, busy: false };
// What refreshing means on each screen. The key is the screen's element.
const PTR_ACTIONS = {
  "#pickWrap": async () => { if(!state.user) return; trendAt = 0; tz.cache = {}; pt.pools.clear(); await Promise.all([loadList(state.user), loadTrending()]); },
  "#lists": () => refreshList(curType),
  "#discover": async () => { $("#dlist").replaceChildren(); discoverOpen(); },
  "#seasonal": async () => { sz.cache.clear(); await szLoad(); },
  "#calendar": async () => { cz.cache = []; await czLoad(); },
  "#schedule": async () => { renderSchedule(); },
  "#profile": async () => { await profRefresh(); },
  "#stats": async () => { asCache.clear(); showStats(); },
  "#taste": async () => { tz.cache = {}; await tzLoad(); },
  "#chat": async () => { renderRecent(); }
};
const ptrAction = () => { for(const id in PTR_ACTIONS){ const n = $(id); if(n && !n.hidden) return PTR_ACTIONS[id]; } return null; };
const ptrBlocked = () => !!document.querySelector(".sheet:not([hidden]), .dsheet");

function ptrBox(){
  if(ptr.box) return ptr.box;
  ptr.box = document.createElement("div"); ptr.box.className = "ptrbox"; ptr.box.setAttribute("aria-hidden", "true");
  ptr.dot = document.createElement("i"); ptr.dot.className = "ptrdot"; ptr.dot.textContent = "↓"; ptr.box.append(ptr.dot); document.body.append(ptr.box);
  return ptr.box;
}
function ptrShow(pull){
  const b = ptrBox(); b.style.setProperty("--pull", pull + "px"); b.style.setProperty("--po", String(Math.min(1, pull / 30)));
  b.classList.toggle("armed", pull >= PTR_ARM);
}
function ptrHide(){ if(!ptr.box) return; ptr.box.classList.remove("armed", "busy"); ptr.box.style.setProperty("--pull", "0px"); ptr.box.style.setProperty("--po", "0"); ptr.dot.textContent = "↓"; }
async function ptrRun(){
  const act = ptrAction(); if(!act){ ptrHide(); return; }
  ptr.busy = true; const b = ptrBox(); b.classList.remove("armed"); b.classList.add("busy"); b.style.setProperty("--pull", PTR_ARM + "px"); b.style.setProperty("--po", "1"); ptr.dot.textContent = "";
  try{ await Promise.all([act(), new Promise(r => setTimeout(r, 600))]); }catch(_){}
  ptr.busy = false; ptrHide();
}

let ptrTouch = null;
document.addEventListener("touchstart", ev => {
  if(ptr.busy || ev.touches.length !== 1 || window.scrollY > 0 || ptrBlocked() || !ptrAction()){ ptrTouch = null; return; }
  ptrTouch = { x: ev.touches[0].clientX, y: ev.touches[0].clientY, on: false, pull: 0 };
}, { passive: true });
document.addEventListener("touchmove", ev => {
  const t = ptrTouch; if(!t) return;
  const dx = ev.touches[0].clientX - t.x, dy = ev.touches[0].clientY - t.y;
  if(window.scrollY > 0){ ptrHide(); ptrTouch = null; return; }
  if(!t.on){
    if(dy < -6 || Math.abs(dx) > 14 && Math.abs(dx) > dy){ ptrTouch = null; return; }   // a sideways or upward swipe is not a refresh
    if(dy < 12) return; t.on = true;
  }
  t.pull = Math.min(96, dy * 0.55); ptrShow(t.pull);
}, { passive: true });
document.addEventListener("touchend", () => { const t = ptrTouch; ptrTouch = null; if(!t || !t.on) return; if(t.pull >= PTR_ARM) ptrRun(); else ptrHide(); });
document.addEventListener("touchcancel", () => { ptrTouch = null; ptrHide(); });
