/* js/features/taste-share.js: turns the taste report into a picture (layout in taste-card.js) and lets you share, copy or save it.
   On the phone the native WnImage add-on does the sharing, copying and saving. Without it, the web view's own share, clipboard and download are tried. */
const TS_FONT = '"Roboto","Inter","Segoe UI",system-ui,sans-serif';
const ts = { blob: null, url: "", busy: false, who: null, rep: null };

// A cover is loaded so that it can be drawn without "tainting" the canvas. If AniList's picture server refuses that, the phone's own HTTP client fetches it as data.
function tsLoadImg(url){
  const load = src => new Promise(res => {
    const i = new Image(), t = setTimeout(() => res(null), 9000);
    i.crossOrigin = "anonymous"; i.onload = () => { clearTimeout(t); res(i); }; i.onerror = () => { clearTimeout(t); res(null); }; i.src = src;
  });
  return load(url).then(async img => {
    if(img || !isNative) return img;
    const H = nativePlugin("CapacitorHttp");
    if(!H || typeof H.get !== "function") return null;
    try{ const r = await H.get({ url, responseType: "blob" }); return r && typeof r.data === "string" && r.status === 200 ? await load("data:image/jpeg;base64," + r.data) : null; }catch(_){ return null; }
  });
}
async function tsWho(){
  if(ts.who && ts.who.name === state.user) return ts.who;
  let avatar = "";
  try{ const { json } = await gql("query{Viewer{name avatar{large}}}", {}), v = json.data && json.data.Viewer; avatar = (v && v.avatar && safeUrl(v.avatar.large)) || ""; }catch(_){}
  ts.who = { name: state.user || "", avatar };
  return ts.who;
}
function tsRound(g, x, y, w, h, r){
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function tsPaint(plan, imgs, acc, acc2){
  const c = document.createElement("canvas"); c.width = plan.w; c.height = plan.h;
  const g = c.getContext("2d");
  const fill = (f, x, w) => { if(f === "grad"){ const gr = g.createLinearGradient(x, 0, x + w, 0); gr.addColorStop(0, acc); gr.addColorStop(1, acc2); return gr; } return f; };
  for(const k of plan.cmds){
    if(k.t === "rect"){
      tsRound(g, k.x, k.y, k.w, k.h, k.r);
      if(k.f){ g.fillStyle = fill(k.f, k.x, k.w); g.fill(); }
      if(k.s){ g.lineWidth = k.sw || 1; g.strokeStyle = k.s; g.stroke(); }
    }else if(k.t === "circ"){
      g.beginPath(); g.arc(k.x, k.y, k.r, 0, Math.PI * 2); g.fillStyle = k.f; g.fill();
    }else if(k.t === "img"){
      const im = imgs.get(k.u);
      g.save(); tsRound(g, k.x, k.y, k.w, k.h, k.r); g.clip();
      if(im && im.naturalWidth){
        const s = Math.max(k.w / im.naturalWidth, k.h / im.naturalHeight), dw = im.naturalWidth * s, dh = im.naturalHeight * s;
        g.drawImage(im, k.x + (k.w - dw) / 2, k.y + (k.h - dh) / 2, dw, dh);
      }else{
        g.fillStyle = "#2c2850"; g.fillRect(k.x, k.y, k.w, k.h);
        g.fillStyle = "#ffffff"; g.font = "700 " + Math.round(k.h * 0.4) + "px " + TS_FONT; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(k.fb || "", k.x + k.w / 2, k.y + k.h / 2);
      }
      g.restore();
    }else if(k.t === "text"){
      g.font = k.w + " " + k.size + "px " + TS_FONT; g.fillStyle = k.c; g.textAlign = k.a; g.textBaseline = "alphabetic";
      if("letterSpacing" in g) /** @type {any} */ (g).letterSpacing = (k.ls || 0) + "px";
      g.fillText(k.s, k.x, k.y);
    }
  }
  return c;
}
async function tsMake(rep){
  const g0 = document.createElement("canvas").getContext("2d");
  const measure = (s, size, w) => { g0.font = w + " " + size + "px " + TS_FONT; return g0.measureText(s).width; };
  const css = getComputedStyle(document.documentElement).getPropertyValue("--sakura").trim(), acc = /^#[0-9a-f]{6}$/i.test(css) ? css : "#8B7CFF", acc2 = "#4FD1C5";
  const who = await tsWho(), plan = tcPlan(rep, who, { measure, acc }), imgs = new Map();
  await Promise.all(plan.urls.map(async u => { imgs.set(u, await tsLoadImg(u)); }));
  const canvas = tsPaint(plan, imgs, acc, acc2);
  const blob = await new Promise(res => canvas.toBlob(res, "image/png"));
  if(!blob) throw new Error("The picture could not be made.");
  return blob;
}
const tsB64 = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1] || ""); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
async function tsNative(method, args){
  const P = isNative ? nativePlugin("WnImage") : null;
  if(!P || typeof P[method] !== "function") return false;
  try{ await P[method](args); return true; }catch(_){ return false; }
}

// ---------- the sheet: Share image / Copy image / Save image ----------
function tsClose(){ $("#tzShare").hidden = true; }
async function tsOpen(rep){
  if(ts.busy) return;
  ts.busy = true; toast("Making your picture…", 4000);
  try{
    const blob = await tsMake(rep);
    if(ts.url) URL.revokeObjectURL(ts.url);
    ts.blob = blob; ts.url = URL.createObjectURL(blob); ts.rep = rep;
    $("#tzShareImg").src = ts.url; $("#tzShare").hidden = false; $("#tzShareDo").focus();
  }catch(_){
    toast("Couldn't make the picture, so your report is shared as text.");
    tzShareAsText(rep);
  }finally{ ts.busy = false; }
}
async function tsShare(){
  tsClose(); const text = tzShareText(ts.rep);
  if(await tsNative("share", { data: await tsB64(ts.blob), title: "My taste report", text })) return;
  try{
    const file = new File([ts.blob], "what-next-taste.png", { type: "image/png" });
    if(navigator.canShare && navigator.canShare({ files: [file] })){ await navigator.share({ files: [file], text }); return; }
  }catch(e){ if(e && e.name === "AbortError") return; }
  toast("This phone can't share the picture from here. Use Save image, or the text is shared instead."); tzShareAsText(ts.rep);
}
async function tsCopy(){
  tsClose();
  if(await tsNative("copy", { data: await tsB64(ts.blob) })){ toast("Image copied"); return; }
  try{ await navigator.clipboard.write([new ClipboardItem({ "image/png": ts.blob })]); toast("Image copied"); }catch(_){ toast("Couldn't copy the image here. Try Share image or Save image."); }
}
async function tsSave(){
  tsClose();
  if(await tsNative("save", { data: await tsB64(ts.blob), name: "what-next-taste" })){ toast("Saved to Pictures > What Next"); return; }
  if(isNative){ toast("Saving needs the full build of the app. Use Share image, then save from the share menu."); return; }
  const a = document.createElement("a"); a.href = ts.url; a.download = "what-next-taste.png"; document.body.append(a); a.click(); a.remove(); toast("Saved");
}
$("#tzShareDo").onclick = tsShare; $("#tzCopyDo").onclick = tsCopy; $("#tzSaveDo").onclick = tsSave; $("#tzShareX").onclick = tsClose;
$("#tzShare").addEventListener("click", ev => { if(ev.target === $("#tzShare")) tsClose(); });
$("#tzShare").addEventListener("keydown", ev => { if(ev.key === "Escape") tsClose(); });
