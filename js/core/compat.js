/* js/core/compat.js: small fallbacks for older Android WebViews */
if(!Element.prototype.replaceChildren){
  Element.prototype.replaceChildren = function(...nodes){ while(this.firstChild) this.removeChild(this.firstChild); this.append(...nodes); };
}

// "The phone has no room left": say so, but not more than once a minute (used when a save to phone storage fails).
let storageWarnAt = 0;
function warnStorage(what){ if(Date.now() - storageWarnAt < 60000 || typeof toast !== "function") return; storageWarnAt = Date.now(); toast("The phone has no room left to save " + (what || "settings") + "."); }

// Small helpers used by several screens.
const sleep = ms => new Promise(r => setTimeout(r, ms));
const titleCase = x => String(x).replace(/\w\S*/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase());

// One way to tell "couldn't reach AniList" from a real answer, used everywhere. gql() marks its own network and server-trouble errors with .net.
const isNetErr = e => !!e && (e.net === true || /Failed to fetch|NetworkError|Load failed|Network request failed|network|timed out|took too long/i.test(e.message || ""));
// The logo screen waits for this (see boot.js), so the first screen is ready underneath it.
const readyNow = () => { try{ if(window.__wnReady) window.__wnReady(); }catch(_){} };
