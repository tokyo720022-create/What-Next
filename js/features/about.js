/* js/features/about.js: the About screen: version, check for updates, what's new, licenses, privacy policy and links.
   Releases are read from GitHub (the "latest" release is always the latest stable one: drafts and pre-releases are skipped by GitHub).
   Each release is tagged v<version>-b<build number>, and its text says "version code N", which is also what the installed app reports. */
const ABOUT_REPO = "tokyo720022-create/What-Next";
const ABOUT_URL = "https://github.com/" + ABOUT_REPO;
const ABOUT_PRIVACY = ABOUT_URL + "/blob/main/PRIVACY.md";
const ABOUT_LICENSES = [
  ["Capacitor (core, Android, App, Browser)", "MIT License", "https://github.com/ionic-team/capacitor/blob/main/LICENSE"],
  ["Capacitor Assets (build tool: icon and splash screen)", "MIT License", "https://github.com/ionic-team/capacitor-assets/blob/main/LICENSE"],
  ["AndroidX libraries (used by Capacitor on Android)", "Apache License 2.0", "https://developer.android.com/jetpack/androidx"],
  ["AniList API (titles, lists, pictures)", "AniList API Terms of Use", "https://docs.anilist.co/guide/terms-of-use"]
];

// ---------- version helpers (no screen needed, so they can be tested alone) ----------
function verNums(s){ const m = /(\d+)\.(\d+)\.(\d+)(?:-b(\d+))?/.exec(String(s || "")); return m ? [+m[1], +m[2], +m[3], m[4] == null ? null : +m[4]] : null; }
function cmpVer(a, b){ for(let i = 0; i < 3; i++) if(a[i] !== b[i]) return a[i] - b[i]; return a[3] == null || b[3] == null ? 0 : a[3] - b[3]; }
// true: a newer release exists. false: this is the latest. null: can't tell (then the release page is opened).
function releaseIsNewer(cur, rel){
  const a = verNums(cur.ver), b = verNums(rel.tag);
  if(a && b && (cmpVer(b, a) !== 0 || (a[3] != null && b[3] != null))) return cmpVer(b, a) > 0;
  const rc = Number((/version code (\d+)/i.exec(rel.body || "") || [])[1]), cc = Number(cur.code);
  if(rc > 0 && cc > 0) return rc > cc;
  return null;
}
// The build number counts minutes since 2023-11-14 (see build-apk.yml), so it also tells when the build was made.
const buildDate = code => code > 0 ? new Date((1700000000 + code * 60) * 1000) : null;

// ---------- screen ----------
let abBusy = false;
const abToast = t => { try{ toast(t); }catch(_){} };
async function aboutInfo(){
  const A = typeof nativePlugin === "function" && nativePlugin("App");
  try{ if(A && A.getInfo){ const i = await A.getInfo(); return { ver: String(i.version || ""), code: Number(i.build) || 0 }; } }catch(_){}
  return { ver: String(window.__REV || ""), code: 0 };
}
function withTimeout(p, ms){ return new Promise((ok, bad) => { const t = setTimeout(() => bad(new Error("GitHub took too long to answer.")), ms); p.then(v => { clearTimeout(t); ok(v); }, e => { clearTimeout(t); bad(e); }); }); }
async function latestRelease(){
  const res = await withTimeout(fetch("https://api.github.com/repos/" + ABOUT_REPO + "/releases/latest", { headers: { Accept: "application/vnd.github+json" } }), 15000);
  if(res.status === 404) return { none: true };
  if(!res.ok) throw new Error("GitHub answered " + res.status);
  const j = await res.json();
  return { tag: String(j.tag_name || ""), name: String(j.name || j.tag_name || ""), url: /^https:\/\//.test(j.html_url || "") ? j.html_url : ABOUT_URL + "/releases/latest", body: String(j.body || ""), at: j.published_at || "" };
}
function aboutLinks(){ return Object.assign({ github: ABOUT_URL }, (window.WN_CONFIG && window.WN_CONFIG.links) || {}); }
function aboutShowLinks(){
  const links = aboutLinks();
  document.querySelectorAll("#abLinks [data-link]").forEach(b => {
    const url = links[b.dataset.link]; b.hidden = !/^https:\/\//.test(url || "");   // an icon only shows when its link is set in config.js
    b.onclick = () => openExternal(url);
  });
}
async function aboutFill(){
  const info = await aboutInfo(), base = verNums(info.ver), d = buildDate(info.code);
  $("#abChip").textContent = "v" + (base ? base.slice(0, 3).join(".") : "2.1.1");
  $("#abVersion").textContent = "Stable v" + (base ? base.slice(0, 3).join(".") : "") + (base && base[3] != null ? " (build " + base[3] + (d ? " · " + d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "") + ")" : info.ver ? " (" + info.ver + ")" : "");
}
async function aboutCheck(){
  if(abBusy) return; abBusy = true; abToast("Checking for updates…");
  try{
    const rel = await latestRelease();
    if(rel.none){ abToast("No releases published yet"); }
    else{
      const newer = releaseIsNewer(await aboutInfo(), rel);
      if(newer === false) abToast("No new updates available");
      else{ abToast(newer ? "New version available: " + rel.tag : "Opening the latest release"); openExternal(rel.url); }   // straight to the latest stable release, where the APK is
    }
  }catch(_){ abToast("Couldn't check for updates. Opening the releases page."); openExternal(ABOUT_URL + "/releases/latest"); }
  abBusy = false;
}
async function aboutNew(){
  const box = $("#abNewBox");
  if(!box.hidden){ box.hidden = true; return; }
  box.hidden = false; box.replaceChildren(el("p", "sub", "Loading…"));
  const open = (label, url) => { const b = el("button", "go alt", label); b.onclick = () => openExternal(url); return b; };
  try{
    const rel = await latestRelease();
    if(rel.none){ box.replaceChildren(el("p", "sub", "No releases published yet."), open("Open releases on GitHub", ABOUT_URL + "/releases")); return; }
    const notes = el("div", "abnotes"); notes.append(richText(rel.body || "No release notes."));
    box.replaceChildren(el("b", null, rel.name || rel.tag), el("p", "sub", rel.at ? new Date(rel.at).toLocaleDateString([], { dateStyle: "medium" }) : ""), notes, open("Open this release on GitHub", rel.url), open("All releases", ABOUT_URL + "/releases"));
  }catch(_){ box.replaceChildren(el("p", "sub", "Couldn't load the release notes. Check your connection."), open("Open releases on GitHub", ABOUT_URL + "/releases")); }
}
function aboutLic(){
  const box = $("#abLicBox");
  if(!box.hidden){ box.hidden = true; return; }
  box.hidden = false;
  box.replaceChildren(...ABOUT_LICENSES.map(([name, lic, url]) => { const b = el("button", "ablic"); b.append(el("b", null, name), el("small", null, lic)); b.onclick = () => openExternal(url); return b; }));
}
if(typeof document !== "undefined" && document.getElementById("setAbout")){
  $("#abUpdate").onclick = aboutCheck; $("#abNew").onclick = aboutNew; $("#abLic").onclick = aboutLic;
  $("#abPrivacy").onclick = () => openExternal(ABOUT_PRIVACY);
  aboutShowLinks(); aboutFill();
}
