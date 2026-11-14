/* js/features/notify-feed.js: the Notifications screen (opened from the bell at the top) and the unread badge.
   It shows your AniList notifications: episodes that aired, titles added or changed on your list, and activity from other people. */
// ---------- AniList notifications ----------
const NF_NAME = "name avatar{medium}", NF_MEDIA = "media{id title{romaji english native} coverImage{large} countryOfOrigin}";
const NF_ACT = k => ["... on " + k + "Notification{id type createdAt activityId context user{id " + NF_NAME + "}}"];
const NF_THR = k => ["... on " + k + "Notification{id type createdAt threadId context user{id " + NF_NAME + "}}"];
// One entry per notification type: [AniList type name, its fields]. A type AniList rejects is dropped (see nfFetch), so one wrong field never empties the whole list.
const NF_FR = [
  ["AiringNotification", "id type createdAt episode contexts " + NF_MEDIA],
  ["RelatedMediaAdditionNotification", "id type createdAt mediaId context " + NF_MEDIA],
  ["MediaDataChangeNotification", "id type createdAt mediaId context reason " + NF_MEDIA],
  ["MediaMergeNotification", "id type createdAt mediaId context reason deletedMediaTitles " + NF_MEDIA],
  ["MediaDeletionNotification", "id type createdAt deletedMediaTitle context reason"],
  ["FollowingNotification", "id type createdAt context user{id " + NF_NAME + "}"],
  ...["ActivityMessage", "ActivityReply", "ActivityMention", "ActivityLike", "ActivityReplyLike", "ActivityReplySubscribed"].map(k => [k + "Notification", "id type createdAt activityId context user{id " + NF_NAME + "}"]),
  ...["ThreadCommentMention", "ThreadCommentReply", "ThreadCommentSubscribed", "ThreadCommentLike", "ThreadLike"].map(k => [k + "Notification", "id type createdAt threadId context user{id " + NF_NAME + "}"])
];
const nfDropped = new Set();
function nfQuery(typed){
  const frags = NF_FR.filter(f => !nfDropped.has(f[0])).map(f => "... on " + f[0] + "{" + f[1] + "}").join(" ");
  return "query($p:Int,$r:Boolean" + (typed ? ",$t:[NotificationType]" : "") + "){Viewer{unreadNotificationCount} Page(page:$p,perPage:30){pageInfo{hasNextPage} notifications(" + (typed ? "type_in:$t," : "") + "resetNotificationCount:$r){__typename " + frags + "}}}";
}
// Asks AniList for a page. If AniList refuses the query because of one notification type (an unknown type or field), that type is left out and the rest still load.
async function nfFetch(page, types){
  let last = "AniList sent no notifications. Try again.";
  for(let i = 0; i < 12; i++){
    const vars = { p: page, r: page === 1 }; if(types) vars.t = types;
    const { json } = await gql(nfQuery(!!types), vars), pg = json.data && json.data.Page;
    if(pg && pg.notifications) return pg;
    const msg = (json.errors && json.errors[0] && json.errors[0].message) || "";
    if(msg) last = msg;
    const m = /on type "(\w+Notification)"|Unknown type "(\w+Notification)"|never be of type "(\w+Notification)"/.exec(msg), bad = m && (m[1] || m[2] || m[3]);
    if(!bad || nfDropped.has(bad) || !NF_FR.some(f => f[0] === bad)) break;
    nfDropped.add(bad);
  }
  throw new Error(last);
}
const NF_COUNT_Q = "query{Viewer{unreadNotificationCount}}";
const nfS = { filter: "all", page: 0, more: false, busy: false, rows: [], seen: 0, gen: 0, err: "" };
const nfSeenGet = () => Number(localStorage.getItem("wn_nf_seen")) || 0;

function nfBadgeSet(n){
  const b = $("#bellN"); if(!b) return;
  b.hidden = !(n > 0); b.textContent = n > 99 ? "99+" : String(n);
  $("#bellBtn").setAttribute("aria-label", n > 0 ? "Notifications, " + n + " unread" : "Notifications");
}
async function nfBadge(){
  try{
    const { json } = await gql(NF_COUNT_Q, {}), v = json.data && json.data.Viewer;
    if(v && v.unreadNotificationCount != null) nfBadgeSet(v.unreadNotificationCount);
  }catch(_){}
}

const nfWhen = at => new Date(at * 1000).toLocaleString([], { weekday: "short", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
function nfRow(n, isNew){
  const L = nfLine(n, tt), card = el("div", "nfcard" + (isNew ? " fresh" : ""));
  const pic = el("div", "nfpic" + (L.user ? " user" : "")); if(L.cover){ const img = new Image(); img.alt = ""; img.loading = "lazy"; img.src = L.cover; pic.append(img); }
  const body = el("div", "nfbody");
  body.append(el("div", "nfwhen", nfWhen(L.at)), el("div", "nftext", L.text));
  if(L.sub) body.append(el("div", "nfsub", L.sub));
  let go = null, label = "";
  if(L.mid){ go = () => openMedia(L.mid); }
  else if(L.activity){ go = () => openExternal("https://anilist.co/activity/" + L.activity); label = "View Detail"; }
  else if(L.thread){ go = () => openExternal("https://anilist.co/forum/thread/" + L.thread); label = "View Detail"; }
  else if(L.user && L.user.id){ go = () => openUser(L.user.id, L.user.name); label = "View profile"; }
  if(label){ const a = el("button", "nflink", label); a.onclick = ev => { ev.stopPropagation(); go(); }; body.append(a); }
  if(go){ card.classList.add("tap"); card.setAttribute("role", "button"); card.tabIndex = 0; card.onclick = go; card.onkeydown = ev => { if(ev.key === "Enter" || ev.key === " "){ ev.preventDefault(); go(); } }; }
  card.append(pic, body);
  return card;
}
function nfDraw(){
  const box = $("#nfList"); box.replaceChildren();
  for(const n of nfS.rows) box.append(nfRow(n, (n.createdAt || 0) > nfS.seen));
  $("#nfMore").hidden = !nfS.more;
  if(nfS.err) $("#nfMsg").textContent = nfS.err;
  else if(!nfS.rows.length && !nfS.busy) $("#nfMsg").textContent = "Nothing here yet. You will see aired episodes, titles added to your list and activity from other people.";
}
async function nfLoad(reset){
  if(nfS.busy) return;
  const first = reset || !nfS.page, page = first ? 1 : nfS.page + 1, gen = ++nfS.gen;
  nfS.busy = true; nfS.err = ""; $("#nfMsg").textContent = first && !nfS.rows.length ? "Loading…" : "";
  $("#nfMore").disabled = true;
  try{
    const pg = await nfFetch(page, NF_FILTERS[nfS.filter]);   // r: page === 1 inside: the first page marks them read on AniList
    if(gen !== nfS.gen) return;   // a newer request (another filter) took over
    const got = (pg.notifications || []).filter(Boolean);
    if(first){ nfS.seen = nfSeenGet(); nfS.rows = got; } else nfS.rows = nfS.rows.concat(got);
    nfS.page = page; nfS.more = !!(pg.pageInfo && pg.pageInfo.hasNextPage);
    if(page === 1){ nfBadgeSet(0); }
    const top = nfS.rows.reduce((m, n) => Math.max(m, n.createdAt || 0), 0);
    if(top > nfSeenGet()){ try{ localStorage.setItem("wn_nf_seen", String(top)); }catch(_){} }
    $("#nfMsg").textContent = "";
  }catch(err){
    if(gen === nfS.gen) nfS.err = isNetErr(err) ? "Couldn't reach AniList. Check your connection and try again." : "AniList could not load your notifications: " + err.message;
  }finally{
    if(gen === nfS.gen){ nfS.busy = false; $("#nfMore").disabled = false; nfDraw(); }
  }
}
// Opening the screen (showTab calls this)
function nfOpen(){
  nfS.err = ""; nfS.rows = []; nfS.page = 0; nfS.more = false; nfS.busy = false; nfS.gen++;
  document.querySelectorAll("#nfFilter .chip").forEach(c => c.setAttribute("aria-pressed", String(c.dataset.v === nfS.filter)));
  nfDraw(); nfLoad(true);
}
$("#nfFilter").addEventListener("click", ev => {
  const c = ev.target.closest(".chip"); if(!c || c.dataset.v === nfS.filter) return;
  nfS.filter = c.dataset.v; nfOpen();
});
$("#nfMore").onclick = () => nfLoad(false);
$("#nfRefresh").onclick = () => { nfS.busy = false; nfLoad(true); };
$("#nfGear").onclick = () => showTab("set-notify");
$("#bellBtn").onclick = () => showTab("notifications");
