/* js/features/settings.js: Settings pages: AniList options and list tools */
// ---------- Settings pages: AniList account options and list tools ----------
const SUBS = ["#setApp", "#setAnilist", "#setLists", "#setSync", "#setAccount", "#setAbout"];
const SCORE_FORMATS = [["POINT_100", "100 point (55 / 100)"], ["POINT_10_DECIMAL", "10 point decimal (5.5 / 10)"], ["POINT_10", "10 point (5 / 10)"], ["POINT_5", "5 star (3 / 5)"], ["POINT_3", "3 point smiley"]];
const fillSel = (id, pairs) => $(id).replaceChildren(...pairs.map(([v, t]) => Object.assign(document.createElement("option"), { value: v, textContent: t })));

// ---------- AniList Settings (saved on your AniList account) ----------
const ANI_TITLES = [["ROMAJI", "Romaji"], ["ENGLISH", "English"], ["NATIVE", "Native"], ["ROMAJI_STYLISED", "Romaji (stylised)"], ["ENGLISH_STYLISED", "English (stylised)"], ["NATIVE_STYLISED", "Native (stylised)"]];
const ANI_STAFF = [["ROMAJI_WESTERN", "Romaji, western order (Given Family)"], ["ROMAJI", "Romaji"], ["NATIVE", "Native"]];
const ANI_MERGE = [[0, "Never"], [30, "30 minutes"], [60, "1 hour"], [120, "2 hours"], [180, "3 hours"], [360, "6 hours"], [720, "12 hours"], [1440, "1 day"], [2880, "2 days"], [4320, "3 days"], [10080, "1 week"], [20160, "2 weeks"], [29160, "Always"]];   // AniList: anything above 2 weeks (20160) means "always"
const ANI_COLORS = [["blue", "Blue"], ["purple", "Purple"], ["pink", "Pink"], ["orange", "Orange"], ["red", "Red"], ["green", "Green"], ["gray", "Gray"]];
const ANI_Q = "query{Viewer{about options{titleLanguage displayAdultContent airingNotifications profileColor staffNameLanguage activityMergeTime restrictMessagesToFollowing timezone notificationOptions{type enabled}}}}";
const ANI_SAVE_Q = "mutation($about:String,$tl:UserTitleLanguage,$ad:Boolean,$an:Boolean,$pc:String,$sn:UserStaffNameLanguage,$mt:Int,$rm:Boolean,$tz:String,$no:[NotificationOptionInput]){UpdateUser(about:$about,titleLanguage:$tl,displayAdultContent:$ad,airingNotifications:$an,profileColor:$pc,staffNameLanguage:$sn,activityMergeTime:$mt,restrictMessagesToFollowing:$rm,timezone:$tz,notificationOptions:$no){id}}";
const ANI_KEYS = { about: "about", title: "tl", adult: "ad", airing: "an", color: "pc", staff: "sn", merge: "mt", restrict: "rm", tz: "tz", notif: "no" };
let ani = null, aniBase = "", aniBusy = false;
const aniDirty = () => !!ani && JSON.stringify(ani) !== aniBase;

// Time zone: AniList wants "-?HH:MM" (a minus sign for west of UTC, nothing for east).
const aniTz = t => { const m = /^\s*([+-])?(\d{1,2}):?(\d{2})\s*$/.exec(String(t == null ? "" : t)); return m ? (m[1] === "-" ? "-" : "") + String(m[2]).padStart(2, "0") + ":" + m[3] : ""; };
const tzFromMins = m => (m < 0 ? "-" : "") + String(Math.floor(Math.abs(m) / 60)).padStart(2, "0") + ":" + String(Math.abs(m) % 60).padStart(2, "0");
const ANI_TZ = [["", "Not set"], ...[...new Set([...Array.from({ length: 27 }, (_, i) => (i - 12) * 60), -570, -210, 210, 270, 330, 345, 390, 525, 570, 630, 765])].sort((a, b) => a - b).map(m => [tzFromMins(m), "UTC" + (m < 0 ? "−" : "+") + tzFromMins(m).replace("-", "")])];
// What each notification switch means. AniList sends the list; a type this app doesn't know yet still shows, with a readable name.
const NOTIF_LABELS = { ACTIVITY_MESSAGE: "Someone sends me a message", ACTIVITY_REPLY: "Someone replies to my activity", FOLLOWING: "Someone follows me", ACTIVITY_MENTION: "Someone mentions me in an activity", THREAD_COMMENT_MENTION: "Someone mentions me in a forum comment", THREAD_SUBSCRIBED: "A thread I follow gets a new comment", THREAD_COMMENT_REPLY: "Someone replies to my forum comment", ACTIVITY_LIKE: "Someone likes my activity", ACTIVITY_REPLY_LIKE: "Someone likes my reply", THREAD_LIKE: "Someone likes my thread", THREAD_COMMENT_LIKE: "Someone likes my forum comment", ACTIVITY_REPLY_SUBSCRIBED: "Someone replies to an activity I replied to", RELATED_MEDIA_ADDITION: "A new title related to my list is added", MEDIA_DATA_CHANGE: "A title on my list changes in a way that affects tracking", MEDIA_MERGE: "Titles on my list are merged", MEDIA_DELETION: "A title on my list is deleted", MEDIA_SUBMISSION_UPDATE: "My title submission is reviewed", STAFF_SUBMISSION_UPDATE: "My staff submission is reviewed", CHARACTER_SUBMISSION_UPDATE: "My character submission is reviewed" };
const notifLabel = t => NOTIF_LABELS[t] || String(t).toLowerCase().replace(/_/g, " ").replace(/^./, c => c.toUpperCase());
// Saved caches that depend on what AniList shows you (18+ titles) or on how scores are written: drop them so nothing stale is shown.
function dropCardCaches(){
  cacheClear("card"); cacheClear("cal");
  mcache.clear(); ecache.clear(); sz.cache.clear(); cz.cache = []; tz.cache = {}; pt.pools.clear(); trendAt = 0;
  if(typeof loadTrending === "function") loadTrending();
}

async function loadAniSettings(quiet){
  if(!quiet){ $("#aniStatus").textContent = "Loading your AniList settings…"; $("#aniStatus").hidden = false; $("#aniForm").hidden = true; $("#aniBar").hidden = true; }
  try{
    const { json } = await gql(ANI_Q, {});
    const v = json.data && json.data.Viewer; if(!v || !v.options) throw new Error((json.errors && json.errors[0] && json.errors[0].message) || "No data");
    const o = v.options;
    ani = { about: v.about || "", title: o.titleLanguage || "ROMAJI", staff: o.staffNameLanguage || "ROMAJI_WESTERN", merge: o.activityMergeTime == null ? 720 : o.activityMergeTime, color: o.profileColor || "blue", adult: !!o.displayAdultContent, airing: !!o.airingNotifications, restrict: !!o.restrictMessagesToFollowing,
      tz: "timezone" in o ? aniTz(o.timezone) : undefined,   // undefined = AniList did not send it, so the section is hidden
      notif: Array.isArray(o.notificationOptions) ? o.notificationOptions.map(n => ({ type: n.type, enabled: !!n.enabled })) : undefined };
    aniBase = JSON.stringify(ani); try{ localStorage.setItem("wn_tlang", String(ani.title).replace("_STYLISED", "")); }catch(_){}
    $("#aniStatus").textContent = "These settings are saved on your AniList account."; $("#aniForm").hidden = false; aniRender();
  }catch(err){
    const retry = el("button", "go alt", "Try again"); retry.onclick = () => loadAniSettings(false);
    $("#aniStatus").textContent = "Couldn't load: " + (isNetErr(err) ? "no connection." : err.message) + " "; $("#aniStatus").append(retry);
  }
}
function aniRender(){
  if(!ani) return; const form = $("#aniForm"), keep = window.scrollY; form.replaceChildren();
  const sec = (title, ...rows) => { const d = el("div", "lssec"); d.append(el("h3", "lsh", title)); for(const r of rows) d.append(r); form.append(d); return d; };
  const bio = el("textarea"); bio.rows = 5; bio.maxLength = 6000; bio.value = ani.about; bio.placeholder = "Write something about yourself"; bio.oninput = () => { ani.about = bio.value; aniButtons(); };
  const colors = ANI_COLORS.some(c => c[0] === ani.color) ? ANI_COLORS : [...ANI_COLORS, [ani.color, "Custom (" + ani.color + ")"]];   // a colour set on the website still shows
  const colorRow = lsSelect("Profile colour", ani.color, colors, v => { ani.color = v; aniRender(); });
  const sw = el("i", "acsw"); sw.style.background = PROFILE_COLORS[ani.color] || (/^#/.test(ani.color) ? ani.color : "#3db4f2"); colorRow.insertBefore(sw, colorRow.lastChild);
  sec("About you", bio, colorRow);
  sec("Title language", lsSelect("Default media title language", ani.title, ANI_TITLES, v => { ani.title = v; aniRender(); }));
  sec("Staff and character naming", lsSelect("Default staff and character naming", ani.staff, ANI_STAFF, v => { ani.staff = v; aniRender(); }));
  sec("Activity merge time", el("p", "sub", "Progress activity created within this time period is merged together."), lsSelect("Merge activity within", ani.merge > 20160 ? 29160 : ani.merge, ANI_MERGE, v => { ani.merge = Number(v); aniRender(); }));
  sec("18+ content", lsSwitch("Show 18+ content because I'm a responsible adult", ani.adult, on => { ani.adult = on; aniRender(); }));
  sec("Notifications", lsSwitch("Receive airing anime notifications", ani.airing, on => { ani.airing = on; const a = (ani.notif || []).find(n => n.type === "AIRING"); if(a) a.enabled = on; aniRender(); }));
  if(ani.notif && ani.notif.some(n => n.type !== "AIRING")){
    const rows = [el("p", "sub", "Choose what AniList notifies you about.")];
    for(const n of ani.notif) if(n.type !== "AIRING") rows.push(lsSwitch(notifLabel(n.type), n.enabled, on => { n.enabled = on; aniRender(); }));
    sec("Notify me when", ...rows);
  }
  sec("Messages", lsSwitch("Only receive messages from people I follow", ani.restrict, on => { ani.restrict = on; aniRender(); }));
  if(ani.tz !== undefined){
    const phone = el("button", "go alt", "Use this phone's time zone"); phone.onclick = () => { ani.tz = tzFromMins(-new Date().getTimezoneOffset()); aniRender(); };
    sec("Time zone", el("p", "sub", "Used by AniList for air times and dates on your account."), lsSelect("Your time zone", ani.tz, ANI_TZ, v => { ani.tz = v; aniRender(); }), phone);
  }
  const more = el("button", "go alt", "Score format, custom lists and list order are in List Settings"); more.onclick = () => showTab("set-lists"); form.append(more);
  aniButtons(); window.scrollTo(0, keep);
}
function aniButtons(){
  const base = JSON.parse(aniBase || "{}"), n = Object.keys(ANI_KEYS).filter(k => JSON.stringify(ani[k]) !== JSON.stringify(base[k])).length;
  $("#aniMsg").textContent = n ? "You have unsaved changes." : ""; $("#aniBar").hidden = !(n || aniBusy || $("#aniMsg").textContent);
  $("#aniSave").disabled = !n || aniBusy; $("#aniSave").textContent = aniBusy ? "Saving…" : "Save Changes";
}
async function aniSave(){
  if(!ani || aniBusy || !aniDirty()) return;
  const base = JSON.parse(aniBase), vars = {}; for(const [k, name] of Object.entries(ANI_KEYS)) if(JSON.stringify(ani[k]) !== JSON.stringify(base[k])) vars[name] = ani[k];
  aniBusy = true; aniButtons();
  try{
    const { json } = await gql(ANI_SAVE_Q, vars); if(json.errors) throw new Error(json.errors[0].message);
    if("ad" in vars) dropCardCaches();   // 18+ titles appear or disappear in search, trending and charts
    if("tl" in vars){ try{ localStorage.setItem("wn_tlang", String(ani.title).replace("_STYLISED", "")); }catch(_){} mcache.clear(); trendAt = 0; if(lists[curType] && lists[curType].entries) renderList(); }
    if("about" in vars || "pc" in vars){ profLoaded = false; cacheDel("acct", "profile_" + acctUser()); }
    aniBusy = false; await loadAniSettings(true); toast("AniList settings saved");
  }catch(err){ aniBusy = false; aniButtons(); $("#aniMsg").textContent = "Couldn't save: " + (isNetErr(err) ? "no connection." : err.message); }
}
$("#aniSave").onclick = aniSave;

// ---------- Account Settings ----------
function fillAccount(){
  renderPending();
  const p = cacheGetAs("acct", "profile_" + acctUser(), CACHE_OK.object);
  $("#acName").textContent = state.user || savedName(); const av = safeUrl(p && p.v && p.v.avatar && p.v.avatar.large); $("#acAvatar").hidden = !av; if(av) $("#acAvatar").src = av;
}
document.querySelectorAll("#setAccount [data-url]").forEach(b => { b.onclick = () => openExternal(b.dataset.url); });
let delArmed = false;
$("#acDelete").onclick = () => {
  const hint = $("#acDeleteHint");
  if(!delArmed){ delArmed = true; hint.textContent = "Tap again to open AniList's account page"; setTimeout(() => { delArmed = false; hint.textContent = "Opens AniList. This can't be undone."; }, 4000); return; }
  delArmed = false; hint.textContent = "Opens AniList. This can't be undone."; openExternal("https://anilist.co/settings/account");
};
$("#acSyncNow").onclick = () => { if(!pendingCount()){ $("#acMsg").textContent = "Nothing is waiting to sync."; return; } flushPending(); $("#acMsg").textContent = "Syncing…"; setTimeout(() => { renderPending(); $("#acMsg").textContent = pendingCount() ? "Still waiting. Check your connection." : "All synced."; }, 2500); };
$("#clearCache").onclick = () => {
  const st = cacheStats(); cacheClear();   // only the cache: waiting changes, settings and your login are not touched
  mcache.clear(); ecache.clear(); asCache.clear(); affCache.clear(); sz.cache.clear(); cz.cache = []; tz.cache = {}; pt.pools.clear(); profLoaded = false; trendAt = 0; if(typeof invalidateLists === "function") invalidateLists();
  $("#acMsg").textContent = st.count ? "Cleared " + st.count + " saved item" + (st.count > 1 ? "s" : "") + " (about " + Math.max(1, Math.round(st.chars * 2 / 1024)) + " KB). They load again when you open them." : "The cache was already empty.";
};
$("#copyInfo").onclick = async () => {
  const text = "What Next? " + (window.__REV || "unknown") + " | AniList user: " + (state.user || savedName()) + (meId() ? " (id " + meId() + ")" : "") + " | " + navigator.userAgent;
  try{ await navigator.clipboard.writeText(text); $("#acMsg").textContent = "App info copied."; }catch(_){ $("#acMsg").textContent = text; }
};

async function syncAniOptions(){
  try{
    const { json } = await gql("query{Viewer{options{titleLanguage} mediaListOptions{scoreFormat}}}", {});
    const v = json.data.Viewer;
    localStorage.setItem("wn_tlang", String(v.options.titleLanguage).replace("_STYLISED", ""));
    localStorage.setItem("wn_scorefmt", v.mediaListOptions.scoreFormat);
  }catch(_){}
}
$("#resetFilters").onclick = () => {
  lf.anime = defFilter(); lf.manga = defFilter(); fstore.anime = fstore.manga = null; LSset("wn_lf", fstore);
  $("#setListsMsg").textContent = "List filters were reset.";
};
$("#aboutBuild").textContent = "Build " + (window.__REV || "unknown");
