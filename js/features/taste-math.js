/* js/features/taste-math.js: the maths behind the taste report. No screen code here, so it can be unit tested.
   Everything is worked out from your own AniList list, compared with a sample of the most popular titles ("the average fan"). */
const TZ_MIN_TITLES = 8;     // fewer started or finished titles than this: no report yet
const TZ_MIN_SCORED = 8;     // fewer rated titles than this: the Contrarian / Aligned slider stays in the middle
const TZ_SMOOTH = 0.02;      // keeps rare tags from jumping to huge ratios

// Anchors for the four sliders. If a slider sits stuck at one end for most people, tune these numbers.
const TZ_ANCHOR = {
  anime: { popMid: 60000, popHalf: 0.7, yearMid: 2015, yearHalf: 12, topLo: 0.38, topHi: 0.70, madLo: 4, madHi: 24 },
  manga: { popMid: 20000, popHalf: 0.7, yearMid: 2012, yearHalf: 12, topLo: 0.38, topHi: 0.70, madLo: 4, madHi: 24 }
};

// The five "vibe" sliders. Names are AniList genres and tags; any name AniList doesn't use is simply ignored.
const TZ_VIBES = [
  { left: { name: "Grim", note: "Bleak worlds, survival, revenge", keys: ["Tragedy", "Gore", "War", "Survival", "Revenge", "Dystopian", "Post-Apocalyptic", "Body Horror", "Horror", "Death Game"] },
    right: { name: "Wholesome", note: "Family, healing, caring for others", keys: ["Iyashikei", "Family Life", "Found Family", "Parenthood", "Slice of Life", "Food", "Cute Girls Doing Cute Things", "Animals", "Camping"] } },
  { left: { name: "Heart", note: "Big emotions, love stories", keys: ["Romance", "Love Triangle", "Coming of Age", "Unrequited Love", "Teens' Love", "Shoujo"] },
    right: { name: "Brain", note: "Mysteries, strategy, big ideas", keys: ["Mystery", "Detective", "Strategy", "Philosophy", "Psychological", "Time Manipulation", "Sci-Fi"] } },
  { left: { name: "Dreamers", note: "Chasing art, fame, adventure", keys: ["Music", "Idols (Female)", "Idols (Male)", "Band", "Acting", "Art", "Adventure", "Travel", "Aviation"] },
    right: { name: "Schemers", note: "Power plays, mind games", keys: ["Politics", "Conspiracy", "Espionage", "Crime", "Gambling", "Assassins", "Mind Games", "Betrayal"] } },
  { left: { name: "Scrappy", note: "Underdogs who work for every win", keys: ["Sports", "Martial Arts", "Boxing", "Baseball", "Basketball", "Football", "Volleyball", "School Club", "Shounen"] },
    right: { name: "Destined", note: "Special powers, second lives", keys: ["Isekai", "Reincarnation", "Super Power", "Magic", "Reverse Isekai", "Time Loop", "Gods", "Demons"] } },
  { left: { name: "Competitive", note: "Rivalries, tournaments", keys: ["Tournament", "Card Battle", "Esports", "Video Games", "Rivalry", "Racing"] },
    right: { name: "Loyal", note: "Friendship, big casts", keys: ["Ensemble Cast", "Friendship", "Bromance", "Teamwork"] } }
];

const TZ_AXES = [
  { key: "pop", left: { letter: "N", name: "Niche" }, right: { letter: "M", name: "Mainstream" },
    capL: "Reaches beyond the most popular {kind}.", capR: "Sticks close to the big, popular titles." },
  { key: "year", left: { letter: "R", name: "Retro" }, right: { letter: "F", name: "Fresh" },
    capL: "Leans toward older classics.", capR: "Leans toward newer {kind}." },
  { key: "spread", left: { letter: "D", name: "Diverse" }, right: { letter: "S", name: "Specialized" },
    capL: "Spans different genres and themes.", capR: "Concentrates on a few favourite genres." },
  { key: "taste", left: { letter: "C", name: "Contrarian" }, right: { letter: "A", name: "Aligned" },
    capL: "Often rates differently from other fans.", capR: "Usually rates close to other fans." }
];

const TZ_TYPES = {
  NFDC: ["The Trailblazer", "Hunts widely for unusual new releases and builds a taste of their own."],
  NFDA: ["The Scout", "Finds fresh, lesser-known shows across genres and usually agrees with fellow fans."],
  NFSC: ["The Niche Pioneer", "Goes deep on one corner of the new releases and rates it on their own terms."],
  NFSA: ["The Insider", "Follows one corner of the new releases closely, right alongside its fans."],
  NRDC: ["The Deep-Cut Digger", "Digs through older, lesser-known shows in many genres with strong opinions."],
  NRDA: ["The Curator", "Collects older hidden gems from many genres and mostly agrees with fellow fans."],
  NRSC: ["The Cult Classicist", "Devoted to one older, lesser-known corner, rated entirely their own way."],
  NRSA: ["The Archivist", "Knows one older, lesser-known corner inside out, in step with its fans."],
  MFDC: ["The Hype Rebel", "Watches what everyone is watching, across genres, but rarely rates like the crowd."],
  MFDA: ["The Zeitgeist Rider", "Keeps up with the latest big shows in every genre and rates close to the crowd."],
  MFSC: ["The Hot-Take Specialist", "Follows the big new hits of a favourite genre with opinions of their own."],
  MFSA: ["The Trend Devotee", "Follows the big new hits of a favourite genre, right with the crowd."],
  MRDC: ["The Classic Contrarian", "Loves the well-known classics across genres, yet rates them their own way."],
  MRDA: ["The Canon Keeper", "Works through the well-known classics in every genre, in step with fans."],
  MRSC: ["The Old-School Rebel", "Sticks to the big classics of one corner, with ratings that go against the grain."],
  MRSA: ["The Old-School Loyalist", "Sticks to the big classics of one corner, alongside the fans."]
};

// Archetype from your strongest theme. Keys are lower-case AniList tag names.
const TZ_ARCH = {
  "isekai": ["The Portal Hopper", "New world, new rules, and a better starting stat line."],
  "reincarnation": ["The Second-Life Specialist", "Death is just a loading screen, and you've seen plenty of them."],
  "time loop": ["The Loop Survivor", "Same day, one more try, and this time you know the ending."],
  "magic": ["The Spellbook Regular", "If there's a magic circle on screen, you're already in your seat."],
  "super power": ["The Power Scaler", "You like your heroes with abilities worth ranking."],
  "tragedy": ["The Tearjerker Connoisseur", "You know the sad ending is coming, and you stay for it anyway."],
  "war": ["The War Room Regular", "Battle lines, big stakes, and plenty of fallen heroes."],
  "iyashikei": ["The Comfort Seeker", "Soft light, slow days, and shows that feel like a warm blanket."],
  "cute girls doing cute things": ["The Cozy Club Member", "Tea, clubs, and small adventures are all you need."],
  "school": ["The Homeroom Regular", "Classrooms, clubs, and festivals feel like home."],
  "workplace": ["The Office Escapist", "You like your stories with a job, a boss, and a deadline."],
  "detective": ["The Case Cracker", "Lay out the clues and let you work out the reveal."],
  "strategy": ["The Armchair Tactician", "You watch the plan almost as much as the fight."],
  "idols (female)": ["The Front-Row Fan", "Stage lights, practice rooms, and a lot of glow sticks."],
  "mythology": ["The Myth Collector", "Gods, legends, and old stories told again."],
  "gods": ["The Pantheon Watcher", "Divine drama and cosmic stakes."],
  "demons": ["The Demon Hunter", "Horns, curses, and plenty of things that go bump."],
  "cyberpunk": ["The Neon Runner", "Rain, neon, and tech that has gone a bit too far."],
  "vampire": ["The Night Owl", "Fangs, old castles, and long memories."],
  "swordplay": ["The Blade Enthusiast", "You appreciate a well-choreographed duel."],
  "superhero": ["The Cape Collector", "Masks, powers, and the occasional origin story."],
  "cultivation": ["The Heavenly Grinder", "Breakthroughs, sects, and endless training."],
  "villainess": ["The Fate Rewriter", "A doomed noble who changes the script is your favourite plot."],
  "harem": ["The Crowd Pleaser", "More love interests than there are episodes."],
  "anti-hero": ["The Moral Gray Zone", "You like heroes who would rather not be called that."],
  "survival": ["The Last One Standing", "Resources are low and the stakes are high."],
  "ensemble cast": ["The Cast Collector", "The more characters, the better."]
};

const tzClamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const tzMedian = a => { if(!a.length) return 0; const s = a.slice().sort((x, y) => x - y), h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };
// Only strong, non-spoiler tags count.
const tzTags = m => (m.tags || []).filter(t => (t.rank || 0) >= 50 && !t.isMediaSpoiler).map(t => t.name);
const tzKeys = m => [...new Set([...(m.genres || []), ...tzTags(m)])];
function tzCount(list, pick){ const c = new Map(); for(const m of list) for(const k of pick(m)) c.set(k, (c.get(k) || 0) + 1); return c; }
// How much more (or less) often a name shows up for you than for the average fan.
function tzLift(name, uc, un, rc, rn){
  const u = (uc.get(name) || 0) / Math.max(1, un), r = (rc.get(name) || 0) / Math.max(1, rn);
  return (u + TZ_SMOOTH) / (r + TZ_SMOOTH);
}
// Text for a ratio: "5×+" at five times or more, "−4.8×" when you are far below the average fan.
function tzX(l){
  if(l >= 1) return l >= 5 ? "5×+" : (Math.round(l * 10) / 10) + "×";
  const d = 1 / l; return "−" + (d >= 9.9 ? "9.9" : (Math.round(d * 10) / 10)) + "×";
}
const tzMag = l => tzClamp(Math.log(Math.max(l, 1 / l)) / Math.log(5));   // 0 to 1: how long the bar is

function tzThemes(media, ref){
  const uc = tzCount(media, tzTags), rc = tzCount(ref, tzTags), un = media.length, rn = ref.length;
  const up = [], down = [];
  for(const t of new Set([...uc.keys(), ...rc.keys()])){
    const n = uc.get(t) || 0, rs = (rc.get(t) || 0) / Math.max(1, rn), l = tzLift(t, uc, un, rc, rn);
    if(n >= 3 && l >= 1.5) up.push({ name: t, lift: l, count: n });
    else if(rs >= 0.08 && l <= 1 / 1.5) down.push({ name: t, lift: l, count: n, refShare: rs });
  }
  up.sort((a, b) => b.lift - a.lift || b.count - a.count || a.name.localeCompare(b.name));
  down.sort((a, b) => a.lift - b.lift || b.refShare - a.refShare || a.name.localeCompare(b.name));
  return { up: up.slice(0, 3), down: down.slice(0, 2) };
}

function tzVibes(media, ref){
  const uc = tzCount(media, tzKeys), rc = tzCount(ref, tzKeys), un = media.length, rn = ref.length;
  const side = keys => { let s = 0, k = 0; for(const n of keys){ if(!(uc.get(n) || rc.get(n))) continue; s += tzLift(n, uc, un, rc, rn); k++; } return k ? s / k : 1; };
  return TZ_VIBES.map(v => { const L = side(v.left.keys), R = side(v.right.keys); return { left: v.left, right: v.right, pos: R / (L + R) }; });
}

// Four sliders, each 0 (left side) to 1 (right side), plus the letter of the side you lean to.
function tzAxes(entries, type, curYear){
  const A = TZ_ANCHOR[type] || TZ_ANCHOR.anime, media = entries.map(e => e.media);
  const pops = media.map(m => m.popularity).filter(x => x > 0).map(Math.log10);
  const years = media.map(m => m.startDate && m.startDate.year).filter(Boolean);
  const gc = tzCount(media, m => m.genres || []), counts = [...gc.values()].sort((a, b) => b - a), total = counts.reduce((a, b) => a + b, 0);
  const scored = entries.filter(e => e.score > 0 && e.media.averageScore > 0), mad = scored.length ? scored.reduce((a, e) => a + Math.abs(e.score - e.media.averageScore), 0) / scored.length : 0;
  const pos = {
    pop: pops.length ? tzClamp(0.5 + (tzMedian(pops) - Math.log10(A.popMid)) / (2 * A.popHalf)) : 0.5,
    year: years.length ? tzClamp(0.5 + (Math.min(tzMedian(years), curYear + 1) - A.yearMid) / (2 * A.yearHalf)) : 0.5,
    spread: total ? tzClamp(((counts[0] || 0) + (counts[1] || 0) + (counts[2] || 0)) / total - A.topLo, 0, 1e9) / (A.topHi - A.topLo) : 0.5,
    taste: scored.length >= TZ_MIN_SCORED ? 1 - tzClamp((mad - A.madLo) / (A.madHi - A.madLo)) : 0.5
  };
  pos.spread = tzClamp(pos.spread);
  return TZ_AXES.map(a => {
    const p = pos[a.key], known = a.key !== "taste" || scored.length >= TZ_MIN_SCORED;
    return { key: a.key, left: a.left, right: a.right, pos: p, known, letter: known ? (p < 0.5 ? a.left.letter : a.right.letter) : "?", capL: a.capL, capR: a.capR, mad: a.key === "taste" ? mad : undefined };
  });
}

const tzRarity = p => p < 5000 ? "Ultra rare" : p < 20000 ? "Rare" : "";
const tzShown = e => !e.media.isAdult;   // adult titles still count in the maths but never appear as covers

function tzGems(entries){
  const ok = entries.filter(e => tzShown(e) && e.media.popularity > 0 && ["COMPLETED", "CURRENT", "REPEATING"].includes(e.status) && (!e.score || e.score >= 60));
  ok.sort((a, b) => a.media.popularity - b.media.popularity || a.media.id - b.media.id);
  return ok.slice(0, 8).map(e => ({ m: e.media, label: tzRarity(e.media.popularity) }));
}
function tzYears(entries, fresh, curYear){
  const ok = entries.filter(e => tzShown(e) && e.status !== "DROPPED" && e.media.startDate && e.media.startDate.year && e.media.startDate.year <= curYear + 1);
  ok.sort((a, b) => (fresh ? b.media.startDate.year - a.media.startDate.year : a.media.startDate.year - b.media.startDate.year) || a.media.id - b.media.id);
  return ok.slice(0, 8).map(e => ({ m: e.media, label: String(e.media.startDate.year) }));
}
function tzGenres(entries){
  const gc = tzCount(entries.map(e => e.media), m => m.genres || []), all = [...gc.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const total = all.reduce((a, x) => a + x[1], 0) || 1, top = all.slice(0, 4);
  const bars = top.map(([name, n]) => ({ name, pct: Math.round(n / total * 100) }));
  bars.push({ name: "Others", pct: Math.max(0, 100 - bars.reduce((a, b) => a + b.pct, 0)) });
  const used = new Set(), picks = [];
  for(const [g] of all.slice(0, 6)){
    const best = entries.filter(e => tzShown(e) && !used.has(e.media.id) && (e.media.genres || []).includes(g)).sort((a, b) => (b.score || 0) - (a.score || 0) || (b.media.averageScore || 0) - (a.media.averageScore || 0) || a.media.id - b.media.id)[0];
    if(best){ used.add(best.media.id); picks.push({ m: best.media, label: "" }); }
  }
  return { bars, picks };
}
function tzGaps(entries){
  return entries.filter(e => tzShown(e) && e.score > 0 && e.media.averageScore > 0)
    .map(e => ({ m: e.media, you: e.score / 10, fans: e.media.averageScore / 10, diff: (e.score - e.media.averageScore) / 10 }))
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff) || a.m.id - b.m.id).slice(0, 3);
}

function tzBuild(entries, ref, type, curYear){
  const eaten = entries.filter(e => e.status !== "PLANNING" && e.media);
  if(eaten.length < TZ_MIN_TITLES) return { ready: false, n: eaten.length, type };
  const media = eaten.map(e => e.media), axes = tzAxes(eaten, type, curYear), themes = tzThemes(media, ref);
  const code = axes.map(a => a.letter).join(""), tkey = code.replace("?", "A"), top = themes.up[0];
  const known = top && TZ_ARCH[top.name.toLowerCase()];
  const arch = top
    ? { name: known ? known[0] : "The " + top.name + " Devotee", line: known ? known[1] : top.name + " shows keep turning up in your list.", tag: top.name, lift: top.lift,
        covers: eaten.filter(e => tzShown(e) && tzTags(e.media).includes(top.name)).sort((a, b) => (b.score || 0) - (a.score || 0) || a.media.id - b.media.id).slice(0, 3).map(e => e.media) }
    : { name: "The All-Rounder", line: "Your list stays close to what most fans watch.", tag: "", lift: 1, covers: [] };
  const ty = TZ_TYPES[tkey] || TZ_TYPES.MFDA;
  const fresh = axes[1].pos >= 0.5;
  return { ready: true, type, n: eaten.length, scored: eaten.filter(e => e.score > 0).length, axes, code, typeName: ty[0], typeLine: ty[1], themes, arch,
    vibes: tzVibes(media, ref), gems: tzGems(eaten), years: tzYears(eaten, fresh, curYear), fresh, genres: tzGenres(eaten), gaps: tzGaps(eaten) };
}

function tzShareText(rep){
  const kind = rep.type === "manga" ? "manga" : "anime", th = rep.themes.up.map(t => t.name).join(", ");
  return "My " + kind + " taste: " + rep.arch.name + " (" + rep.typeName + ", " + rep.code + ")" + (th ? "\nTop themes: " + th : "") + "\nMade with What Next?";
}
