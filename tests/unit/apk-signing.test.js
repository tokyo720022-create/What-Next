// Tests for android-signing/patch-android.sh and verify-apk.sh (what keeps new APKs installing over old ones).
// They run against a copy of the Capacitor build.gradle and stand-ins for apksigner / aapt2. Run: node tests/unit/apk-signing.test.js
const fs = require("fs"), os = require("os"), path = require("path"), { spawnSync } = require("child_process");
const SRC = path.join(__dirname, "../../android-signing");
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; console.log((cond ? "PASS " : "FAIL ") + name + (cond ? "" : "\n   " + extra)); };
const GRADLE = `apply plugin: 'com.android.application'

android {
    namespace = "com.whatnext.app"
    compileSdk = rootProject.ext.compileSdkVersion
    defaultConfig {
        applicationId "com.whatnext.app"
        minSdkVersion rootProject.ext.minSdkVersion
        targetSdkVersion rootProject.ext.targetSdkVersion
        versionCode 1
        versionName "1.0"
        testInstrumentationRunner "androidx.test.runner.AndroidJUnitRunner"
    }
    buildTypes {
        release {
            minifyEnabled false
        }
    }
}
apply from: 'capacitor.build.gradle'
`;
function project(gradle, withKeystore = true){
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "apk-")); fs.mkdirSync(path.join(d, "android/app"), { recursive: true }); fs.mkdirSync(path.join(d, "android-signing")); fs.mkdirSync(path.join(d, "home"));
  if(gradle != null) fs.writeFileSync(path.join(d, "android/app/build.gradle"), gradle);
  for(const f of ["patch-android.sh", "verify-apk.sh", "fingerprint.txt"]) fs.copyFileSync(path.join(SRC, f), path.join(d, "android-signing", f));
  if(withKeystore) fs.copyFileSync(path.join(SRC, "debug.keystore"), path.join(d, "android-signing/debug.keystore"));
  return d;
}
const sh = (d, script, args, env = {}) => spawnSync("bash", [path.join(d, "android-signing", script), ...args], { cwd: d, encoding: "utf8", env: Object.assign({}, process.env, { HOME: path.join(d, "home"), ANDROID_HOME: "", ANDROID_SDK_ROOT: "" }, env) });
const read = (d, f) => fs.readFileSync(path.join(d, f), "utf8");

// ---- patch-android.sh ----
let d = project(GRADLE), r = sh(d, "patch-android.sh", ["2.1.1-b55", "1300123"]), g = read(d, "android/app/build.gradle");
ok("sets versionCode and versionName", r.status === 0 && /versionCode 1300123\b/.test(g) && g.includes('versionName "2.1.1-b55"') && !/versionCode 1\n/.test(g), r.stdout + r.stderr);
ok("copies the shared key next to the app and into the default place", fs.existsSync(path.join(d, "android/app/shared-debug.keystore")) && fs.existsSync(path.join(d, "home/.android/debug.keystore")) && fs.readFileSync(path.join(d, "android/app/shared-debug.keystore")).equals(fs.readFileSync(path.join(SRC, "debug.keystore"))));
ok("sets the debug signing config explicitly", /signingConfigs\s*\{\s*debug\s*\{[^}]*storeFile file\("shared-debug.keystore"\)[^}]*keyAlias "androiddebugkey"/.test(g) && g.includes('storePassword "android"') && g.includes('keyPassword "android"'));
sh(d, "patch-android.sh", ["2.1.1-b56", "1300124"]); g = read(d, "android/app/build.gradle");
ok("running it twice does not add the signing block twice", (g.match(/shared-debug\.keystore/g) || []).length === 1 && /versionCode 1300124\b/.test(g));
d = project(GRADLE.replace("versionCode 1", "versionCode = 1").replace('versionName "1.0"', 'versionName = "1.0"')); r = sh(d, "patch-android.sh", ["9.9", "777"]); g = read(d, "android/app/build.gradle");
ok("also works when the template writes 'versionCode = 1'", r.status === 0 && /versionCode 777\b/.test(g) && g.includes('versionName "9.9"'), r.stdout + r.stderr);
d = project(GRADLE.replace(/versionCode 1\n/, "").replace(/versionName "1.0"\n/, "")); r = sh(d, "patch-android.sh", ["2.1.1-b1", "123"]);
ok("stops with a clear message when the version cannot be set", r.status !== 0 && /Could not set versionCode 123/.test(r.stdout + r.stderr), r.stdout + r.stderr);
d = project(GRADLE, false); r = sh(d, "patch-android.sh", ["1", "2"]);
ok("stops when the signing key is missing", r.status !== 0 && /debug\.keystore is missing/.test(r.stdout + r.stderr), r.stdout + r.stderr);
d = project(null); r = sh(d, "patch-android.sh", ["1", "2"]);
ok("stops when the Android project has not been created", r.status !== 0 && /build\.gradle was not found/.test(r.stdout + r.stderr), r.stdout + r.stderr);

// ---- verify-apk.sh ----
const WANT = fs.readFileSync(path.join(SRC, "fingerprint.txt"), "utf8").trim();
function tools(d, { digest = WANT, code = "1300123", name = "2.1.1-b55", signOk = true } = {}){
  const s = path.join(d, "apksigner"), a = path.join(d, "aapt2");
  fs.writeFileSync(s, `#!/usr/bin/env bash\n${signOk ? "" : "echo 'DOES NOT VERIFY' >&2; exit 1\n"}echo "Signer #1 certificate DN: CN=What Next Debug"\necho "Signer #1 certificate SHA-256 digest: ${digest.toUpperCase()}"\necho "Signer #1 certificate SHA-1 digest: 0000"\n`, { mode: 0o755 });
  fs.writeFileSync(a, `#!/usr/bin/env bash\necho "package: name='com.whatnext.app' versionCode='${code}' versionName='${name}' platformBuildVersionName='15'"\necho "sdkVersion:'23'"\n`, { mode: 0o755 });
  fs.writeFileSync(path.join(d, "app.apk"), "x"); return { APKSIGNER: s, AAPT2: a };
}
d = project(GRADLE); let env = tools(d); r = sh(d, "verify-apk.sh", [path.join(d, "app.apk"), "1300123", "2.1.1-b55"], env);
ok("a correctly signed APK with the right version passes", r.status === 0 && /same signing key as every other build/.test(r.stdout) && r.stdout.includes("Signing certificate SHA-256: " + WANT), r.stdout + r.stderr);
env = tools(d, { digest: "ab".repeat(32) }); r = sh(d, "verify-apk.sh", [path.join(d, "app.apk"), "1300123", "2.1.1-b55"], env);
ok("an APK signed with a different key fails the build", r.status !== 0 && /different key/.test(r.stdout + r.stderr) && /would not install over the previous build/.test(r.stdout + r.stderr), r.stdout + r.stderr);
env = tools(d, { code: "1" }); r = sh(d, "verify-apk.sh", [path.join(d, "app.apk"), "1300123", "2.1.1-b55"], env);
ok("an APK with the wrong versionCode fails the build", r.status !== 0 && /versionCode 1300123/.test(r.stdout + r.stderr), r.stdout + r.stderr);
env = tools(d, { name: "1.0" }); r = sh(d, "verify-apk.sh", [path.join(d, "app.apk"), "1300123", "2.1.1-b55"], env);
ok("an APK with the wrong versionName fails the build", r.status !== 0 && /versionName 2\.1\.1-b55/.test(r.stdout + r.stderr), r.stdout + r.stderr);
env = tools(d, { signOk: false }); r = sh(d, "verify-apk.sh", [path.join(d, "app.apk"), "1300123", "2.1.1-b55"], env);
ok("an APK whose signature does not verify fails the build", r.status !== 0 && /signature is not valid/.test(r.stdout + r.stderr), r.stdout + r.stderr);
r = sh(d, "verify-apk.sh", [path.join(d, "missing.apk"), "1", "1"], tools(d));
ok("a missing APK fails the build", r.status !== 0 && /was not built/.test(r.stdout + r.stderr), r.stdout + r.stderr);
r = sh(d, "verify-apk.sh", [path.join(d, "app.apk"), "1300123", "2.1.1-b55"], { APKSIGNER: "", AAPT2: "", PATH: "/usr/bin:/bin" });
ok("without the Android tools it warns instead of failing", r.status === 0 && /apksigner was not found/.test(r.stdout + r.stderr), r.stdout + r.stderr);
ok("the fingerprint file matches the committed key", (() => { const k = spawnSync("keytool", ["-list", "-v", "-keystore", path.join(SRC, "debug.keystore"), "-storepass", "android"], { encoding: "utf8" }); if(k.error) return true; const m = (k.stdout || "").match(/SHA256: ([0-9A-F:]+)/); return !m || m[1].replace(/:/g, "").toLowerCase() === WANT; })(), "fingerprint.txt does not match android-signing/debug.keystore");
// ---- the workflow still uses them ----
const wf = fs.readFileSync(path.join(__dirname, "../../.github/workflows/build-apk.yml"), "utf8");
ok("the build workflow patches the version and signing with patch-android.sh", wf.includes("bash android-signing/patch-android.sh"), "build-apk.yml no longer calls patch-android.sh");
ok("the build workflow checks the finished APK with verify-apk.sh", wf.includes("bash android-signing/verify-apk.sh") && wf.indexOf("assembleDebug") < wf.indexOf("verify-apk.sh") && wf.indexOf("verify-apk.sh") < wf.indexOf("Name the APK"), "build-apk.yml does not verify the APK between the build and naming it");
ok("the version code comes from the clock, not from the run counter", /code=\$\(\( \(\$\(date \+%s\) - \d+\) \/ 60 \)\)/.test(wf) && !/1000 \+ \$\{\{ github\.run_number/.test(wf), "versionCode must not depend on github.run_number");
ok("the root copy of the workflow matches the real one", fs.readFileSync(path.join(__dirname, "../../build-apk.yml"), "utf8") === wf, "build-apk.yml (root) differs from .github/workflows/build-apk.yml");
console.log("\n" + pass + " passed, " + fail + " failed"); process.exit(fail ? 1 : 0);
