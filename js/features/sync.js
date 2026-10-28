/* js/features/sync.js: Discord sync engine (anime and manga) */
// ---------- Sync engine: AniList list -> Discord (anime and manga) ----------
const CFG_KEY = "wn_cfg";
const KINDS = {
  anime: { label: "ANIME", type: "ANIME", total: "episodes", hook: "hook", testId: "#cfgHook" },
  manga: { label: "MANGA", type: "MANGA", total: "chapters", hook: "mangaHook", testId: "#cfgMangaHook" }
};
const DEFAULT_LISTS = "anime movies, iseki, isekai, milf, loli, rom com, plan to continue, hentai, favourite, fav, planning";
const DEFAULT_VIP = "One Piece, Detective Conan, Kono Suba, Dragon Ball Z";
const syncQ = k => "query($u:String,$p:Int){Page(page:$p,perPage:50){pageInfo{hasNextPage} mediaList(userName:$u,type:" + KINDS[k].type + ",sort:[UPDATED_TIME_DESC]){updatedAt mediaId progress score(format:POINT_100) status customLists media{title{romaji english native} countryOfOrigin type format " + (k === "anime" ? "episodes duration nextAiringEpisode{airingAt episode}" : "chapters") + " genres tags{name} coverImage{extraLarge color}}}}}";
const sleep = ms => new Promise(r => setTimeout(r, ms));
let syncing = false;

function cfg(){ try{ return JSON.parse(localStorage.getItem(CFG_KEY) || "{}"); }catch(_){ return {}; } }
function loadSync(k){ try{ return JSON.parse(localStorage.getItem("wn_sync_" + k) || "{}"); }catch(_){ return {}; } }
function saveSync(d, k){ try{ localStorage.setItem("wn_sync_" + k, JSON.stringify(d)); }catch(_){} }
function slog(t){ const p = $("#syncLog"); p.hidden = false; p.textContent += t + "\n"; p.scrollTop = p.scrollHeight; }
const titleCase = x => String(x).replace(/\w\S*/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase());
function hookOk(h){ return !h || /^https:\/\/(discord|discordapp)\.com\/api\/webhooks\//.test(h); }

function fillCfg(){
  const c = cfg();
  $("#cfgSource").value = c.source || ""; $("#cfgSource").placeholder = state.user || "your AniList username";
  $("#cfgHook").value = c.hook || ""; $("#cfgMangaHook").value = c.mangaHook || ""; $("#cfgVipHook").value = c.vipHook || ""; $("#cfgLogHook").value = c.logHook || "";
  $("#cfgVipList").value = c.vipList != null ? c.vipList : DEFAULT_VIP;
  $("#cfgLists").value = c.lists != null ? c.lists : DEFAULT_LISTS;
  $("#cfgWrite").checked = !!c.write; $("#cfgAuto").checked = !!c.auto;
}
function renderSyncStatus(){
  const line = k => { const st = loadSync(k); return k[0].toUpperCase() + k.slice(1) + ": " + (st.last_run ? new Date(st.last_run).toLocaleString() + " · " + Object.keys(st.sync || {}).length + " titles remembered" : "never synced"); };
  $("#syncStatus").textContent = line("anime") + "\n" + line("manga") + "\nThe first run of each only builds a baseline and sends nothing.";
}
$("#cfgSave").onclick = () => {
  const c = { source: $("#cfgSource").value.trim(), hook: $("#cfgHook").value.trim(), mangaHook: $("#cfgMangaHook").value.trim(), vipHook: $("#cfgVipHook").value.trim(), logHook: $("#cfgLogHook").value.trim(),
    vipList: $("#cfgVipList").value, lists: $("#cfgLists").value, write: $("#cfgWrite").checked, auto: $("#cfgAuto").checked };
  if(![c.hook, c.mangaHook, c.vipHook, c.logHook].every(hookOk)){ $("#syncStatus").textContent = "One of the webhooks isn't a Discord webhook link."; return; }
  try{ localStorage.setItem(CFG_KEY, JSON.stringify(c)); renderSyncStatus(); slog("Settings saved on this device."); }
  catch(_){ $("#syncStatus").textContent = "Couldn't save settings."; }
};
$("#cfgReset").onclick = () => { try{ localStorage.removeItem("wn_sync_anime"); localStorage.removeItem("wn_sync_manga"); }catch(_){} renderSyncStatus(); $("#syncLog").hidden = true; };

async function discord(hook, body, params){
  const q = new URLSearchParams(params || {}).toString();
  const res = await fetch(hook + (q ? (hook.includes("?") ? "&" : "?") + q : ""), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if(!res.ok){
    let d = ""; try{ const j = await res.json(); d = j.message || JSON.stringify(j); }catch(_){}
    throw new Error("Discord " + res.status + (d ? ": " + d : ""));
  }
  return res.status === 204 ? {} : res.json().catch(() => ({}));
}
// Forum-channel webhooks only accept messages that start a thread, so the test sends a thread name first.
async function testHook(k){
  const h = $(KINDS[k].testId).value.trim();
  $("#syncLog").textContent = "";
  if(!h || !hookOk(h)) return slog("Enter a valid " + k + " webhook link first.");
  try{
    try{ await discord(h, { content: "✅ What Next? can reach this webhook.", thread_name: "Connection test" }); }
    catch(e1){ if(!/Discord 400/.test(e1.message)) throw e1; await discord(h, { content: "✅ What Next? can reach this webhook." }); }
    slog("Test message sent for " + k + ". Check Discord.");
  }catch(e2){ slog("Test failed: " + e2.message); }
}
$("#cfgTest").onclick = () => testHook("anime");
$("#cfgTestManga").onclick = () => testHook("manga");

async function threadFor(list, st, c, k){
  const lists = (c.lists != null ? c.lists : DEFAULT_LISTS).split(",").map(x => x.trim().toLowerCase()).filter(Boolean);
  const name = lists.includes(String(list || "Unknown").toLowerCase().trim()) ? titleCase(list) : "General Updates";
  const key = "[" + KINDS[k].label + "] " + name;
  if(st.threads[key]) return st.threads[key];
  const r = await discord(c[KINDS[k].hook], { content: "📡 **" + name + "** | " + KINDS[k].label + " Telemetry Dashboard", thread_name: key }, { wait: "true" });
  const id = String(r.channel_id || r.id || "");
  if(!id) throw new Error("Discord returned no thread ID. Is this a forum channel webhook?");
  st.threads[key] = id; saveSync(st, k); return id;
}
function category(it, k){
  const m = it.media, d = [...(m.genres || []), ...(m.tags || []).map(t => t.name)].map(x => String(x).toLowerCase());
  const active = Object.keys(it.customLists || {}).filter(x => it.customLists[x]);
  if(active.length) return active[0];
  if(k === "anime" && m.format === "MOVIE") return "Anime movies";
  if(d.includes("isekai")) return "Iseki";
  if(["hentai", "ecchi", "adult", "smut"].some(x => d.includes(x))) return "Hentai";
  if(["milf", "older woman", "mother"].some(x => d.includes(x))) return "Milf";
  if(d.includes("loli")) return "Loli";
  return titleCase((it.status || "UNKNOWN").replace(/_/g, " "));
}
function weekKey(){
  const d = new Date(), t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())), day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear(), w = Math.ceil(((t - Date.UTC(y, 0, 1)) / 86400000 + 1) / 7);
  return y + "-W" + String(w).padStart(2, "0");
}

async function runSync(k){
  if(syncing) return;
  const K = KINDS[k], c = cfg(), src = (c.source || state.user || "").trim(), hook = c[K.hook];
  $("#syncLog").textContent = "";
  if(!src) return slog("Set a source AniList username in Settings.");
  if(!hook) return slog("Add your " + k + " Discord webhook in Settings first.");
  syncing = true; $("#syncNow").disabled = true; $("#syncNowManga").disabled = true;
  const st = loadSync(k); st.sync = st.sync || {}; st.threads = st.threads || {};
  const first = !st.last_update; let highest = st.last_update || 0, sent = 0, failed = 0;
  slog(first ? "First " + k + " run: building a silent baseline. Nothing is sent to Discord." : "Checking " + src + " for " + k + " changes…");
  try{
    const items = []; let page = 1, more = true;
    while(more){
      const { json } = await gql(syncQ(k), { u: src, p: page });
      const d = json.data && json.data.Page;
      if(!d) throw new Error(json.errors ? json.errors[0].message : "AniList returned no data");
      more = d.pageInfo.hasNextPage;
      for(const it of d.mediaList){
        if(!it || !it.media) continue;
        if(!first && it.updatedAt <= (st.last_update || 0)){ more = false; break; }
        if(it.updatedAt > highest) highest = it.updatedAt;
        items.push(it);
      }
      page++; if(more) await sleep(1000);
    }
    slog("Read " + items.length + " list entries.");
    const vips = (c.vipList != null ? c.vipList : DEFAULT_VIP).split(",").map(x => x.trim().toLowerCase()).filter(Boolean);
    for(const it of items){
      const id = String(it.mediaId), progress = it.progress || 0, m = it.media;
      if(!(id in st.sync)){ st.sync[id] = progress; continue; }
      const prev = st.sync[id];
      if(progress <= prev){ st.sync[id] = progress; continue; }
      const done = it.status === "COMPLETED", g = (progress - prev) * 10 + (done ? 100 : 0);
      if(!st.weekly || st.weekly.week !== weekKey()) st.weekly = { week: weekKey(), g: 0 };
      st.weekly.g += g; st.points = (st.points || 0) + g;
      const title = m.title.english || m.title.romaji || "Unknown", romaji = m.title.romaji || "N/A";
      const color = m.coverImage && m.coverImage.color ? parseInt(m.coverImage.color.replace("#", ""), 16) : 3447003;
      const total = m[K.total], left = total != null ? total - progress : "?";
      const embed = { title: ("UPDATE: " + title).slice(0, 256), color,
        author: { name: done ? "🏆 " + g + "G EARNED | SERIES COMPLETED" : "🎮 +" + g + "G | Weekly: " + st.weekly.g + "G" },
        fields: [{ name: "🇯🇵 Romaji", value: romaji }, { name: "📊 Status", value: it.status || "UNKNOWN" },
          { name: "✅ Progress", value: String(progress), inline: true }, { name: "⏳ Left", value: String(left), inline: true }],
        image: m.coverImage && m.coverImage.extraLarge ? { url: m.coverImage.extraLarge } : undefined };
      try{
        const tid = await threadFor(category(it, k), st, c, k);
        await discord(hook, { embeds: [embed] }, { thread_id: tid }); await sleep(2000);
        const names = (romaji + " " + (m.title.english || "")).toLowerCase();
        if(c.vipHook && vips.some(v => names.includes(v))){
          await discord(c.vipHook, { embeds: [{ ...embed, title: "⭐ VIP UPDATE: " + title, description: "S-Tier Franchise Update." }] }); await sleep(2000);
        }
        sent++; slog("Sent: " + title + " → " + progress);
      }catch(e2){ failed++; slog("Discord failed for " + title + ": " + e2.message); }
      if(c.write && auth.token && src.toLowerCase() !== String(state.user).toLowerCase()){
        try{ await gql("mutation($id:Int,$p:Int,$s:Int){SaveMediaListEntry(mediaId:$id,progress:$p,scoreRaw:$s){id}}", { id: it.mediaId, p: progress, s: it.score || 0 }); }
        catch(e3){ slog("Copy to your account failed for " + title + ": " + e3.message); }
      }
      st.sync[id] = progress;
    }
    st.last_update = highest; st.last_run = Date.now(); saveSync(st, k);
    slog("Done. " + sent + " sent, " + failed + " failed." + (first ? " Baseline saved." : ""));
    if(c.logHook){ try{ await discord(c.logHook, { embeds: [{ title: titleCase(k) + " sync finished", description: sent + " update(s) sent, " + failed + " failed.", color: 3447003 }] }); }catch(_){} }
  }catch(e2){ slog("Sync stopped: " + e2.message); }
  finally{ syncing = false; $("#syncNow").disabled = false; $("#syncNowManga").disabled = false; renderSyncStatus(); }
}
async function maybeAutoSync(){
  const c = cfg(); if(!c.auto) return;
  for(const k of ["anime", "manga"]){
    if(!c[KINDS[k].hook]) continue;
    if(Date.now() - (loadSync(k).last_run || 0) > 3 * 3600 * 1000) await runSync(k);
  }
}
$("#syncNow").onclick = () => runSync("anime");
$("#syncNowManga").onclick = () => runSync("manga");
