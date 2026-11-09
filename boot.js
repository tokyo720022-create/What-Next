/* boot.js: loads the screen files, then the script files in order, then the app starts. */
(function(){
  const REV = "3.0.0-r9"; window.__REV = REV;   // change this whenever files change, so a phone never mixes old and new files
  const VIEWS = [["screens", "views/shell/header.html"], ["screens", "views/shell/tabs.html"], ["screens", "views/screens/login.html"], ["screens", "views/screens/pick.html"], ["screens", "views/screens/discover.html"], ["screens", "views/screens/seasonal.html"], ["screens", "views/screens/taste.html"], ["screens", "views/screens/calendar.html"], ["screens", "views/screens/chat.html"], ["screens", "views/screens/schedule.html"], ["screens", "views/screens/stats.html"], ["screens", "views/screens/lists.html"], ["screens", "views/screens/profile.html"], ["screens", "views/settings/menu.html"], ["screens", "views/settings/app.html"], ["screens", "views/settings/anilist.html"], ["screens", "views/settings/lists.html"], ["screens", "views/settings/sync.html"], ["screens", "views/settings/account.html"], ["screens", "views/settings/about.html"], ["overlays", "views/sheets/filter.html"], ["overlays", "views/sheets/customise.html"], ["overlays", "views/sheets/overlays.html"], ["overlays", "views/sheets/relmap.html"], ["overlays", "views/sheets/user.html"]];
  const SCRIPTS = ["js/core/compat.js", "js/core/cache.js", "js/core/pacer.js", "js/core/markup.js", "js/core/diagnostics.js", "js/core/core.js", "js/core/tabs.js", "js/features/discover.js", "js/core/auth.js", "js/core/tracker.js", "js/core/session.js", "js/features/pick-extras.js", "js/features/schedule-stats.js", "js/features/chat.js", "js/features/triple-math.js", "js/features/sync.js", "js/features/lists.js", "js/features/profile.js", "js/features/profile-extra.js", "js/core/theme.js", "js/features/media.js", "js/features/entity.js", "js/features/editor.js", "js/features/trending.js", "js/features/settings.js", "js/features/about.js", "js/features/app-settings.js", "js/features/anistats.js", "js/features/list-settings.js", "js/features/relmap.js", "js/features/users.js", "js/features/seasonal.js", "js/features/taste-math.js", "js/features/taste.js", "js/features/pick-taste.js", "js/features/refresh.js", "js/features/calendar.js", "js/core/start.js"];
  const T0 = Date.now(), SPLASH_MS = (() => { try{ const a = JSON.parse(localStorage.getItem("wn_app") || "{}"); return a.splash === false ? 0 : 1100; }catch(_){ return 1100; } })();   // the logo splash stays at least this long, then fades out
  // The logo screen stays until the first screen is ready underneath it (start.js and loadList call this), but never longer than 4.5 s.
  let readyRes; const ready = new Promise(r => { readyRes = r; }); window.__wnReady = () => readyRes();
  let done = 0; const total = VIEWS.length + SCRIPTS.length;
  const tick = () => { done++; const f = document.getElementById("bootFill"); if(f) f.style.width = Math.max(6, Math.round(done / total * 100)) + "%"; };   // the loading bar on the logo screen
  const fail = msg => { document.body.innerHTML = '<div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:24px;text-align:center;background:#0A0714;color:#F2EEFF;font:16px sans-serif"><p style="margin:0">Couldn\'t load the app (' + msg + ').</p><button onclick="location.reload()" style="padding:12px 28px;border:0;border-radius:24px;background:#fff;color:#0A0714;font:600 16px sans-serif">Try again</button></div>'; };
  Promise.all(VIEWS.map(v => fetch(v[1] + "?v=" + REV, { cache: "no-cache" }).then(r => { if(!r.ok) throw new Error(v[1] + " " + r.status); return r.text(); }).then(t => { tick(); return t; })))
    .then(async texts => {
      const html = { screens: "", overlays: "" };
      VIEWS.forEach((v, i) => { html[v[0]] += texts[i] + "\n"; });
      document.getElementById("screens").innerHTML = html.screens;
      document.getElementById("overlays").innerHTML = html.overlays;
      for(const f of SCRIPTS){
        await new Promise((ok, bad) => { const s = document.createElement("script"); s.src = f + "?v=" + REV; s.onload = () => { tick(); ok(); }; s.onerror = () => bad(new Error("missing " + f)); document.body.append(s); });
      }
      const wait = SPLASH_MS - (Date.now() - T0); if(wait > 0) await new Promise(r => setTimeout(r, wait));
      await Promise.race([ready, new Promise(r => setTimeout(r, Math.max(0, 4500 - (Date.now() - T0))))]);
      const splash = document.getElementById("boot");   // every button has its code now
      if(splash){ splash.classList.add("out"); setTimeout(() => splash.remove(), 380); }
    })
    .catch(e => fail(e.message));
})();
