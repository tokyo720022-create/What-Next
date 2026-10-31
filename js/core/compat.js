/* js/core/compat.js: small fallbacks for older Android WebViews */
if(!Element.prototype.replaceChildren){
  Element.prototype.replaceChildren = function(...nodes){ while(this.firstChild) this.removeChild(this.firstChild); this.append(...nodes); };
}

// Small helpers used by several screens.
const sleep = ms => new Promise(r => setTimeout(r, ms));
const titleCase = x => String(x).replace(/\w\S*/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase());
