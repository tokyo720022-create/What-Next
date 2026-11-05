/* js/core/pacer.js: keeps the app under AniList's request limit.
   AniList allows a limited number of requests per minute (its docs say 90, and 30 while the API is degraded) and answers 429 with a Retry-After
   when you go over. The real limit is read from the X-RateLimit-Limit header of the answers, so until the first answer nothing is held back.
   Reading screens keep a few requests in reserve, so saving your change is never stuck behind a big load. */
function makePacer(opts){
  const log = [];                 // start times of the requests of the last minute
  let cap = Infinity, hold = 0;   // cap: requests per minute. hold: nothing may be sent before this time (after a 429)
  const busy = ms => { const e = new Error("AniList is busy right now (too many requests). Try again in about " + Math.max(1, Math.ceil(ms / 1000)) + " seconds."); e.net = true; return e; };
  return {
    setLimit(limit){ if(limit > 0) cap = Math.max(6, limit - 2); },
    setHold(ms){ hold = opts.now() + ms; },
    holdLeft(){ return Math.max(0, hold - opts.now()); },
    async pace(isChange){
      for(;;){
        const now = opts.now();
        while(log.length && now - log[0] > 60000) log.shift();
        if(hold > now){ if(hold - now > opts.maxWait) throw busy(hold - now); await opts.sleep(hold - now + 50); continue; }
        const room = isChange ? cap : cap - Math.min(4, Math.floor(cap / 4));   // changes may use the reserve
        if(log.length < room){ log.push(now); return; }
        const wait = 60000 - (now - log[0]) + 50;
        if(wait > opts.maxWait) throw busy(wait);
        await opts.sleep(wait);
      }
    },
    busy
  };
}
