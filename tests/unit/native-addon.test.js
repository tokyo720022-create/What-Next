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
function project(o = {}){
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "addon-")), a = path.join(d, "android");
  const put = (rel, text) => { const p = path.join(a, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); };
  put("build.gradle", o.root !== undefined ? o.root : ROOT_GRADLE);
  put("app/build.gradle", o.app !== undefined ? o.app : APP_GRADLE);
  if(o.cap !== null) put("app/capacitor.build.gradle", o.cap !== undefined ? o.cap : CAP_GRADLE(21));
  put("app/src/main/java/com/whatnext/app/MainActivity.java", o.main !== undefined ? o.main : MAIN);
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
  ok("the background alert files are copied and the WorkManager library is added once", ["WnNotifyPlugin.kt", "WnPollWorker.kt"].every(f => s["app/src/main/java/app/whatnext/addon/" + f] === read("native/kotlin/" + f)) && count(s["app/build.gradle"], /implementation "androidx\.work:work-runtime:2\.9\.1"/g) === 1 && /import app\.whatnext\.addon\.WnNotifyPlugin;/.test(s["app/src/main/java/com/whatnext/app/MainActivity.java"]));
  ok("MainActivity registers both plugins before the bridge starts", s["app/src/main/java/com/whatnext/app/MainActivity.java"].indexOf("registerPlugin(WnNotifyPlugin.class)") > 0 && s["app/src/main/java/com/whatnext/app/MainActivity.java"].indexOf("registerPlugin(WnNotifyPlugin.class)") < s["app/src/main/java/com/whatnext/app/MainActivity.java"].indexOf("super.onCreate(savedInstanceState)"));
  ok("MainActivity registers the plugin before the bridge starts", /import android\.os\.Bundle;\nimport app\.whatnext\.addon\.WnSecurePlugin;/.test(main) && main.indexOf("registerPlugin(WnSecurePlugin.class)") > 0 && main.indexOf("registerPlugin(WnSecurePlugin.class)") < main.indexOf("super.onCreate(savedInstanceState)") && /^package com\.whatnext\.app;/.test(main) && main.includes("import com.getcapacitor.BridgeActivity;"));
  // running it again changes nothing and adds nothing twice
  const r2 = run(a), s2 = snapshot(a);
  ok("running it twice does no harm", r2.status === 0 && JSON.stringify(s2) === JSON.stringify(s) && count(s2["build.gradle"], /kotlin-gradle-plugin/g) === 1 && count(s2["app/build.gradle"], /security-crypto/g) === 1 && count(s2["app/build.gradle"], /work-runtime/g) === 1 && count(s2["app/src/main/java/com/whatnext/app/MainActivity.java"], /registerPlugin/g) === 2);
}
// ---- secure login storage alone (the fallback when the background alerts do not build)
{
  const a = project(), r = spawnSync("python3", [path.join(ROOT, "native/apply-addon.py"), a, "--secure-only"], { encoding: "utf8" }), s = snapshot(a);
  const main = s["app/src/main/java/com/whatnext/app/MainActivity.java"];
  ok("--secure-only adds the login storage and nothing of the alerts", r.status === 0 && /background alerts: no/.test(r.stdout) && s["app/src/main/java/app/whatnext/addon/WnSecurePlugin.kt"] && !s["app/src/main/java/app/whatnext/addon/WnNotifyPlugin.kt"] && !s["app/src/main/java/app/whatnext/addon/WnPollWorker.kt"] && !/work-runtime/.test(s["app/build.gradle"]) && !/WnNotify/.test(main) && /registerPlugin\(WnSecurePlugin\.class\)/.test(main), r.stdout + r.stderr);
  // then the full add-on on top of it (an upgrade): the second plugin is added next to the first, nothing twice
  const r2 = run(a), s2 = snapshot(a), main2 = s2["app/src/main/java/com/whatnext/app/MainActivity.java"];
  ok("the full add-on can be applied after the secure-only one", r2.status === 0 && count(main2, /registerPlugin\(WnSecurePlugin\.class\)/g) === 1 && count(main2, /registerPlugin\(WnNotifyPlugin\.class\)/g) === 1 && count(main2, /import app\.whatnext\.addon\.WnNotifyPlugin;/g) === 1 && count(s2["app/build.gradle"], /security-crypto/g) === 1 && count(s2["app/build.gradle"], /work-runtime/g) === 1 && count(s2["build.gradle"], /kotlin-gradle-plugin/g) === 1, r2.stdout + r2.stderr);
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
ok("the notify plugin is called WnNotify, the name the app looks for", /@CapacitorPlugin\(name = "WnNotify"\)/.test(kp) && /nativePlugin\("WnNotify"\)/.test(read("js/features/notify.js")) && /@PluginMethod\s+fun configure\(call: PluginCall\)/.test(kp));
ok("configure is wrapped so a failure is a rejection, not a crash, and the type list is cleaned before it goes into a query", /try \{[\s\S]*catch \(e: Exception\)[\s\S]*call\.reject/.test(kp) && /isUpperCase\(\) \|\| it == '_' \|\| it == ','/.test(kp));
ok("the check runs every 30 minutes, only with a connection, and replaces its own earlier schedule", /30, TimeUnit\.MINUTES/.test(kp) && /NetworkType\.CONNECTED/.test(kp) && /enqueueUniquePeriodicWork\(WnPollWorker\.WORK, ExistingPeriodicWorkPolicy\.UPDATE/.test(kp) && /cancelUniqueWork/.test(kp));
ok("a first run only remembers the time, so old notifications never flood the phone", /contains\("last"\)/.test(kp) && /if \(at > last\) fresh\.add/.test(kw));
ok("the worker reads the login from the same encrypted store and only talks to AniList", /"wn_secure"/.test(kw) && /"wn_token"/.test(kw) && /https:\/\/graphql\.anilist\.co/.test(kw) && (kw.match(/https?:\/\//g) || []).length === 1);
ok("the worker never marks notifications read on AniList, so the unread count in the app stays right", !/resetNotificationCount/.test(kw));
ok("any problem ends a run quietly and the token is never logged", /catch \(e: Exception\)[\s\S]*Result\.success\(\)/.test(kw) && !/\bLog\.|println\(|printStackTrace/.test(kw + kp));
ok("a missing value from AniList is never shown as the word null", /isNull\(key\)/.test(kw));
ok("tapping an alert opens the app on the Notifications list (the link the app understands)", /whatnext:\/\/notifications/.test(kw) && /whatnext:\\\/\\\/notifications/.test(read("js/features/notify.js")));

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
