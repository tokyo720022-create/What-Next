/* js/core/theme.js: theme and colours */
// ---------- Theme ----------
const PAL = {
  light: { "--bg": "#F4F4FA", "--card": "#FFFFFF", "--ink": "#14162B", "--muted": "#6B6F8F", "--line": "#E3E4F0", "--chip": "#ECEDF8", "--shadow": "0 10px 30px rgba(20,22,60,.08)", "--glass": "rgba(255,255,255,.82)" },
  dark: { "--bg": "#0C0E1D", "--card": "#161936", "--ink": "#F3F3FC", "--muted": "#9EA3CB", "--line": "#2A2F5A", "--chip": "#20244A", "--shadow": "0 10px 30px rgba(0,0,0,.35)", "--glass": "rgba(22,25,54,.82)" },
  amoled: { "--bg": "#000000", "--card": "#0E0E14", "--ink": "#F3F3FC", "--muted": "#9A9AB5", "--line": "#22222E", "--chip": "#1A1A24", "--shadow": "none", "--glass": "rgba(8,8,12,.88)" }
};
const themeCfg = () => LS("wn_theme", { mode: "system", a: "", b: "" });
function applyTheme(){
  const t = themeCfg(), r = document.documentElement.style;
  Object.keys(PAL.light).concat(["--sakura", "--grad"]).forEach(k => r.removeProperty(k));
  if(t.mode !== "system") Object.entries(PAL[t.mode]).forEach(([k, v]) => r.setProperty(k, v));
  if(t.a) r.setProperty("--sakura", t.a);
  if(t.a || t.b) r.setProperty("--grad", "linear-gradient(135deg," + (t.a || "#FF4D86") + "," + (t.b || "#FF7A59") + ")");
}
// ---------- App options (App Settings) ----------
const APP_DEF = { avatar: "circle", size: "m", splash: true, allpos: { anime: "top", manga: "top" }, relative: true, naming: { JP: "", KR: "", CN: "", TW: "" } };
function appCfg(){ const s = LS("wn_app", {}) || {}; return Object.assign({}, APP_DEF, s, { allpos: Object.assign({}, APP_DEF.allpos, s.allpos), naming: Object.assign({}, APP_DEF.naming, s.naming) }); }
function setApp(patch){ const c = appCfg(); LSset("wn_app", Object.assign(c, patch)); applyApp(); }
function applyApp(){ const c = appCfg(), h = document.documentElement; h.dataset.avatar = c.avatar; h.style.fontSize = { s: "14.5px", m: "", l: "17.5px" }[c.size] || ""; }
const PRESETS = [["Sakura", "#ff4d86", "#ff7a59"], ["Ocean", "#2d9cff", "#4fe0ff"], ["Forest", "#2ecc71", "#a3e635"], ["Sunset", "#ff7a18", "#ffc94d"], ["Violet", "#8b5cf6", "#ec4899"], ["Mono", "#9aa3c4", "#dfe3f8"]];
function fillLook(){
  const t = themeCfg(); chipSet("#themeMode", t.mode);
  $("#colorA").value = t.a || "#ff4d86"; $("#colorB").value = t.b || "#ff7a59";
  document.querySelectorAll("#themePresets .preset").forEach(b => b.setAttribute("aria-pressed", String(((t.a || "#ff4d86") === b.dataset.a) && ((t.b || "#ff7a59") === b.dataset.b))));
}
$("#themeMode").addEventListener("click", ev => { const b = ev.target.closest(".chip"); if(!b) return; LSset("wn_theme", Object.assign(themeCfg(), { mode: b.dataset.v })); applyTheme(); chipSet("#themeMode", b.dataset.v); });
$("#colorA").oninput = ev => { LSset("wn_theme", Object.assign(themeCfg(), { a: ev.target.value })); applyTheme(); };
$("#colorB").oninput = ev => { LSset("wn_theme", Object.assign(themeCfg(), { b: ev.target.value })); applyTheme(); };
$("#colorReset").onclick = () => { LSset("wn_theme", Object.assign(themeCfg(), { a: "", b: "" })); applyTheme(); fillLook(); };
applyTheme(); applyApp();
