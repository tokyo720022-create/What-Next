// Tests for the Kotlin add-on setup: native/apply-addon.py on sample Android projects, the Kotlin file's rules, and how the workflow uses them.
// The Kotlin code itself cannot be compiled here; the GitHub build is its real test. Run: node tests/unit/native-addon.test.js
const fs = require("fs"), path = require("path"), os = require("os"), { spawnSync } = require("child_process");
const ROOT = path.join(__dirname, "../..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
let pass = 0, fail = 0;
const ok = (name, cond, detail) => { cond ? pass++ : fail++; console.log((cond ? "PASS " : "FAIL ") + name + (cond || !detail ? "" : "\n   " + detail)); };

const py = spawnSync("python3", ["--version"], { encoding: "utf8" });
if(py.status !== 0){ console.log("SKIP python3 is not installed here; the build machine has it"); process.exit(0); }

const ROOT_GRADLE = `buildscript {
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        classpath 'com.android.tools.build:gradle:8.7.2'
        classpath 'com.google.gms:google-services:4.4.2'
    }
}

apply from: "variables.gradle"
`;
const APP_GRADLE = `apply plugin: 'com.android.application'

android {
    namespace = "com.whatnext.app"
    compileSdk = rootProject.ext.compileSdkVersion
    defaultConfig {
        applicationId "com.whatnext.app"
    }
}

repositories {
    flatDir{
        dirs '../capacitor-cordova-android-plugins/src/main/libs', 'libs'
    }
}

dependencies {
    implementation fileTree(include: ['*.jar'], dir: 'libs')
    implementation project(':capacitor-android')
}

apply from: 'capacitor.build.gradle'

try {
    def servicesJSON = file('google-services.json')
    if (servicesJSON.text) {
        apply plugin: 'com.google.gms.google-services'
    }
} catch(Exception e) {
    logger.info("google-services.json not found, google-services plugin not applied. Push Notifications won't work")
}
`;
const CAP_GRADLE = v => `android {
  compileOptions {
      sourceCompatibility JavaVersion.VERSION_${v}
      targetCompatibility JavaVersion.VERSION_${v}
  }
}
`;
const MAIN = `package com.whatnext.app;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {}
`;
const MANIFEST = `<?xml version="1.0" encoding="utf-8"?>\n<manifest xmlns:android="http://schemas.android.com/apk/res/android">\n    <application android:label="@string/app_name">\n        <activity android:name=".MainActivity" android:exported="true"></activity>\n    </application>\n    <uses-permission android:name="android.permission.INTERNET" />\n</manifest>\n`;
function project(o = {}){
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "addon-")), a = path.join(d, "android");
  const put = (rel, text) => { const p = path.join(a, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); };
  put("build.gradle", o.root !== undefined ? o.root : ROOT_GRADLE);
  put("app/build.gradle", o.app !== undefined ? o.app : APP_GRADLE);
  if(o.cap !== null) put("app/capacitor.build.gradle", o.cap !== undefined ? o.cap : CAP_GRADLE(21));
  put("app/src/main/java/com/whatnext/app/MainActivity.java", o.main !== undefined ? o.main : MAIN);
  if(o.manifest !== null) put("app/src/main/AndroidManifest.xml", o.manifest !== undefined ? o.manifest : MANIFEST);
  return a;
}
const snapshot = a => { const out = {}; (function walk(d){ for(const e of fs.readdirSync(d, { withFileTypes: true })){ const p = path.join(d, e.name); e.isDirectory() ? walk(p) : out[path.relative(a, p)] = fs.readFileSync(p, "utf8"); } })(a); return out; };
const run = a => spawnSync("python3", [path.join(ROOT, "native/apply-addon.py"), a], { encoding: "utf8" });
const count = (s, re) => (s.match(re) || []).length;

// ---- a normal Capacitor project
{
  const a = project(), r = run(a), s = snapshot(a);
  ok("the script succeeds on a normal project", r.status === 0 && /added \(Java 21/.test(r.stdout), r.stdout + r.stderr);
  ok("the Kotlin plugin is added after the Android Gradle plugin in build.gradle", /classpath 'com\.android\.tools\.build:gradle:8\.7\.2'\n\s*classpath "org\.jetbrains\.kotlin:kotlin-gradle-plugin:1\.9\.25"/.test(s["build.gradle"]) && s["build.gradle"].includes("google-services:4.4.2"));
  ok("app/build.gradle applies Kotlin, matches the Java version and adds the encryption library", s["app/build.gradle"].startsWith("apply plugin: 'com.android.application'\napply plugin: 'kotlin-android'") && /android \{\n    kotlinOptions \{ jvmTarget = "21" \}/.test(s["app/build.gradle"]) && /dependencies \{\n    implementation "androidx\.security:security-crypto:1\.1\.0-alpha06"/.test(s["app/build.gradle"]) && s["app/build.gradle"].includes("implementation project(':capacitor-android')"));
  const kt = s["app/src/main/java/app/whatnext/addon/WnSecurePlugin.kt"];
  ok("the Kotlin file is copied into the project", kt === read("native/kotlin/WnSecurePlugin.kt"));
  const main = s["app/src/main/java/com/whatnext/app/MainActivity.java"];
  ok("the background alert files are copied and the WorkManager library is added once", ["WnNotifyPlugin.kt", "WnPollWorker.kt", "WnImagePlugin.kt", "WnLockPlugin.kt", "WnWidgetPlugin.kt", "WnWidgetStore.kt", "WnWidgetKit.kt", "WnAiringWidget.kt", "WnContinueWidget.kt", "WnUpdatesWidget.kt", "WnStreakWidget.kt", "WnPickWidget.kt"].every(f => s["app/src/main/java/app/whatnext/addon/" + f] === read("native/kotlin/" + f)) && count(s["app/build.gradle"], /implementation "androidx\.work:work-runtime:2\.9\.1"/g) === 1 && /import app\.whatnext\.addon\.WnNotifyPlugin;/.test(s["app/src/main/java/com/whatnext/app/MainActivity.java"]));
  ok("MainActivity registers all five plugins before the bridge starts", /registerPlugin\(WnImagePlugin\.class\)/.test(s["app/src/main/java/com/whatnext/app/MainActivity.java"]) && /registerPlugin\(WnLockPlugin\.class\)/.test(s["app/src/main/java/com/whatnext/app/MainActivity.java"]) && /registerPlugin\(WnWidgetPlugin\.class\)/.test(s["app/src/main/java/com/whatnext/app/MainActivity.java"]) && s["app/src/main/java/com/whatnext/app/MainActivity.java"].indexOf("registerPlugin(WnNotifyPlugin.class)") > 0 && s["app/src/main/java/com/whatnext/app/MainActivity.java"].indexOf("registerPlugin(WnNotifyPlugin.class)") < s["app/src/main/java/com/whatnext/app/MainActivity.java"].indexOf("super.onCreate(savedInstanceState)"));
  ok("MainActivity registers the plugin before the bridge starts", /import android\.os\.Bundle;\nimport app\.whatnext\.addon\.WnSecurePlugin;/.test(main) && main.indexOf("registerPlugin(WnSecurePlugin.class)") > 0 && main.indexOf("registerPlugin(WnSecurePlugin.class)") < main.indexOf("super.onCreate(savedInstanceState)") && /^package com\.whatnext\.app;/.test(main) && main.includes("import com.getcapacitor.BridgeActivity;"));
  // running it again changes nothing and adds nothing twice
  const r2 = run(a), s2 = snapshot(a);
  ok("running it twice does no harm", r2.status === 0 && JSON.stringify(s2) === JSON.stringify(s) && count(s2["build.gradle"], /kotlin-gradle-plugin/g) === 1 && count(s2["app/build.gradle"], /security-crypto/g) === 1 && count(s2["app/build.gradle"], /work-runtime/g) === 1 && count(s2["app/src/main/java/com/whatnext/app/MainActivity.java"], /registerPlugin/g) === 5 && count(s2["app/build.gradle"], /androidx\.biometric/g) === 1);
}
// ---- secure login storage alone (the fallback when the background alerts do not build)
{
  const a = project(), r = spawnSync("python3", [path.join(ROOT, "native/apply-addon.py"), a, "--secure-only"], { encoding: "utf8" }), s = snapshot(a);
  const main = s["app/src/main/java/com/whatnext/app/MainActivity.java"];
  ok("--secure-only adds the login storage and nothing of the alerts", r.status === 0 && /background alerts: no/.test(r.stdout) && s["app/src/main/java/app/whatnext/addon/WnSecurePlugin.kt"] && !s["app/src/main/java/app/whatnext/addon/WnNotifyPlugin.kt"] && !s["app/src/main/java/app/whatnext/addon/WnPollWorker.kt"] && !/work-runtime/.test(s["app/build.gradle"]) && !/WnNotify/.test(main) && /registerPlugin\(WnSecurePlugin\.class\)/.test(main), r.stdout + r.stderr);
  // then the full add-on on top of it (an upgrade): the second plugin is added next to the first, nothing twice
  const r2 = run(a), s2 = snapshot(a), main2 = s2["app/src/main/java/com/whatnext/app/MainActivity.java"];
  ok("the full add-on can be applied after the secure-only one", r2.status === 0 && count(main2, /registerPlugin\(WnSecurePlugin\.class\)/g) === 1 && count(main2, /registerPlugin\(WnNotifyPlugin\.class\)/g) === 1 && count(main2, /registerPlugin\(WnImagePlugin\.class\)/g) === 1 && count(main2, /import app\.whatnext\.addon\.WnImagePlugin;/g) === 1 && count(main2, /import app\.whatnext\.addon\.WnNotifyPlugin;/g) === 1 && count(s2["app/build.gradle"], /security-crypto/g) === 1 && count(s2["app/build.gradle"], /work-runtime/g) === 1 && count(s2["build.gradle"], /kotlin-gradle-plugin/g) === 1, r2.stdout + r2.stderr);
}
// ---- the Java version is taken from the project
{
  const a = project({ cap: CAP_GRADLE(17) }); const r = run(a);
  ok("a Java 17 project gets jvmTarget 17", r.status === 0 && /jvmTarget = "17"/.test(snapshot(a)["app/build.gradle"]));
  const b = project({ cap: null, app: APP_GRADLE.replace("android {", "android {\n    compileOptions { sourceCompatibility JavaVersion.VERSION_11 }") }); const r2 = run(b);
  ok("the Java version can also come from app/build.gradle", r2.status === 0 && /jvmTarget = "11"/.test(snapshot(b)["app/build.gradle"]));
}
// ---- problems: a clear message, and nothing is changed
const bad = (name, opts, pattern) => { const a = project(opts), before = snapshot(a), r = run(a); ok(name, r.status === 1 && pattern.test(r.stdout) && JSON.stringify(snapshot(a)) === JSON.stringify(before), "exit " + r.status + "\n" + r.stdout + r.stderr); };
bad("no Java version found: stops, changes nothing", { cap: CAP_GRADLE("").replace(/VERSION_/g, "V"), app: APP_GRADLE }, /Java version/);
bad("no Android Gradle plugin line: stops, changes nothing", { root: "buildscript { dependencies { classpath 'other:thing:1' } }\n" }, /Android Gradle plugin line/);
bad("no android block: stops, changes nothing", { app: "apply plugin: 'com.android.application'\n// VERSION_21\n" }, /android \{ block/);
bad("a MainActivity with code of its own is left alone", { main: MAIN.replace("{}", "{\n    @Override public void onCreate(android.os.Bundle b) { super.onCreate(b); }\n}") }, /code of its own/);
{
  const a = project(); fs.unlinkSync(path.join(a, "build.gradle")); const r = run(a);
  ok("a missing build.gradle is reported", r.status === 1 && /cannot find .*build\.gradle/.test(r.stdout), r.stdout + r.stderr);
}

// ---- the Kotlin file's rules (it cannot be compiled here)
const kt = read("native/kotlin/WnSecurePlugin.kt");
ok("the plugin is called WnSecure, the name the app looks for", /@CapacitorPlugin\(name = "WnSecure"\)/.test(kt) && /nativePlugin\("WnSecure"\)/.test(read("js/core/auth.js")));
ok("it offers get, set and remove, each marked as a plugin method", ["get", "set", "remove"].every(m => new RegExp("@PluginMethod\\s+fun " + m + "\\(call: PluginCall\\)").test(kt)));
ok("it uses the Keystore-backed encrypted store with strong schemes", /EncryptedSharedPreferences\.create/.test(kt) && /KeyScheme\.AES256_GCM/.test(kt) && /PrefKeyEncryptionScheme\.AES256_SIV/.test(kt) && /PrefValueEncryptionScheme\.AES256_GCM/.test(kt));
ok("it only accepts the app's own wn_ names and bounded values", /startsWith\("wn_"\)/.test(kt) && /MAX_VALUE/.test(kt));
ok("every method is wrapped so a failure becomes a rejection, not a crash", ["get", "set", "remove"].every(m => new RegExp("fun " + m + "\\(call: PluginCall\\)[\\s\\S]*?try \\{[\\s\\S]*?catch \\(e: Exception\\)").test(kt)));
ok("a stored value is never written to the log", !/\bLog\.|println\(|Timber|printStackTrace/.test(kt));
ok("a save is confirmed (commit), not fire-and-forget", /putString\(k, v\)\.commit\(\)/.test(kt));

// ---- the background alert files' rules
const kp = read("native/kotlin/WnNotifyPlugin.kt"), kw = read("native/kotlin/WnPollWorker.kt");
const ki = read("native/kotlin/WnImagePlugin.kt");
ok("the image plugin is called WnImage and has share, copy and save, each wrapped so a failure is a rejection", /@CapacitorPlugin\(name = "WnImage"\)/.test(ki) && ["share", "copy", "save"].every(m => new RegExp("@PluginMethod\\s+fun " + m + "\\(call: PluginCall\\)").test(ki)) && (ki.match(/catch \(e: Exception\)/g) || []).length >= 5 && /nativePlugin\("WnImage"\)/.test(read("js/features/taste-share.js")));
ok("sharing and copying go through the cache and the FileProvider Capacitor declares; saving uses MediaStore in Pictures", /context\.packageName \+ "\.fileprovider"/.test(ki) && /File\(context\.cacheDir, "wn_share"\)/.test(ki) && /MediaStore\.Images\.Media\.EXTERNAL_CONTENT_URI/.test(ki) && /DIRECTORY_PICTURES \+ "\/What Next"/.test(ki));
const kl = read("native/kotlin/WnLockPlugin.kt");
ok("the lock plugin is called WnLock and has available, unlock and secure, each guarded", /@CapacitorPlugin\(name = "WnLock"\)/.test(kl) && ["available", "unlock", "secure"].every(m => new RegExp("@PluginMethod\\s+fun " + m + "\\(call: PluginCall\\)").test(kl)) && (kl.match(/catch \(e: Exception\)/g) || []).length >= 3 && /nativePlugin\("WnLock"\)/.test(read("js/features/lock.js")));
ok("the phone prompt allows fingerprint or face, and the screen lock from Android 11; the negative button is set before that", /BIOMETRIC_WEAK or BiometricManager\.Authenticators\.DEVICE_CREDENTIAL/.test(kl) && /SDK_INT < 30\) info\.setNegativeButtonText/.test(kl));
ok("the screenshot block uses FLAG_SECURE and can be switched off again", /FLAG_SECURE/.test(kl) && /clearFlags\(WindowManager\.LayoutParams\.FLAG_SECURE\)/.test(kl));
ok("the notify plugin is called WnNotify, the name the app looks for", /@CapacitorPlugin\(name = "WnNotify"\)/.test(kp) && /nativePlugin\("WnNotify"\)/.test(read("js/features/notify.js")) && /@PluginMethod\s+fun configure\(call: PluginCall\)/.test(kp));
ok("configure is wrapped so a failure is a rejection, not a crash, and the type list is cleaned before it goes into a query", /try \{[\s\S]*catch \(e: Exception\)[\s\S]*call\.reject/.test(kp) && /isUpperCase\(\) \|\| it == '_' \|\| it == ','/.test(kp));
ok("the check runs every 30 minutes, only with a connection, and replaces its own earlier schedule", /30, TimeUnit\.MINUTES/.test(kp) && /NetworkType\.CONNECTED/.test(kp) && /enqueueUniquePeriodicWork\(WnPollWorker\.WORK, ExistingPeriodicWorkPolicy\.UPDATE/.test(kp) && /cancelUniqueWork/.test(kp));
ok("a first run only remembers the time, so old notifications never flood the phone", /contains\("last"\)/.test(kp) && /if \(at > last\) fresh\.add/.test(kw));
ok("the worker reads the login from the same encrypted store and only talks to AniList", /"wn_secure"/.test(kw) && /"wn_token"/.test(kw) && /https:\/\/graphql\.anilist\.co/.test(kw) && (kw.match(/https?:\/\//g) || []).length === 1);
ok("the worker never marks notifications read on AniList, so the unread count in the app stays right", !/resetNotificationCount/.test(kw));
ok("any problem ends a run quietly and the token is never logged", /catch \(e: Exception\)[\s\S]*Result\.success\(\)/.test(kw) && !/\bLog\.|println\(|printStackTrace/.test(kw + kp));
ok("a missing value from AniList is never shown as the word null", /isNull\(key\)/.test(kw));
ok("tapping an alert opens the app on the Notifications list (the link the app understands)", /whatnext:\/\/notifications/.test(kw) && /whatnext:\\\/\\\/notifications/.test(read("js/features/notify.js")));

// ---- every Kotlin file in native/kotlin is copied into the project (a file left out of the lists makes the whole add-on fail to compile, and the build falls back to one without it)
{
  const a = project(), r = run(a), s = snapshot(a), files = fs.readdirSync(path.join(ROOT, "native/kotlin")).filter(f => f.endsWith(".kt"));
  ok("every Kotlin file of the add-on is copied into the Android project", r.status === 0 && files.length >= 14 && files.every(f => s["app/src/main/java/app/whatnext/addon/" + f] === read("native/kotlin/" + f)), files.filter(f => s["app/src/main/java/app/whatnext/addon/" + f] === undefined).join());
  const all = files.map(f => read("native/kotlin/" + f)).join("\n").replace(/@CapacitorPlugin\(name = "\w+"\)/g, ""), declared = new Set([...all.matchAll(/^(?:class|object) (\w+)/gm)].map(m => m[1]));
  const used = [...new Set([...all.replace(/"[^"\n]*"/g, '""').matchAll(/\b(Wn[A-Z]\w+)\b/g)].map(m => m[1]))];
  ok("every Wn class the Kotlin code uses is declared in one of the files", used.every(u => declared.has(u)), used.filter(u => !declared.has(u)).join());
}

// ---- home screen widgets
{
  const a = project(), r = run(a), s = snapshot(a), man = s["app/src/main/AndroidManifest.xml"], names = ["WnAiringWidget", "WnContinueWidget", "WnUpdatesWidget", "WnStreakWidget", "WnPickWidget"];
  ok("the five widget receivers are added to the manifest, inside the application, once each", r.status === 0 && names.every(n => count(man, new RegExp('android:name="app\\.whatnext\\.addon\\.' + n + '"', "g")) === 1) && man.indexOf("WnPickWidget") < man.indexOf("</application>") && man.indexOf("WnAiringWidget") > man.indexOf("<application"), man);
  ok("each receiver names a provider info file that exists, and a Kotlin class that exists", names.every(n => { const info = /wn_widget_(\w+)_info/.exec(man.slice(man.indexOf(n))); return info && fs.existsSync(path.join(ROOT, "native/widgets/res/xml/wn_widget_" + info[1] + "_info.xml")) && fs.existsSync(path.join(ROOT, "native/kotlin/" + n + ".kt")) && new RegExp("class " + n + " : AppWidgetProvider\\(\\)").test(read("native/kotlin/" + n + ".kt")); }));
  ok("the layouts, drawables, infos and strings are copied into the project's resources", ["layout/wn_widget_airing.xml", "layout/wn_widget_continue.xml", "layout/wn_widget_updates.xml", "layout/wn_widget_streak.xml", "layout/wn_widget_pick.xml", "drawable/wn_widget_bg.xml", "drawable/wn_cover_placeholder.xml", "values/wn_widget_strings.xml", "xml/wn_widget_airing_info.xml"].every(f => s["app/src/main/res/" + f] === read("native/widgets/res/" + f)));
  const again = run(a), s2 = snapshot(a); ok("running it twice adds the receivers only once", again.status === 0 && count(s2["app/src/main/AndroidManifest.xml"], /WnAiringWidget/g) === 1);
  const b = project(), rb = spawnSync("python3", [path.join(ROOT, "native/apply-addon.py"), b, "--secure-only"], { encoding: "utf8" }), sb = snapshot(b);
  ok("--secure-only adds no widgets, no receivers and no resources", rb.status === 0 && !/Widget/.test(sb["app/src/main/AndroidManifest.xml"]) && !Object.keys(sb).some(k => /wn_widget/.test(k)), rb.stdout + rb.stderr);
  const c = project({ manifest: null }), rc = run(c); ok("without a manifest the script stops with a clear message (the build then falls back)", rc.status !== 0 && /AndroidManifest/.test(rc.stdout + rc.stderr));
  // everything the Kotlin code looks up by name exists in the resources
  const layouts = { airing: read("native/widgets/res/layout/wn_widget_airing.xml"), continue: read("native/widgets/res/layout/wn_widget_continue.xml"), updates: read("native/widgets/res/layout/wn_widget_updates.xml"), streak: read("native/widgets/res/layout/wn_widget_streak.xml"), pick: read("native/widgets/res/layout/wn_widget_pick.xml") };
  const hasId = (lay, id) => new RegExp('android:id="@\\+id/' + id + '"').test(layouts[lay]);
  const idsOf = (file, lay) => { const code = read("native/kotlin/" + file), out = new Set(); for(const m of code.matchAll(/"id", "([a-z]+_[a-z]+\d?)(\$[a-z]+)?"/g)) out.add(m[1] + (m[2] ? "*" : "")); return [...out].map(x => ({ x, lay })); };
  const checks = [...idsOf("WnAiringWidget.kt", "airing"), ...idsOf("WnContinueWidget.kt", "continue"), ...idsOf("WnUpdatesWidget.kt", "updates"), ...idsOf("WnStreakWidget.kt", "streak"), ...idsOf("WnPickWidget.kt", "pick")];
  const missing = checks.filter(c => c.x.endsWith("*") ? !(c.lay === "continue" && c.x === "con_r*" ? [1, 2] : [1, 2, 3, 4]).every(n => hasId(c.lay, c.x.slice(0, -1) + n)) && !(c.lay === "updates" && [1, 2, 3, 4, 5, 6, 7, 8].every(n => hasId("updates", "upd_i" + n))) && !(c.lay === "streak" && [1, 2, 3, 4, 5, 6, 7].every(n => hasId("streak", "stk_d" + n))) : !hasId(c.lay, c.x));
  ok("every view id the widget code looks up by name exists in that widget's layout", checks.length > 20 && missing.length === 0, JSON.stringify(missing));
  const drawables = [...new Set([...fs.readdirSync(path.join(ROOT, "native/kotlin")).filter(f => /Widget/.test(f)).flatMap(f => [...read("native/kotlin/" + f).matchAll(/"drawable", "(\w+)"/g)].map(m => m[1]))])];
  ok("every drawable the widget code looks up exists", drawables.length >= 3 && drawables.every(d => fs.existsSync(path.join(ROOT, "native/widgets/res/drawable/" + d + ".xml"))), drawables.join());
  ok("the layouts use only views that can be put in a widget (no custom, web or recycler views)", Object.values(layouts).every(l => !/<(WebView|RecyclerView|EditText|ScrollView|CheckBox|androidx|com\.)/.test(l)));
  const kk = read("native/kotlin/WnWidgetKit.kt"), kp = read("native/kotlin/WnWidgetPlugin.kt");
  ok("a widget tap opens only the app's own whatnext:// addresses, set to this app's package", /Uri\.parse\(uri\)/.test(kk) && /setPackage\(ctx\.packageName\)/.test(kk) && /FLAG_IMMUTABLE/.test(kk) && read("native/kotlin/WnAiringWidget.kt").includes('"whatnext://media/"'));
  ok("covers are only fetched over https, kept small, cached and pruned", /startsWith\("https:\/\/"\)/.test(kk) && />= 200/.test(kk) && /prune\(/.test(kk) && /File\(ctx\.cacheDir, "wn_widget"\)/.test(kk));
  const kc = read("native/kotlin/WnContinueWidget.kt"), ka = read("native/kotlin/WnApi.kt");
  ok("a widget thread can never stop the app: every error is caught, the broadcast is always finished, a missing result is handled", /catch \(e: Throwable\)/.test(kk) && /setUncaughtExceptionHandler/.test(kk) && /pending\?\.finish\(\)/.test(kk) && /BroadcastReceiver\.PendingResult\? = try/.test(kk));
  ok("if Android refuses an update (too much picture data) the widget is drawn again without covers and the reason is kept", /fun safeUpdate/.test(kk) && /build\(false\)/.test(kk) && /WnWidgetStore\.note\(ctx, "update: "/.test(kk) && names.slice(0, 4).filter(n => n !== "WnStreakWidget").every(n => /safeUpdate/.test(read("native/kotlin/" + n + ".kt"))));
  ok("covers are downloaded by the app (prefetch) right after it saves a snapshot, and a widget only downloads when time is left", /prefetch\(context, snap\)/.test(read("native/kotlin/WnWidgetPlugin.kt")) && /fun prefetch/.test(kk) && /until - 1500/.test(kk) && /"Accept", "image\/\*"/.test(kk) && /User-Agent/.test(kk));
  ok("covers are cut down to the size they are shown at, so the data sent to the home screen stays small", /maxW: Int, maxH: Int/.test(kk) && /createScaledBitmap/.test(kk) && names.every(n => n === "WnStreakWidget" || n === "WnContinueWidget" || /k\.cover\(ctx, k\.str\((o|p), "c"\), \d+, \d+, until\)/.test(read("native/kotlin/" + n + ".kt"))) && /k\.tile\(ctx, k\.str\(o, "b"\), k\.str\(o, "c"\)/.test(kc) && /val w = 270/.test(kk) && /val h = 152/.test(kk));
  ok("the Continue tile is like Trakt's: a wide 16:9 picture (banner first, else the cover cut from its upper part) with the length and 'N left' as chips, a progress line, rounded corners", /16f \/ 9f/.test(kk) && /plain\(ctx, bannerUrl, until\) \?: plain\(ctx, coverUrl, until\)/.test(kk) && /\* 0\.3f/.test(kk) && /"" \+ left \+ " left"/.test(kk) && /"" \+ minutes \+ "m"/.test(kk) && /drawRoundRect\(RectF\(x, y, x \+ width, y \+ 28f\)/.test(kk) && /rounded\(out, 16f\)/.test(kk) && /coverUrls/.test(kk) && /out\.add\(b\)/.test(kk));
  ok("the Continue layout has the big header with the check-circle icon, a glass background, and wide tiles that size themselves to the picture", /android:textSize="22sp"/.test(layouts.continue) && hasId("continue", "con_hi") && /wn_widget_bg_glass/.test(layouts.continue) && /adjustViewBounds="true"/.test(layouts.continue) && fs.existsSync(path.join(ROOT, "native/widgets/res/drawable/wn_tile_placeholder.xml")) && /<size android:width="270dp" android:height="152dp"\/>/.test(read("native/widgets/res/drawable/wn_tile_placeholder.xml")) && /wn_tile_placeholder/.test(kc) && /"Continue Watching"/.test(kc));
  ok("the tick button marks the next episode or chapter on AniList with the app's encrypted login, over https, and finishes a title when it reaches the end", /ACTION_PLUS/.test(kc) && /WnApi\.setProgress/.test(kc) && /https:\/\/graphql\.anilist\.co/.test(ka) && /"wn_secure"/.test(ka) && /"wn_token"/.test(ka) && /status:COMPLETED/.test(ka) && /FLAG_IMMUTABLE/.test(kc) && /bump\(ctx, mediaId, progress, total\)/.test(kc));
  ok("the tick button of each title is its own PendingIntent, and the layout has a button for each of the four tiles", /whatnext:\/\/plus\/\$id/.test(kc) && [1, 2, 3, 4].every(n => hasId("continue", "con_k" + n) && hasId("continue", "con_b" + n)) && fs.existsSync(path.join(ROOT, "native/widgets/res/drawable/wn_check.xml")));
  ok("the widget plugin is called WnWidget with update, pin, status and clear, each guarded", /@CapacitorPlugin\(name = "WnWidget"\)/.test(kp) && ["update", "pin", "status", "clear"].every(m => new RegExp("@PluginMethod\\s+fun " + m + "\\(call: PluginCall\\)").test(kp)) && (kp.match(/catch \(e: Exception\)/g) || []).length >= 4 && /nativePlugin\("WnWidget"\)/.test(read("js/features/widgets.js")));
  ok("the widgets update about every 30 minutes (the lowest Android allows) and draw off the main thread", names.every(n => true) && /updatePeriodMillis="1800000"/.test(read("native/widgets/res/xml/wn_widget_airing_info.xml")) && /goAsync\(\)/.test(kk));
}

// ---- the workflow
const wf = read(".github/workflows/build-apk.yml");
ok("the workflow adds the add-on after cap sync and before the build", wf.indexOf("npx cap sync android") < wf.indexOf("python3 native/apply-addon.py android") && wf.indexOf("python3 native/apply-addon.py android") < wf.indexOf("assembleRelease"));
ok("if adding the add-on fails, the project is restored from the copy made just before", /cp -r android \/tmp\/android\.pristine/.test(wf) && /rm -rf android && cp -r \/tmp\/android\.pristine android/.test(wf));
ok("if the build fails with the add-ons, it is built again with the login storage alone, then with nothing, before any debug fallback", wf.indexOf("built again with only the secure login storage") > 0 && wf.indexOf("built again without it") > wf.indexOf("built again with only the secure login storage") && wf.indexOf("built again without it") < wf.indexOf("assembleDebug") && (wf.match(/assembleRelease/g) || []).length === 3 && /apply-addon\.py android --secure-only/.test(wf));
ok("the release text says which add-ons are in", /Native add-ons \([^)]*\): \$\{\{ steps\.build\.outputs\.addon \}\}/.test(wf));
ok("the build adds the notification icon, the permissions and the plugin check", /ic_stat_whatnext\.xml/.test(wf) && ["POST_NOTIFICATIONS", "RECEIVE_BOOT_COMPLETED", "SCHEDULE_EXACT_ALARM", "USE_EXACT_ALARM"].every(p => wf.includes("android.permission." + p)) && /@capacitor\/local-notifications/.test(wf) && fs.existsSync(path.join(ROOT, "native/android-res/drawable/ic_stat_whatnext.xml")));
ok("an out-of-date package-lock.json falls back to npm install instead of stopping the build", /npm ci \|\| \{/.test(wf) && /npm install/.test(wf));
ok("the plugin the reminders use is listed in package.json and set up in capacitor.config.json", /"@capacitor\/local-notifications"/.test(read("package.json")) && /ic_stat_whatnext/.test(read("capacitor.config.json")));
ok("the root copy of the workflow matches", fs.readFileSync(path.join(ROOT, "build-apk.yml"), "utf8").replace(/\r\n/g, "\n").trimEnd() === wf.replace(/\r\n/g, "\n").trimEnd());
console.log("\n" + pass + " passed, " + fail + " failed"); process.exit(fail ? 1 : 0);
