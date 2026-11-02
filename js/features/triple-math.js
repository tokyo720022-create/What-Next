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
const TS_DC_LISTS = "anime movies, iseki, isekai, milf, loli, rom com, plan to continue, hentai, favourite, fav, planning, tensei";
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
function tsCard(e, kind, cat){
  const m = e.media || {}, t = m.title || {}, title = t.english || t.romaji || "#" + e.mediaId, total = kind === "manga" ? m.chapters : m.episodes, p = e.progress || 0;
  const left = total ? Math.max(0, total - p) : "?", cover = m.coverImage && m.coverImage.extraLarge, done = e.status === "COMPLETED";
  const embed = { title: ("UPDATE: " + title).slice(0, 256), color: tsHexInt(m.coverImage && m.coverImage.color),
    fields: [{ name: "🇯🇵 Romaji", value: t.romaji || "N/A", inline: false }, { name: "📊 Status", value: e.status || "UNKNOWN", inline: false }, { name: "✅ Progress", value: String(p), inline: true }, { name: "⏳ Left", value: String(left), inline: true }],
    footer: { text: cat.own ? tsPyTitle(cat.name) : "General Updates" } };
  if(cover) embed.image = { url: cover };
  if(done) embed.author = { name: "🏆 SERIES COMPLETED" };
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
