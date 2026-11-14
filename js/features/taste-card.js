/* js/features/taste-card.js: lays out the shareable taste report picture (1080 pixels wide) as a list of drawing commands.
   No screen code and no canvas here: the sizes of text come in through opt.measure(text, size, weight), so the layout can be tested.
   Commands: rect {x,y,w,h,r,f,s,sw}, circ {x,y,r,f}, text {s,x,y,size,w,c,a,ls}, img {u,x,y,w,h,r,fb}. A fill of "grad" is the accent gradient. */
const TC_W = 1080, TC_M = 56, TC_COL = 473, TC_GUT = 21, TC_PAD = 24;
const TC_C = { bg: "#0b0b10", card: "#15151b", track: "#262630", line: "#33333f", ink: "#ffffff", soft: "#cfcfd8", mute: "#8e8e9a", dark: "#0b0b10", chip: "#23232b" };

function tcPlan(rep, who, opt){
  const M = opt.measure, acc = opt.acc || "#8B7CFF", cmds = [], urls = new Set(), kind = rep.type === "manga" ? "manga" : "anime", ex = rep.extra || null;
  const rect = (x, y, w, h, r, f, s, sw) => { const c = { t: "rect", x, y, w, h, r: r || 0, f: f || null, s: s || null, sw: sw || 0 }; cmds.push(c); return c; };
  const text = (s, x, y, size, w, c, a, ls) => cmds.push({ t: "text", s: String(s), x, y, size, w, c, a: a || "left", ls: ls || 0 });
  const img = (u, x, y, w, h, r, fb) => { if(u) urls.add(u); cmds.push({ t: "img", u: u || "", x, y, w, h, r, fb: (fb || "").slice(0, 1).toUpperCase() }); };
  const fit = (s, size, w, maxW) => { s = String(s); if(M(s, size, w) <= maxW) return s; while(s.length > 1 && M(s + "…", size, w) > maxW) s = s.slice(0, -1); return s.trimEnd() + "…"; };
  const wrap = (s, size, w, maxW, maxLines) => {
    const words = String(s).split(/\s+/).filter(Boolean), lines = []; let cur = "";
    for(const wd of words){
      const t = cur ? cur + " " + wd : wd;
      if(M(t, size, w) <= maxW || !cur) cur = t; else { lines.push(cur); cur = wd; }
    }
    if(cur) lines.push(cur);
    if(lines.length > maxLines){ const rest = lines.slice(maxLines - 1).join(" "); lines.length = maxLines - 1; lines.push(fit(rest, size, w, maxW)); }
    return lines.map(l => M(l, size, w) > maxW ? fit(l, size, w, maxW) : l);
  };
  const label = (s, x, y) => text(s.toUpperCase(), x, y, 20, 700, TC_C.mute, "left", 1.5);

  const bgCmd = rect(0, 0, TC_W, 0, 0, TC_C.bg);   // the height is set at the end

  // ---- header
  img(who.avatar, TC_M, 64, 72, 72, 18, who.name);
  text(fit(who.name || "", 34, 700, 560), 148, 112, 34, 700, TC_C.ink);
  text("What Next?", TC_W - TC_M, 114, 40, 800, TC_C.ink, "right");
  text("YOUR " + kind.toUpperCase() + " TASTE", TC_M, 214, 22, 600, TC_C.mute, "left", 2);
  let tsize = 58, tl = wrap(rep.arch.name, tsize, 800, 740, 3);
  if(tl.length > 2){ tsize = 48; tl = wrap(rep.arch.name, tsize, 800, 740, 3); }
  let ty = 214 + tsize + 14;   // baseline of the first title line
  for(let k = 0; k < tl.length; k++){ text(tl[k], TC_M, ty, tsize, 800, TC_C.ink); if(k < tl.length - 1) ty += tsize + 8; }
  const aline = wrap(rep.arch.line, 26, 500, 740, 2);
  ty += 54; for(const l of aline){ text(l, TC_M, ty, 26, 500, TC_C.mute); ty += 34; }
  img(who.avatar, 840, 172, 144, 144, 30, who.name);
  const top = Math.max(ty + 20, 360);

  // ---- left column
  const LX = TC_M, RX = TC_M + TC_COL + TC_GUT, IN = TC_COL - 2 * TC_PAD;
  let ly = top;
  // theme index
  {
    const card = rect(LX, ly, TC_COL, 0, 32, TC_C.card); let y = ly + 44;
    label("Theme index", LX + TC_PAD, y); y += 24;
    if(rep.arch.tag){
      rect(LX + TC_PAD, y, IN, 168, 24, null, TC_C.line, 2);
      const bx = LX + TC_PAD + 24, bw = IN - 48 - 118;
      text(fit(rep.arch.tag, 30, 700, bw), bx, y + 56, 30, 700, TC_C.ink);
      const xs = tzX(rep.arch.lift); text(xs, bx, y + 106, 42, 800, acc);
      const xw = M(xs, 42, 800) + 10;
      text("more than", bx + xw, y + 90, 20, 500, TC_C.mute); text("the average fan", bx + xw, y + 116, 20, 500, TC_C.mute);
      const cs = (rep.arch.covers || []).slice(0, 4), gx = LX + TC_PAD + IN - 24 - 112;
      cs.forEach((m, i) => img(m.coverImage && m.coverImage.large, gx + (i % 2) * 58, y + 12 + Math.floor(i / 2) * 78, 54, 72, 8, m.title && (m.title.romaji || "")));
      y += 168 + 12;
    }
    const rows = rep.themes.up.concat(rep.themes.down);
    for(const t of rows){
      text(fit(t.name, 24, 600, 190), LX + TC_PAD, y + 36, 24, 600, TC_C.ink);
      const bx = LX + TC_PAD + 204, bw = 100, up = t.lift >= 1;
      rect(bx, y + 20, bw, 10, 5, TC_C.track); const half = Math.round(tzMag(t.lift) * bw / 2);
      if(half > 0) rect(up ? bx + bw / 2 : bx + bw / 2 - half, y + 20, half, 10, 5, up ? acc : TC_C.mute);
      rect(bx + bw / 2 - 1, y + 16, 2, 18, 1, TC_C.mute);
      text(tzX(t.lift), LX + TC_PAD + IN, y + 36, 24, 800, up ? acc : TC_C.mute, "right");
      y += 50;
    }
    card.h = y - ly + 22; ly += card.h + TC_GUT;
  }
  // vibe
  {
    const card = rect(LX, ly, TC_COL, 0, 32, TC_C.card); let y = ly + 44;
    label("Your vibe", LX + TC_PAD, y); y += 22;
    for(const v of rep.vibes){
      const on = Math.abs(v.pos - 0.5) < 0.04 ? -1 : v.pos < 0.5 ? 0 : 1, hw = IN / 2;
      rect(LX + TC_PAD, y, IN, 48, 24, TC_C.track);
      if(on >= 0) rect(LX + TC_PAD + on * hw + 3, y + 3, hw - 6, 42, 21, "grad");
      text(v.left.name, LX + TC_PAD + hw / 2, y + 32, 22, on === 0 ? 800 : 600, on === 0 ? TC_C.dark : TC_C.mute, "center");
      text(v.right.name, LX + TC_PAD + hw * 1.5, y + 32, 22, on === 1 ? 800 : 600, on === 1 ? TC_C.dark : TC_C.mute, "center");
      y += 58;
    }
    card.h = y - ly + 14; ly += card.h + TC_GUT;
  }
  // what your list says
  if(ex && ex.lines && ex.lines.length){
    const card = rect(LX, ly, TC_COL, 0, 32, TC_C.card); let y = ly + 44;
    label("On your list", LX + TC_PAD, y); y += 16;
    for(const ln of ex.lines.slice(0, 4)){
      const hl = wrap(ln.head, 23, 700, IN, 2), bl = wrap(ln.body, 20, 400, IN, 2);
      y += 14; for(const l of hl){ y += 28; text(l, LX + TC_PAD, y, 23, 700, TC_C.ink); }
      for(const l of bl){ y += 26; text(l, LX + TC_PAD, y, 20, 400, TC_C.mute); }
      y += 10;
    }
    if(ex.confidence){ y += 22; text("Based on " + rep.n + " titles (" + rep.scored + " rated) · " + ex.confidence.level + " confidence", LX + TC_PAD, y, 19, 500, TC_C.mute); }
    card.h = y - ly + 24; ly += card.h;
  }

  // ---- right column
  let ry = top;
  {
    const card = rect(RX, ry, TC_COL + 1, 0, 32, TC_C.card); let y = ry + 44;
    const nm = rep.typeName.replace(/^The /, "The ").toUpperCase();
    label(fit(nm, 20, 700, 300), RX + TC_PAD, y);
    const cw = M(rep.code, 22, 800) + 28; rect(RX + TC_COL + 1 - TC_PAD - cw, y - 28, cw, 40, 12, TC_C.ink); text(rep.code, RX + TC_COL + 1 - TC_PAD - cw / 2, y, 22, 800, TC_C.dark, "center");
    y += 18; for(const l of wrap(rep.typeLine, 22, 400, IN, 3)){ y += 30; text(l, RX + TC_PAD, y, 22, 400, TC_C.soft); }
    y += 22;
    rep.axes.forEach((a, i) => {
      const lean = a.known ? (a.pos < 0.5 ? 0 : 1) : -1, x0 = RX + TC_PAD, x1 = RX + TC_PAD + IN;
      const side = (s, which) => {
        const on = lean === which, left = which === 0, nmx = M(s.name, 26, on ? 800 : 500);
        if(on){
          const bx = left ? x0 : x1 - 38; rect(bx, y, 38, 38, 11, TC_C.ink); text(s.letter, bx + 19, y + 28, 24, 800, TC_C.dark, "center");
          text(s.name, left ? x0 + 50 : x1 - 50, y + 30, 26, 800, TC_C.ink, left ? "left" : "right");
        }else text(s.name, left ? x0 : x1, y + 30, 26, 500, TC_C.mute, left ? "left" : "right");
        return nmx;
      };
      side(a.left, 0); side(a.right, 1);
      const ty2 = y + 62; rect(x0, ty2, IN, 10, 5, TC_C.track);
      if(a.known){
        const cx = x0 + IN / 2, px = x0 + a.pos * IN, fx = Math.min(cx, px), fw = Math.abs(px - cx);
        if(fw > 1) rect(fx, ty2, fw, 10, 5, acc);
        cmds.push({ t: "circ", x: px, y: ty2 + 5, r: 13, f: acc });
      }
      rect(x0 + IN / 2 - 1, ty2 - 5, 2, 20, 1, TC_C.mute);
      y = ty2 + 50;
      const cap = a.known ? (a.pos < 0.5 ? a.capL : a.capR).replace("{kind}", kind) : "Rate at least " + TZ_MIN_SCORED + " titles to sharpen this one.";
      for(const l of wrap(cap, 20, 400, IN, 2)){ text(l, x0, y, 20, 400, TC_C.mute); y += 26; }
      y += 8;
      const covers = (list, labelOf) => {
        const n = Math.min(4, list.length); if(!n) return;
        for(let k = 0; k < n; k++){
          const cx = x0 + k * 100, m = list[k].m;
          img(m.coverImage && m.coverImage.large, cx, y, 90, 126, 12, m.title && (m.title.romaji || ""));
          const lb = labelOf(list[k]); if(lb){ const lw = M(lb, 15, 700) + 14; rect(cx + 45 - lw / 2, y + 126 - 26, lw, 22, 11, "rgba(0,0,0,0.72)"); text(lb, cx + 45, y + 126 - 10, 15, 700, TC_C.ink, "center"); }
        }
        y += 126 + 18;
      };
      if(i === 0 && lean === 0) covers(rep.gems, g => g.label);
      if(i === 1) covers(rep.years, g => g.label);
      if(i === 2){
        let cx = x0, cy = y; const names = (rep.genres.names || rep.genres.bars.filter(b => b.name !== "Others").map(b => b.name)).slice(0, 8);
        for(const g of names){
          const w = M(g, 20, 700) + 34; if(cx + w > x1){ cx = x0; cy += 48; }
          rect(cx, cy, w, 38, 19, TC_C.chip); text(g, cx + w / 2, cy + 27, 20, 700, TC_C.ink, "center"); cx += w + 10;
        }
        y = cy + 38 + 18;
      }
      if(i === 3 && a.known && rep.gaps.length){
        for(const g of rep.gaps){
          img(g.m.coverImage && g.m.coverImage.large, x0, y, 42, 58, 8, g.m.title && (g.m.title.romaji || ""));
          const nameW = IN - 42 - 14 - 90;
          text(fit(tt(g.m), 21, 700, nameW), x0 + 56, y + 24, 21, 700, TC_C.ink);
          text("You " + g.you.toFixed(1) + " · Fans " + g.fans.toFixed(1), x0 + 56, y + 50, 19, 400, TC_C.mute);
          text((g.diff > 0 ? "+" : "−") + Math.abs(g.diff).toFixed(1), x1, y + 36, 26, 800, g.diff > 0 ? "#3ddc97" : acc, "right");
          y += 68;
        }
        y += 6;
      }
      y += 14;
    });
    card.h = y - ry + 8; ry += card.h;
  }

  // ---- footer
  const fy = Math.max(ly, ry) + 64;
  text(fit("anilist.co/user/" + (who.name || ""), 24, 500, 520), TC_M, fy, 24, 500, TC_C.mute);
  text("Made with What Next?", TC_W - TC_M, fy, 24, 500, TC_C.mute, "right");
  const H = fy + 56; bgCmd.h = H;
  return { w: TC_W, h: H, cmds, urls: [...urls] };
}
