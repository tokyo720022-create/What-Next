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
function tsFingerprint(e){
  return tsHash(JSON.stringify([e.status || "", e.score || 0, e.progress || 0, e.progressVolumes || 0, e.repeat || 0, tsDate(e.startedAt), tsDate(e.completedAt), e.private ? 1 : 0, e.notes || ""]));
}

// What to send to MyAnimeList. Dates are left out when empty, unless this title was sent before (then "" clears them).
function tsMalFields(e, type, sentBefore){
  const manga = type === "MANGA", f = { status: TS_MAL_STATUS[type][e.status] || "plan_to_" + (manga ? "read" : "watch"), score: tsScoreMal(e.score) };
  if(manga){ f.num_chapters_read = e.progress || 0; f.num_volumes_read = e.progressVolumes || 0; f.is_rereading = e.status === "REPEATING" ? "true" : "false"; }
  else { f.num_watched_episodes = e.progress || 0; f.is_rewatching = e.status === "REPEATING" ? "true" : "false"; }
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
    if(mode === "baseline"){ for(const t of targets) now[id][key[t]] = fp; continue; }
    const need = targets.filter(t => mode === "all" || prev[key[t]] !== fp);
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
  for(const e of entries){ const id = String(e.mediaId); now[id] = { ...(media[id] || {}), fp: tsFingerprint(e), i: (e.media && e.media.idMal) || (media[id] || {}).i }; }
  parts.forEach((p, n) => {
    const t = targets[n];
    if(modes[t] === "baseline") for(const id in p.now) now[id][key[t]] = p.now[id][key[t]];
    for(const w of p.work){ const cur = byId.get(w.id) || { entry: w.entry, id: w.id, fp: w.fp, need: [] }; cur.need.push(...w.need); byId.set(w.id, cur); }
  });
  return { work: [...byId.values()], now, removed: parts.length ? parts[0].removed : [] };
}
