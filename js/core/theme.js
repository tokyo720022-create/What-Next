/* js/core/theme.js: theme and colours */
// ---------- Theme ----------
// Anime themes, in groups (a franchise like One Piece or a genre like Isekai). Every colour in the app comes from these variables, so one choice recolours everything.
// A theme belongs to one group. Rules every theme has to keep (tests/unit/themes.test.js checks them): text, muted text and the accent are readable on the page and the cards,
// and "--sakura-ink" is readable on the accent and on both ends of the gradient.
// "g" is the accent gradient (buttons, selected chips), "--sakura-ink" is the text colour that sits on it.
const THEME_DEFAULT = "onepiece";
// "adult" groups stay out of the picker until App Settings > Show 18+ themes is on. Themes there are colours and patterns only.
const THEME_GROUPS = [
  { id: "onepiece", name: "One Piece" }, { id: "isekai", name: "Isekai" }, { id: "fantasy", name: "Fantasy" }, { id: "action", name: "Action" },
  { id: "comedy", name: "Comedy" }, { id: "romcom", name: "Rom Com" }, { id: "romance", name: "Romance" },
  { id: "magicalgirl", name: "Magical Girl" }, { id: "mystery", name: "Mystery" }, { id: "movies", name: "Movies" },
  { id: "hentai", name: "Hentai 18+", adult: true, note: "Colours and patterns only, nothing explicit." }
];
const THEMES = [
  { id: "sakuraflowers", group: "romance", name: "Sakura Flowers", note: "Light, with soft cherry petals.", dark: false, pattern: "petals", g: ["#C42A62", "#7A4BC8"],
    v: { "--bg": "#FFF5F9", "--card": "#FFFFFF", "--ink": "#2A1220", "--muted": "#7A5668", "--line": "#F3D9E4", "--chip": "#FCE7F0", "--sakura": "#C42A62", "--sakura-ink": "#FFFFFF", "--shadow": "0 10px 30px rgba(196,42,98,.10)", "--glass": "rgba(255,255,255,.86)" } },
  { id: "onepiece", group: "onepiece", name: "One Piece", note: "Deep sea navy, straw hat gold.", dark: true, g: ["#F5C542", "#E8503A"],
    v: { "--bg": "#050B1A", "--card": "#0E1830", "--ink": "#F5F1E6", "--muted": "#9FB0CC", "--line": "#1F2E50", "--chip": "#16233F", "--sakura": "#F5C542", "--sakura-ink": "#1B1400", "--shadow": "0 10px 30px rgba(0,0,0,.40)", "--glass": "rgba(14,24,48,.84)" } },
  { id: "naruto", group: "action", name: "Naruto", note: "Ninja orange with headband blue.", dark: true, g: ["#FF8A1F", "#3B8CF0"],
    v: { "--bg": "#0D0A07", "--card": "#1A140E", "--ink": "#FFF4E6", "--muted": "#BFA88C", "--line": "#33261A", "--chip": "#251C13", "--sakura": "#FF8A1F", "--sakura-ink": "#1A0F00", "--shadow": "0 10px 30px rgba(0,0,0,.45)", "--glass": "rgba(26,20,14,.84)" } },
  { id: "gintama", group: "comedy", name: "Gintama", note: "Silver and strawberry milk, with Edo wave patterns.", dark: true, special: true, pattern: "waves", g: ["#C9D3FF", "#FFA3D1"],
    v: { "--bg": "#0B0E22", "--card": "#151A38", "--ink": "#EEF1FF", "--muted": "#A5ADD6", "--line": "#2A3162", "--chip": "#1E2448", "--sakura": "#C9D3FF", "--sakura-ink": "#0B0E22", "--shadow": "0 10px 30px rgba(0,0,0,.40)", "--glass": "rgba(21,26,56,.84)" } },
  { id: "dragonball", group: "action", name: "Dragon Ball", note: "Gi orange, ki yellow, night sky.", dark: true, g: ["#FF9F1C", "#FFE04A"],
    v: { "--bg": "#050A1E", "--card": "#0F1838", "--ink": "#FFF8E5", "--muted": "#A9B4D6", "--line": "#22305C", "--chip": "#17214A", "--sakura": "#FF9F1C", "--sakura-ink": "#1A0E00", "--shadow": "0 10px 30px rgba(0,0,0,.42)", "--glass": "rgba(15,24,56,.84)" } },
  { id: "bleach", group: "action", name: "Bleach", note: "Black and bone white, orange spark.", dark: true, g: ["#F5F2EA", "#FF6A13"],
    v: { "--bg": "#050505", "--card": "#121212", "--ink": "#F5F2EA", "--muted": "#A9A59B", "--line": "#2A2A2A", "--chip": "#1C1C1C", "--sakura": "#FF6A13", "--sakura-ink": "#140700", "--shadow": "none", "--glass": "rgba(14,14,14,.88)" } },
  { id: "rentagirlfriend", group: "romcom", name: "Rent-a-Girlfriend", note: "Light, sky blue with a touch of pink.", dark: false, g: ["#2368BB", "#C93C78"],
    v: { "--bg": "#F0F6FF", "--card": "#FFFFFF", "--ink": "#12203A", "--muted": "#516383", "--line": "#D7E3F5", "--chip": "#E4EEFB", "--sakura": "#2368BB", "--sakura-ink": "#FFFFFF", "--shadow": "0 10px 30px rgba(35,104,187,.10)", "--glass": "rgba(255,255,255,.86)" } },
  { id: "aot", group: "action", name: "Attack on Titan", note: "Survey Corps green and wall stone.", dark: true, g: ["#8FC47A", "#D0A06A"],
    v: { "--bg": "#0A0D08", "--card": "#151A12", "--ink": "#EDEFE6", "--muted": "#A3AD97", "--line": "#2A3224", "--chip": "#1E241A", "--sakura": "#8FC47A", "--sakura-ink": "#0A1405", "--shadow": "0 10px 30px rgba(0,0,0,.45)", "--glass": "rgba(21,26,18,.86)" } }  ,
  { id: "konosuba", group: "isekai", name: "KonoSuba", note: "Aqua blue and explosion pink, under an Axel night sky.", dark: true, pattern: "stars", g: ["#52B5FF", "#FF6B8B"],
    v: { "--bg": "#0A0D1F", "--card": "#131831", "--ink": "#F2F5FF", "--muted": "#A7B2DA", "--line": "#232C55", "--chip": "#1B2243", "--sakura": "#52B5FF", "--sakura-ink": "#03111C", "--shadow": "0 10px 30px rgba(0,0,0,.42)", "--glass": "rgba(19,24,49,.85)" } },
  { id: "shieldhero", group: "isekai", name: "Shield Hero", note: "Shield green and gold on a dark forest night.", dark: true, pattern: "scales", g: ["#43D18B", "#E6B94A"],
    v: { "--bg": "#07120F", "--card": "#0F1F19", "--ink": "#EAF6EE", "--muted": "#9CBBA9", "--line": "#1F3C2F", "--chip": "#162B22", "--sakura": "#43D18B", "--sakura-ink": "#02130A", "--shadow": "0 10px 30px rgba(0,0,0,.45)", "--glass": "rgba(15,31,25,.86)" } },
  { id: "magicalexplorer", group: "isekai", name: "Magical Explorer", note: "Violet magic circles with a teal glow.", dark: true, pattern: "runes", g: ["#A78BFA", "#35D8C2"],
    v: { "--bg": "#0A0A1E", "--card": "#14142F", "--ink": "#F1EFFF", "--muted": "#AAA7D3", "--line": "#28254F", "--chip": "#1E1C42", "--sakura": "#A78BFA", "--sakura-ink": "#0B0621", "--shadow": "0 10px 30px rgba(0,0,0,.42)", "--glass": "rgba(20,20,47,.85)" } },
  { id: "blackclover", group: "fantasy", name: "Black Clover", note: "Black Bulls black and red, with a gold glint.", dark: true, pattern: "clover", g: ["#FF5A5F", "#E8B93E"],
    v: { "--bg": "#09090A", "--card": "#151516", "--ink": "#F5F0E6", "--muted": "#B1AA9A", "--line": "#2C2C2E", "--chip": "#202022", "--sakura": "#FF5A5F", "--sakura-ink": "#1A0305", "--shadow": "0 10px 30px rgba(0,0,0,.5)", "--glass": "rgba(21,21,22,.88)" } },
  { id: "sao", group: "fantasy", name: "Sword Art Online", note: "Holo-menu cyan and Asuna orange, on an Aincrad night.", dark: true, pattern: "hex", g: ["#8FE9FF", "#FF9A3D"],
    v: { "--bg": "#06080F", "--card": "#0E1320", "--ink": "#EAF3FF", "--muted": "#9AAAC6", "--line": "#1C2842", "--chip": "#141D31", "--sakura": "#8FE9FF", "--sakura-ink": "#00121B", "--shadow": "0 10px 30px rgba(0,0,0,.45)", "--glass": "rgba(14,19,32,.86)" } },
  { id: "mashle", group: "fantasy", name: "Mashle", note: "Light and loud: cream, lightning gold and muscle red.", dark: false, pattern: "bolts", g: ["#B3261E", "#A35200"],
    v: { "--bg": "#FFF8E6", "--card": "#FFFFFF", "--ink": "#1D1A3A", "--muted": "#5C5878", "--line": "#EEDFB6", "--chip": "#FBEFC8", "--sakura": "#B3261E", "--sakura-ink": "#FFFFFF", "--shadow": "0 10px 30px rgba(179,38,30,.12)", "--glass": "rgba(255,255,255,.88)" } },
  { id: "ikenie", group: "hentai", name: "Ikenie no Haha", note: "Crimson and candle gold, after dark.", dark: true, pattern: "embers", g: ["#FF5C8D", "#E8A14C"],
    v: { "--bg": "#12060B", "--card": "#1F0B14", "--ink": "#FCEBF2", "--muted": "#CFA0B3", "--line": "#3D1627", "--chip": "#2B101D", "--sakura": "#FF5C8D", "--sakura-ink": "#210411", "--shadow": "0 10px 30px rgba(0,0,0,.5)", "--glass": "rgba(31,11,20,.88)" } },
  { id: "yourname", group: "movies", name: "Your Name", note: "Twilight sky, a falling comet and a red braided cord.", dark: true, pattern: "comet", g: ["#FF7F96", "#FFB36B"],
    v: { "--bg": "#0B0D26", "--card": "#151A3B", "--ink": "#F4F1FF", "--muted": "#AEB2DD", "--line": "#262C5C", "--chip": "#1D2349", "--sakura": "#FF7F96", "--sakura-ink": "#2A0610", "--shadow": "0 10px 30px rgba(0,0,0,.42)", "--glass": "rgba(21,26,59,.85)" } },
  { id: "suzume", group: "movies", name: "Suzume", note: "Sunrise pink, door red and sea blue.", dark: false, pattern: "doors", g: ["#B8324A", "#2F6FB5"],
    v: { "--bg": "#FFF3F0", "--card": "#FFFFFF", "--ink": "#2B2340", "--muted": "#645C7A", "--line": "#F3D9D3", "--chip": "#FDE6E1", "--sakura": "#B8324A", "--sakura-ink": "#FFFFFF", "--shadow": "0 10px 30px rgba(184,50,74,.12)", "--glass": "rgba(255,255,255,.88)" } },
  { id: "sailormoon", group: "magicalgirl", name: "Sailor Moon", note: "Moonlight pink and gold on a midnight sky.", dark: true, pattern: "moons", g: ["#FF8FCB", "#FFD86B"],
    v: { "--bg": "#14102E", "--card": "#201A47", "--ink": "#FFF2FA", "--muted": "#CBB8E6", "--line": "#352C6E", "--chip": "#2A2358", "--sakura": "#FF8FCB", "--sakura-ink": "#2A0A20", "--shadow": "0 10px 30px rgba(0,0,0,.42)", "--glass": "rgba(32,26,71,.86)" } },
  { id: "conan", group: "mystery", name: "Detective Conan", note: "Blue suit, red bow tie and a case to solve.", dark: true, pattern: "clues", g: ["#5B9BFF", "#FF4D5E"],
    v: { "--bg": "#080C18", "--card": "#111A30", "--ink": "#EEF3FF", "--muted": "#9FB0D6", "--line": "#1E2C52", "--chip": "#17223E", "--sakura": "#5B9BFF", "--sakura-ink": "#02122B", "--shadow": "0 10px 30px rgba(0,0,0,.42)", "--glass": "rgba(17,26,48,.86)" } },
  { id: "sanji", group: "onepiece", name: "Sanji", note: "Black suit, blond gold and a blue flame.", dark: true, pattern: "smoke", g: ["#FFD84A", "#4DA3FF"],
    v: { "--bg": "#0A0B10", "--card": "#14161F", "--ink": "#F6F3EA", "--muted": "#B3B0A0", "--line": "#2A2D3A", "--chip": "#1C1F2B", "--sakura": "#FFD84A", "--sakura-ink": "#1A1500", "--shadow": "0 10px 30px rgba(0,0,0,.42)", "--glass": "rgba(20,22,31,.88)" } },
  { id: "nami", group: "onepiece", name: "Nami", note: "Tangerine orange and Grand Line blue, bright as a sunny deck.", dark: false, pattern: "tangerine", g: ["#C2410C", "#0E6BA8"],
    v: { "--bg": "#FFF5E8", "--card": "#FFFFFF", "--ink": "#1F2A44", "--muted": "#56627F", "--line": "#F6DFC0", "--chip": "#FFE9CC", "--sakura": "#C2410C", "--sakura-ink": "#FFFFFF", "--shadow": "0 10px 30px rgba(194,65,12,.12)", "--glass": "rgba(255,255,255,.88)" } },
  { id: "robin", group: "onepiece", name: "Robin", note: "Purple blossoms and old Ohara books.", dark: true, pattern: "hana", g: ["#C58BFF", "#FF8AC4"],
    v: { "--bg": "#120B1F", "--card": "#1C1230", "--ink": "#F6EEFF", "--muted": "#BBA8D6", "--line": "#33224F", "--chip": "#271A40", "--sakura": "#C58BFF", "--sakura-ink": "#1A0630", "--shadow": "0 10px 30px rgba(0,0,0,.42)", "--glass": "rgba(28,18,48,.86)" } },
  { id: "zoro", group: "onepiece", name: "Zoro", note: "Moss green and steel, three slashes deep.", dark: true, pattern: "slashes", g: ["#6FE08B", "#C9D3D1"],
    v: { "--bg": "#070D0A", "--card": "#0F1A14", "--ink": "#EAF5EE", "--muted": "#A3BCAD", "--line": "#1D3328", "--chip": "#15241C", "--sakura": "#6FE08B", "--sakura-ink": "#02140A", "--shadow": "0 10px 30px rgba(0,0,0,.42)", "--glass": "rgba(15,26,20,.88)" } },
  { id: "luffy", group: "onepiece", name: "Luffy", note: "Rubber-fire orange and straw gold on a warm black night.", dark: true, pattern: "straw", g: ["#FF6B4A", "#FFD36B"],
    v: { "--bg": "#160A08", "--card": "#25120F", "--ink": "#FFF4EA", "--muted": "#D9B8A8", "--line": "#44201A", "--chip": "#341A15", "--sakura": "#FF6B4A", "--sakura-ink": "#1F0700", "--shadow": "0 10px 30px rgba(0,0,0,.42)", "--glass": "rgba(37,18,15,.88)" } },
  { id: "usopp", group: "onepiece", name: "Usopp", note: "Sniper olive and slingshot orange, with a tall tale or two.", dark: true, pattern: "pellets", g: ["#B5C94A", "#E0873E"],
    v: { "--bg": "#100E08", "--card": "#1B1810", "--ink": "#F7EEDF", "--muted": "#C2AD8E", "--line": "#3A2D1D", "--chip": "#272016", "--sakura": "#B5C94A", "--sakura-ink": "#121600", "--shadow": "0 10px 30px rgba(0,0,0,.42)", "--glass": "rgba(27,24,16,.88)" } },
  { id: "wano", group: "onepiece", name: "Wano", note: "Samurai indigo, a crimson sun and gold, in the Land of Wano.", dark: true, pattern: "asanoha", g: ["#F25C54", "#E9B64A"],
    v: { "--bg": "#0C1024", "--card": "#151B3A", "--ink": "#F7EFE6", "--muted": "#B3B6D6", "--line": "#252E5E", "--chip": "#1D2548", "--sakura": "#F25C54", "--sakura-ink": "#1C0605", "--shadow": "0 10px 30px rgba(0,0,0,.42)", "--glass": "rgba(21,27,58,.88)" } }
];
// The saved choice is { id }. Older copies saved { mode, a, b }: a light choice becomes Sakura Flowers, anything else the default.
// Drawers in App Settings come from here. THEME_GROUPS only sets the order, the names and the 18+ flag: a theme with no group, or with a group
// nobody described, still gets a drawer ("Other" for no group) instead of disappearing.
function themeCategories(){
  const out = new Map(THEME_GROUPS.map(g => [g.id, { id: g.id, name: g.name, adult: !!g.adult, note: g.note || "", themes: [] }]));
  for(const t of THEMES){
    const id = t.group ? String(t.group) : "other";
    if(!out.has(id)) out.set(id, { id, name: id === "other" ? "Other" : id.replace(/[-_]+/g, " ").replace(/\b\w/g, c => c.toUpperCase()), adult: false, note: "", themes: [] });
    out.get(id).themes.push(t);
  }
  const all = [...out.values()].filter(c => c.themes.length);
  return all.filter(c => c.id !== "other").concat(all.filter(c => c.id === "other"));
}
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
function fillLook(){ document.querySelectorAll("#themeGrid .thm").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.id === themeId()))); if(typeof markThemeDrawers === "function") markThemeDrawers(); }
applyTheme();
// ---------- App options (App Settings) ----------
const APP_DEF = { adultThemes: false, avatar: "circle", size: "m", splash: true, advanced: false, allpos: { anime: "top", manga: "top" }, relative: true, naming: { JP: "", KR: "", CN: "", TW: "" } };
function appCfg(){ const s = LS("wn_app", {}) || {}; return Object.assign({}, APP_DEF, s, { allpos: Object.assign({}, APP_DEF.allpos, s.allpos), naming: Object.assign({}, APP_DEF.naming, s.naming) }); }
function setApp(patch){ const c = appCfg(); LSset("wn_app", Object.assign(c, patch)); applyApp(); }
const advancedOn = () => !!appCfg().advanced;   // App Settings > Advanced features: unlocks AniList Triple Sync
function applyApp(){ const c = appCfg(), h = document.documentElement, row = document.getElementById("rowSync"); if(row) row.hidden = !c.advanced; h.dataset.avatar = c.avatar; h.style.fontSize = { s: "14.5px", m: "", l: "17.5px" }[c.size] || ""; }
applyApp();
