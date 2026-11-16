/* js/features/vault-math.js: the maths for keeping Triple Sync's keys, tokens and webhook links apart from the rest of its settings. No screen or storage code, so it can be unit tested.
   The secret parts of the settings go to the phone's encrypted store (vault.js); everything else stays in normal storage. */
// Where the secrets sit in the settings object. client IDs are included: they are not passwords, but nobody else needs to read them either.
const VAULT_PATHS = [["al", "clientId"], ["al", "clientSecret"], ["al", "token"], ["mal", "clientId"], ["mal", "clientSecret"], ["mal", "access"], ["mal", "refresh"], ["mal", "pending"], ["dcUrl"], ["dcAnime"], ["dcManga"]];
const vGet = (o, p) => { let x = o; for(const k of p){ if(x === null || typeof x !== "object") return undefined; x = x[k]; } return x; };
const vEmpty = v => v === undefined || v === null || v === "" || (typeof v === "object" && !Object.keys(v).length);
function vSetPath(o, p, v){ let x = o; for(let i = 0; i < p.length - 1; i++){ if(x[p[i]] === null || typeof x[p[i]] !== "object") x[p[i]] = {}; x = x[p[i]]; } x[p[p.length - 1]] = v; }
function vDelPath(o, p){ let x = o; for(let i = 0; i < p.length - 1; i++){ if(x === null || typeof x !== "object") return; x = x[p[i]]; } if(x && typeof x === "object") delete x[p[p.length - 1]]; }
const vClone = o => JSON.parse(JSON.stringify(o || {}));

// The settings in two parts: pub (safe to keep as normal text) and sec (only the secrets that have a value).
function vSplit(cfg){
  const pub = vClone(cfg), sec = {};
  for(const p of VAULT_PATHS){ const v = vGet(pub, p); if(!vEmpty(v)) vSetPath(sec, p, vClone({ v }).v); vDelPath(pub, p); }
  return { pub, sec };
}
// Puts the secrets back into a settings object (the secret value wins over anything left in pub).
function vMerge(pub, sec){
  const out = vClone(pub);
  for(const p of VAULT_PATHS){ const v = vGet(sec, p); if(!vEmpty(v)) vSetPath(out, p, vClone({ v }).v); }
  return out;
}
// What the screen may show of a saved secret: the last few characters of a key, a short part of a webhook link, never the whole value.
function vMask(v){
  const s = String(v == null ? "" : v);
  if(!s) return "";
  const w = /webhooks\/(\d+)\/([\w-]+)/.exec(s);
  if(w) return "webhook …" + w[2].slice(-4);
  return s.length <= 8 ? "••••" : "••••" + s.slice(-3);
}
// Removes secrets from a piece of text before it is shown, logged or copied: known values, webhook links, bearer tokens and token fields.
function vRedact(text, sec){
  let s = String(text == null ? "" : text);
  const walk = o => { for(const k in o || {}){ const v = o[k]; if(typeof v === "string"){ if(v.length >= 6) s = s.split(v).join("[hidden]"); } else if(v && typeof v === "object") walk(v); } };
  walk(sec);
  return s.replace(/https:\/\/(?:(?:canary|ptb)\.)?discord(?:app)?\.com\/api\/webhooks\/[^\s"'<>]+/gi, "[webhook]")
    .replace(/Bearer\s+[\w.~+\/-]+=*/gi, "Bearer [hidden]")
    .replace(/("?(?:access_token|refresh_token|client_secret|code_verifier)"?\s*[:=]\s*"?)[^"&\s,}]+/gi, "$1[hidden]");
}
// A short fingerprint of a string, so a webhook link never has to be used as a storage key. Not a password hash: it only has to be stable and not reversible by eye.
function vHash(str){
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for(let i = 0; i < str.length; i++){ const c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, "0") + (h1 >>> 0).toString(16).padStart(8, "0");
}
