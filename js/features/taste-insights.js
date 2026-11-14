/* js/features/taste-insights.js: a smarter reading of your list for the taste report. No screen code here, so it can be unit tested.
   It looks at how you rate, finish and drop, which genres you score highest or abandon, how long and how new your titles are, and how your taste has moved lately.
   Every result is left out when the list does not support it (too few titles), so the report never states a guess as a fact. */
const TI_MIN = 4;            // a genre or studio needs at least this many titles before anything is said about it
const TI_LATE = 3;           // "lately" = the last 3 calendar years (this year and the two before)
const tiRound1 = x => Math.round(x * 10) / 10;
const tiMean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
const tiSource = { LIGHT_NOVEL: "light novels", MANGA: "manga", ORIGINAL: "original stories", VIDEO_GAME: "video games", WEB_NOVEL: "web novels", NOVEL: "novels", VISUAL_NOVEL: "visual novels", GAME: "games" };

// How you use the 1 to 10 scale, and whether you rate above or below other fans on the same titles.
function tiRating(entries){
  const rated = entries.filter(e => e.score > 0), n = rated.length;
  if(n < TZ_MIN_SCORED) return { n, known: false };
  const s10 = rated.map(e => e.score / 10), mean = tiMean(s10), sd = Math.sqrt(tiMean(s10.map(x => (x - mean) * (x - mean))));
  const hist = Array(10).fill(0); for(const x of s10) hist[Math.min(9, Math.max(0, Math.round(x) - 1))]++;
  const pairs = rated.filter(e => e.media && e.media.averageScore > 0), bias = pairs.length >= TZ_MIN_SCORED ? tiMean(pairs.map(e => (e.score - e.media.averageScore) / 10)) : null;
  const label = bias === null ? (mean >= 8 ? "Generous" : mean <= 6 ? "Tough" : "Balanced") : bias >= 0.6 ? "Generous" : bias <= -0.6 ? "Tough" : "Balanced";
  return { n, known: true, mean: tiRound1(mean), median: tiRound1(tzMedian(s10)), sd: tiRound1(sd), hist, bias: bias === null ? null : tiRound1(bias), label, narrow: sd < 1.1 };
}
// Finishing and dropping (planned titles are not in this list).
function tiFinish(entries){
  const c = s => entries.filter(e => e.status === s).length, done = c("COMPLETED") + c("REPEATING"), dropped = c("DROPPED"), started = done + dropped + c("CURRENT") + c("PAUSED");
  if(done + dropped < 6) return { known: false };
  const rate = done / (done + dropped);
  return { known: true, done, dropped, started, rate, pct: Math.round(rate * 100), label: rate >= 0.9 ? "Finisher" : rate <= 0.7 ? "Sampler" : "Steady" };
}
// A genre you drop far more often than your usual.
function tiDrops(entries){
  const base = entries.filter(e => ["COMPLETED", "REPEATING", "DROPPED"].includes(e.status)), all = base.length, drops = base.filter(e => e.status === "DROPPED").length;
  if(all < 12) return null;
  const usual = drops / all, by = new Map();
  for(const e of base) for(const g of (e.media.genres || [])){ const v = by.get(g) || { n: 0, d: 0 }; v.n++; if(e.status === "DROPPED") v.d++; by.set(g, v); }
  const worst = [...by.entries()].filter(([, v]) => v.n >= TI_MIN && v.d >= 2 && v.d / v.n >= Math.max(0.25, usual * 1.8)).sort((a, b) => b[1].d / b[1].n - a[1].d / a[1].n || b[1].n - a[1].n || a[0].localeCompare(b[0]))[0];
  return worst ? { genre: worst[0], n: worst[1].n, dropped: worst[1].d, times: usual > 0 ? tiRound1(worst[1].d / worst[1].n / usual) : 0 } : null;
}
// The genres you rate highest and lowest compared with your own average.
function tiGenreScores(entries){
  const rated = entries.filter(e => e.score > 0), mean = tiMean(rated.map(e => e.score / 10));
  if(rated.length < TZ_MIN_SCORED) return { best: null, worst: null };
  const by = new Map();
  for(const e of rated) for(const g of (e.media.genres || [])){ const v = by.get(g) || []; v.push(e.score / 10); by.set(g, v); }
  const rows = [...by.entries()].filter(([, v]) => v.length >= 3).map(([g, v]) => ({ genre: g, n: v.length, mean: tiRound1(tiMean(v)), diff: tiMean(v) - mean })).sort((a, b) => b.diff - a.diff || b.n - a.n || a.genre.localeCompare(b.genre));
  const best = rows[0] && rows[0].diff >= 0.5 ? rows[0] : null, last = rows[rows.length - 1], worst = last && last !== best && last.diff <= -0.7 ? last : null;
  return { best, worst, overall: tiRound1(mean) };
}
// Where your titles come from in time, as decades.
function tiDecades(entries){
  const by = new Map(); let total = 0;
  for(const e of entries){ const y = e.media.startDate && e.media.startDate.year; if(!(y > 1900)) continue; const d = Math.floor(y / 10) * 10; by.set(d, (by.get(d) || 0) + 1); total++; }
  const rows = [...by.entries()].sort((a, b) => a[0] - b[0]).map(([d, n]) => ({ decade: d, label: d + "s", n, pct: Math.round(n / total * 100) }));
  return { rows, total, top: rows.slice().sort((a, b) => b.n - a.n || b.decade - a.decade)[0] || null };
}
function tiFormats(entries){
  const by = new Map(); let total = 0;
  for(const e of entries){ const f = e.media.format; if(!f) continue; by.set(f, (by.get(f) || 0) + 1); total++; }
  return [...by.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 4).map(([f, n]) => ({ name: tzFormatName(f), n, pct: Math.round(n / total * 100) }));
}
// Typical length: episodes for anime, chapters for manga (one-shots and unknown lengths are left out).
function tiLength(entries, type){
  const manga = type === "manga", lens = entries.map(e => manga ? e.media.chapters : e.media.episodes).filter(x => x > 1 && x < (manga ? 5000 : 2000));
  if(lens.length < 8) return null;
  const med = Math.round(tzMedian(lens)), unit = manga ? "chapters" : "episodes", short = manga ? med <= 40 : med <= 13, long = manga ? med >= 150 : med >= 24;
  return { median: med, unit, label: short ? "Short and sweet" : long ? "Long-runner fan" : "Mid-length", short, long };
}
function tiStudios(entries){
  const by = new Map();
  for(const e of entries){ for(const s of ((e.media.studios && e.media.studios.nodes) || [])) if(s && s.name) by.set(s.name, (by.get(s.name) || 0) + 1); }
  return [...by.entries()].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 4).map(([name, n]) => ({ name, n }));
}
function tiSources(entries){
  const by = new Map(); let total = 0;
  for(const e of entries){ const s = e.media.source; if(!s) continue; by.set(s, (by.get(s) || 0) + 1); total++; }
  const top = [...by.entries()].sort((a, b) => b[1] - a[1])[0];
  return total >= 12 && top && top[1] / total >= 0.4 && tiSource[top[0]] ? { name: tiSource[top[0]], pct: Math.round(top[1] / total * 100) } : null;
}
function tiRecent(entries, curYear){
  const ys = entries.map(e => e.media.startDate && e.media.startDate.year).filter(y => y > 1900);
  if(ys.length < 12) return null;
  const pct = Math.round(ys.filter(y => y >= curYear - (TI_LATE - 1)).length / ys.length * 100);
  return { pct, keepsUp: pct >= 40, classics: pct <= 10 };
}
// How your taste has moved: the four sliders for what you touched in the last two years, against everything before.
function tiDrift(entries, ref, type, curYear){
  const when = e => (e.completedAt && e.completedAt.year) || (e.startedAt && e.startedAt.year) || 0;
  const late = entries.filter(e => when(e) >= curYear - 1), old = entries.filter(e => when(e) && when(e) < curYear - 1);
  if(late.length < 10 || old.length < 10) return null;
  const a = tzAxes(late, type, curYear), b = tzAxes(old, type, curYear), out = [];
  const say = [["Niche", "Mainstream"], ["Retro", "Fresh"], ["Diverse", "Specialized"]];
  for(let i = 0; i < 3; i++){ const d = a[i].pos - b[i].pos; if(Math.abs(d) >= 0.12) out.push({ axis: a[i].key, to: d > 0 ? say[i][1] : say[i][0], amount: Math.round(Math.abs(d) * 100) }); }
  const lt = tzThemes(late.map(e => e.media), ref).up[0], ot = tzThemes(old.map(e => e.media), ref).up[0];
  return { shifts: out, theme: lt && (!ot || ot.name !== lt.name) ? { name: lt.name, lift: lt.lift } : null, nLate: late.length };
}
function tiConfidence(n, scored){
  const level = n >= 60 && scored >= 30 ? "High" : n >= 25 && scored >= 12 ? "Medium" : "Low";
  return { level, line: level === "High" ? "A lot to go on: this report is solid." : level === "Medium" ? "A decent sample. It will sharpen as you add and rate more." : "Early days: add and rate more titles and it will sharpen." };
}

// Everything above, plus a few plain sentences ordered by how interesting they are.
function tiBuild(entries, rep, ref, type, curYear){
  const rows = entries.filter(e => e.media), manga = type === "manga";
  const style = tiRating(rows), finish = tiFinish(rows), drops = tiDrops(rows), gs = tiGenreScores(rows), dec = tiDecades(rows), formats = tiFormats(rows);
  const length = tiLength(rows, type), studios = manga ? [] : tiStudios(rows), source = manga ? null : tiSources(rows), recent = tiRecent(rows, curYear), drift = tiDrift(rows, ref, type, curYear);
  const lines = [], add = (icon, head, body) => lines.push({ icon, head, body });
  if(style.known){
    const b = style.bias;
    if(b !== null && style.label !== "Balanced") add(style.label === "Generous" ? "🌟" : "🧐", style.label === "Generous" ? "Generous rater" : "Tough critic", "You score " + Math.abs(b).toFixed(1) + " points " + (b > 0 ? "above" : "below") + " other fans on the same titles (your average is " + style.mean.toFixed(1) + ").");
    else if(b !== null) add("⚖️", "Balanced rater", "You score within " + Math.max(0.1, Math.abs(b)).toFixed(1) + " points of other fans on the same titles.");
    else add(style.label === "Generous" ? "🌟" : "⚖️", style.label + " rater", "Your average score is " + style.mean.toFixed(1) + ".");
  }
  if(finish.known) add(finish.label === "Finisher" ? "✅" : finish.label === "Sampler" ? "🚪" : "📺", finish.label === "Finisher" ? "A finisher" : finish.label === "Sampler" ? "A sampler" : "Steady viewer", finish.label === "Sampler" ? "You left " + finish.dropped + " of the " + (finish.done + finish.dropped) + " titles you wrapped up or dropped: you sample a lot and keep what clicks." : "Of the titles you wrapped up or dropped, you finished " + finish.pct + "%.");
  if(drops) add("💤", "Where you quit: " + drops.genre, "You dropped " + drops.dropped + " of " + drops.n + " " + drops.genre + " titles" + (drops.times >= 1.5 ? ", about " + drops.times + "× your usual rate." : "."));
  if(gs.best) add("⭐", "Your best-rated genre: " + gs.best.genre, "You average " + gs.best.mean.toFixed(1) + " there, against " + gs.overall.toFixed(1) + " overall (" + gs.best.n + " titles).");
  if(gs.worst) add("📉", "Your toughest genre: " + gs.worst.genre, "You average " + gs.worst.mean.toFixed(1) + " there, against " + gs.overall.toFixed(1) + " overall (" + gs.worst.n + " titles).");
  if(drift && drift.shifts.length) add("🧭", "Lately you lean " + drift.shifts.map(s => s.to).join(" and "), "That is based on the " + drift.nLate + " titles you touched in the last two years, compared with everything before.");
  if(drift && drift.theme) add("📈", "Rising for you: " + drift.theme.name, "It shows up " + tzX(drift.theme.lift) + " as often as for the average fan in what you watched lately.");
  if(recent && recent.keepsUp) add("🆕", "Keeps up with new releases", recent.pct + "% of your titles started in the last " + TI_LATE + " years.");
  else if(recent && recent.classics) add("🎞️", "Loves the older ones", "Only " + recent.pct + "% of your titles started in the last " + TI_LATE + " years.");
  else if(dec.top && dec.top.pct >= 30) add("📅", "The " + dec.top.label + " are your decade", dec.top.pct + "% of your titles started then.");
  if(length) add("⏳", length.label, "Your typical " + (manga ? "manga" : "anime") + " has " + length.median + " " + length.unit + ".");
  if(studios[0]) add("🏢", "Most-watched studio: " + studios[0].name, studios[0].n + " titles in your list.");
  if(source) add("📚", "Loves " + source.name, source.pct + "% of your anime are based on them.");
  const vibes = (rep.vibes || []).filter(v => Math.abs(v.pos - 0.5) >= 0.1).sort((a, b) => Math.abs(b.pos - 0.5) - Math.abs(a.pos - 0.5)).slice(0, 3).map(v => (v.pos < 0.5 ? v.left : v.right).name);
  const summary = rep.arch.name + ". " + (rep.arch.tag ? "You like " + rep.arch.tag + " " + (manga ? "manga" : "anime") + " " + tzX(rep.arch.lift) + " more than the average fan" : "Your list stays close to what most fans read or watch") + (vibes.length ? " and lean " + vibes.join(", ").replace(/, ([^,]*)$/, " and $1") : "") + ".";
  const runner = rep.themes.up[1] && TZ_ARCH[rep.themes.up[1].name.toLowerCase()];
  return { style, finish, drops, genreScores: gs, decades: dec, formats, length, studios, source, recent, drift, lines: lines.slice(0, 8), confidence: tiConfidence(rep.n, rep.scored), summary,
    runnerUp: runner ? { name: runner[0], tag: rep.themes.up[1].name, lift: rep.themes.up[1].lift } : null };
}
