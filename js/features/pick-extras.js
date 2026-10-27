/* js/features/pick-extras.js: hide list, rate and sequels, for-you, lineup, surprise */
// ---------- Round 1 helpers ----------
const hide = new Set();
try{ JSON.parse(localStorage.getItem("wn_hide") || "[]").forEach(x => hide.add(x)); }catch(_){}
const saveHide = () => { try{ localStorage.setItem("wn_hide", JSON.stringify([...hide])); }catch(_){} };

async function addPlanning(id, btn, type){
  btn.disabled = true; btn.textContent = "Adding…";
  const r = await trackSave(id, type || "anime", { status: "PLANNING" }, { quiet: true });
  if(r.ok || r.queued) btn.textContent = r.queued ? "Saved offline" : "Added to Planning";
  else { btn.disabled = false; btn.textContent = "Couldn't add: " + ((r.error && r.error.message) || "error"); }
}

async function afterFinish(e){
  const title = e.media.title.english || e.media.title.romaji;
  const box = $("#result"); box.replaceChildren();
  const note = document.createElement("div"); note.className = "msg"; note.textContent = "Finished " + title + "! How would you rate it?";
  const row = document.createElement("div"); row.className = "row"; row.style.marginTop = "10px";
  for(let n = 1; n <= 10; n++){
    const b = document.createElement("button"); b.className = "chip"; b.style.minWidth = "52px"; b.textContent = n;
    b.onclick = async () => {
      row.querySelectorAll("button").forEach(x => x.disabled = true);
      const r = await trackSave(e.media.id, e.media.type === "ANIME" ? "anime" : "manga", { score: n * 10 }, { quiet: true });
      if(r.ok || r.queued){ note.textContent = (r.queued ? "Saved on this device: " : "Saved: ") + title + " rated " + n + "/10."; row.remove(); }
      else { note.textContent = "Couldn't save rating: " + ((r.error && r.error.message) || "error"); row.querySelectorAll("button").forEach(x => x.disabled = false); }
    };
    row.append(b);
  }
  const next = document.createElement("button"); next.className = "go alt"; next.textContent = "Next pick"; next.onclick = () => pick();
  box.append(note, row, next);
  try{
    const { json } = await gql("query($id:Int){Media(id:$id){relations{edges{relationType node{id siteUrl title{romaji english}}}}}}", { id: e.media.id });
    const seq = ((json.data && json.data.Media && json.data.Media.relations.edges) || []).filter(x => x.relationType === "SEQUEL");
    const onList = new Set(state.items.map(i => i.media.id));
    if(seq.length){
      const h = document.createElement("p"); h.className = "q"; h.textContent = "Next up"; box.insertBefore(h, next);
      seq.forEach(x => {
        const n = x.node, d = document.createElement("div"); d.className = "msg"; d.style.marginTop = "8px";
        const a = document.createElement("a"); a.href = n.siteUrl; a.target = "_blank"; a.rel = "noopener"; a.textContent = n.title.english || n.title.romaji; d.append(a);
        if(!onList.has(n.id)){ const b = document.createElement("button"); b.className = "mini"; b.textContent = "+ Planning"; b.onclick = () => addPlanning(n.id, b, e.media.type === "ANIME" ? "anime" : "manga"); d.append(document.createElement("br"), b); }
        box.insertBefore(d, next);
      });
    }
  }catch(_){}
}

function topGenres(){
  const c = new Map();
  for(const e of state.items) for(const g of e.media.genres || []) c.set(g, (c.get(g) || 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(x => x[0]);
}

$("#spinBtn").onclick = () => { state.skipped.clear(); pick(true); };
$("#lineupBtn").onclick = lineup;
$("#hideClear").onclick = () => { hide.clear(); saveHide(); $("#hideCount").textContent = "No hidden titles."; };

function filtSum(){
  const t = { 15: "15 min", 30: "30 min", 60: "1 hour", 120: "2 hours" }[state.time];
  $("#filtSum").textContent = "Filters · " + t + " · " + ({ ANIME: "Watch", MANGA: "Read", BOTH: "Either" })[state.kind] +
    (state.genre !== "ALL" ? " · " + state.genre : "") + (state.adult !== "ALL" ? " · " + (state.adult === "ONLY" ? "18+ only" : "No 18+") : "");
}
["#kinds", "#times", "#genres", "#adult"].forEach(id => $(id).addEventListener("click", filtSum));
filtSum();
