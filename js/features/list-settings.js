/* js/features/list-settings.js: Settings > List Settings. The same options as AniList's list settings page. */
// ---------- AniList list settings ----------
const LS_ACT = [["CURRENT", "Watching/Reading"], ["PLANNING", "Planning"], ["COMPLETED", "Completed"], ["DROPPED", "Dropped"], ["PAUSED", "Paused"], ["REPEATING", "Rewatching/Rereading"]];
const LS_ORDERS = [["score", "Score"], ["title", "Title"], ["updatedAt", "Last updated"], ["id", "Last added"]];
const LS_FORMATS = { anime: ["TV", "Movie", "OVA", "ONA", "Special", "TV Short", "Music"], manga: ["Manga", "Novel", "One Shot"] };
const LS_BASE = { anime: ["Watching", "Rewatching", "Planning", "Completed", "Dropped", "Paused"], manga: ["Reading", "Rereading", "Planning", "Completed", "Dropped", "Paused"] };
const LS_OPTS = "sectionOrder splitCompletedSectionByFormat customLists advancedScoring advancedScoringEnabled";
const LS_Q = "query{Viewer{options{disabledListActivity{type disabled}} mediaListOptions{scoreFormat rowOrder animeList{" + LS_OPTS + "} mangaList{" + LS_OPTS + "}}}}";
const LS_SAVE_Q = "mutation($sf:ScoreFormat,$ro:String,$al:MediaListOptionsInput,$ml:MediaListOptionsInput,$da:[ListActivityOptionInput]){UpdateUser(scoreFormat:$sf,rowOrder:$ro,animeListOptions:$al,mangaListOptions:$ml,disabledListActivity:$da){id}}";
const LS_DEL_Q = "mutation($n:String,$t:MediaType){DeleteCustomList(customList:$n,type:$t){deleted}}";

let lset = null, lsBase = "", lsReorder = { anime: false, manga: false }, lsAdding = null, lsBusy = false;
const lsNormList = l => ({ order: [...(l.sectionOrder || [])], split: !!l.splitCompletedSectionByFormat, custom: [...(l.customLists || [])], adv: [...(l.advancedScoring || [])], advOn: !!l.advancedScoringEnabled });
const lsDirty = () => !!lset && JSON.stringify(lset) !== lsBase;
const lsAdvSame = () => JSON.stringify([lset.anime.adv, lset.anime.advOn]) === JSON.stringify([lset.manga.adv, lset.manga.advOn]);

async function lsLoad(force, quiet){
  if(lset && !force && !lsBusy){ lsRender(); return; }
  if(!quiet){ $("#lsStatus").textContent = "Loading your AniList list settings…"; $("#lsStatus").hidden = false; $("#lsForm").hidden = true; $("#lsBar").hidden = true; }
  try{
    const { json } = await gql(LS_Q, {});
    const v = json.data && json.data.Viewer; if(!v || !v.mediaListOptions) throw new Error((json.errors && json.errors[0] && json.errors[0].message) || "No data");
    const o = v.mediaListOptions, act = {}; for(const [t] of LS_ACT) act[t] = false;
    for(const a of (v.options && v.options.disabledListActivity) || []) if(a && a.type in act) act[a.type] = !!a.disabled;
    lset = { score: o.scoreFormat || "POINT_10", row: o.rowOrder || "score", anime: lsNormList(o.animeList || {}), manga: lsNormList(o.mangaList || {}), act, removed: { anime: [], manga: [] } };
    lsBase = JSON.stringify(lset); lsReorder = { anime: false, manga: false }; lsAdding = null;
    $("#lsStatus").hidden = true; $("#lsForm").hidden = false; lsRender();
  }catch(err){
    const retry = el("button", "go alt", "Try again"); retry.onclick = () => lsLoad(true);
    $("#lsStatus").textContent = "Couldn't load your list settings: " + (/Failed to fetch|NetworkError|Load failed/i.test(err.message) ? "no connection." : err.message); $("#lsStatus").append(retry);
  }
}

// ----- small pieces -----
function lsHead(title, ...actions){ const h = el("div", "lshead"); h.append(el("h3", null, title)); for(const a of actions) h.append(a); return h; }
function lsLink(text, fn){ const b = el("button", "lslink", text); b.onclick = fn; return b; }
function lsSwitch(label, on, fn){
  const row = el("label", "lsrow"), box = el("input", "lssw"); box.type = "checkbox"; box.checked = on; box.onchange = () => fn(box.checked);
  row.append(el("span", null, label), box, el("i", "lsck")); return row;
}
function lsSelect(label, value, pairs, fn){
  const row = el("label", "lsrow"), s = el("select", "lssel"), list = pairs.some(p => p[0] === value) ? pairs : [...pairs, [value, value]];
  for(const [v, t] of list){ const o = el("option", null, t); o.value = v; s.append(o); }
  s.value = value; s.onchange = () => fn(s.value); row.append(el("span", null, label), s); return row;
}
function lsChips(names, removed, onRemove, onUndo){
  const box = el("div", "lschips");
  for(const n of names){ const c = el("span", "lschip"); const x = el("button", null, "✕"); x.setAttribute("aria-label", "Remove " + n); x.onclick = () => onRemove(n); c.append(el("span", null, n), x); box.append(c); }
  for(const n of removed){ const c = el("span", "lschip gone"); const u = el("button", null, "Undo"); u.onclick = () => onUndo(n); c.append(el("span", null, n), u); box.append(c); }
  return box;
}
function lsAdder(key, placeholder, onAdd){
  const wrap = el("div", "lsadd");
  if(lsAdding !== key) return null;
  const inp = el("input"); inp.placeholder = placeholder; inp.maxLength = 60; inp.id = "lsInput";
  const add = el("button", "mini", "Add"), cancel = el("button", "mini", "Cancel");
  const go = () => { const v = inp.value.trim(); if(v && onAdd(v)) lsAdding = null; lsRender(); };
  add.onclick = go; cancel.onclick = () => { lsAdding = null; lsRender(); }; inp.onkeydown = e => { if(e.key === "Enter") go(); };
  wrap.append(inp, add, cancel); return wrap;
}
const lsNames = t => lset[t].custom.concat(lset.removed[t]).map(x => x.toLowerCase());
function lsDefaultOrder(t){
  const s = lset[t], out = [...LS_BASE[t]];
  if(s.split){ const i = out.indexOf("Completed"); out.splice(i + 1, 0, ...LS_FORMATS[t].map(f => "Completed " + f)); }
  return out.concat(s.custom);
}
function lsSetSplit(t, on){
  const s = lset[t], fm = LS_FORMATS[t].map(f => "Completed " + f);
  if(on){ const i = s.order.indexOf("Completed"), add = fm.filter(n => !s.order.includes(n)); s.order.splice(i < 0 ? s.order.length : i + 1, 0, ...add); }
  else s.order = s.order.filter(n => !fm.includes(n));
  s.split = on;
}

// ----- the form -----
function lsRender(){
  if(!lset) return;
  const form = $("#lsForm"), keep = window.scrollY, kind = t => (t === "anime" ? "Anime" : "Manga");
  form.replaceChildren();

  const sc = el("div", "lssec"); sc.append(el("h3", "lsh", "Scoring"));
  sc.append(lsSelect("Scoring system", lset.score, SCORE_FORMATS, v => { lset.score = v; lsRender(); }));
  const groups = lsAdvSame() ? [{ label: "", ts: ["anime", "manga"] }] : [{ label: "Anime ", ts: ["anime"] }, { label: "Manga ", ts: ["manga"] }];
  for(const g of groups){
    const first = lset[g.ts[0]];
    sc.append(lsSwitch("Use " + g.label.toLowerCase() + "advanced scoring", first.advOn, on => { for(const t of g.ts) lset[t].advOn = on; lsRender(); }));
    if(first.advOn){
      const key = "adv-" + g.ts.join("");
      const add = lsLink("Add more", () => { lsAdding = key; lsRender(); const i = $("#lsForm .lsadd input"); if(i) i.focus(); });
      sc.append(lsHead(g.label + "Advanced scoring criteria", add));
      sc.append(lsChips(first.adv, [], n => { for(const t of g.ts) lset[t].adv = lset[t].adv.filter(x => x !== n); lsRender(); }, () => {}));
      const a = lsAdder(key, "New criteria, for example Story", v => { if(first.adv.some(x => x.toLowerCase() === v.toLowerCase())) return false; for(const t of g.ts) lset[t].adv.push(v); return true; });
      if(a) sc.append(a);
    }
  }
  form.append(sc);

  const li = el("div", "lssec"); li.append(el("h3", "lsh", "List"));
  li.append(lsSelect("Default list order", lset.row, LS_ORDERS, v => { lset.row = v; lsRender(); }));
  for(const t of ["anime", "manga"]) li.append(lsSwitch("Split " + kind(t) + " completed list section by format", lset[t].split, on => { lsSetSplit(t, on); lsRender(); }));
  form.append(li);

  const ac = el("div", "lssec"); ac.append(el("h3", "lsh", "Disable List Activity Creation"));
  for(const [type, label] of LS_ACT) ac.append(lsSwitch("Stop creating " + label + " activity", lset.act[type], on => { lset.act[type] = on; lsRender(); }));
  form.append(ac);

  for(const t of ["anime", "manga"]){
    const s = lset[t], sec = el("div", "lssec");
    sec.append(lsHead("Custom " + kind(t) + " Lists", lsLink("Add more", () => { lsAdding = "custom-" + t; lsRender(); const i = $("#lsForm .lsadd input"); if(i) i.focus(); })));
    sec.append(lsChips(s.custom, lset.removed[t], n => { s.custom = s.custom.filter(x => x !== n); lset.removed[t].push(n); s.order = s.order.filter(x => x !== n); lsRender(); },
      n => { lset.removed[t] = lset.removed[t].filter(x => x !== n); s.custom.push(n); if(!s.order.includes(n)) s.order.push(n); lsRender(); }));
    const a = lsAdder("custom-" + t, "New list name", v => { if(lsNames(t).includes(v.toLowerCase())) { toast("You already have a list called " + v); return false; } s.custom.push(v); s.order.push(v); return true; });
    if(a) sec.append(a);
    if(lset.removed[t].length) sec.append(el("p", "sub warn2", "Lists marked for removal are deleted from all your titles when you save."));
    form.append(sec);
  }

  for(const t of ["anime", "manga"]){
    const s = lset[t], sec = el("div", "lssec"), moving = lsReorder[t];
    sec.append(lsHead(kind(t) + " Section Order", lsLink("Reset to Default", () => { s.order = lsDefaultOrder(t); lsRender(); }), lsLink(moving ? "Done" : "Start Reorder", () => { lsReorder[t] = !moving; lsRender(); })));
    s.order.forEach((name, i) => {
      const row = el("div", "lsord"); row.append(el("span", null, name));
      if(moving){
        const up = el("button", null, "▲"), dn = el("button", null, "▼"); up.disabled = i === 0; dn.disabled = i === s.order.length - 1;
        up.setAttribute("aria-label", "Move " + name + " up"); dn.setAttribute("aria-label", "Move " + name + " down");
        up.onclick = () => { [s.order[i - 1], s.order[i]] = [s.order[i], s.order[i - 1]]; lsRender(); };
        dn.onclick = () => { [s.order[i + 1], s.order[i]] = [s.order[i], s.order[i + 1]]; lsRender(); };
        row.append(up, dn);
      }
      sec.append(row);
    });
    form.append(sec);
  }
  $("#lsSave").disabled = !lsDirty() || lsBusy; $("#lsSave").textContent = lsBusy ? "Saving…" : "Save Changes";
  $("#lsMsg").textContent = lsDirty() ? "You have unsaved changes." : "";
  $("#lsBar").hidden = !(lsDirty() || lsBusy || $("#lsMsg").textContent);
  window.scrollTo(0, keep);
}

async function lsSave(){
  if(!lset || lsBusy || !lsDirty()) return;
  lsBusy = true; lsRender();
  try{
    for(const t of ["anime", "manga"]) for(const name of lset.removed[t]){
      const r = await gql(LS_DEL_Q, { n: name, t: t.toUpperCase() });
      if(r.json.errors) throw new Error("Couldn't delete the list " + name + ": " + r.json.errors[0].message);
    }
    const opt = o => ({ sectionOrder: o.order, splitCompletedSectionByFormat: o.split, customLists: o.custom, advancedScoring: o.adv, advancedScoringEnabled: o.advOn });
    const da = LS_ACT.map(([type]) => ({ type, disabled: !!lset.act[type] }));   // AniList replaces the whole list, so all six are sent
    const { json } = await gql(LS_SAVE_Q, { sf: lset.score, ro: lset.row, al: opt(lset.anime), ml: opt(lset.manga), da });
    if(json.errors) throw new Error(json.errors[0].message);
    try{ localStorage.setItem("wn_scorefmt", lset.score); }catch(_){}
    LOPT = null; mcache.clear();
    if(typeof invalidateLists === "function") invalidateLists();
    if(lists[curType] && lists[curType].entries) renderList();
    lsBusy = false; await lsLoad(true, true); toast("List settings saved");
  }catch(err){
    lsBusy = false; lsRender();
    $("#lsMsg").textContent = "Couldn't save: " + (/Failed to fetch|NetworkError|Load failed/i.test(err.message) ? "no connection." : err.message);
  }
}
$("#lsSave").onclick = lsSave;
