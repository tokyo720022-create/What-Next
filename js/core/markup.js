/* js/core/markup.js: AniList text (descriptions, bios) shown safely, with spoilers you tap to reveal.
   Everything is built with createElement and text nodes, never innerHTML, so text from AniList can't inject anything.
   Spoilers use AniList's ~!hidden text!~ tag. A spoiler can sit inside a line (inline) or cover several lines (block),
   can hold Markdown (bold, italic, strike, code, links), and spoilers can be nested.
   The one place that reads a spoiler's inside is spoilerParts(): if AniList's tag labels need a different format, change only that. */
const SPOILER_DEPTH = 4;

// Split text into plain parts and ~!spoiler!~ parts. Nested spoilers stay inside their outer one. A tag that never closes is plain text.
function splitSpoilers(s){
  const out = []; let buf = "", i = 0;
  while(i < s.length){
    if(s.startsWith("~!", i)){
      let d = 1, j = i + 2;
      while(j < s.length && d > 0){ if(s.startsWith("~!", j)){ d++; j += 2; } else if(s.startsWith("!~", j)){ d--; j += 2; } else j++; }
      if(d === 0){ if(buf){ out.push({ sp: false, text: buf }); buf = ""; } out.push({ sp: true, text: s.slice(i + 2, j - 2) }); i = j; continue; }
    }
    buf += s[i]; i++;
  }
  if(buf) out.push({ sp: false, text: buf });
  return out;
}
// What is inside a spoiler tag: an optional label and the hidden text.
function spoilerParts(inner){ return { label: "", body: inner }; }

const MD_RE = /\*\*([^*\n][\s\S]*?)\*\*|__([^_\n][\s\S]*?)__|\*(?=\S)([^*\n]*?\S)\*|_(?=\S)([^_\n]*?\S)_|~~([^~\n][\s\S]*?)~~|`([^`\n]+)`|\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>"')\]]+)/g;
const isWordCh = c => !!c && /\w/.test(c);
function inlineMd(text, parent){
  const re = new RegExp(MD_RE.source, "g"); let last = 0, m;
  const add = (tag, s) => { const e = document.createElement(tag); inlineMd(s, e); parent.append(e); };
  while((m = re.exec(text))){
    const all = m[0], before = text[m.index - 1], after = text[m.index + all.length];
    if((m[4] != null && (isWordCh(before) || isWordCh(after))) || (m[3] != null && (isWordCh(before) || after === "*"))){ re.lastIndex = m.index + 1; continue; }   // snake_case and 2*3*4 stay as they are
    if(m.index > last) parent.append(text.slice(last, m.index));
    if(m[1] != null) add("strong", m[1]); else if(m[2] != null) add("strong", m[2]);
    else if(m[3] != null) add("em", m[3]); else if(m[4] != null) add("em", m[4]);
    else if(m[5] != null) add("s", m[5]);
    else if(m[6] != null){ const c = document.createElement("code"); c.textContent = m[6]; parent.append(c); }
    else{
      const url = m[8] || m[9], a = document.createElement("a"); a.href = url; a.rel = "noopener"; a.textContent = m[7] || url;
      a.onclick = ev => { ev.preventDefault(); ev.stopPropagation(); if(typeof openExternal === "function") openExternal(url); };
      parent.append(a);
    }
    last = m.index + all.length;
  }
  if(last < text.length) parent.append(text.slice(last));
}

function splToggle(node){
  const on = node.classList.toggle("on");
  node.setAttribute("aria-expanded", String(on));
  node.setAttribute("aria-label", on ? "Spoiler, tap to hide" : "Spoiler, tap to show");
  if(node.classList.contains("splb")){ const b = node.querySelector(":scope > .splbody"), h = node.querySelector(":scope > .splhead"); if(b) b.hidden = !on; if(h) h.textContent = on ? "Hide spoiler" : (node.dataset.label || "Spoiler") + " · tap to show"; }
}
function spoilerNode(inner, depth){
  const { label, body } = spoilerParts(inner), text = body.replace(/^\n+|\n+$/g, "");
  if(!/\n/.test(text)){   // inline spoiler: hidden words inside a line
    const n = document.createElement("span"); n.className = "spl"; n.setAttribute("role", "button"); n.tabIndex = 0;
    n.setAttribute("aria-expanded", "false"); n.setAttribute("aria-label", "Spoiler, tap to show");
    if(label) n.title = label;
    renderSegments(text, n, depth + 1);
    n.addEventListener("click", ev => { if(ev.target.closest && ev.target.closest("a") && n.classList.contains("on")) return; ev.preventDefault(); ev.stopPropagation(); splToggle(n); });
    n.addEventListener("keydown", ev => { if(ev.key === "Enter" || ev.key === " "){ ev.preventDefault(); splToggle(n); } });
    return n;
  }
  const box = document.createElement("span"); box.className = "splb"; box.dataset.label = label || "Spoiler";   // block spoiler: a box that opens
  const head = document.createElement("button"); head.type = "button"; head.className = "splhead"; head.textContent = box.dataset.label + " · tap to show";
  const inside = document.createElement("span"); inside.className = "splbody"; inside.hidden = true;
  renderSegments(text, inside, depth + 1);
  head.onclick = ev => { ev.stopPropagation(); splToggle(box); };
  box.append(head, inside); box.setAttribute("aria-expanded", "false");
  return box;
}
function renderSegments(t, parent, depth){
  for(const seg of splitSpoilers(t)){
    if(!seg.sp || depth >= SPOILER_DEPTH){ inlineMd(seg.sp ? seg.text : seg.text, parent); continue; }
    parent.append(spoilerNode(seg.text, depth));
  }
}
// AniList's own text -> plain text with the HTML it sometimes carries turned into Markdown, ready to render.
function mdPrep(raw){
  return String(raw || "")
    .replace(/<br\s*\/?>/gi, "\n").replace(/<\/?(?:b|strong)>/gi, "**").replace(/<\/?(?:i|em)>/gi, "*").replace(/<\/?(?:s|del|strike)>/gi, "~~")
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"').replace(/&#0?39;|&rsquo;/g, "'").replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
    .replace(/\b(?:img|webm|youtube)\d*%?\s*\([^)]*\)/gi, "")   // embedded pictures and videos
    .replace(/^#{1,6}\s*/gm, "").replace(/\n{3,}/g, "\n\n").trim();
}
function richText(raw){
  const frag = document.createDocumentFragment();
  renderSegments(mdPrep(raw), frag, 0);
  return frag;
}
// One short line of plain text for cards: spoilers are not shown (they become "[spoiler]") and Markdown marks are removed.
function plainText(raw){
  return splitSpoilers(mdPrep(raw)).map(s => s.sp ? "[spoiler]" : s.text).join("")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\*\*|__|~~/g, "").replace(/\s+/g, " ").trim();
}
