/* js/features/editor.js: list editor. Rules and saving come from js/core/tracker.js */
let LOPT = null;
let editorBack = () => { $("#editor").hidden = true; };
async function listOptions(){
  if(LOPT) return LOPT;
  try{
    const { json } = await gql("query{Viewer{mediaListOptions{scoreFormat animeList{customLists} mangaList{customLists}}}}", {});
    const o = json.data.Viewer.mediaListOptions;
    LOPT = { anime: o.animeList.customLists || [], manga: o.mangaList.customLists || [] };
    try{ localStorage.setItem("wn_scorefmt", o.scoreFormat); }catch(_){}
    return LOPT;
  }catch(_){ return { anime: [], manga: [] }; }
}
async function openEditor(m){
  const type = m.type === "ANIME" ? "anime" : "manga", total = (type === "anime" ? m.episodes : m.chapters) || null, lab = STATUS_LABEL(type);
  const opts = (await listOptions())[type], e = m.mediaListEntry, spec = scoreSpec();
  const d = { status: e ? e.status : "PLANNING", progress: e ? e.progress : 0, score: e ? (e.score || 0) : 0, repeat: e ? e.repeat || 0 : 0, notes: (e && e.notes) || "", priority: e ? e.priority || 0 : 0,
    priv: !!(e && e.private), start: dIn(e && e.startedAt), end: dIn(e && e.completedAt), lists: Object.keys((e && e.customLists) || {}).filter(k => e.customLists[k]) };
  const base = JSON.stringify(d), initial = JSON.parse(base), dirty = () => JSON.stringify(d) !== base;
  let fav = !!m.isFavourite, armed = false, discardArmed = false;
  const box = $("#editor"); box.replaceChildren(); box.hidden = false; box.scrollTop = 0;
  const head = el("div", "sheethead ehead"), back = el("button", "mini", "← Back"), heart = el("button", "mini heart", fav ? "♥ Favourite" : "♡ Favourite");
  editorBack = () => {
    if(box.hidden) return;
    if(dirty() && !discardArmed){ discardArmed = true; back.textContent = "Discard changes?"; setTimeout(() => { discardArmed = false; back.textContent = "← Back"; }, 3500); return; }
    box.hidden = true;
  };
  back.onclick = () => editorBack();
  heart.onclick = async () => {
    heart.disabled = true;
    try{
      const v = type === "anime" ? { a: m.id } : { m: m.id };
      const { json } = await gql("mutation($a:Int,$m:Int){ToggleFavourite(animeId:$a,mangaId:$m){anime{pageInfo{total}}}}", v);
      if(json.errors) throw new Error(json.errors[0].message);
      fav = !fav; m.isFavourite = fav; heart.textContent = fav ? "♥ Favourite" : "♡ Favourite";
    }catch(_){ toast("Couldn't change the favourite. Check your connection."); }
    heart.disabled = false;
  };
  head.append(back, el("b", null, "List editor"), heart);
  // the title with its cover, over a blurred copy of the cover
  const cover = (m.coverImage && (m.coverImage.large || m.coverImage.extraLarge)) || "", hero = el("div", "ehero"), thumb = new Image(), einfo = el("div", "einfo"), title = el("h2", "ph", tt(m));
  thumb.alt = ""; if(cover){ thumb.src = cover; hero.style.setProperty("--cv", "url(" + JSON.stringify(cover) + ")"); }
  const airSt = (m.status || "").replace(/_/g, " ").toLowerCase(), sub = [(m.format || "").replace(/_/g, " "), total ? total + (type === "anime" ? " episodes" : " chapters") : "", airSt ? airSt[0].toUpperCase() + airSt.slice(1) : ""].filter(Boolean).join(" · ");
  einfo.append(title, el("p", "esub", sub)); hero.append(thumb, einfo);
  box.append(head, hero);
  let host = box;   // each group of controls sits in its own card
  const sec = t => { host = el("section", "esec"); host.append(el("div", "q", t)); box.append(host); };
  // status
  sec("Status");
  const seg = el("div", "seg"), segBtns = {};
  ["CURRENT", "PLANNING", "COMPLETED", "REPEATING", "PAUSED", "DROPPED"].forEach(s => { const b = el("button", "chip", lab[s]); b.dataset.s = s; b.onclick = () => setStatus(s); segBtns[s] = b; seg.append(b); });
  host.append(seg);
  // progress
  sec(type === "anime" ? "Episodes" : "Chapters");
  const stp = el("div", "stepper"), minus = el("button", "chip", "−"), plus = el("button", "chip", "+"), pin = el("input"), of = el("span", "sub", total ? "of " + total : "");
  pin.type = "number"; pin.min = "0"; pin.inputMode = "numeric";
  const ptrack = el("div", "ptrack"), pfill = el("i"); ptrack.append(pfill);
  const fin = total ? el("button", "chip efin", "All") : null, pline = el("p", "esub");   // fin: jump to the last episode or chapter
  stp.append(minus, pin, plus, of); if(fin) stp.append(fin); host.append(stp, ptrack, pline);
  // score (in the format you chose on AniList)
  sec("Score");
  const sv = el("div", "bigscore"), sl = el("input"), srow = el("div", "stepper"), sm = el("button", "chip", "−"), sp = el("button", "chip", "+"), sn = el("button", "mini", "No score");
  sl.type = "range"; sl.min = String(spec.min); sl.max = String(spec.max); sl.step = String(spec.step); sn.style.margin = "0";
  srow.append(sm, sp, sn); host.append(sv, sl, srow);
  // dates
  sec("Dates");
  const dates = el("div", "two"), mkDate = (label, key) => {
    const c = el("div", "datecell"), i = el("input"), l = el("span", "sub", label), t = el("button", "mini", "Today"), x = el("button", "mini", "Clear");
    i.type = "date"; i.oninput = () => { d[key] = i.value; }; t.onclick = () => { d[key] = dayKey(); sync(); }; x.onclick = () => { d[key] = ""; sync(); };
    c.append(l, i, t, x); dates.append(c); return i;
  };
  const startIn = mkDate("Started", "start"), endIn = mkDate("Finished", "end");
  host.append(dates);
  // rewatches, priority, private
  sec(type === "anime" ? "Total rewatches" : "Total rereads");
  const rs = el("div", "stepper"), rm = el("button", "chip", "−"), rp = el("button", "chip", "+"), rv = el("b", null, "0");
  rm.onclick = () => { d.repeat = Math.max(0, d.repeat - 1); sync(); }; rp.onclick = () => { d.repeat++; sync(); };
  rs.append(rm, rv, rp); host.append(rs);
  sec("Priority");
  const pr = el("div", "seg seg4"), prBtns = [];
  [["None", 0], ["Low", 1], ["Medium", 3], ["High", 5]].forEach(([n, v]) => { const b = el("button", "chip", n); b.onclick = () => { d.priority = v; sync(); }; prBtns.push([b, v]); pr.append(b); });
  host.append(pr);
  host = el("section", "esec"); box.append(host);
  const pv = el("label", "chk sw"), pvi = el("input"); pvi.type = "checkbox"; pvi.onchange = () => { d.priv = pvi.checked; };
  pv.append(pvi, " Private (hide from my public profile)"); host.append(pv);
  // custom lists
  if(opts.length){
    sec("Custom lists");
    const cl = el("div", "seg");
    opts.forEach(n => { const b = el("button", "chip", n); b.dataset.n = n; b.onclick = () => { const i = d.lists.indexOf(n); if(i >= 0) d.lists.splice(i, 1); else d.lists.push(n); sync(); }; cl.append(b); });
    host.append(cl);
  }
  // notes
  sec("Notes");
  const notes = el("textarea"); notes.rows = 3; notes.placeholder = "Write a note"; notes.oninput = () => { d.notes = notes.value; };
  host.append(notes);
  // bar
  const bar = el("div", "sheetbar"), save = el("button", "go", e ? "Save" : "Add to list");
  let rmv = null; if(e && e.id){ rmv = el("button", "go alt danger", "Remove"); bar.append(rmv); }
  bar.append(save); box.append(bar);

  const scoreVal = () => spec.fromRaw(d.score);
  const setScore = v => { v = Math.max(spec.min, Math.min(spec.max, Math.round(v / spec.step) * spec.step)); d.score = spec.toRaw(Number(v.toFixed(2))); sync(); };
  function sync(){
    for(const s in segBtns) segBtns[s].setAttribute("aria-pressed", String(d.status === s));
    pin.value = d.progress; pfill.style.width = total ? Math.min(100, Math.round(d.progress / total * 100)) + "%" : "0%";
    of.textContent = total ? "/ " + total : "";
    pline.textContent = total ? Math.min(100, Math.round(d.progress / total * 100)) + "% " + (type === "anime" ? "watched" : "read") + " · " + Math.max(0, total - d.progress) + " left" : "";
    sv.textContent = d.score ? "★ " + spec.text(scoreVal()) : "No score"; sl.value = d.score ? scoreVal() : 0;
    sl.style.setProperty("--p", d.score ? Math.round((scoreVal() - spec.min) / (spec.max - spec.min) * 100) + "%" : "0%");
    startIn.value = d.start; endIn.value = d.end; rv.textContent = d.repeat;
    prBtns.forEach(([b, v]) => b.setAttribute("aria-pressed", String(d.priority === v)));
    pvi.checked = d.priv; if(notes.value !== d.notes) notes.value = d.notes;
    box.querySelectorAll("[data-n]").forEach(b => b.setAttribute("aria-pressed", String(d.lists.includes(b.dataset.n))));
  }
  // same rules as the quick +1 buttons
  const cur = () => ({ status: d.status, progress: d.progress, repeat: d.repeat, startedAt: d.start ? dOut(d.start) : null, completedAt: d.end ? dOut(d.end) : null });
  const apply = p => { if(p.status) d.status = p.status; if(p.progress != null) d.progress = p.progress; if(p.repeat != null) d.repeat = p.repeat; if(p.startedAt) d.start = dIn(p.startedAt); if(p.completedAt) d.end = dIn(p.completedAt); };
  function setStatus(s){ apply(trackRules(cur(), total, { status: s })); sync(); }
  function setProg(n){ apply(trackRules(cur(), total, { progress: n })); sync(); }
  minus.onclick = () => setProg(d.progress - 1); plus.onclick = () => setProg(d.progress + 1); if(fin) fin.onclick = () => setProg(total);
  pin.onchange = () => setProg(+pin.value);
  sl.oninput = () => setScore(+sl.value);
  sm.onclick = () => setScore((scoreVal() || 0) - spec.step); sp.onclick = () => setScore((scoreVal() || 0) + spec.step);
  sn.onclick = () => { d.score = 0; sync(); };
  sync();

  const patch = () => {
    const p = {}, all = !e;
    if(all || d.status !== initial.status) p.status = d.status;
    if(all || d.progress !== initial.progress) p.progress = d.progress;
    if(all || d.repeat !== initial.repeat) p.repeat = d.repeat;
    if(all || d.score !== initial.score) p.score = d.score;
    if(all || d.notes !== initial.notes) p.notes = d.notes;
    if(all || d.priority !== initial.priority) p.priority = d.priority;
    if(all || d.priv !== initial.priv) p.private = d.priv;
    if(all || d.start !== initial.start) p.startedAt = dOut(d.start);
    if(all || d.end !== initial.end) p.completedAt = dOut(d.end);
    if(all || JSON.stringify(d.lists) !== JSON.stringify(initial.lists)) p.customLists = d.lists;
    return p;
  };
  save.onclick = async () => {
    const p = patch();
    if(!Object.keys(p).length){ box.hidden = true; return; }
    save.disabled = true; save.textContent = "Saving…";
    const r = await trackSave(m.id, type, p, { quiet: true });
    if(r.ok || r.queued){
      box.hidden = true;
      if(r.queued) toast("Saved on this device. It will sync when you're online.");
      else if(!e && mstack.length && mstack[mstack.length - 1] === m.id) showMedia(m.id);
    }else{ save.disabled = false; save.textContent = "Couldn't save: " + ((r.error && r.error.message) || "error"); }
  };
  if(rmv) rmv.onclick = async () => {
    if(!armed){ armed = true; rmv.textContent = "Tap again to remove"; setTimeout(() => { if(!rmv.disabled){ armed = false; rmv.textContent = "Remove"; } }, 3500); return; }
    rmv.disabled = true;
    const r = await trackRemove(m.id, type, e.id);
    if(r.ok){ box.hidden = true; if(mstack.length) showTop(); renderAfter(m.id, type); }
    else{ rmv.disabled = false; armed = false; rmv.textContent = r.offline ? "Can't remove while offline" : "Couldn't remove: " + ((r.error && r.error.message) || "error"); }
  };
}
