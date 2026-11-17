/* js/features/widgets-math.js: what the home screen widgets show, worked out from your lists. No screen or phone code, so it can be unit tested.
   The app turns your data into one small snapshot (titles, cover addresses, times, progress); the Android widgets only draw it. */
const WG_AIR_DAYS = 7;
const WG_LIST = ["CURRENT", "REPEATING", "PLANNING"];
const wgCover = m => { const u = m && m.coverImage && m.coverImage.large; return /^https:\/\//.test(u || "") ? u : ""; };
const wgDay = now => { const d = new Date(now * 1000); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
const wgShow = (m, adult) => !!m && (adult || !m.isAdult);   // 18+ titles stay out of the widgets unless you allow them

// The next episode of each anime on your list that airs within a week (or in the last 15 minutes), soonest first.
function wgAiring(items, now, name, adult){
  return (items || []).filter(e => e && e.media && e.media.type === "ANIME" && WG_LIST.includes(e.status) && wgShow(e.media, adult) && e.media.nextAiringEpisode && e.media.nextAiringEpisode.airingAt >= now - 900 && e.media.nextAiringEpisode.airingAt <= now + WG_AIR_DAYS * 86400)
    .sort((a, b) => a.media.nextAiringEpisode.airingAt - b.media.nextAiringEpisode.airingAt || a.media.id - b.media.id).slice(0, 8)
    .map(e => ({ id: e.media.id, t: name(e.media), c: wgCover(e.media), ep: e.media.nextAiringEpisode.episode, at: e.media.nextAiringEpisode.airingAt, ty: "ANIME" }));
}
// What you are watching or reading, the most recently touched first when that is known (upd: id -> time of your last change).
function wgContinue(items, upd, name, adult){
  const total = m => (m.type === "MANGA" ? m.chapters : m.episodes) || 0;
  return (items || []).filter(e => e && e.media && (e.status === "CURRENT" || e.status === "REPEATING") && wgShow(e.media, adult))
    .map((e, i) => ({ e, i, u: (upd && upd[e.media.id]) || 0 })).sort((a, b) => b.u - a.u || a.i - b.i).slice(0, 4)
    .map(x => ({ id: x.e.media.id, t: name(x.e.media), c: wgCover(x.e.media), p: x.e.progress || 0, total: total(x.e.media), ty: x.e.media.type === "MANGA" ? "MANGA" : "ANIME" }));
}
// The titles you changed last: entries are { updatedAt, media } from your loaded lists.
function wgUpdates(entries, name, adult){
  const seen = new Set();
  return (entries || []).filter(e => e && e.media && e.updatedAt > 0 && wgShow(e.media, adult)).sort((a, b) => b.updatedAt - a.updatedAt || a.media.id - b.media.id)
    .filter(e => !seen.has(e.media.id) && seen.add(e.media.id)).slice(0, 8)
    .map(e => ({ id: e.media.id, c: wgCover(e.media), t: name(e.media), ty: e.media.type === "MANGA" ? "MANGA" : "ANIME" }));
}
// Days in a row with at least one update. Today not done yet does not break it (risk: true) until the day is over.
function wgStreak(days, now){
  const set = new Set(days || []), day = n => wgDay(now - n * 86400);
  let n = set.has(day(0)) ? 0 : 1, count = 0;
  while(set.has(day(n)) && count < 400){ count++; n++; }
  const week = []; for(let i = 6; i >= 0; i--) week.push(set.has(day(i)) ? 1 : 0);
  return { days: count, risk: count > 0 && !set.has(day(0)), week };
}
// Days with activity from an epoch-seconds list (updatedAt of your entries) joined with the days the app saw you change something yourself.
function wgDays(updatedAts, own, now){
  const out = new Set(own || []);
  for(const t of updatedAts || []) if(t > 0 && t <= now + 86400) out.add(wgDay(t));
  return [...out];
}
// src: { items, lists: { anime, manga }, pick: { id, title, cover, why } | null, days, adult, name, now }
function wgSnapshot(src){
  const now = src.now, lists = src.lists || {}, all = [].concat(lists.anime || [], lists.manga || []);
  const upd = {}; for(const e of all) if(e.media && e.updatedAt > 0) upd[e.media.id] = e.updatedAt;
  const updates = wgUpdates(all, src.name, src.adult);
  return {
    v: 1, at: now,
    airing: wgAiring(src.items, now, src.name, src.adult),
    continue: wgContinue(src.items, upd, src.name, src.adult),
    updates: updates.length ? updates : wgContinue(src.items, {}, src.name, src.adult).map(x => ({ id: x.id, c: x.c, t: x.t, ty: x.ty })),
    streak: wgStreak(wgDays(all.map(e => e.updatedAt), src.days, now), now),
    pick: src.pick && src.pick.id ? { id: src.pick.id, t: String(src.pick.title || ""), c: /^https:\/\//.test(src.pick.cover || "") ? src.pick.cover : "", why: String(src.pick.why || "") } : null
  };
}
