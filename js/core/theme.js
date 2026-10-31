/* js/core/theme.js: theme and colours */
// ---------- Theme ----------
// Eight anime themes. Every colour in the app comes from these variables, so one choice recolours everything.
// "g" is the accent gradient (buttons, selected chips), "--sakura-ink" is the text colour that sits on it.
const THEME_DEFAULT = "onepiece";
const THEMES = [
  { id: "sakuraflowers", name: "Sakura Flowers", note: "Light, with soft cherry petals.", dark: false, pattern: "petals", g: ["#C42A62", "#7A4BC8"],
    v: { "--bg": "#FFF5F9", "--card": "#FFFFFF", "--ink": "#2A1220", "--muted": "#7A5668", "--line": "#F3D9E4", "--chip": "#FCE7F0", "--sakura": "#C42A62", "--sakura-ink": "#FFFFFF", "--shadow": "0 10px 30px rgba(196,42,98,.10)", "--glass": "rgba(255,255,255,.86)" } },
  { id: "onepiece", name: "One Piece", note: "Deep sea navy, straw hat gold.", dark: true, g: ["#F5C542", "#E8503A"],
    v: { "--bg": "#050B1A", "--card": "#0E1830", "--ink": "#F5F1E6", "--muted": "#9FB0CC", "--line": "#1F2E50", "--chip": "#16233F", "--sakura": "#F5C542", "--sakura-ink": "#1B1400", "--shadow": "0 10px 30px rgba(0,0,0,.40)", "--glass": "rgba(14,24,48,.84)" } },
  { id: "naruto", name: "Naruto", note: "Ninja orange with headband blue.", dark: true, g: ["#FF8A1F", "#3B8CF0"],
    v: { "--bg": "#0D0A07", "--card": "#1A140E", "--ink": "#FFF4E6", "--muted": "#BFA88C", "--line": "#33261A", "--chip": "#251C13", "--sakura": "#FF8A1F", "--sakura-ink": "#1A0F00", "--shadow": "0 10px 30px rgba(0,0,0,.45)", "--glass": "rgba(26,20,14,.84)" } },
  { id: "gintama", name: "Gintama", note: "Silver and strawberry milk, with Edo wave patterns.", dark: true, special: true, pattern: "waves", g: ["#C9D3FF", "#FFA3D1"],
    v: { "--bg": "#0B0E22", "--card": "#151A38", "--ink": "#EEF1FF", "--muted": "#A5ADD6", "--line": "#2A3162", "--chip": "#1E2448", "--sakura": "#C9D3FF", "--sakura-ink": "#0B0E22", "--shadow": "0 10px 30px rgba(0,0,0,.40)", "--glass": "rgba(21,26,56,.84)" } },
  { id: "dragonball", name: "Dragon Ball", note: "Gi orange, ki yellow, night sky.", dark: true, g: ["#FF9F1C", "#FFE04A"],
    v: { "--bg": "#050A1E", "--card": "#0F1838", "--ink": "#FFF8E5", "--muted": "#A9B4D6", "--line": "#22305C", "--chip": "#17214A", "--sakura": "#FF9F1C", "--sakura-ink": "#1A0E00", "--shadow": "0 10px 30px rgba(0,0,0,.42)", "--glass": "rgba(15,24,56,.84)" } },
  { id: "bleach", name: "Bleach", note: "Black and bone white, orange spark.", dark: true, g: ["#F5F2EA", "#FF6A13"],
    v: { "--bg": "#050505", "--card": "#121212", "--ink": "#F5F2EA", "--muted": "#A9A59B", "--line": "#2A2A2A", "--chip": "#1C1C1C", "--sakura": "#FF6A13", "--sakura-ink": "#140700", "--shadow": "none", "--glass": "rgba(14,14,14,.88)" } },
  { id: "rentagirlfriend", name: "Rent-a-Girlfriend", note: "Light, sky blue with a touch of pink.", dark: false, g: ["#2368BB", "#C93C78"],
    v: { "--bg": "#F0F6FF", "--card": "#FFFFFF", "--ink": "#12203A", "--muted": "#516383", "--line": "#D7E3F5", "--chip": "#E4EEFB", "--sakura": "#2368BB", "--sakura-ink": "#FFFFFF", "--shadow": "0 10px 30px rgba(35,104,187,.10)", "--glass": "rgba(255,255,255,.86)" } },
  { id: "aot", name: "Attack on Titan", note: "Survey Corps green and wall stone.", dark: true, g: ["#8FC47A", "#D0A06A"],
    v: { "--bg": "#0A0D08", "--card": "#151A12", "--ink": "#EDEFE6", "--muted": "#A3AD97", "--line": "#2A3224", "--chip": "#1E241A", "--sakura": "#8FC47A", "--sakura-ink": "#0A1405", "--shadow": "0 10px 30px rgba(0,0,0,.45)", "--glass": "rgba(21,26,18,.86)" } }
];
// The saved choice is { id }. Older copies saved { mode, a, b }: a light choice becomes Sakura Flowers, anything else the default.
function themeId(){
  const t = LS("wn_theme", null);
  if(t && THEMES.some(x => x.id === t.id)) return t.id;
  return t && t.mode === "light" ? "sakuraflowers" : THEME_DEFAULT;
}
function applyTheme(){
  const th = THEMES.find(x => x.id === themeId()), root = document.documentElement;
  for(const [k, v] of Object.entries(th.v)) root.style.setProperty(k, v);
  root.style.setProperty("--grad", "linear-gradient(135deg," + th.g[0] + "," + th.g[1] + ")");
  root.style.colorScheme = th.dark ? "dark" : "light";
  root.dataset.theme = th.id; root.dataset.pattern = th.pattern || "";
  const m = document.querySelector('meta[name="theme-color"]'); if(m) m.content = th.v["--bg"];
}
function setTheme(id){ LSset("wn_theme", { id }); applyTheme(); fillLook(); }
function fillLook(){ document.querySelectorAll("#themeGrid .thm").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.id === themeId()))); }
applyTheme();
// ---------- App options (App Settings) ----------
const APP_DEF = { avatar: "circle", size: "m", splash: true, advanced: false, allpos: { anime: "top", manga: "top" }, relative: true, naming: { JP: "", KR: "", CN: "", TW: "" } };
function appCfg(){ const s = LS("wn_app", {}) || {}; return Object.assign({}, APP_DEF, s, { allpos: Object.assign({}, APP_DEF.allpos, s.allpos), naming: Object.assign({}, APP_DEF.naming, s.naming) }); }
function setApp(patch){ const c = appCfg(); LSset("wn_app", Object.assign(c, patch)); applyApp(); }
const advancedOn = () => !!appCfg().advanced;   // App Settings > Advanced features: unlocks AniList Triple Sync
function applyApp(){ const c = appCfg(), h = document.documentElement, row = document.getElementById("rowSync"); if(row) row.hidden = !c.advanced; h.dataset.avatar = c.avatar; h.style.fontSize = { s: "14.5px", m: "", l: "17.5px" }[c.size] || ""; }
applyApp();
