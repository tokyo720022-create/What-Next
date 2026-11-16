/* js/features/lock.js: a PIN lock (and optionally the phone's fingerprint or screen lock) for the AniList Triple Sync page and the Import Lists button.
   The PIN is never stored: only a salted PBKDF2 hash of it is. Too many wrong tries make the lock wait longer each time. The rules are in lock-math.js.
   This lock keeps other people who pick up your phone out of your keys and your lists. It does not replace the phone's own screen lock. */
const LK_KEY = "wn_lock";
const lk = { unlocked: false, last: 0, onPage: false, hiddenAt: 0, resolve: null, promise: null, mode: "unlock", bioOk: false, screen: false, timer: 0 };
const lkCfg = () => Object.assign({ pin: null, bio: false, relock: 5, import: true, secure: true, fails: 0, until: 0 }, LS(LK_KEY, {}) || {});
const lkSave = patch => LSset(LK_KEY, Object.assign(lkCfg(), patch));
const lkNative = () => (isNative ? nativePlugin("WnLock") : null);

// ---------- the PIN ----------
const lkB64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const lkUnb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function lkHash(pin, salt, iter){
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  return lkB64(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: iter }, key, 256));
}
async function lkMake(pin){ const salt = crypto.getRandomValues(new Uint8Array(16)), iter = 150000; return { v: 1, salt: lkB64(salt), iter, hash: await lkHash(pin, salt, iter) }; }
async function lkCheck(pin, rec){
  if(!rec || !rec.salt) return false;
  const h = await lkHash(pin, lkUnb64(rec.salt), rec.iter || 150000); let d = h.length ^ String(rec.hash).length;
  for(let i = 0; i < h.length; i++) d |= h.charCodeAt(i) ^ String(rec.hash).charCodeAt(i);   // compared in constant time
  return d === 0;
}
const lkFmt = s => s >= 3600 ? Math.ceil(s / 3600) + " h" : s >= 60 ? Math.ceil(s / 60) + " min" : s + " s";

// ---------- the sheet ----------
const lkSetErr = t => { $("#lkErr").textContent = t || ""; };
function lkClose(ok){
  clearInterval(lk.timer); $("#lockSheet").hidden = true; $("#lkPin").value = ""; $("#lkPin2").value = ""; lkSetErr("");
  const r = lk.resolve; lk.resolve = null; lk.promise = null; if(r) r(!!ok);
}
function lkWaitUi(){
  const w = lkWait(lkCfg(), Date.now());
  $("#lkGo").disabled = w > 0;
  if(w > 0) lkSetErr("Too many wrong tries. Try again in " + lkFmt(w) + "."); else if($("#lkErr").textContent.startsWith("Too many")){ lkSetErr(""); clearInterval(lk.timer); }
}
// mode: "unlock" asks for the PIN, "set" asks for a new PIN twice.
function lkOpen(mode, title, msg){
  if(lk.promise) return lk.promise;
  lk.mode = mode; $("#lkTitle").textContent = title; $("#lkMsg").textContent = msg;
  $("#lkPin2").hidden = mode !== "set"; $("#lkForgot").hidden = mode !== "unlock"; $("#lkGo").textContent = mode === "set" ? "Save PIN" : "Unlock";
  $("#lkBio").hidden = !(mode === "unlock" && lk.bioOk && lkCfg().bio);
  $("#lkPin").value = ""; $("#lkPin2").value = ""; lkSetErr(""); $("#lockSheet").hidden = false; $("#lkPin").focus();
  clearInterval(lk.timer); lk.timer = setInterval(lkWaitUi, 1000); lkWaitUi();
  lk.promise = new Promise(res => { lk.resolve = res; });
  if(mode === "unlock" && lk.bioOk && lkCfg().bio) lkBio();
  return lk.promise;
}
function lkDone(){ lk.unlocked = true; lk.last = Date.now(); lkSave({ fails: 0, until: 0 }); lkClose(true); }
async function lkBio(){
  const P = lkNative(); if(!P) return;
  try{ await P.unlock({ title: "Unlock Triple Sync", subtitle: "Use your fingerprint or phone lock" }); lkDone(); }catch(_){ /* cancelled or not possible: the PIN still works */ }
}
async function lkSubmit(){
  const c = lkCfg(), now = Date.now(), pin = $("#lkPin").value;
  if(lkWait(c, now)) return lkWaitUi();
  if(!(typeof crypto !== "undefined" && crypto.subtle)){ lkSetErr("This device can't check a PIN here."); return; }
  if(lk.mode === "set"){
    const v = lkPinOk(pin); if(!v.ok) return lkSetErr(v.msg);
    if(pin !== $("#lkPin2").value) return lkSetErr("The two PINs are not the same.");
    $("#lkGo").disabled = true; lkSave({ pin: await lkMake(pin), fails: 0, until: 0 }); lk.unlocked = true; lk.last = now; $("#lkGo").disabled = false; lkClose(true); return;
  }
  $("#lkGo").disabled = true; const ok = await lkCheck(pin, c.pin); $("#lkGo").disabled = false;
  if(ok) return lkDone();
  const fails = (c.fails || 0) + 1, d = lkDelay(fails);
  lkSave({ fails, until: d ? now + d * 1000 : 0 }); $("#lkPin").value = "";
  lkSetErr(d ? "Wrong PIN. Wait " + lkFmt(d) + " before the next try." : "Wrong PIN. " + (5 - fails) + (5 - fails === 1 ? " try" : " tries") + " left before a pause."); lkWaitUi();
}
$("#lkGo").onclick = lkSubmit;
$("#lkPin").addEventListener("keydown", ev => { if(ev.key === "Enter"){ ev.preventDefault(); if(lk.mode === "set") $("#lkPin2").focus(); else lkSubmit(); } });
$("#lkPin2").addEventListener("keydown", ev => { if(ev.key === "Enter"){ ev.preventDefault(); lkSubmit(); } });
$("#lkBio").onclick = lkBio;
$("#lkCancel").onclick = () => lkClose(false);
$("#lkForgot").onclick = () => {
  const b = $("#lkForgot");
  if(b.dataset.armed !== "1"){ b.dataset.armed = "1"; b.textContent = "Tap again: this erases all Triple Sync keys"; setTimeout(() => { b.dataset.armed = ""; b.textContent = "Forgot the PIN?"; }, 5000); return; }
  b.dataset.armed = ""; b.textContent = "Forgot the PIN?"; lockReset(); lkClose(false);
};
// Forgot the PIN: the only way back in is to erase everything the lock protects, then set up again.
function lockReset(){
  vaultWipe();
  for(const k of [TS_KEY, "wn_ts_threads", "wn_ts_state_anime", "wn_ts_state_manga", "wn_ts_fail_anime", "wn_ts_fail_manga", LK_KEY]) try{ localStorage.removeItem(k); }catch(_){}
  lk.unlocked = false; showTab("settings");
}

// ---------- asking ----------
const lockNeeded = scope => lkNeeded(scope, lkCfg(), lk, Date.now());
function lockAsk(scope){
  if(!lockNeeded(scope)) return Promise.resolve(true);
  return lkOpen("unlock", scope === "import" ? "Confirm it's you" : "Triple Sync is locked", scope === "import" ? "Enter your PIN to open the AniList import page." : "Enter your PIN to see and change your keys, webhooks and sync settings.");
}
// Asks for the PIN even when the lock is open (to change or remove it).
function lockVerify(){ return lkOpen("unlock", "Enter your PIN", "Your current PIN is needed for this change."); }

// ---------- the page: leaving, screenshots, going to the background ----------
function lkScreen(on){
  if(on === lk.screen) return; lk.screen = on;
  const P = lkNative(); if(P && typeof P.secure === "function") try{ P.secure({ on }).catch(() => {}); }catch(_){}
}
function lockPage(t){
  const on = t === "set-sync", was = lk.onPage; lk.onPage = on;
  if(was && !on){ lk.last = Date.now(); if(lkCfg().relock === 0) lk.unlocked = false; }
  lkScreen(on && lkCfg().secure);
}
document.addEventListener("visibilitychange", () => {
  if(document.visibilityState === "hidden"){ lk.hiddenAt = Date.now(); return; }
  const c = lkCfg(); if(!c.pin || !lk.unlocked || !lk.hiddenAt) return;
  if(c.relock === 0 || Date.now() - lk.hiddenAt > c.relock * 60000){
    lk.unlocked = false;
    if(lk.onPage) lockAsk("sync").then(ok => { if(!ok) showTab("settings"); });
  }
});
$("#setSync").addEventListener("pointerdown", () => { lk.last = Date.now(); }, { passive: true });

// ---------- the settings on the Triple Sync page ----------
function lockFill(){
  const c = lkCfg(), on = !!c.pin, P = lkNative();
  $("#lkOn").checked = on; $("#lkOptions").hidden = !on;
  $("#lkRelock").value = String(c.relock); $("#lkImport").checked = !!c.import; $("#lkBioOn").checked = !!c.bio;
  $("#lkBioRow").hidden = !(P && lk.bioOk); $("#lkScreenRow").hidden = !(P && typeof P.secure === "function"); $("#lkScreen").checked = !!c.secure;
  $("#lkState").textContent = on ? "Locked with a PIN" + (c.bio && lk.bioOk ? " or your fingerprint" : "") + ". Opens again " + (c.relock === 0 ? "every time you come back to this page." : "after " + c.relock + (c.relock === 1 ? " minute" : " minutes") + " away.") : "Not locked. Anyone who opens the app can see this page.";
}
$("#lkOn").onchange = async () => {
  if($("#lkOn").checked){ const ok = await lkOpen("set", "Choose a PIN", "4 to 8 digits. It is asked when you open Triple Sync" + (lkCfg().import ? " or Import Lists" : "") + "."); if(!ok) $("#lkOn").checked = false; }
  else if(await lockVerify()){ lkSave({ pin: null, fails: 0, until: 0 }); lk.unlocked = false; } else $("#lkOn").checked = true;
  lockFill();
};
$("#lkChange").onclick = async () => { if(await lockVerify()){ lk.promise = null; await lkOpen("set", "New PIN", "Choose a new PIN (4 to 8 digits)."); } lockFill(); };
$("#lkRelock").onchange = () => { lkSave({ relock: Number($("#lkRelock").value) }); lockFill(); };
$("#lkImport").onchange = () => lkSave({ import: $("#lkImport").checked });
$("#lkBioOn").onchange = () => { lkSave({ bio: $("#lkBioOn").checked }); lockFill(); };
$("#lkScreen").onchange = () => { lkSave({ secure: $("#lkScreen").checked }); lkScreen(lk.onPage && $("#lkScreen").checked); };
(function lkInit(){
  const P = lkNative(); if(!P || typeof P.available !== "function") return;
  try{ P.available().then(r => { lk.bioOk = !!(r && r.available); }).catch(() => {}); }catch(_){}
})();
