/* js/features/lock-math.js: the rules of the Triple Sync lock (PIN checks, wrong-guess delays, when to ask again). No screen code, so it can be unit tested. */
const LK_RELOCK = [0, 1, 5, 15];   // minutes away before the lock asks again; 0 = every time the page is opened
// A PIN is 4 to 8 digits and must not be trivial.
function lkPinOk(pin){
  const p = String(pin || "");
  if(!/^\d{4,8}$/.test(p)) return { ok: false, msg: "Use 4 to 8 digits." };
  if(/^(\d)\1+$/.test(p)) return { ok: false, msg: "That PIN is too easy to guess (all the same digit)." };
  const d = [...p].map(Number), step = d[1] - d[0];
  if((step === 1 || step === -1) && d.every((x, i) => i === 0 || x - d[i - 1] === step)) return { ok: false, msg: "That PIN is too easy to guess (a run of digits)." };
  return { ok: true, msg: "" };
}
// Seconds to wait after this many wrong guesses in a row: none for the first four, then 30 s, 1 min, 5 min, 15 min, 1 hour.
const lkDelay = fails => fails < 5 ? 0 : [30, 60, 300, 900, 3600][Math.min(fails - 5, 4)];
const lkWait = (cfg, now) => Math.max(0, Math.ceil(((cfg.until || 0) - now) / 1000));
// Does this scope (the Triple Sync page, or the Import Lists button) need the PIN right now?
function lkNeeded(scope, cfg, st, now){
  if(!cfg.pin) return false;
  if(scope === "import" && !cfg.import) return false;
  if(!st.unlocked) return true;
  if(cfg.relock === 0) return scope === "import" || !st.onPage ? true : false;
  return now - st.last > cfg.relock * 60000;
}
