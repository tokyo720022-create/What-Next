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
  ok("MainActivity registers the plugin before the bridge starts", /import android\.os\.Bundle;\nimport app\.whatnext\.addon\.WnSecurePlugin;/.test(main) && main.indexOf("registerPlugin(WnSecurePlugin.class)") > 0 && main.indexOf("registerPlugin(WnSecurePlugin.class)") < main.indexOf("super.onCreate(savedInstanceState)") && /^package com\.whatnext\.app;/.test(main) && main.includes("import com.getcapacitor.BridgeActivity;"));
  // running it again changes nothing and adds nothing twice
  const r2 = run(a), s2 = snapshot(a);
  ok("running it twice does no harm", r2.status === 0 && JSON.stringify(s2) === JSON.stringify(s) && count(s2["build.gradle"], /kotlin-gradle-plugin/g) === 1 && count(s2["app/build.gradle"], /security-crypto/g) === 1 && count(s2["app/src/main/java/com/whatnext/app/MainActivity.java"], /registerPlugin/g) === 1);
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

// ---- the workflow
const wf = read(".github/workflows/build-apk.yml");
ok("the workflow adds the add-on after cap sync and before the build", wf.indexOf("npx cap sync android") < wf.indexOf("python3 native/apply-addon.py android") && wf.indexOf("python3 native/apply-addon.py android") < wf.indexOf("assembleRelease"));
ok("if adding the add-on fails, the project is restored from the copy made just before", /cp -r android \/tmp\/android\.pristine/.test(wf) && /rm -rf android && cp -r \/tmp\/android\.pristine android/.test(wf));
ok("if the build fails with the add-on, it is built again without it before any debug fallback", wf.indexOf("built again without it") > 0 && wf.indexOf("built again without it") < wf.indexOf("assembleDebug") && (wf.match(/assembleRelease/g) || []).length === 2);
ok("the release text says whether the add-on is in", /Native add-on \(secure login storage\): \$\{\{ steps\.build\.outputs\.addon \}\}/.test(wf));
ok("the root copy of the workflow matches", fs.readFileSync(path.join(ROOT, "build-apk.yml"), "utf8").replace(/\r\n/g, "\n").trimEnd() === wf.replace(/\r\n/g, "\n").trimEnd());
console.log("\n" + pass + " passed, " + fail + " failed"); process.exit(fail ? 1 : 0);
