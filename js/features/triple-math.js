/* js/features/triple-math.js: the maths behind AniList Triple Sync. No screen or network code here, so it can be unit tested.
   Ported from the AniList -> MAL delta engines (mal_sync_engine.py, mal_manga_sync_engine.py) and the AniList write-back. */
const TS_MAL_STATUS = {
  ANIME: { CURRENT: "watching", REPEATING: "watching", PLANNING: "plan_to_watch", COMPLETED: "completed", PAUSED: "on_hold", DROPPED: "dropped" },
  MANGA: { CURRENT: "reading", REPEATING: "reading", PLANNING: "plan_to_read", COMPLETED: "completed", PAUSED: "on_hold", DROPPED: "dropped" }
};

// A date as "YYYY-MM-DD", or "" when AniList only knows part of it (MAL needs all three).
function tsDate(d){
  if(!d || !d.year || !d.month || !d.day) return "";
  return String(d.year).padStart(4, "0") + "-" + String(d.month).padStart(2, "0") + "-" + String(d.day).padStart(2, "0");
}
// AniList wants null for the parts it should clear.
const tsFuzzy = d => ({ year: (d && d.year) || null, month: (d && d.month) || null, day: (d && d.day) || null });

// AniList scores come as 0 to 100. MAL uses 1 to 10, and 0 means "no score" (so clearing a score here clears it there).
function tsScoreMal(score){
  const v = parseFloat(score);
  if(!(v > 0)) return 0;
  return Math.max(1, Math.min(10, Math.round(v / 10)));
}

// A short fingerprint of everything that gets sent. A different fingerprint means the entry changed.
function tsHash(str){
  let h = 0x811c9dc5;
  for(let i = 0; i < str.length; i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36);
}
// A date as year-month-day with zeros for the unknown parts, so a year-only date still counts as a change.
const tsFz = d => [(d && d.year) || 0, (d && d.month) || 0, (d && d.day) || 0].join("-");
const tsHasDate = d => !!(d && (d.year || d.month || d.day));
function tsFingerprint(e){
  return tsHash(JSON.stringify([e.status || "", e.score || 0, e.progress || 0, e.progressVolumes || 0, e.repeat || 0, tsFz(e.startedAt), tsFz(e.completedAt), e.private ? 1 : 0, e.notes || ""]));
}

// What to send to MyAnimeList. Dates are left out when empty, unless this title was sent before (then "" clears them).
function tsMalFields(e, type, sentBefore){
  const manga = type === "MANGA", f = { status: TS_MAL_STATUS[type][e.status] || "plan_to_" + (manga ? "read" : "watch"), score: tsScoreMal(e.score) };
  if(manga){ f.num_chapters_read = e.progress || 0; f.num_volumes_read = e.progressVolumes || 0; f.is_rereading = e.status === "REPEATING" ? "true" : "false"; f.num_times_reread = e.repeat || 0; }
  else { f.num_watched_episodes = e.progress || 0; f.is_rewatching = e.status === "REPEATING" ? "true" : "false"; f.num_times_rewatched = e.repeat || 0; }
  const s = tsDate(e.startedAt), c = tsDate(e.completedAt);
  if(s || sentBefore) f.start_date = s;
  if(c || sentBefore) f.finish_date = c;
  return f;
}

// What to send to the target AniList account (SaveMediaListEntry variables).
function tsAlVars(e, type){
  const v = { mediaId: e.mediaId, status: e.status, progress: e.progress || 0, scoreRaw: e.score || 0, repeat: e.repeat || 0, private: !!e.private, notes: e.notes || "", startedAt: tsFuzzy(e.startedAt), completedAt: tsFuzzy(e.completedAt) };
  if(type === "MANGA") v.progressVolumes = e.progressVolumes || 0;
  return v;
}

// Pull the code out of whatever was pasted: just the code, or the whole link the login page sent you to.
function tsParseCode(text){
  const t = String(text || "").trim();
  if(!t) return { code: "", state: "" };
  const m = t.match(/[?&#]code=([^&#\s]+)/);
  const st = t.match(/[?&#]state=([^&#\s]+)/);
  if(m){ try{ return { code: decodeURIComponent(m[1]), state: st ? decodeURIComponent(st[1]) : "" }; }catch(_){ return { code: m[1], state: st ? st[1] : "" }; } }
  return { code: t, state: "" };
}

// Which titles need sending. `media` is what was remembered (id -> { a, m, e }), `targets` is ["al"], ["mal"] or both.
//  a / m = the fingerprint last sent to AniList / MAL, e = the id of the entry on the target AniList account.
// mode: "delta" sends what changed, "all" sends everything, "baseline" only remembers (sends nothing).
function tsPlan(entries, media, targets, mode){
  const key = { al: "a", mal: "m" }, work = [], now = {}, seen = new Set();
  for(const e of entries){
    const id = String(e.mediaId); seen.add(id);
    const fp = tsFingerprint(e), prev = media[id] || {};
    now[id] = { ...prev, fp, i: (e.media && e.media.idMal) || prev.i };
    const rj = {}; for(const t of ["al", "mal"]) if(prev.rj && prev.rj[t] === fp) rj[t] = fp;   // a rejection only holds while the entry is unchanged
    if(Object.keys(rj).length) now[id].rj = rj; else delete now[id].rj;
    if(mode === "baseline"){ for(const t of targets) now[id][key[t]] = fp; continue; }
    const need = targets.filter(t => mode === "all" || (prev[key[t]] !== fp && !rj[t]));
    if(need.length) work.push({ entry: e, id, fp, need });
  }
  const removed = Object.keys(media).filter(id => !seen.has(id)).map(id => ({ id, ...media[id] }));
  return { work, now, removed };
}
// Each target counts as "first run" until at least one title was ever sent to it.
const tsFirstTargets = (media, targets) => targets.filter(t => !Object.values(media).some(m => m && m[{ al: "a", mal: "m" }[t]]));
// Too many titles vanishing at once almost always means the wrong username or a bad read, not a real clean-up.
const tsRemovalLooksWrong = (removed, total) => removed > 10 && removed > total * 0.25;

// Plan several targets at once. `modes` says how each one starts: { al: "all" | "baseline" | "delta", mal: ... }.
function tsPlanMulti(entries, media, targets, modes){
  const key = { al: "a", mal: "m" }, parts = targets.map(t => tsPlan(entries, media, [t], modes[t] || "delta")), byId = new Map(), now = {};
  for(const e of entries){ const id = String(e.mediaId); now[id] = { ...(media[id] || {}), fp: tsFingerprint(e), i: (e.media && e.media.idMal) || (media[id] || {}).i }; Object.assign(now[id], parts[0] ? { rj: parts[0].now[id].rj } : {}); if(!now[id].rj) delete now[id].rj; }
  parts.forEach((p, n) => {
    const t = targets[n];
    if(modes[t] === "baseline") for(const id in p.now) now[id][key[t]] = p.now[id][key[t]];
    for(const w of p.work){ const cur = byId.get(w.id) || { entry: w.entry, id: w.id, fp: w.fp, need: [] }; cur.need.push(...w.need); byId.set(w.id, cur); }
  });
  return { work: [...byId.values()], now, removed: parts.length ? parts[0].removed : [] };
}

// ----- never overwrite a target that is further along -----
// src: the source entry. tgt: what the target has now. Returns { skip: "ahead" }, { same: true }, or { vars } / { fields } to write.
function tsMergeAl(src, tgt, type){
  const manga = type === "MANGA", tp = tgt.progress || 0, sp = src.progress || 0;
  if((tgt.status === "COMPLETED" && src.status !== "COMPLETED" && src.status !== "REPEATING") || tp > sp) return { skip: "ahead" };
  const v = tsAlVars(src, type);
  if(!(src.score > 0) && tgt.score > 0) v.scoreRaw = tgt.score;                                   // never clear a score
  if(!src.notes && tgt.notes) v.notes = tgt.notes;                                                // or notes
  if(!tsHasDate(src.startedAt) && tsHasDate(tgt.startedAt)) v.startedAt = tsFuzzy(tgt.startedAt);   // or dates
  if(!tsHasDate(src.completedAt) && tsHasDate(tgt.completedAt)) v.completedAt = tsFuzzy(tgt.completedAt);
  v.repeat = Math.max(v.repeat || 0, tgt.repeat || 0);
  if(manga) v.progressVolumes = Math.max(v.progressVolumes || 0, tgt.progressVolumes || 0);
  const same = v.status === tgt.status && v.progress === tp && v.scoreRaw === (tgt.score || 0) && v.repeat === (tgt.repeat || 0) && !!v.private === !!tgt.private && (v.notes || "") === (tgt.notes || "")
    && tsFz(v.startedAt) === tsFz(tgt.startedAt) && tsFz(v.completedAt) === tsFz(tgt.completedAt) && (!manga || v.progressVolumes === (tgt.progressVolumes || 0));
  return same ? { same: true } : { vars: v };
}
// f: the fields we would send to MyAnimeList (tsMalFields). tgt: its my_list_status.
function tsMergeMal(f, tgt, type){
  const manga = type === "MANGA", pk = manga ? "num_chapters_read" : "num_watched_episodes", gk = manga ? "num_chapters_read" : "num_episodes_watched", rk = manga ? "num_times_reread" : "num_times_rewatched", fk = manga ? "is_rereading" : "is_rewatching";
  const tp = tgt[gk] || 0, sp = f[pk] || 0;
  if((tgt.status === "completed" && f.status !== "completed" && f[fk] !== "true") || tp > sp) return { skip: "ahead" };
  const v = { ...f };
  if(!(f.score > 0) && tgt.score > 0) v.score = tgt.score;
  if(!f.start_date && tgt.start_date) delete v.start_date;
  if(!f.finish_date && tgt.finish_date) delete v.finish_date;
  v[rk] = Math.max(f[rk] || 0, tgt[rk] || 0);
  if(manga) v.num_volumes_read = Math.max(v.num_volumes_read || 0, tgt.num_volumes_read || 0);
  const same = v.status === tgt.status && v[pk] === tp && v.score === (tgt.score || 0) && v[rk] === (tgt[rk] || 0) && (v[fk] === "true") === !!tgt[fk]
    && (v.start_date === undefined || v.start_date === (tgt.start_date || "")) && (v.finish_date === undefined || v.finish_date === (tgt.finish_date || "")) && (!manga || v.num_volumes_read === (tgt.num_volumes_read || 0));
  return same ? { same: true } : { fields: v };
}

// ----- which accounts the memory belongs to -----
// ident: { src: "source name, lower case", al: target AniList user id or 0, mal: MyAnimeList user id or "" } for the targets in use.
// A different source clears the whole memory; a different target account clears only what was recorded for that target.
function tsReconcile(mem, ident){
  const notes = [], names = { al: "AniList", mal: "MyAnimeList" }, keys = { al: ["a", "e"], mal: ["m", "x"] };
  let media = mem.media || {}, ids = { ...(mem.ids || {}) };
  if(mem.src && mem.src !== ident.src){ media = {}; ids = {}; notes.push("The source account changed, so the memory of earlier syncs was cleared."); }
  for(const t of ["al", "mal"]){
    const cur = ident[t]; if(!cur) continue;
    if(ids[t] && String(ids[t]) !== String(cur)){
      const next = {};
      for(const id in media){ const m = { ...media[id] }; for(const k of keys[t]) delete m[k]; if(m.rj){ const r = { ...m.rj }; delete r[t]; if(Object.keys(r).length) m.rj = r; else delete m.rj; } next[id] = m; }
      media = next; notes.push("A different " + names[t] + " account is connected now, so every title counts as new for it.");
    }
    ids[t] = cur;
  }
  return { media, ids, notes };
}

// ----- errors -----
// fatal: stop the run. net: no connection, stop. reject: the service refused this one title, don't retry it until it changes. transient: try again next run.
function tsErrKind(e){
  if(e.fatal) return "fatal"; if(e.net) return "net";
  return [400, 403, 404, 405, 409, 410, 422].includes(e.status || 0) ? "reject" : "transient";
}

// ----- Discord report -----
const tsWebhookOk = u => /^https:\/\/(?:(?:canary|ptb)\.)?(?:discord|discordapp)\.com\/api\/webhooks\/\d+\/[\w-]+(?:\?.*)?$/.test(String(u || "").trim());
const tsQuiet = r => !(r.sentAl || r.sentMal || r.removed || r.failed || r.rejected);
function tsReport(r){
  const bad = r.failed + r.rejected, fields = [], add = (name, value, inline = true) => { if(value !== "" && value != null) fields.push({ name, value: String(value).slice(0, 1000), inline }); };
  add("Source", r.source); add("Targets", r.targets.join(", ") || "none");
  if(r.targets.includes("AniList")) add("Sent to AniList", r.sentAl);
  if(r.targets.includes("MyAnimeList")) add("Sent to MyAnimeList", r.sentMal);
  add("Already up to date", r.same || ""); add("Target is ahead (left alone)", r.ahead || ""); add("Not on the target (left alone)", r.skipped || ""); add("No MyAnimeList page", r.noMal || ""); add("Removed from targets", r.removed || "");
  add("Rejected", r.rejected || ""); add("Failed", r.failed || "");
  if(r.titles && r.titles.length) add("Titles sent", r.titles.slice(0, 15).join("\n") + (r.titles.length > 15 ? "\n…and " + (r.titles.length - 15) + " more" : ""), false);
  if(r.problems && r.problems.length) add("Problems", r.problems.slice(0, 8).map(p => p.title + " (" + p.msg + ")").join("\n"), false);
  return { title: "AniList Triple Sync · " + r.kind, description: (r.stopped ? "Stopped early. " : "Finished. ") + (r.sentAl + r.sentMal) + " update(s) sent" + (bad ? ", " + bad + " problem(s)" : "") + " in " + r.seconds + "s.", color: r.stopped || bad ? 15105570 : 5763719, fields, footer: { text: "What Next?" } };
}

// ----- Discord update cards (the anime and manga webhooks): one card per title whose progress went up -----
// Which lists get their own thread. Anything else goes to "General Updates". (Same defaults as the Python engines.)
const TS_DC_LISTS = "anime movies, iseki, isekai, milf, loli, rom com, plan to continue, hentai, favourite, fav, planning, tensei, fantasy";
const tsPyTitle = s => String(s).toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase());   // like Python's str.title()
const tsActiveLists = e => {
  const c = e && e.customLists;
  if(Array.isArray(c)) return c.filter(x => x && x.enabled).map(x => x.name);
  if(c && typeof c === "object") return Object.keys(c).filter(k => c[k]);
  return [];
};
// The list a title belongs to for threading: its first custom list, else a guess from its format and tags, else its status.
function tsCategory(e, kind, own){
  const m = e.media || {}, active = tsActiveLists(e);
  let name = active[0] || null;
  if(!name){
    const d = [...(m.genres || []), ...(m.tags || []).map(t => t && t.name)].filter(Boolean).map(x => String(x).toLowerCase());
    if(kind === "anime" && m.format === "MOVIE") name = "Anime movies";
    else if(d.includes("isekai")) name = "Iseki";
    else if(d.some(x => ["hentai", "ecchi", "adult", "smut"].includes(x))) name = "Hentai";
    else if(d.some(x => ["milf", "older woman", "mother"].includes(x))) name = "Milf";
    else if(d.includes("loli")) name = "Loli";
  }
  if(!name) name = tsPyTitle(String(e.status || "UNKNOWN").replace(/_/g, " "));
  const ownSet = String(own || "").split(",").map(x => x.trim().toLowerCase()).filter(Boolean);
  return { name, own: ownSet.includes(String(name).toLowerCase().trim()) };
}
const tsThreadName = (cat, kind) => "[" + kind.toUpperCase() + "] " + (cat.own ? tsPyTitle(cat.name) : "General Updates");
const tsHexInt = h => /^#?[0-9a-f]{6}$/i.test(String(h || "")) ? parseInt(String(h).replace("#", ""), 16) : 3447003;
// opt.themes: give lists that have a theme (Isekai, Rom Com) their own look. opt.force: use this theme (or "" for the standard look), used by the test buttons.
// opt.adaptive: the themed border takes its colour from the poster (see tsAdaptColor).
function tsCard(e, kind, cat, opt){
  const th = opt ? (opt.force !== undefined ? opt.force : opt.themes ? tsThemeFor(cat) : "") : "";
  if(th && TS_THEMES[th]) return tsThemedCard(e, kind, th, opt);
  const m = e.media || {}, t = m.title || {}, title = t.english || t.romaji || "#" + e.mediaId, total = kind === "manga" ? m.chapters : m.episodes, p = e.progress || 0;
  const left = total ? Math.max(0, total - p) : "?", cover = m.coverImage && m.coverImage.extraLarge, done = e.status === "COMPLETED";
  const embed = { title: ("UPDATE: " + title).slice(0, 256), color: tsHexInt(m.coverImage && m.coverImage.color),
    fields: [{ name: "🇯🇵 Romaji", value: t.romaji || "N/A", inline: false }, { name: "📊 Status", value: e.status || "UNKNOWN", inline: false }, { name: "✅ Progress", value: String(p), inline: true }, { name: "⏳ Left", value: String(left), inline: true }],
    footer: { text: cat.own ? tsPyTitle(cat.name) : "General Updates" } };
  if(cover) embed.image = { url: cover };
  if(done) embed.author = { name: "🏆 SERIES COMPLETED" };
  return embed;
}
// ----- Card themes: a list can have its own look. A list with no theme uses the standard card above. -----
// To add a theme, add an entry here (with a label, its colours, icons and wording) and its list names to "match" (names are compared without spaces or punctuation, so "Rom-Com" and "romcom" are the same).
const TS_THEMES = {
  isekai: {
    label: "Isekai", match: ["iseki", "isekai", "tensei"], color: 0x8E5CFF, icon: "⚔️", full: "🟪", empty: "⬛", footer: "🌀 Isekai · Tokyo Brotherhood",
    author: kind => "🌀 ISEKAI GATE · " + (kind === "manga" ? "CHAPTER LOG" : "EPISODE LOG"), done: "🏆 QUEST COMPLETE · BACK FROM ANOTHER WORLD",
    names: { romaji: "🌀 Romaji", status: "🗺️ Quest status", left: "⏳ Left", manga: "📜 Chapter", anime: "📺 Episode" },
    status: { CURRENT: "on the journey", PLANNING: "at the summoning circle", COMPLETED: "quest complete", PAUSED: "resting at the inn", DROPPED: "left the party", REPEATING: "new game+" },
    line: { CURRENT: "The journey in another world continues…", PLANNING: "Waiting at the summoning circle.", COMPLETED: "The Demon King has fallen. The tale is complete.", PAUSED: "Resting at the inn.", DROPPED: "The hero left the party.", REPEATING: "New Game+ has begun." }
  },
  romcom: {
    label: "Rom Com", match: ["romcom", "romanticcomedy"], color: 0xFF6FA3, icon: "💘", full: "💗", empty: "🤍", footer: "💕 Rom Com · Tokyo Brotherhood",
    author: kind => "💕 ROM-COM DIARY · " + (kind === "manga" ? "NEW CHAPTER" : "NEW EPISODE"), done: "💍 HAPPILY EVER AFTER",
    names: { romaji: "🌸 Romaji", status: "💌 Status", left: "⏳ Left", manga: "💖 Chapter", anime: "💖 Episode" },
    status: { CURRENT: "falling for it", PLANNING: "crush pending", COMPLETED: "happily ever after", PAUSED: "on a break", DROPPED: "friend-zoned", REPEATING: "rereading the love story" },
    line: { CURRENT: "One step closer to the confession…", PLANNING: "Saved for a rainy day with someone special.", COMPLETED: "They finally got together. Happily ever after!", PAUSED: "Taking a break from the drama.", DROPPED: "Friend-zoned. It happens.", REPEATING: "Reading the love story all over again." }
  },
  hentai: {
    label: "Hentai (18+)", match: ["hentai"], color: 0xB3123C, icon: "🔞", full: "🟥", empty: "⬛", footer: "🔞 18+ · Tokyo Brotherhood",
    author: kind => "🌙 AFTER DARK · " + (kind === "manga" ? "NEW CHAPTER" : "NEW EPISODE"), done: "🌙 AFTER DARK · FINISHED",
    names: { romaji: "🔞 Romaji", status: "🌙 Status", left: "⏳ Left", manga: "📖 Chapter", anime: "📺 Episode" },
    status: { CURRENT: "after dark", PLANNING: "saved for later", COMPLETED: "finished", PAUSED: "paused for now", DROPPED: "dropped", REPEATING: "again" },
    line: { CURRENT: "Continuing after dark. 18+ only.", PLANNING: "Saved for later. 18+ only.", COMPLETED: "Finished. 18+ only.", PAUSED: "Paused for now.", DROPPED: "Dropped.", REPEATING: "Going through it again." }
  },
  milf: {
    label: "Mature (18+)", match: ["milf"], color: 0xC65D7B, icon: "🍷", full: "🟥", empty: "⬛", footer: "🍷 Mature shelf · Tokyo Brotherhood",
    author: kind => "🍷 MATURE SHELF · 18+ · " + (kind === "manga" ? "NEW CHAPTER" : "NEW EPISODE"), done: "🍷 MATURE SHELF · FINISHED",
    names: { romaji: "🍷 Romaji", status: "🕯️ Status", left: "⏳ Left", manga: "📖 Chapter", anime: "📺 Episode" },
    status: { CURRENT: "in progress", PLANNING: "saved for later", COMPLETED: "finished", PAUSED: "paused for now", DROPPED: "dropped", REPEATING: "again" },
    line: { CURRENT: "Another one from the mature shelf. 18+ only.", PLANNING: "Saved for later. 18+ only.", COMPLETED: "Finished. 18+ only.", PAUSED: "Paused for now.", DROPPED: "Dropped.", REPEATING: "Going through it again." }
  },
  movies: {
    label: "Anime Movies", match: ["animemovie", "movie"], color: 0xF5A623, icon: "🎬", full: "🟨", empty: "⬛", footer: "🎬 Anime Movies · Tokyo Brotherhood", unit: "Part",
    author: kind => "🎬 MOVIE NIGHT · NOW SHOWING", done: "🍿 THE CREDITS ROLLED",
    names: { romaji: "🎞️ Romaji", status: "🎟️ Ticket", left: "⏳ Left", manga: "🎞️ Part", anime: "🎞️ Part" },
    status: { CURRENT: "now showing", PLANNING: "tickets booked", COMPLETED: "credits rolled", PAUSED: "intermission", DROPPED: "left the cinema", REPEATING: "second screening" },
    line: { CURRENT: "The film is rolling…", PLANNING: "Popcorn is ready. Just pick a night.", COMPLETED: "The credits rolled. Movie night complete!", PAUSED: "Intermission.", DROPPED: "Walked out of the cinema.", REPEATING: "Second screening, same seat." }
  },
  fantasy: {
    label: "Fantasy", match: ["fantasy"], color: 0x2DBE8A, icon: "🐉", full: "🟩", empty: "⬛", footer: "🐉 Fantasy · Tokyo Brotherhood",
    author: kind => "🐉 REALM CHRONICLE · " + (kind === "manga" ? "NEW CHAPTER" : "NEW EPISODE"), done: "👑 LEGEND COMPLETE",
    names: { romaji: "🧙 Romaji", status: "🗡️ Quest", left: "⏳ Left", manga: "📜 Chapter", anime: "📺 Episode" },
    status: { CURRENT: "adventure ongoing", PLANNING: "map unrolled", COMPLETED: "legend complete", PAUSED: "camping for the night", DROPPED: "turned back at the gates", REPEATING: "a new campaign" },
    line: { CURRENT: "The adventure goes on…", PLANNING: "The map is unrolled. The journey waits.", COMPLETED: "The legend is complete. Songs will be sung.", PAUSED: "Camping for the night.", DROPPED: "Turned back at the gates.", REPEATING: "A new campaign begins." }
  },
  favourite: {
    label: "Favourite", match: ["fav"], color: 0xFFC83D, icon: "⭐", full: "🟨", empty: "⬛", footer: "⭐ Favourites · Tokyo Brotherhood",
    author: kind => "⭐ HALL OF FAME · " + (kind === "manga" ? "NEW CHAPTER" : "NEW EPISODE"), done: "🏆 ADDED TO THE HALL OF FAME",
    names: { romaji: "✨ Romaji", status: "🏅 Status", left: "⏳ Left", manga: "💛 Chapter", anime: "💛 Episode" },
    status: { CURRENT: "a favourite in progress", PLANNING: "a future favourite?", COMPLETED: "hall of fame", PAUSED: "waiting for more", DROPPED: "fell out of favour", REPEATING: "revisiting a classic" },
    line: { CURRENT: "A favourite, one step further.", PLANNING: "Could this be the next favourite?", COMPLETED: "Finished, and it stays in the hall of fame.", PAUSED: "Waiting for more of a favourite.", DROPPED: "Even favourites fall out of favour.", REPEATING: "Revisiting a classic." }
  },
  continue: {
    label: "Plan to Continue", match: ["plantocontinue", "continue"], color: 0x2EC4B6, icon: "▶️", full: "🟦", empty: "⬜", footer: "⏯️ Plan to continue · Tokyo Brotherhood",
    author: kind => "⏯️ UP NEXT · PICK UP WHERE YOU LEFT OFF", done: "✅ ALL CAUGHT UP",
    names: { romaji: "🔖 Romaji", status: "📌 Status", left: "⏳ Left", manga: "⏯️ Stopped at chapter", anime: "⏯️ Stopped at episode" },
    status: { CURRENT: "back in the groove", PLANNING: "bookmarked", COMPLETED: "all caught up", PAUSED: "waiting to resume", DROPPED: "not continuing", REPEATING: "from the start again" },
    line: { CURRENT: "Back in the groove.", PLANNING: "Bookmarked. Ready when you are.", COMPLETED: "All caught up!", PAUSED: "Waiting to be picked back up.", DROPPED: "Not continuing this one.", REPEATING: "Starting over from the beginning." }
  },
  planning: {
    label: "Planning", match: ["planning"], color: 0x6C8CFF, icon: "📝", full: "🟦", empty: "⬜", footer: "🗓️ Planning · Tokyo Brotherhood",
    author: kind => "🗓️ ON THE RADAR · " + (kind === "manga" ? "READING LIST" : "WATCHLIST"), done: "✅ OFF THE LIST",
    names: { romaji: "📝 Romaji", status: "🗓️ Status", left: "⏳ Left", manga: "📖 Chapter", anime: "📺 Episode" },
    status: { CURRENT: "finally started", PLANNING: "on the radar", COMPLETED: "off the list", PAUSED: "back on hold", DROPPED: "taken off the list", REPEATING: "again" },
    line: { CURRENT: "Finally started it!", PLANNING: "Added to the list. Someday soon.", COMPLETED: "Crossed off the list!", PAUSED: "Back on hold.", DROPPED: "Taken off the list.", REPEATING: "Going again." }
  }
};
const tsSimple = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
// Which theme a list has: the one whose names appear in the list's name ("Isekai", "Rom Com", "Rom-Com 2" ...). "" = standard look.
function tsThemeFor(cat){
  const n = tsSimple(cat && cat.name);
  if(!n || !(cat && cat.own)) return "";   // only lists that have their own thread are themed; General Updates stays standard
  for(const id of Object.keys(TS_THEMES)) if(TS_THEMES[id].match.some(w => n.includes(w))) return id;
  return "";
}
function tsBar(p, total, full, empty){
  if(!(total > 0)) return "";
  const n = 10, f = Math.max(0, Math.min(n, Math.round(p / total * n)));
  return full.repeat(f) + empty.repeat(n - f) + " " + Math.min(100, Math.round(p / total * 100)) + "%";
}
// The border colour that follows the poster. AniList gives each poster's main colour; it is nudged so it always shows well on Discord's dark
// background (not too dark, not washed out). A grey or black-and-white poster has no real colour, so it keeps the theme's own colour.
function tsAdaptColor(hex, fallback){
  if(!/^#?[0-9a-f]{6}$/i.test(String(hex || ""))) return fallback;
  const n = parseInt(String(hex).replace("#", ""), 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2;
  if(d < 0.001) return fallback;
  const s = d / (1 - Math.abs(2 * l - 1));
  if(!(s >= 0.12)) return fallback;
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h = (h * 60 + 360) % 360;
  const S = Math.min(0.9, Math.max(0.45, s)), L = Math.min(0.66, Math.max(0.5, l));
  const c = (1 - Math.abs(2 * L - 1)) * S, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = L - c / 2;
  const [r1, g1, b1] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const to = v => Math.round((v + m) * 255);
  return (to(r1) << 16) | (to(g1) << 8) | to(b1);
}
function tsThemedCard(e, kind, id, opt){
  const T = TS_THEMES[id], m = e.media || {}, t = m.title || {}, title = t.english || t.romaji || "#" + e.mediaId;
  const total = kind === "manga" ? m.chapters : m.episodes, p = e.progress || 0, st = e.status || "UNKNOWN", done = st === "COMPLETED";
  const left = total ? Math.max(0, total - p) : "?", cover = m.coverImage && m.coverImage.extraLarge, unit = T.unit || (kind === "manga" ? "Chapter" : "Episode"), bar = tsBar(p, total, T.full, T.empty);
  const embed = {
    author: { name: done ? T.done : T.author(kind) },
    title: (T.icon + " " + title).slice(0, 256),
    description: ("**" + unit + " " + p + "**" + (total ? " of " + total : "") + (bar ? "\n" + bar : "") + "\n*" + (T.line[st] || "") + "*").slice(0, 4000),
    color: opt && opt.adaptive ? tsAdaptColor(m.coverImage && m.coverImage.color, T.color) : T.color,
    fields: [
      { name: T.names.romaji, value: t.romaji || "N/A", inline: false },
      { name: T.names.status, value: "**" + st + "**" + (T.status[st] ? " · " + T.status[st] : ""), inline: false },
      { name: T.names[kind === "manga" ? "manga" : "anime"], value: String(p), inline: true },
      { name: T.names.left, value: String(left), inline: true }],
    footer: { text: T.footer }
  };
  if(cover) embed.image = { url: cover };
  return embed;
}
// Which titles get a card. The very first run only remembers progress; a title new to the list, or one whose progress went down, is remembered quietly.
function tsAnnounce(entries, media){
  const seenAny = Object.values(media).some(m => m && m.dp !== undefined), post = [], dp = {};
  for(const e of entries){
    const id = String(e.mediaId), prev = (media[id] || {}).dp, p = e.progress || 0;
    dp[id] = p;
    if(seenAny && prev !== undefined && p > prev) post.push(e);
  }
  return { post, dp, baseline: !seenAny };
}
