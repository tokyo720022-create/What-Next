// Unit tests for the release reminder and notification list maths in js/features/notify-math.js, and for how the screens use them. Run: node tests/unit/notify.test.js
const fs = require("fs"), vm = require("vm"), path = require("path");
const ROOT = path.join(__dirname, "../..");
const ctx = { console, Date, Math, Number, String, Array, Set, Map }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, "js/features/notify-math.js"), "utf8"), ctx);
const g = n => vm.runInContext(n, ctx), read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
let pass = 0, fail = 0;
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pass++ : fail++; console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "\n   got  " + JSON.stringify(got) + "\n   want " + JSON.stringify(want))); };
const yes = (name, cond) => eq(name, !!cond, true);

const NOW = 1800000000, nfBuild = g("nfBuild"), nfEvents = g("nfEvents"), nfLine = g("nfLine"), nfId = g("nfId");
const ALL = { reminders: true, h3: true, m30: true, live: true, today: true }, name = m => m.title.romaji, clock = () => "7:00 PM";
const anime = (id, status, next, o) => ({ status, progress: 0, media: Object.assign({ id, type: "ANIME", status: "RELEASING", title: { romaji: "Show " + id }, nextAiringEpisode: next || null, startDate: {} }, o || {}) });

// ---- ids
yes("ids fit in a 32-bit integer for the biggest AniList ids and episode numbers", [[499999, 998, 2], [1, 1, 0], [600000, 2500, 1]].every(([m, e, s]) => { const i = nfId(m, e, s); return Number.isInteger(i) && i >= 0 && i < 2147483647; }));
yes("the three reminders of one episode, and the next episode, all get different ids", new Set([0, 1, 2].map(s => nfId(5, 7, s)).concat([0, 1, 2].map(s => nfId(5, 8, s)))).size === 6);
eq("the same episode always gets the same ids, so planning again replaces and never repeats", [0, 1, 2].map(s => nfId(21, 1100, s)), [0, 1, 2].map(s => nfId(21, 1100, s)));
yes("the release-day id of a title never equals one of its episode ids", [0, 1, 2].every(s => g("nfDayId")(9) !== nfId(9, 5, s)) && g("nfDayId")(9) % 3 === 0);

// ---- three reminders per episode
{
  const at = NOW + 5 * 3600, specs = nfBuild([anime(1, "CURRENT", { episode: 7, airingAt: at })], [], ALL, NOW, name, clock);
  eq("an episode in 5 hours: 3 hours before, 30 minutes before, and when it airs", specs.map(s => [s.at - at, s.body]), [[-10800, "Episode 7 airs in 3 hours · 7:00 PM"], [-1800, "Episode 7 airs in 30 minutes · 7:00 PM"], [0, "Episode 7 is airing now"]]);
  eq("the notification title is the show's name and tapping it can open the title page", [specs[0].title, specs[0].mid], ["Show 1", 1]);
}
{
  const at = NOW + 2 * 3600, specs = nfBuild([anime(1, "CURRENT", { episode: 3, airingAt: at })], [], ALL, NOW, name, clock);
  eq("an episode in 2 hours: the 3-hour reminder is already past and is skipped", specs.map(s => s.at - at), [-1800, 0]);
}
{
  const at = NOW + 600, specs = nfBuild([anime(1, "CURRENT", { episode: 3, airingAt: at })], [], ALL, NOW, name, clock);
  eq("an episode in 10 minutes: only the airing reminder is left", specs.map(s => s.at - at), [0]);
  eq("an episode that has aired already gets nothing", nfBuild([anime(1, "CURRENT", { episode: 3, airingAt: NOW - 60 })], [], ALL, NOW, name, clock), []);
}
{
  const at = NOW + 5 * 3600, it = [anime(1, "CURRENT", { episode: 7, airingAt: at })];
  eq("each reminder can be switched off", [{ h3: false }, { m30: false }, { live: false }].map(o => nfBuild(it, [], Object.assign({}, ALL, o), NOW, name, clock).length), [2, 2, 2]);
  eq("everything off: nothing is planned", nfBuild(it, [], { reminders: true, h3: false, m30: false, live: false, today: false }, NOW, name, clock), []);
}

// ---- which titles
{
  const at = NOW + 5 * 3600, next = { episode: 2, airingAt: at };
  const items = [anime(1, "CURRENT", next), anime(2, "PLANNING", next), anime(3, "REPEATING", next), anime(4, "COMPLETED", next), anime(5, "DROPPED", next), anime(6, "PAUSED", next), { status: "CURRENT", progress: 0, media: { id: 7, type: "MANGA", status: "RELEASING", title: { romaji: "Manga" }, nextAiringEpisode: next, startDate: {} } }];
  eq("only anime that you watch, rewatch or plan get reminders (not completed, dropped, paused or manga)", [...new Set(nfBuild(items, [], ALL, NOW, name, clock).map(s => s.mid))].sort(), [1, 2, 3]);
}
{
  const a = NOW + 2 * 86400, rows = [{ mediaId: 1, episode: 5, airingAt: a }, { mediaId: 1, episode: 6, airingAt: a + 7 * 86400 }, { mediaId: 1, episode: 7, airingAt: a + 20 * 86400 }, { mediaId: 99, episode: 1, airingAt: a }];
  const evs = nfEvents([anime(1, "CURRENT", { episode: 5, airingAt: a })], rows, NOW);
  eq("the next episode and the schedule are merged, one entry per episode, titles not on your list and dates beyond two weeks left out", evs.map(e => [e.mid, e.ep, e.at]), [[1, 5, a], [1, 6, a + 7 * 86400]]);
  eq("a changed air time from the schedule wins over the one saved in your list", nfEvents([anime(1, "CURRENT", { episode: 5, airingAt: a })], [{ mediaId: 1, episode: 5, airingAt: a + 3600 }], NOW).map(e => e.at), [a + 3600]);
}
// ---- release day (anime without an episode schedule yet, manga)
{
  const d = new Date(NOW * 1000 + 10 * 86400000), at = Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9, 0, 0).getTime() / 1000);
  const m = (id, type, st, o) => ({ status: st, progress: 0, media: Object.assign({ id, type, status: "NOT_YET_RELEASED", title: { romaji: "T" + id }, nextAiringEpisode: null, startDate: { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() } }, o || {}) });
  const specs = nfBuild([m(10, "MANGA", "PLANNING"), m(11, "ANIME", "PLANNING"), m(12, "MANGA", "COMPLETED"), m(13, "MANGA", "PLANNING", { startDate: { year: 2027, month: 3, day: null } }), m(14, "ANIME", "PLANNING", { nextAiringEpisode: { episode: 1, airingAt: NOW + 10 * 86400 } })], [], ALL, NOW, name, clock);
  eq("a title with a full release date gets one reminder at 9:00 on that day (manga and anime alike)", specs.filter(s => s.body === "Releases today").map(s => [s.mid, s.at]).sort((a, b) => a[0] - b[0]), [[10, at], [11, at]]);
  eq("no day reminder for a partial date, a title you finished, or an anime that already has an episode schedule (it gets the three reminders)", specs.filter(s => [12, 13].includes(s.mid)).length + specs.filter(s => s.mid === 14 && s.body === "Releases today").length, 0);
  eq("the release-day reminders can be switched off", nfBuild([m(10, "MANGA", "PLANNING")], [], Object.assign({}, ALL, { today: false }), NOW, name, clock), []);
}
// ---- the cap
{
  const items = Array.from({ length: 300 }, (_, i) => anime(i + 1, "CURRENT", { episode: 2, airingAt: NOW + 4 * 3600 + i * 60 }));
  const specs = nfBuild(items, [], ALL, NOW, name, clock);
  yes("never more than 400 at once (Android allows about 500 alarms), earliest first", specs.length === 400 && specs.every((s, i) => i === 0 || specs[i - 1].at <= s.at) && new Set(specs.map(s => s.id)).size === 400);
}
// ---- when to plan again
{
  const sig = g("nfSignature"), a = anime(1, "CURRENT", { episode: 2, airingAt: NOW + 100 }), base = sig([a], ALL);
  yes("the plan is redone when an air time moves, a title joins or leaves, a status changes or a switch changes", [sig([anime(1, "CURRENT", { episode: 2, airingAt: NOW + 200 })], ALL), sig([a, anime(2, "PLANNING", null)], ALL), sig([], ALL), sig([anime(1, "PLANNING", { episode: 2, airingAt: NOW + 100 })], ALL), sig([a], Object.assign({}, ALL, { h3: false }))].every(x => x !== base));
  yes("and not when only progress changes", sig([Object.assign({}, a, { progress: 5 })], ALL) === base);
}
// ---- which AniList types the background check asks for
eq("background types follow the two switches", [g("nfTypes")({ updates: true, social: false }).length, g("nfTypes")({ updates: false, social: false }).length, g("nfTypes")({ updates: false, social: true }).length], [4, 0, 12]);
yes("sequel added and title changed are in the title types", ["RELATED_MEDIA_ADDITION", "MEDIA_DATA_CHANGE"].every(t => g("NF_UPDATE_TYPES").includes(t)));
yes("every type name is one AniList lets you switch (the app's own list of AniList notification types)", [...g("NF_UPDATE_TYPES"), ...g("NF_SOCIAL_TYPES")].every(t => new RegExp("\\b" + t + ":").test(read("js/features/settings.js"))));

// ---- text of the list (the words come from AniList)
const T = m => m.title.romaji;
eq("episode aired", nfLine({ __typename: "AiringNotification", id: 1, createdAt: 5, episode: 6, contexts: ["Episode ", " of ", " aired."], media: { id: 3, title: { romaji: "Toaru Anbu no ITEM" }, coverImage: { large: "c.jpg" } } }, T).text, "Episode 6 of Toaru Anbu no ITEM aired.");
{
  const l = nfLine({ __typename: "RelatedMediaAdditionNotification", id: 2, createdAt: 9, context: " was recently added to the site.", media: { id: 4, title: { romaji: "Sequel S2" } } }, T);
  eq("a sequel was added: the title and AniList's sentence, and it opens the title", [l.text, l.mid], ["Sequel S2 was recently added to the site.", 4]);
}
{
  const l = nfLine({ __typename: "MediaDataChangeNotification", id: 3, createdAt: 9, context: "was recently edited.", reason: "Status changed to Finished.", media: { id: 5, title: { romaji: "Done Show" } } }, T);
  eq("a title on your list changed: the sentence and the reason on a second line", [l.text, l.sub, l.mid], ["Done Show was recently edited.", "Status changed to Finished.", 5]);
}
{
  const l = nfLine({ __typename: "ActivityLikeNotification", id: 4, createdAt: 9, activityId: 77, context: " liked your activity.", user: { id: 8, name: "ttplayx", avatar: { medium: "a.jpg" } } }, T);
  eq("someone liked your activity: name, sentence, avatar and the activity to open", [l.text, l.cover, l.activity, l.thread, l.mid], ["ttplayx liked your activity.", "a.jpg", 77, 0, 0]);
  eq("a missing sentence or name never shows the word null or undefined", nfLine({ __typename: "FollowingNotification", id: 5, user: null, context: null }, T).text, "Someone sent you a notification.");
  eq("a forum notification keeps the thread to open", nfLine({ __typename: "ThreadLikeNotification", id: 6, threadId: 12, context: " liked your forum thread.", user: { id: 1, name: "x" } }, T).thread, 12);
}
eq("a deleted title is named from AniList's own text", nfLine({ __typename: "MediaDeletionNotification", id: 7, deletedMediaTitle: "Old", context: " was deleted from the site.", reason: "Duplicate" }, T).text, "Old was deleted from the site.");

// ---- how the screens use it
const boot = read("boot.js"), sw = read("js/features/notify.js"), feed = read("js/features/notify-feed.js"), tabs = read("js/core/tabs.js");
yes("the new files are loaded, the maths before the code that uses it, all before the app starts", boot.indexOf("notify-math.js") > 0 && boot.indexOf("notify-math.js") < boot.indexOf("js/features/notify.js") && boot.indexOf("js/features/notify-feed.js") < boot.indexOf("js/core/start.js") && boot.includes("views/screens/notifications.html") && boot.includes("views/settings/notify.html"));
yes("the app starts the reminders after login (start.js) and on every list load, list change and return to the app", /nfStarted\(\)/.test(read("js/core/start.js")) && /nfSoon\(\)/.test(read("js/core/core.js")) && /nfSoon\(\)/.test(read("js/core/tracker.js")) && /nfResume\(\)/.test(read("js/core/auth.js")));
yes("signing out clears the reminders, the background check and the seen marker", /nfSignedOut\(\)/.test(read("js/core/auth.js")) && /nfClear\(LN\)/.test(sw) && /configure\(\{ enabled: false/.test(sw) && /"wn_nf_seen"/.test(read("js/core/session.js")));
yes("reminders are planned from the phone's own plugin, in a high-importance channel, allowed while idle, with the small icon", /nativePlugin\("LocalNotifications"\)/.test(sw) && /importance: 4/.test(sw) && /allowWhileIdle: true/.test(sw) && /smallIcon: "ic_stat_whatnext"/.test(sw));
yes("the permission box is only shown once by itself; the buttons can ask again", /!nfCfg\(\)\.asked/.test(sw) && /nfAllowed\(LN, true, true\)/.test(sw));
yes("tapping a reminder opens that title; the background alerts open the list (and only after login)", /localNotificationActionPerformed/.test(sw) && /openMedia\(id\)/.test(sw) && /nfWant && nfReady && auth\.token/.test(sw));
yes("the Notifications screen is reachable (bell, back button, pull to refresh) and the settings page is in the menu", /"notifications": "#notifs"|notifications: "#notifs"/.test(tabs) && /"set-notify": "#setNotify"/.test(tabs) && /#setNotify/.test(read("js/features/settings.js")) && /data-go="set-notify"/.test(read("views/settings/menu.html")) && /"#notifs"/.test(read("js/features/refresh.js")) && /id="bellBtn"/.test(read("views/shell/header.html")));
yes("opening the list asks AniList to mark them read, later pages do not, and every user-controlled word goes in as text", /r: page === 1/.test(feed) && !/innerHTML/.test(feed + sw));
yes("links to AniList open through the app's safe opener (https only)", /openExternal\("https:\/\/anilist\.co\/activity\//.test(feed) && /openExternal\("https:\/\/anilist\.co\/forum\/thread\//.test(feed));
console.log("\n" + pass + " passed, " + fail + " failed"); process.exit(fail ? 1 : 0);
