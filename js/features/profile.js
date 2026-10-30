/* js/features/profile.js: Profile screen (banner, avatar, counts, AniList stats, bio) */
// ---------- Profile ----------
let profLoaded = false, profMe = null;
const PROFILE_COLORS = { blue: "#3db4f2", purple: "#c063ff", pink: "#fc9dd6", orange: "#ef881a", red: "#e13333", green: "#4cca51", gray: "#677b94" };
const PROFILE_KEY = "wn_profile";
const fmtN = n => (n == null ? "–" : Number(n).toLocaleString());
const fmtMean = n => (n ? Number(n).toFixed(2) : "–");
const safeUrl = u => (/^https:\/\//.test(u || "") ? u : "");

// AniList bios are markdown with embedded media; keep just the readable text.
function cleanAbout(t){
  return clean(String(t || "")
    .replace(/~!([\s\S]*?)!~/g, "")                              // spoilers
    .replace(/\b(?:img|webm|youtube)\d*%?\s*\([^)]*\)/gi, "")    // embedded images and videos
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")                     // [text](link) -> text
    .replace(/^#{1,6}\s*/gm, "").replace(/__|\*\*|~~/g, ""))
    .replace(/\n{3,}/g, "\n\n").trim();
}

// colour ring, banner picture and avatar for a profile card
function profLook(card, bannerEl, avatarEl, v){
  const col = v.options && v.options.profileColor, hex = PROFILE_COLORS[col] || (/^#[0-9a-f]{3,8}$/i.test(col || "") ? col : PROFILE_COLORS.blue);
  card.style.setProperty("--pc", hex);
  const banner = safeUrl(v.bannerImage); bannerEl.style.backgroundImage = banner ? "url(" + JSON.stringify(banner) + ")" : "";
  const av = safeUrl(v.avatar && v.avatar.large); if(av){ avatarEl.src = av; avatarEl.hidden = false; }
}

function paintProfile(d){
  const v = d.v, st = v.statistics || {}, a = st.anime || {}, m = st.manga || {};
  $("#profName").textContent = v.name || state.user || "";
  profLook($("#profile .pcard"), $("#profBanner"), $("#profAvatar"), v);
  $("#profLink").href = safeUrl(v.siteUrl) || "https://anilist.co/user/" + encodeURIComponent(v.name || state.user || "");
  $("#pcAnime").textContent = fmtN(a.count); $("#pcManga").textContent = fmtN(m.count);
  $("#pcFollowing").textContent = fmtN(d.following); $("#pcFollowers").textContent = fmtN(d.followers);
  $("#paEps").textContent = fmtN(a.episodesWatched); $("#paDays").textContent = a.minutesWatched != null ? (a.minutesWatched / 1440).toFixed(1) : "–"; $("#paMean").textContent = fmtMean(a.meanScore);
  $("#pmChaps").textContent = fmtN(m.chaptersRead); $("#pmVols").textContent = fmtN(m.volumesRead); $("#pmMean").textContent = fmtMean(m.meanScore);
  const bio = cleanAbout(v.about), box = $("#profBioBox");
  box.hidden = !bio; $("#profBio").textContent = bio; $("#profBio").classList.remove("open");
  $("#profBioMore").hidden = bio.length < 220; $("#profBioMore").textContent = "More";
}
$("#profBioMore").onclick = () => { const c = $("#profBio"); c.classList.toggle("open"); $("#profBioMore").textContent = c.classList.contains("open") ? "Less" : "More"; };

// Two small requests: the profile itself, then the follower counts. AniList requires the user id as Int! for followers/following.
const PROFILE_Q = "query{Viewer{id name siteUrl about(asHtml:false) bannerImage avatar{large} options{profileColor} statistics{anime{count episodesWatched minutesWatched meanScore} manga{count chaptersRead volumesRead meanScore}}}}";
const FOLLOW_Q = "query($id:Int!){fo:Page(perPage:1){pageInfo{total} following(userId:$id){id}} fe:Page(perPage:1){pageInfo{total} followers(userId:$id){id}}}";
const savedName = () => { try{ return localStorage.getItem("wn_name") || ""; }catch(_){ return ""; } };
$("#profErr").onclick = () => { profLoaded = false; renderProfile(); };

async function renderProfile(){
  $("#profName").textContent = state.user || savedName();
  if(typeof profExtras === "function") profExtras();
  if(profLoaded) return;
  let cached = null;
  try{ cached = JSON.parse(localStorage.getItem(PROFILE_KEY) || "null"); }catch(_){}
  const mine = cached && cached.v && String(cached.v.name || "").toLowerCase() === String(state.user || savedName()).toLowerCase();
  if(mine) paintProfile(cached);   // show the saved copy right away
  $("#profErr").hidden = true;
  try{
    const { json } = await gql(PROFILE_Q, {});
    const v = json.data && json.data.Viewer;
    if(!v) throw new Error((json.errors && json.errors[0] && json.errors[0].message) || "No data");
    const d = { v, following: mine ? cached.following : null, followers: mine ? cached.followers : null };
    profMe = { id: v.id, name: v.name }; paintProfile(d); profLoaded = true;
    try{ localStorage.setItem(PROFILE_KEY, JSON.stringify(d)); }catch(_){}
    try{
      const r2 = await gql(FOLLOW_Q, { id: v.id }), j = r2.json.data;
      if(j){ d.following = j.fo && j.fo.pageInfo ? j.fo.pageInfo.total : d.following; d.followers = j.fe && j.fe.pageInfo ? j.fe.pageInfo.total : d.followers; paintProfile(d); try{ localStorage.setItem(PROFILE_KEY, JSON.stringify(d)); }catch(_){} }
    }catch(_){}   // follower counts are optional
  }catch(err){
    const msg = /Failed to fetch|NetworkError|Load failed/i.test(err.message) ? "no connection" : err.message;
    $("#profErr").textContent = "Couldn't load your profile (" + msg + "). Tap to try again."; $("#profErr").hidden = false;
  }
}
document.querySelectorAll("[data-go]").forEach(b => { b.onclick = () => showTab(b.dataset.go); });

// the counts are buttons: Anime and Manga open your lists, Following and Followers open the people lists
$("#pcAnimeBtn").onclick = () => showTab("anime");
$("#pcMangaBtn").onclick = () => showTab("manga");
for(const [id, mode] of [["#pcFollowingBtn", "following"], ["#pcFollowersBtn", "followers"]]) $(id).onclick = async () => {
  try{ const uid = profMe ? profMe.id : await myId(); openUserList(mode, uid, state.user || savedName()); }catch(_){ toast("No connection. Try again."); }
};
