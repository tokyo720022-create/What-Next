# Test harness: serves the app and fakes AniList (it keeps its own state, like the real one).
# Run any *.e2e.py file here, or all of them with run_all.py. Needs: pip install playwright && playwright install chromium
import json, re, sys, threading, http.server, socketserver, functools, os, time
from playwright.sync_api import sync_playwright

SITE = os.environ.get("SITE") or os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PORT = 8099

def serve():
    h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=SITE)
    class Q(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
    h = functools.partial(Q, directory=SITE)
    socketserver.TCPServer.allow_reuse_address = True
    srv = socketserver.TCPServer(("127.0.0.1", PORT), h)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv

STAT_A = ["CURRENT"] * 6 + ["REPEATING"] + ["PLANNING"] * 8 + ["COMPLETED"] * 10 + ["PAUSED"] * 3 + ["DROPPED"] * 3
def entry(i, typ):
    st = STAT_A[i % len(STAT_A)]
    total = 12 if typ == "ANIME" else 40
    return {"entryId": 5000 + i, "repeat": 0, "startedAt": {"year": None, "month": None, "day": None}, "completedAt": {"year": None, "month": None, "day": None}, "notes": None, "priority": 0, "private": False, "customLists": {},
            "mediaId": 1000 + i, "status": st, "progress": (i * 3) % (total + 1) if st != "PLANNING" else 0, "score": (i * 7) % 101 if i % 3 else 0, "updatedAt": 1700000000 + i,
            "media": {"id": 1000 + i, "type": typ, "isAdult": False, "siteUrl": "https://anilist.co/%s/%d" % (typ.lower(), 1000 + i),
                      "title": {"romaji": "Romaji Title %d" % i, "english": ("English Title %d" % i) if i % 4 else None, "native": "x"},
                      "coverImage": {"large": "https://img.test/c%d.jpg" % i, "extraLarge": "https://img.test/c%d.jpg" % i},
                      "format": "TV" if typ == "ANIME" else "MANGA", "status": "FINISHED", "episodes": total if typ == "ANIME" else None, "chapters": total if typ == "MANGA" else None,
                      "duration": 24, "averageScore": 60 + i % 30, "popularity": 1000 - i, "genres": ["Action", "Comedy"] if i % 2 else ["Drama"], "countryOfOrigin": "JP", "startDate": {"year": 2000 + i % 25},
                      "nextAiringEpisode": None}}

N = int(os.environ.get("N", "130"))
DATA = {"ANIME": [entry(i, "ANIME") for i in range(N)], "MANGA": [entry(i, "MANGA") for i in range(N // 2)]}
SAVED = []
FAVS = []; FAVSTATE = {}
LISTOPT = {"scoreFormat": "POINT_100", "rowOrder": "updatedAt",
    "animeList": {"sectionOrder": ["Watching", "Rewatching", "Completed", "Planning", "Completed TV", "Completed Movie"], "splitCompletedSectionByFormat": True, "customLists": ["Anime movies", "Iseki", "Milf"], "advancedScoring": ["Story", "Characters", "Visuals"], "advancedScoringEnabled": True},
    "mangaList": {"sectionOrder": ["Reading", "Hentai", "Completed", "Rereading"], "splitCompletedSectionByFormat": False, "customLists": ["Hentai", "Fav"], "advancedScoring": ["Story", "Characters", "Visuals"], "advancedScoringEnabled": True},
    "act": {"CURRENT": False, "PLANNING": False, "COMPLETED": False, "DROPPED": False, "PAUSED": False, "REPEATING": True}}
UPDATES = []
RMGRAPH = {1001: [("SOURCE", 5000), ("SEQUEL", 5002), ("SIDE_STORY", 5003), ("SIDE_STORY", 5004), ("SPIN_OFF", 5005), ("ALTERNATIVE", 5006), ("PREQUEL", 5010), ("CHARACTER", 5020)],
    5000: [("ADAPTATION", 1001)], 5002: [("PREQUEL", 1001), ("SEQUEL", 5007)], 5003: [("PARENT", 1001)], 5004: [("PARENT", 1001)], 5005: [("PARENT", 1001)], 5006: [("ALTERNATIVE", 1001)],
    5007: [("PREQUEL", 5002)], 5010: [("SEQUEL", 1001), ("SIDE_STORY", 5011)], 5011: [("PARENT", 5010)], 5020: [("CHARACTER", 1001), ("CHARACTER", 5021)], 5021: [("CHARACTER", 5020)]}
RMREQS = []
FAKEUSERS = {301: {"id": 301, "name": "Moreaumi", "bannerImage": "https://img.test/c8.jpg", "isFollowing": True, "isFollower": True}, 302: {"id": 302, "name": "Orewatokyo720", "bannerImage": None, "isFollowing": True, "isFollower": True},
    303: {"id": 303, "name": "Vaskim", "bannerImage": None, "isFollowing": False, "isFollower": True}, 304: {"id": 304, "name": "cloudberrypies", "bannerImage": None, "isFollowing": True, "isFollower": False}}
FOLLOWERS = [301, 302, 303]; FOLLOWING = [304, 301, 302]
FOLLOWS = []
DREQ = []; SZREQ = []; CZREQ = []
def _cat():
    out = []
    for i in range(45):
        out.append({"id": 7000 + i, "type": "ANIME", "format": "TV", "status": "FINISHED", "isAdult": i % 15 == 14, "title": {"romaji": ("Naruto Clone %d" % i) if i % 5 == 0 else ("Catalog Anime %d" % i), "english": None},
                    "coverImage": {"large": "https://img.test/c%d.jpg" % (i % 9)}, "averageScore": 90 - i, "popularity": 100000 - i * 100, "favourites": 5000 - i * 10, "seasonYear": 2000 + i % 25, "episodes": 12, "chapters": None,
                    "genres": ["Action", "Comedy"] if i % 2 == 0 else ["Drama"], "mediaListEntry": {"status": "COMPLETED"} if i == 2 else {"status": "PLANNING"} if i == 3 else None, "studios": {"nodes": [{"name": "Studio %d" % (i % 4)}]}})
    return out
CATALOG = _cat()
SZ_ITEMS = [
    {"id": 8001, "type": "ANIME", "format": "TV", "status": "RELEASING", "title": {"romaji": "Alpha Season", "english": None}, "coverImage": {"large": "https://img.test/c1.jpg"}, "averageScore": 85, "popularity": 104549, "favourites": 2597, "trending": 90, "startDate": {"year": 2026, "month": 10, "day": 2}, "mediaListEntry": {"status": "PLANNING", "score": 0}, "studios": {"nodes": [{"name": "OLM"}]}},
    {"id": 8002, "type": "ANIME", "format": "TV", "status": "RELEASING", "title": {"romaji": "Bravo Season", "english": None}, "coverImage": {"large": "https://img.test/c2.jpg"}, "averageScore": 87, "popularity": 98232, "favourites": 3149, "trending": 50, "startDate": {"year": 2026, "month": 10, "day": 5}, "mediaListEntry": {"status": "CURRENT", "score": 80}, "studios": {"nodes": [{"name": "Studio Pierrot"}]}},
    {"id": 8003, "type": "ANIME", "format": "TV", "status": "RELEASING", "title": {"romaji": "Charlie Season", "english": None}, "coverImage": {"large": "https://img.test/c3.jpg"}, "averageScore": 81, "popularity": 49666, "favourites": 840, "trending": 10, "startDate": {"year": 2026, "month": 10, "day": 1}, "mediaListEntry": None, "studios": {"nodes": [{"name": "Electric Circus"}]}},
    {"id": 8004, "type": "ANIME", "format": "MOVIE", "status": "NOT_YET_RELEASED", "title": {"romaji": "Delta Movie", "english": None}, "coverImage": {"large": "https://img.test/c4.jpg"}, "averageScore": 70, "popularity": 30000, "favourites": 300, "trending": 5, "startDate": {"year": 2026, "month": 11, "day": 20}, "mediaListEntry": None, "studios": {"nodes": []}},
    {"id": 8005, "type": "ANIME", "format": "ONA", "status": "RELEASING", "title": {"romaji": "Echo Web", "english": None}, "coverImage": {"large": "https://img.test/c5.jpg"}, "averageScore": 66, "popularity": 12000, "favourites": 100, "trending": 2, "startDate": {"year": 2026, "month": 10, "day": 9}, "mediaListEntry": None, "studios": {"nodes": [{"name": "Web Studio"}]}}]
NET = {"off": False, "fail": 0, "delay": 0}

def svg(n):
    return ('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300"><rect width="200" height="300" fill="hsl(%d,60%%,45%%)"/></svg>' % (n * 37 % 360)).encode()

def handle(route, request):
    url = request.url
    if "graphql.anilist.co" in url:
        if NET["off"]: return route.abort("internetdisconnected")
        body = json.loads(request.post_data or "{}"); q = body.get("query", ""); v = body.get("variables", {}) or {}
        if "MediaListCollection" in q:
            if NET["fail"] > 0: NET["fail"] -= 1; return route.abort("failed")
            if NET["delay"]: time.sleep(NET["delay"] / 1000)
        def ok(d): route.fulfill(status=200, content_type="application/json", body=json.dumps({"data": d}))
        if "a:MediaListCollection" in q and "status_in:[PAUSED,DROPPED]" in q:
            return ok({"a": {"lists": [{"entries": [{"score": 80, "media": {**CATALOG[10], "mediaListEntry": {"status": "PAUSED"}}}, {"score": 60, "media": {**CATALOG[11], "mediaListEntry": {"status": "DROPPED"}}}]}]}, "m": {"lists": []}})
        if "MediaListCollection" in q:
            t = v.get("t", "ANIME"); es = DATA[t]
            if v.get("u") and v["u"] != "Tester": es = [{**e, "score": min(100, e["score"] + (6 if i % 4 == 0 and e["score"] else 0))} for i, e in enumerate(es)]
            if "status_in" in q: es = [e for e in es if e["status"] in ("CURRENT", "REPEATING", "PLANNING")]
            full = [{**e, "media": {**e["media"]}} for e in es]
            return ok({"MediaListCollection": {"hasNextChunk": False, "lists": [{"entries": full}]}})
        if "(userId:$id,sort:USERNAME)" in q:
            ids = FOLLOWERS if "followers(userId" in q else FOLLOWING
            return ok({"Page": {"pageInfo": {"hasNextPage": False}, ("followers" if "followers(userId" in q else "following"): [{**FAKEUSERS[i], "avatar": {"large": "https://img.test/c%d.jpg" % (i % 9)}} for i in ids]}})
        if "User(name:$n)" in q:
            u = next((x for x in FAKEUSERS.values() if x["name"].lower() == (v.get("n") or "").lower()), None)
            return ok({"User": {"id": u["id"], "name": u["name"]} if u else None})
        if "ToggleFollow" in q:
            u = FAKEUSERS[v["id"]]; u["isFollowing"] = not u["isFollowing"]; FOLLOWS.append(v["id"])
            return ok({"ToggleFollow": {"id": v["id"], "isFollowing": u["isFollowing"]}})
        if "User(id:$id)" in q and "isFollowing" in q:
            u = FAKEUSERS[v["id"]]
            return ok({"User": {**u, "siteUrl": "https://anilist.co/user/" + u["name"], "about": "Hi, I am " + u["name"] + ". ~!spoiler!~", "avatar": {"large": "https://img.test/c%d.jpg" % (v["id"] % 9)}, "options": {"profileColor": "purple"},
                "statistics": {"anime": {"count": 198, "episodesWatched": 8359, "minutesWatched": 199267, "meanScore": 93.88}, "manga": {"count": 26, "chaptersRead": 4942, "volumesRead": 254, "meanScore": 93.57}}}})
        if "followers(userId" in q or "following(userId" in q:
            if "$id:Int!" not in q.replace(" ", ""):   # AniList rejects a nullable Int where Int! is required
                return route.fulfill(status=400, content_type="application/json", body=json.dumps({"errors": [{"message": "Variable \"$id\" of type \"Int\" used in position expecting type \"Int!\".", "status": 400}]}))
            tot = {301: (12, 9)}.get(v.get("id"), (7, 3))
            return ok({"fo": {"pageInfo": {"total": tot[0]}}, "fe": {"pageInfo": {"total": tot[1]}}})
        if "Viewer{" in q and "bannerImage" in q:
            if NET.get("profileerr"): return route.fulfill(status=500, content_type="application/json", body=json.dumps({"errors": [{"message": "Too Many Requests", "status": 429}], "data": None}))
            return ok({"Viewer": {"id": 1, "name": "Tester", "siteUrl": "https://anilist.co/user/Tester", "about": "Just a normal hardcore otaku ~!hidden twist!~ img200(https://img.test/c7.jpg) [my list](https://anilist.co) " + "long bio text " * 30, "bannerImage": "https://img.test/c8.jpg", "avatar": {"large": "https://img.test/c9.jpg"}, "options": {"profileColor": "pink"},
                "statistics": {"anime": {"count": 464, "episodesWatched": 5100, "minutesWatched": 196000, "meanScore": 80.5}, "manga": {"count": 311, "chaptersRead": 11148, "volumesRead": 473, "meanScore": 94.9612}}}})
        if "genres(limit" in q and "statuses{" in q:
            def stat(kind):
                anime = kind == "anime"; total = 806 if anime else 494
                gen = [("Comedy", 418), ("Fantasy", 357), ("Action", 315), ("Romance", 311), ("Adventure", 252), ("Drama", 196), ("Slice of Life", 174), ("Supernatural", 133), ("Ecchi", 122), ("Sci-Fi", 95), ("Hentai", 62), ("Mystery", 41), ("Psychological", 29), ("Horror", 14), ("Mecha", 13), ("Thriller", 10)]
                if not anime: gen = [("Hentai", 207), ("Fantasy", 183), ("Comedy", 172), ("Romance", 170), ("Ecchi", 113), ("Adventure", 111), ("Action", 98)]
                st = [("PLANNING", 341), ("COMPLETED", 314), ("CURRENT", 111), ("PAUSED", 35), ("DROPPED", 5)] if anime else [("PLANNING", 167), ("COMPLETED", 164), ("CURRENT", 160), ("REPEATING", 2), ("DROPPED", 1)]
                d = {"count": total, "meanScore": 80.5 if anime else 94.96, "minutesWatched": 196000, "episodesWatched": 5100, "chaptersRead": 11148, "volumesRead": 473,
                     "statuses": [{"status": a, "count": b} for a, b in st], "formats": [{"format": "TV", "count": 600}, {"format": "MOVIE", "count": 90}, {"format": "OVA", "count": 40}, {"format": "TV_SHORT", "count": 6}] if anime else [{"format": "MANGA", "count": 400}, {"format": "ONE_SHOT", "count": 60}, {"format": "NOVEL", "count": 4}],
                     "scores": [{"score": 60, "count": 5}, {"score": 70, "count": 30}, {"score": 80, "count": 60}, {"score": 90, "count": 25}],
                     "genres": [{"genre": a, "count": b} for a, b in gen]}
                if "tags(limit" in q:
                    d["tags"] = [{"tag": {"name": "Shounen", "category": "Demographic"}, "count": 239 if anime else 73}, {"tag": {"name": "Seinen", "category": "Demographic"}, "count": 118 if anime else 76}, {"tag": {"name": "Shoujo", "category": "Demographic"}, "count": 53 if anime else 6}, {"tag": {"name": "Josei", "category": "Demographic"}, "count": 18 if anime else 1},
                                 {"tag": {"name": "Male Protagonist", "category": "Cast-Main Cast"}, "count": 300}, {"tag": {"name": "Harem", "category": "Theme-Romance"}, "count": 150}, {"tag": {"name": "Isekai", "category": "Setting-Universe"}, "count": 90}]
                return d
            return ok({("User" if "User(id:$id)" in q else "Viewer"): {"statistics": {"anime": stat("anime"), "manga": stat("manga")}}})
        if "rowOrder" in q and "mutation" not in q:
            return ok({"Viewer": {"options": {"disabledListActivity": [{"type": t, "disabled": d} for t, d in LISTOPT["act"].items()]}, "mediaListOptions": {"scoreFormat": LISTOPT["scoreFormat"], "rowOrder": LISTOPT["rowOrder"], "animeList": LISTOPT["animeList"], "mangaList": LISTOPT["mangaList"]}}})
        if "DeleteCustomList" in q:
            UPDATES.append({"delete": v}); key = "animeList" if v.get("t") == "ANIME" else "mangaList"
            LISTOPT[key]["customLists"] = [n for n in LISTOPT[key]["customLists"] if n != v.get("n")]
            return ok({"DeleteCustomList": {"deleted": True}})
        if "UpdateUser(" in q and "animeListOptions" in q:
            UPDATES.append(v)
            if NET.get("updateerr"): return route.fulfill(status=200, content_type="application/json", body=json.dumps({"errors": [{"message": "Boom"}], "data": None}))
            LISTOPT["scoreFormat"] = v["sf"]; LISTOPT["rowOrder"] = v["ro"]; LISTOPT["animeList"] = v["al"]; LISTOPT["mangaList"] = v["ml"]
            for a in v["da"]: LISTOPT["act"][a["type"]] = a["disabled"]
            return ok({"UpdateUser": {"id": 1}})
        if "id_in:$ids" in q:
            RMREQS.append(v["ids"])
            def rmm(i):
                st = {1001: "COMPLETED", 5002: "PLANNING"}.get(i)
                return {"id": i, "type": "MANGA" if i in (5000, 5011) else "ANIME", "format": "MANGA" if i == 5000 else "TV", "status": "FINISHED", "isAdult": False, "title": {"romaji": "Show %d" % i if i != 1001 else "Root Show", "english": None}, "coverImage": {"medium": "https://img.test/c%d.jpg" % (i % 9)},
                        "averageScore": 70 + i % 20, "seasonYear": 2000 + i % 20, "startDate": {"year": 2000 + i % 20}, "mediaListEntry": {"status": st} if st else None,
                        "relations": {"edges": [{"relationType": t, "node": {"id": n}} for t, n in RMGRAPH.get(i, [])]}}
            return ok({"Page": {"media": [rmm(i) for i in v["ids"] if i in RMGRAPH]}})
        if "activities(userId:$id,type_in" in q:
            import datetime
            noon = int(datetime.datetime.now().replace(hour=12, minute=0, second=0, microsecond=0).timestamp()); day = 86400
            acts = [{"id": 1, "status": "watched episode", "progress": "3 - 5", "createdAt": noon}, {"id": 2, "status": "watched episode", "progress": "7", "createdAt": noon - 60},
                    {"id": 3, "status": "read chapter", "progress": "10 - 11", "createdAt": noon - day}, {"id": 4, "status": "completed", "progress": None, "createdAt": noon - day - 30},
                    {"id": 5, "status": "watched episode", "progress": "1 - 3", "createdAt": noon - 2 * day}, {"id": 6, "status": "watched episode", "progress": "4", "createdAt": noon - 3 * day},
                    {"id": 7, "status": "plans to watch", "progress": None, "createdAt": noon - 3 * day}]
            return ok({"Page": {"pageInfo": {"hasNextPage": False}, "activities": acts}})
        if "media(type:$type,search:$q" in q:
            DREQ.append(dict(v)); items = [dict(m) for m in CATALOG]
            if v.get("type") == "MANGA": items = [{**m, "type": "MANGA", "format": "MANGA", "episodes": None, "chapters": 100, "title": {"romaji": "Manga " + m["title"]["romaji"], "english": None}} for m in items]
            if v.get("q"): items = [m for m in items if v["q"].lower() in m["title"]["romaji"].lower()]
            if v.get("genres"): items = [m for m in items if any(g in m["genres"] for g in v["genres"])]
            if v.get("tags"): items = [m for m in items if m["id"] % 2 == 0]
            if v.get("year"): items = [m for m in items if m["seasonYear"] == v["year"]]
            if v.get("adult") is False: items = [m for m in items if not m["isAdult"]]
            if v.get("adult") is True: items = [m for m in items if m["isAdult"]]
            if v.get("onList") is False: items = [m for m in items if not m["mediaListEntry"]]
            if v.get("onList") is True: items = [m for m in items if m["mediaListEntry"]]
            p = v.get("p") or 1; chunk = items[(p - 1) * 30: p * 30]
            return ok({"Page": {"pageInfo": {"hasNextPage": len(items) > p * 30}, "media": chunk}})
        if "characters(search:$q" in q:
            DREQ.append(dict(v)); cs = [{"id": 11, "name": {"full": "Satoru Gojou", "native": "五条悟"}, "image": {"large": "https://img.test/c1.jpg"}, "favourites": 39385}, {"id": 12, "name": {"full": "Levi", "native": None}, "image": {"large": "https://img.test/c2.jpg"}, "favourites": 38833}, {"id": 13, "name": {"full": "Luffy D. Monkey", "native": None}, "image": {"large": "https://img.test/c3.jpg"}, "favourites": 35997}]
            if v.get("q"): cs = [c for c in cs if v["q"].lower() in c["name"]["full"].lower()]
            return ok({"Page": {"pageInfo": {"hasNextPage": False}, "characters": cs}})
        if "staff(search:$q" in q:
            DREQ.append(dict(v)); return ok({"Page": {"pageInfo": {"hasNextPage": False}, "staff": [{"id": 21, "name": {"full": "Hayao Miyazaki", "native": None}, "image": {"large": "https://img.test/c4.jpg"}, "favourites": 20000, "primaryOccupations": ["Director", "Animator"]}]}})
        if "studios(search:$q" in q:
            DREQ.append(dict(v)); return ok({"Page": {"pageInfo": {"hasNextPage": False}, "studios": [{"id": 31, "name": "MAPPA", "favourites": 9000, "isAnimationStudio": True, "media": {"nodes": [{"coverImage": {"medium": "https://img.test/c5.jpg"}}]}}]}})
        if "users(search:$q" in q:
            DREQ.append(dict(v)); us = [{**u, "avatar": {"large": "https://img.test/c%d.jpg" % (u["id"] % 9)}} for u in FAKEUSERS.values() if (v.get("q") or "").lower() in u["name"].lower()]
            return ok({"Page": {"pageInfo": {"hasNextPage": False}, "users": us}})
        if "MediaTagCollection" in q:
            return ok({"MediaTagCollection": [{"name": "Isekai", "category": "Setting-Universe", "isAdult": False}, {"name": "Harem", "category": "Theme-Romance", "isAdult": False}, {"name": "Nudity", "category": "Sexual Content", "isAdult": True}, {"name": "Time Loop", "category": "Theme-Sci-Fi", "isAdult": False}]})
        if "media(season:$s,seasonYear:$y" in q:
            SZREQ.append(dict(v)); p = v.get("p") or 1
            items = SZ_ITEMS[:3] if p == 1 else SZ_ITEMS[3:]
            if v.get("y") == 2020: items = [] if p == 1 else []
            return ok({"Page": {"pageInfo": {"hasNextPage": p == 1 and v.get("y") != 2020}, "media": items}})
        if "airingSchedules(airingAt_greater" in q:
            CZREQ.append(dict(v)); day0 = v["from"] + 1
            def lk(site, color, typ="STREAMING"): return {"site": site, "url": "https://example.test/" + site, "type": typ, "color": color, "icon": None, "isDisabled": False}
            m = lambda i, **k: {"id": i, "type": "ANIME", "format": "TV", "isAdult": False, "season": "FALL", "seasonYear": 2026, "title": {"romaji": "Airing %d" % i, "english": None}, "coverImage": {"large": "https://img.test/c%d.jpg" % (i % 9)}, "bannerImage": "https://img.test/c8.jpg", "mediaListEntry": None, "externalLinks": [], **k}
            items = [{"id": 1, "airingAt": day0 + 18 * 3600, "episode": 4, "media": m(9001, mediaListEntry={"status": "CURRENT"}, externalLinks=[lk("Crunchyroll", "#f47521"), lk("YouTube", "#ff0000"), lk("Official Site", "#999999", "INFO")])},
                     {"id": 2, "airingAt": day0 + 19 * 3600 + 1800, "episode": 12, "media": m(9002, mediaListEntry={"status": "PLANNING"})},
                     {"id": 3, "airingAt": day0 + 20 * 3600, "episode": 2, "media": m(9003, season="WINTER", seasonYear=2020)},
                     {"id": 4, "airingAt": day0 + 21 * 3600, "episode": 1, "media": m(9004, isAdult=True)}]
            return ok({"Page": {"pageInfo": {"hasNextPage": False}, "airingSchedules": items}})
        if "mediaListOptions" in q: return ok({"Viewer": {"mediaListOptions": {"scoreFormat": NET.get("scorefmt", "POINT_10_DECIMAL"), "animeList": {"customLists": []}, "mangaList": {"customLists": []}}, "options": {"titleLanguage": "ENGLISH"}}})
        if "Viewer{id name}" in q:
            if NET.get("viewererr"): return route.fulfill(status=500, content_type="application/json", body=json.dumps({"errors": [{"message": "Internal Server Error", "status": 500}], "data": None}))
            return ok({"Viewer": {"id": 1, "name": "Tester"}})
        if "TRENDING_DESC" in q: return ok({"Page": {"media": []}})
        if "SaveMediaListEntry" in q:
            SAVED.append(v)
            if NET.get("saveerr"): return route.fulfill(status=200, content_type="application/json", body=json.dumps({"errors": [{"message": "Boom"}], "data": None}))
            ent = next((x for t in DATA.values() for x in t if x["mediaId"] == v["mediaId"]), None)
            if ent is None: return ok({"SaveMediaListEntry": {"id": 9999, "status": v.get("status"), "progress": v.get("progress", 0)}})
            for k in ("status", "progress", "repeat", "notes", "priority", "startedAt", "completedAt"):
                if k in v: ent[k] = v[k]
            if "score" in v: ent["score"] = v["score"]
            if "private" in v: ent["private"] = v["private"]
            if "customLists" in v: ent["customLists"] = {n: True for n in v["customLists"]}
            ent["updatedAt"] = int(time.time())
            return ok({"SaveMediaListEntry": {"id": ent["entryId"], "status": ent["status"], "progress": ent["progress"]}})
        if "DeleteMediaListEntry" in q:
            for t in DATA:
                DATA[t] = [x for x in DATA[t] if x["entryId"] != v["id"]]
            return ok({"DeleteMediaListEntry": {"deleted": True}})
        if "Media(id:$id)" in q and "page:$p" in q:
            fld = "characters" if "characters(" in q else "staff"
            nid = 700 if fld == "characters" else 800
            return ok({"Media": {fld: {"pageInfo": {"hasNextPage": False}, "edges": [{"role": "SUPPORTING", "node": {"id": nid + k, "siteUrl": "u", "name": {"full": "More %s %d" % (fld, k)}, "image": {"medium": "https://img.test/c5.jpg"}}} for k in range(2)]}}})
        if "Character(id:$id)" in q:
            ms = lambda k: {"id": 1000 + k, "type": "ANIME", "format": "TV", "title": {"romaji": "Series %d" % k, "english": None}, "coverImage": {"large": "https://img.test/c%d.jpg" % k}}
            return ok({"Character": {"id": v["id"], "siteUrl": "https://anilist.co/character/%d" % v["id"], "name": {"full": "Hero One", "native": "ヒーロー"}, "image": {"large": "https://img.test/c3.jpg"}, "description": "A brave hero. ~!Secret twist!~ __Loves__ tea.", "gender": "Female", "age": "17", "bloodType": "A", "dateOfBirth": {"year": None, "month": 4, "day": 9}, "favourites": 15, "isFavourite": FAVSTATE.get(("c", v["id"]), False),
                "media": {"pageInfo": {"total": 2}, "edges": [{"characterRole": "MAIN", "node": ms(1), "voiceActors": [{"id": 901, "name": {"full": "Actor Jp"}, "image": {"medium": "https://img.test/c6.jpg"}, "languageV2": "Japanese"}, {"id": 902, "name": {"full": "Actor En"}, "image": {"medium": "https://img.test/c7.jpg"}, "languageV2": "English"}]}, {"characterRole": "SUPPORTING", "node": ms(2), "voiceActors": [{"id": 901, "name": {"full": "Actor Jp"}, "image": {"medium": "https://img.test/c6.jpg"}, "languageV2": "Japanese"}]}]}}})
        if "Staff(id:$id)" in q:
            ms = lambda k: {"id": 1000 + k, "type": "ANIME", "format": "TV", "title": {"romaji": "Credit %d" % k, "english": None}, "coverImage": {"large": "https://img.test/c%d.jpg" % k}}
            return ok({"Staff": {"id": v["id"], "siteUrl": "https://anilist.co/staff/%d" % v["id"], "name": {"full": "Actor Jp", "native": "声優"}, "image": {"large": "https://img.test/c6.jpg"}, "description": "A voice actor.", "primaryOccupations": ["Voice Actor"], "languageV2": "Japanese", "homeTown": "Tokyo", "gender": "Female", "age": 30, "yearsActive": [2010], "dateOfBirth": {"year": 1995, "month": 3, "day": 2}, "favourites": 40, "isFavourite": FAVSTATE.get(("s", v["id"]), False),
                "staffMedia": {"pageInfo": {"total": 2}, "edges": [{"staffRole": "Hero One (Ep 1)", "node": ms(3)}, {"staffRole": "Sidekick", "node": ms(4)}]}, "characters": {"edges": [{"role": "MAIN", "node": {"id": 501, "name": {"full": "Hero One"}, "image": {"medium": "https://img.test/c3.jpg"}}, "media": [{"id": 1001, "title": {"romaji": "Series 1", "english": None}}]}]}}})
        if "Studio(id:$id" in q:
            pg = v.get("p", 1); n = 24 if pg == 1 else 6
            return ok({"Studio": {"id": v["id"], "siteUrl": "https://anilist.co/studio/%d" % v["id"], "name": "Studio One", "favourites": 62, "isFavourite": FAVSTATE.get(("t", v["id"]), False),
                "media": {"pageInfo": {"hasNextPage": pg == 1}, "edges": [{"node": {"id": 2000 + (pg - 1) * 24 + k, "type": "ANIME", "format": "TV", "title": {"romaji": "Studio Show %d" % ((pg - 1) * 24 + k), "english": None}, "coverImage": {"large": "https://img.test/c%d.jpg" % k}, "seasonYear": 2020 + k % 5}} for k in range(n)]}}})
        if "ToggleFavourite" in q:
            key = ("c", v["c"]) if v.get("c") else ("s", v["s"]) if v.get("s") else ("t", v["t"]); FAVS.append(key); FAVSTATE[key] = not FAVSTATE.get(key, False)
            return ok({"ToggleFavourite": {"studios": {"pageInfo": {"total": 1}}}})
        if "Media(id:$id)" in q:
            e = next((x for t in DATA.values() for x in t if x["mediaId"] == v["id"]), None)
            if e is None: base = DATA["ANIME"][0]; e = {**base, "mediaId": v["id"], "media": {**base["media"], "id": v["id"], "title": {"romaji": "Other title %d" % v["id"], "english": None}}}
            m = e["media"]
            return ok({"Media": {**m, "idMal": 1, "synonyms": [], "bannerImage": None, "coverImage": {**m["coverImage"], "color": "#fff"}, "description": "A test show.", "volumes": None, "season": "FALL", "seasonYear": 2026, "endDate": {"year": None, "month": None, "day": None}, "source": "MANGA", "favourites": 5, "isFavourite": False, "rankings": [], "tags": [], "studios": {"edges": [{"isMain": True, "node": {"id": 77, "name": "Studio One", "isAnimationStudio": True}}, {"isMain": False, "node": {"id": 88, "name": "Producer One", "isAnimationStudio": False}}]}, "meanScore": 61, "nextAiringEpisode": None, "trailer": None, "externalLinks": [], "characters": {"edges": [{"role": "MAIN", "node": {"id": 501, "siteUrl": "https://anilist.co/character/501", "name": {"full": "Hero One"}, "image": {"medium": "https://img.test/c3.jpg"}}}]}, "staff": {"edges": [{"role": "Director", "node": {"id": 601, "siteUrl": "https://anilist.co/staff/601", "name": {"full": "Director One"}, "image": {"medium": "https://img.test/c4.jpg"}}}]}, "relations": {"edges": [{"relationType": "SEQUEL", "node": {"id": 5002, "type": "ANIME", "format": "TV", "title": {"romaji": "Sequel Show", "english": None}, "coverImage": {"large": "https://img.test/c2.jpg"}}}]}, "recommendations": {"nodes": []}, "mediaListEntry": {"id": e["entryId"], "status": e["status"], "progress": e["progress"], "score": e["score"], "repeat": e["repeat"], "notes": e["notes"], "private": e["private"], "priority": e["priority"], "startedAt": e["startedAt"], "completedAt": e["completedAt"], "customLists": e["customLists"]}}})
        return ok({})
    if "img.test" in url:
        if NET["off"]: return route.abort("internetdisconnected")
        n = int(re.findall(r"c(\d+)", url)[0]) if re.findall(r"c(\d+)", url) else 0
        if n == 8:
            return route.fulfill(status=200, content_type="image/svg+xml", body='<svg xmlns="http://www.w3.org/2000/svg" width="1900" height="400" viewBox="0 0 1900 400"><rect width="1900" height="400" fill="#2a3a5a"/><text x="950" y="120" font-size="110" font-weight="900" fill="#fff" text-anchor="middle">TOKYOVERSE</text><text x="950" y="230" font-size="48" fill="#ffd166" text-anchor="middle">MIDDLE LINE</text><text x="950" y="340" font-size="60" fill="#9be15d" text-anchor="middle">TRANSLATIONS</text></svg>')
        return route.fulfill(status=200, content_type="image/svg+xml", body=svg(n))
    if "localhost" in url or "127.0.0.1" in url: return route.continue_()
    return route.fulfill(status=204, body="")

def run(fn, viewport=(390, 844), mobile=True, init="", anon=False):
    srv = serve()
    out = {"console": [], "errors": [], "failed": []}
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": viewport[0], "height": viewport[1]}, is_mobile=mobile, has_touch=mobile, device_scale_factor=2,
                            user_agent="Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36")
        ctx.route("**/*", handle)
        page = ctx.new_page()
        page.on("console", lambda m: out["console"].append((m.type, m.text)) if m.type in ("error", "warning") else None)
        page.on("pageerror", lambda e: out["errors"].append(str(e)))
        page.on("requestfailed", lambda r: out["failed"].append(r.url))
        page.add_init_script(("" if anon else "if(!localStorage.getItem('wn_token')){localStorage.setItem('wn_token','tok'); localStorage.setItem('wn_name','Tester');}") + init)
        out["ctx"] = ctx
        page.goto("http://127.0.0.1:%d/index.html" % PORT)
        page.wait_for_selector("#boot", state="detached", timeout=15000)   # the loading screen goes away when the app is ready
        page.wait_for_selector("#setup" if anon else "#tabs:not([hidden])", timeout=15000)
        try:
            fn(page, out)
        finally:
            b.close()
    srv.shutdown(); srv.server_close()
    return out
