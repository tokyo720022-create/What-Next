/* js/features/vault.js: keeps Triple Sync's client IDs, client secrets, login tokens and Discord webhook links in the phone's encrypted store (the "WnSecure" Kotlin add-on, the same one that holds your AniList login).
   Without the add-on (a browser, or a build that could not add it) nothing changes: they stay in normal storage, and the Triple Sync page says so.
   The rest of the settings stay in normal storage. The split and merge maths is in vault-math.js. */
const VAULT_KEY = "wn_ts_secret";
const vault = { secure: false, ready: false, cache: {}, queue: Promise.resolve(), failed: false };
const vaultStore = () => (typeof secureStore === "function" ? secureStore() : null);
const vaultJson = () => JSON.stringify(vault.cache);

// Called at start (after the login is fetched). Moves secrets left in normal storage into the vault; a plain copy is only removed once the vault reads back correctly.
async function vaultHydrate(){
  const P = vaultStore();
  if(!P){ vault.ready = true; return; }
  try{
    const r = await P.get({ key: VAULT_KEY });
    let blob = {}; if(r && r.value){ try{ blob = JSON.parse(r.value) || {}; }catch(_){ blob = {}; } }
    const { pub, sec } = vSplit(LS(TS_KEY, {}) || {}), merged = vMerge(blob, sec);   // a secret typed before this finished wins over the stored one
    if(!vEmpty(sec)){
      vault.cache = merged;
      await P.set({ key: VAULT_KEY, value: vaultJson() });
      const back = await P.get({ key: VAULT_KEY });
      if(!(back && back.value === vaultJson())) throw new Error("the vault did not read back");
      LSset(TS_KEY, pub);
    }else vault.cache = merged;
    vault.secure = true;
  }catch(_){ vault.secure = false; vault.cache = {}; }   // this phone's store does not work: the plain copy keeps working
  vault.ready = true;
  if(typeof tsFill === "function" && !$("#setSync").hidden){ tsFill(); tsRenderStatus(); }
}
// Every write of the Triple Sync settings goes through here.
function tsWrite(c){
  if(!vault.secure){ LSset(TS_KEY, c); return; }
  const { pub, sec } = vSplit(c); vault.cache = sec; LSset(TS_KEY, pub);
  const P = vaultStore(), value = vaultJson();
  vault.queue = vault.queue.then(() => P.set({ key: VAULT_KEY, value })).catch(() => {
    vault.failed = true; vault.secure = false;   // last resort: put the secrets back in normal storage so nothing is lost
    LSset(TS_KEY, vMerge(LS(TS_KEY, {}) || {}, vault.cache));
  });
}
// Signing out, or resetting Triple Sync: nothing may stay behind.
function vaultWipe(){
  vault.cache = {};
  const P = vaultStore(); if(P){ try{ P.remove({ key: VAULT_KEY }).catch(() => {}); }catch(_){} }
}
const vaultReady = () => (vault.ready ? Promise.resolve() : new Promise(res => { const t = setInterval(() => { if(vault.ready){ clearInterval(t); res(); } }, 50); setTimeout(() => { clearInterval(t); res(); }, 4000); }));
