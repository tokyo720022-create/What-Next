/* js/features/notify-math.js: the maths behind release reminders and the notification list. No screen code here, so it can be unit tested.
   Reminders: for each airing anime on your list, up to three phone notifications per episode (3 hours before, 30 minutes before, when it airs). */
const NF_SLOTS = [{ key: "h3", before: 10800, left: "airs in 3 hours" }, { key: "m30", before: 1800, left: "airs in 30 minutes" }, { key: "live", before: 0, left: "is airing now" }];
const NF_HORIZON = 14 * 86400;   // only the next two weeks are scheduled; the app plans again whenever it opens
const NF_MAX = 400;              // Android keeps at most about 500 alarms per app: stay well under
const NF_UPDATE_TYPES = ["RELATED_MEDIA_ADDITION", "MEDIA_DATA_CHANGE", "MEDIA_MERGE", "MEDIA_DELETION"];   // a sequel was added, a title on your list changed, merged, deleted
const NF_SOCIAL_TYPES = ["FOLLOWING", "ACTIVITY_MESSAGE", "ACTIVITY_REPLY", "ACTIVITY_MENTION", "ACTIVITY_LIKE", "ACTIVITY_REPLY_LIKE", "ACTIVITY_REPLY_SUBSCRIBED", "THREAD_COMMENT_MENTION", "THREAD_SUBSCRIBED", "THREAD_COMMENT_REPLY", "THREAD_LIKE", "THREAD_COMMENT_LIKE"];
const NF_FILTERS = { all: null, airing: ["AIRING"], titles: NF_UPDATE_TYPES, social: NF_SOCIAL_TYPES };
const NF_LIST_STATUS = ["CURRENT", "REPEATING", "PLANNING"];   // the titles that get reminders: what you watch, rewatch or plan

// Phone notification numbers must fit in a 32-bit integer and stay the same for the same episode, so a re-plan replaces instead of repeating.
const nfId = (mid, ep, slot) => ((mid % 500000) * 1000 + (ep % 999)) * 3 + slot;
const nfDayId = mid => ((mid % 500000) * 1000 + 999) * 3;

// Which AniList notification types the background check asks for.
function nfTypes(cfg){ return (cfg.updates ? NF_UPDATE_TYPES : []).concat(cfg.social ? NF_SOCIAL_TYPES : []); }

// Upcoming episodes of the anime on your list: the one AniList lists as next, plus the schedule rows we fetched (they win when both name the same episode).
function nfEvents(items, rows, now, horizon){
  const mine = new Map(), out = new Map(), end = now + (horizon || NF_HORIZON);
  for(const e of items || []){ if(e && e.media && e.media.type === "ANIME" && NF_LIST_STATUS.includes(e.status)) mine.set(e.media.id, e); }
  const add = (mid, ep, at) => {
    if(!mine.has(mid) || !(ep > 0) || !(at > now) || at > end) return;
    const k = mid + ":" + ep; out.set(k, { mid, ep, at, e: mine.get(mid) });
  };
  for(const e of mine.values()){ const n = e.media.nextAiringEpisode; if(n) add(e.media.id, n.episode, n.airingAt); }
  for(const r of rows || []) if(r) add(r.mediaId, r.episode, r.airingAt);
  return [...out.values()].sort((a, b) => a.at - b.at);
}

// The notifications to schedule. name(media) is the title to show; clock(seconds) the local time of day ("7:00 PM").
function nfBuild(items, rows, cfg, now, name, clock){
  const specs = [], evs = nfEvents(items, rows, now), animeWithEp = new Set(evs.map(x => x.mid));
  for(const x of evs){
    const m = x.e.media, title = name(m);
    NF_SLOTS.forEach((s, i) => {
      if(!cfg[s.key]) return;
      const t = x.at - s.before;
      if(s.before ? t <= now + 5 : x.at <= now) return;   // that moment has passed: no late reminder
      specs.push({ id: nfId(m.id, x.ep, i), at: t, mid: m.id, title, body: "Episode " + x.ep + " " + s.left + (s.before ? " · " + clock(x.at) : "") });
    });
  }
  if(cfg.today){   // titles with a release date and no airing schedule yet (anime that start soon, manga): one reminder on the day, at 9:00
    for(const e of items || []){
      const m = e && e.media, d = m && m.startDate;
      if(!m || m.status !== "NOT_YET_RELEASED" || !NF_LIST_STATUS.includes(e.status) || animeWithEp.has(m.id) || !(d && d.year && d.month && d.day)) continue;
      const at = Math.floor(new Date(d.year, d.month - 1, d.day, 9, 0, 0).getTime() / 1000);
      if(at > now && at <= now + 120 * 86400) specs.push({ id: nfDayId(m.id), at, mid: m.id, title: name(m), body: "Releases today" });
    }
  }
  return specs.sort((a, b) => a.at - b.at).slice(0, NF_MAX);
}
// Anything that should make the reminders be planned again: your list, its air times, and the switches.
function nfSignature(items, cfg){
  const rows = (items || []).filter(e => e && e.media && NF_LIST_STATUS.includes(e.status)).map(e => e.media.id + ":" + e.status + ":" + ((e.media.nextAiringEpisode && e.media.nextAiringEpisode.airingAt) || 0) + ":" + ((e.media.startDate && e.media.startDate.day) || 0)).sort();
  return [cfg.reminders, cfg.h3, cfg.m30, cfg.live, cfg.today].map(Number).join("") + "|" + rows.join(",");
}

// One AniList notification as text for the list. name(media) gives a title. AniList sends the sentence in pieces (contexts / context), so the words are AniList's own.
function nfLine(n, name){
  const t = n.__typename || "", m = n.media, title = m ? name(m) : "", c = s => String(s == null ? "" : s), tidy = s => s.replace(/\s+/g, " ").trim();
  const out = { id: n.id, at: n.createdAt || 0, type: n.type || "", text: "", sub: "", mid: 0, activity: 0, thread: 0, user: null, cover: "" };
  if(m){ out.mid = m.id; out.cover = (m.coverImage && m.coverImage.large) || ""; }
  if(t === "AiringNotification"){
    const k = Array.isArray(n.contexts) ? n.contexts : [];
    out.text = tidy(c(k[0] || "Episode ") + c(n.episode) + c(k[1] || " of ") + title + c(k[2] || " aired."));
  }else if(t === "RelatedMediaAdditionNotification" || t === "MediaDataChangeNotification" || t === "MediaMergeNotification"){
    out.text = tidy((title || "A title") + " " + c(n.context || "was updated."));
    out.sub = tidy(c(n.reason) || (Array.isArray(n.deletedMediaTitles) ? n.deletedMediaTitles.join(", ") : ""));
    if(!out.mid && n.mediaId) out.mid = n.mediaId;
  }else if(t === "MediaDeletionNotification"){
    out.text = tidy((c(n.deletedMediaTitle) || "A title") + " " + c(n.context || "was deleted from AniList."));
    out.sub = tidy(c(n.reason));
  }else{
    const u = n.user; out.user = u ? { id: u.id, name: u.name } : null;
    out.text = tidy((u && u.name || "Someone") + " " + c(n.context || "sent you a notification."));
    out.cover = (u && u.avatar && u.avatar.medium) || "";
    out.activity = Number(n.activityId) || 0; out.thread = Number(n.threadId) || 0;
  }
  return out;
}
