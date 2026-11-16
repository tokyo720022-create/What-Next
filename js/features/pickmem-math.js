/* js/features/pickmem-math.js: the maths of Pick Memory. No screen or storage code, so it can be unit tested.
   Pick Memory remembers what you like and dislike about the titles Pick suggests, as small weights on traits (genres, length, era, country of origin),
   and turns them into a capped bonus added to Pick's usual score. It has two layers: what it learned by itself, and what you set by hand (Favour or Mute), which wins. */
const PM_CAP = 25;                    // the bonus is at most this many points; Pick's own score runs from about 100 to 180
const PM_HALF = 90 * 86400;           // a learned preference loses half its strength in 90 days without new reactions
const PM_ETA = 0.25;                  // how far one reaction moves a trait (a quarter of the way to like or dislike)
const PM_MIN_N = 3;                   // a trait needs about 3 reactions before it counts in full
const PM_FAM = { genre: 1, len: 0.6, era: 0.5, from: 0.5 };   // how much each kind of trait counts
const PM_EXPLORE = 0.15;              // about 1 pick in 7 is a deliberate change of pace
const PM_COUNTRY = { JP: "Japanese", KR: "Korean", CN: "Chinese", TW: "Taiwanese" };
const pmClamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const pmEmpty = () => ({ v: 1, on: true, learn: true, boot: { anime: false, manga: false }, react: { anime: 0, manga: 0 }, anime: {}, manga: {} });

// Short, medium or long: episodes for anime, chapters for manga. One-shots and unknown lengths say nothing.
function pmLen(m, type){
  const n = type === "manga" ? m.chapters : m.episodes;
  if(!(n > 1)) return null;
  return type === "manga" ? (n <= 40 ? "short" : n <= 150 ? "mid" : "long") : (n <= 13 ? "short" : n <= 26 ? "mid" : "long");
}
// The traits of a title that Pick Memory learns about.
function pmTraits(m, type){
  const out = [];
  for(const g of (m.genres || [])) if(g) out.push({ key: "genre:" + g, fam: "genre" });
  const l = pmLen(m, type); if(l) out.push({ key: "len:" + l, fam: "len" });
  const y = m.startDate && m.startDate.year; if(y > 1900) out.push({ key: "era:" + Math.floor(y / 10) * 10, fam: "era" });
  if(m.countryOfOrigin) out.push({ key: "from:" + m.countryOfOrigin, fam: "from" });
  return out;
}
// A trait in words, for the "why" chips and notes.
function pmLabel(key, type){
  const [k, v] = [key.slice(0, key.indexOf(":")), key.slice(key.indexOf(":") + 1)], thing = type === "manga" ? "manga" : "anime";
  if(k === "genre") return v;
  if(k === "len") return v === "short" ? "short series" : v === "long" ? "long-running " + thing : "mid-length " + thing;
  if(k === "era") return "the " + v + "s";
  return (PM_COUNTRY[v] || v) + " " + thing;
}
// How strongly a trait counts right now: your own setting wins; otherwise what was learned, faded by age and held back until there are enough reactions.
function pmEff(rec, now){
  if(!rec) return 0;
  if(rec.m) return rec.m * 0.8;
  const age = Math.max(0, now - (rec.t || now));
  return (rec.v || 0) * Math.pow(0.5, age / PM_HALF) * Math.min(1, (rec.n || 0) / PM_MIN_N);
}
// The points added to Pick's score for this title.
function pmBonus(mem, type, m, now){
  if(!mem || !mem.on) return 0;
  let s = 0; const book = mem[type] || {};
  for(const t of pmTraits(m, type)) s += PM_FAM[t.fam] * pmEff(book[t.key], now);
  return PM_CAP * Math.tanh(s / 1.5);
}

// One reaction: target +1 (liked) or -1 (did not like). skip: trait keys that must not learn (a genre you filtered on says nothing about taste).
// Returns the new memory, what changed (for undo) and the trait that moved most.
function pmLearn(mem, type, m, target, strength, now, skip){
  const next = JSON.parse(JSON.stringify(mem)), book = next[type] || (next[type] = {}), changes = []; let top = null;
  for(const t of pmTraits(m, type)){
    if(skip && skip.has(t.key)) continue;
    const prev = book[t.key] ? Object.assign({}, book[t.key]) : null, cur = prev || { v: 0, n: 0, t: now };
    const faded = cur.v * Math.pow(0.5, Math.max(0, now - (cur.t || now)) / PM_HALF);   // fade the old value first, then move it
    const move = PM_ETA * PM_FAM[t.fam] * (strength || 1), nv = pmClamp(faded + move * (target - faded), -1, 1);
    book[t.key] = Object.assign({}, cur, { v: nv, n: (cur.n || 0) + 1, t: now });
    changes.push({ key: t.key, prev });
    const d = Math.abs(nv - faded) * PM_FAM[t.fam]; if(!top || d > top.d) top = { key: t.key, d };
  }
  if(changes.length) next.react[type] = (next.react[type] || 0) + 1;
  return { mem: next, changes, top: top && top.key, up: target > 0 };
}
function pmUndo(mem, type, changes){
  const next = JSON.parse(JSON.stringify(mem)), book = next[type] || (next[type] = {});
  for(const c of changes){ if(c.prev) book[c.key] = c.prev; else delete book[c.key]; }
  if(changes.length) next.react[type] = Math.max(0, (next.react[type] || 0) - 1);
  return next;
}
// Starting from your list, so there is no cold start: scores above your own average lift a trait, drops lower it. entries: your finished, current, paused and dropped titles.
function pmBoot(mem, type, entries, now){
  const sig = e => e.score > 0 ? null : e.status === "DROPPED" ? -0.6 : e.status === "COMPLETED" ? 0.25 : e.status === "PAUSED" ? -0.1 : 0.15;
  const rated = entries.filter(e => e.score > 0), avg = rated.length ? rated.reduce((s, e) => s + e.score / 10, 0) / rated.length : 0;
  const val = e => (e.score > 0 ? pmClamp((e.score / 10 - avg) / 2.5, -1, 1) : sig(e));
  const rows = entries.filter(e => e.media), sums = new Map(); let total = 0;
  for(const e of rows){ const x = val(e); total += x; for(const t of pmTraits(e.media, type)){ const r = sums.get(t.key) || { s: 0, n: 0 }; r.s += x; r.n++; sums.set(t.key, r); } }
  const global = rows.length ? total / rows.length : 0, next = JSON.parse(JSON.stringify(mem)), book = next[type] || (next[type] = {});
  for(const [key, r] of sums){
    if(r.n < 2 || (book[key] && book[key].n)) continue;   // too few titles to say anything, or you already reacted to it
    const v = pmClamp((r.s / r.n - global) * 1.2, -0.8, 0.8);
    if(Math.abs(v) >= 0.05) book[key] = { v, n: Math.round(Math.min(r.n, 12) / 2), t: now, boot: true };
  }
  next.boot[type] = true; return next;
}
// A title the person asked not to see again today. The map is { id: "YYYY-MM-DD" } of the day it was set aside.
const pmDay = now => { const d = new Date(now * 1000); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
const pmSnoozed = (map, id, day) => map && map[id] === day;
function pmSnoozeAdd(map, id, day){ const out = {}; for(const k in map || {}) if(map[k] === day) out[k] = map[k]; out[id] = day; return out; }   // older days fall away
// Every so often show something outside the usual: returns the index of the pick to show, or 0 (the best one).
function pmExploreIndex(len, rnd, on){
  if(!on || len < 4 || rnd() >= PM_EXPLORE) return 0;
  return 1 + Math.floor(rnd() * Math.min(4, len - 1));
}
// Up to three short reasons for a pick, from the real parts of its score.
function pmWhy(mem, type, e, p, ctx, now){
  const m = e.media, out = [], book = (mem && mem.on && mem[type]) || {}, minutes = p && p.minutes;
  if(ctx.explore) out.push("A change of pace");
  const liked = pmTraits(m, type).map(t => ({ key: t.key, eff: pmEff(book[t.key], now) * PM_FAM[t.fam] })).filter(x => x.eff >= 0.3).sort((a, b) => b.eff - a.eff).slice(0, 2);
  for(const l of liked) out.push("You like " + pmLabel(l.key, type));
  if(e.status === "CURRENT" && p && p.progress) out.push("You're " + (type === "manga" ? "at chapter " : "at episode ") + p.progress);
  else if(e.status === "PLANNING") out.push("On your Planning list");
  else if(e.status === "REPEATING") out.push("A rewatch you started");
  if(m.status === "RELEASING" && m.type !== "MANGA") out.push("Airing now");
  if(minutes && ctx.time && minutes <= ctx.time) out.push("Fits your " + (ctx.time >= 60 ? ctx.time / 60 + " h" : ctx.time + " min"));
  if(m.averageScore >= 80) out.push("Highly rated (" + m.averageScore + "%)");
  return out.slice(0, 3);
}
