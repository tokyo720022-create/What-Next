/* js/features/chat.js: Chat */
// ---------- Chat: one-to-one AniList private messages ----------
const chat = { id: 0, name: "", mine: 0, timer: null };
const MSG_F = "id createdAt isPrivate message(asHtml:false) messenger{name}";
async function myId(){
  if(state.uid) return state.uid;
  const { json } = await gql("query{Viewer{id}}", {});
  state.uid = json.data && json.data.Viewer && json.data.Viewer.id;
  return state.uid;
}
function recentChats(){ try{ const a = JSON.parse(localStorage.getItem("wn_chats") || "[]"); return Array.isArray(a) ? a.filter(x => typeof x === "string") : []; }catch(_){ return []; } }   // a damaged list is just empty
function renderRecent(){
  $("#chatRecent").replaceChildren(...recentChats().map(n => { const b = el("button", "chip", n); b.style.flex = "0 0 auto"; b.onclick = () => openChat(n); return b; }));
}
function stopChatTimer(){ if(chat.timer){ clearInterval(chat.timer); chat.timer = null; } }
function startChatTimer(){
  stopChatTimer();
  chat.timer = setInterval(() => { if(!document.hidden && !$("#chat").hidden && !$("#chatRoom").hidden) loadThread(false); }, 20000);
}
async function openChat(name){
  name = (name || "").trim().replace(/^@/, ""); if(!name) return;
  const err = $("#chatErr"); err.textContent = "Looking up " + name + "…";
  try{
    const { json } = await gql("query($n:String){User(name:$n){id name}}", { n: name });
    const u = json.data && json.data.User;
    if(!u) throw new Error("No AniList user called " + name + ".");
    chat.id = u.id; chat.name = u.name; chat.mine = await myId();
    const r = [u.name, ...recentChats().filter(x => x !== u.name)].slice(0, 8);
    try{ localStorage.setItem("wn_chats", JSON.stringify(r)); }catch(_){}
    err.textContent = ""; $("#chatNote").textContent = "";
    $("#chatHome").hidden = true; $("#chatRoom").hidden = false; $("#chatWith").textContent = u.name;
    await loadThread(true); startChatTimer();
  }catch(e2){ err.textContent = isNetErr(e2) ? "No connection. Try again." : e2.message; }
}
async function loadThread(scroll){
  if(!chat.id) return;
  try{
    const part = "(perPage:30){activities(type:MESSAGE,userId:$%s,messengerId:$%s,sort:ID_DESC){... on MessageActivity{" + MSG_F + "}}}";
    const q = "query($a:Int,$b:Int){i:Page" + part.replace("%s", "a").replace("%s", "b") + " o:Page" + part.replace("%s", "b").replace("%s", "a") + "}";
    const { json } = await gql(q, { a: chat.mine, b: chat.id });
    if(json.errors && !json.data) throw new Error(json.errors[0].message);
    const seen = new Set(), all = [];
    for(const k of ["i", "o"]) for(const m of (json.data[k] && json.data[k].activities) || []){
      if(m && m.id && !seen.has(m.id)){ seen.add(m.id); all.push(m); }
    }
    all.sort((a, b) => a.createdAt - b.createdAt);
    const t = $("#thread");
    t.replaceChildren(...all.map(m => {
      const b = el("div", "bub " + (m.messenger && m.messenger.name === chat.name ? "them" : "me")); b.append(m.message || "");
      b.append(el("small", null, new Date(m.createdAt * 1000).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + (m.isPrivate ? " · private" : "")));
      return b;
    }));
    if(!all.length) t.append(el("p", "sub", "No messages yet. Say hi!"));
    if(scroll) window.scrollTo(0, document.body.scrollHeight);
  }catch(e2){ $("#chatNote").textContent = "Couldn't load messages: " + e2.message; }
}
async function sendMsg(){
  const box = $("#chatText"), text = box.value.trim(); if(!text || !chat.id) return;
  const btn = $("#chatSend"); btn.disabled = true; $("#chatNote").textContent = "";
  try{
    const { json } = await gql("mutation($r:Int,$m:String,$p:Boolean){SaveMessageActivity(recipientId:$r,message:$m,private:$p){id}}", { r: chat.id, m: text, p: true });
    if(json.errors) throw new Error(json.errors[0].message);
    box.value = ""; await loadThread(true);
  }catch(e2){ $("#chatNote").textContent = "Couldn't send: " + e2.message; }
  finally{ btn.disabled = false; }
}
$("#chatOpen").onclick = () => openChat($("#chatUser").value);
$("#chatUser").addEventListener("keydown", e => { if(e.key === "Enter") openChat($("#chatUser").value); });
$("#chatSend").onclick = sendMsg;
$("#chatBack").onclick = () => { stopChatTimer(); chat.id = 0; $("#chatRoom").hidden = true; $("#chatHome").hidden = false; renderRecent(); };
