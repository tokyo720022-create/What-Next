// Tests for the APK signing scripts in android-signing/ (what keeps new APKs installing over old ones, with the key kept secret).
// They run against a copy of the Capacitor build.gradle, a key made on the spot, and stand-ins for apksigner / aapt2.
// Run: node tests/unit/apk-signing.test.js   (the key tests need keytool, which comes with Java)
const fs = require("fs"), os = require("os"), path = require("path"), { spawnSync } = require("child_process");
const ROOT = path.join(__dirname, "../.."), SRC = path.join(ROOT, "android-signing");
let pass = 0, fail = 0, skipped = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; console.log((cond ? "PASS " : "FAIL ") + name + (cond ? "" : "\n   " + extra)); };
const HAS_KEYTOOL = !spawnSync("keytool", ["-help"], { encoding: "utf8" }).error;

// ---- no key file is committed ----
function walk(dir, out = []){ for(const f of fs.readdirSync(dir, { withFileTypes: true })){ if(["node_modules", ".git", "__pycache__"].includes(f.name)) continue; const p = path.join(dir, f.name); f.isDirectory() ? walk(p, out) : out.push(p); } return out; }
const keyFiles = walk(ROOT).filter(f => /\.(keystore|jks|p12|pfx|pem)$/i.test(f)).map(f => path.relative(ROOT, f));
ok("no signing key file is committed to the repo (it is public, so anyone could sign as this app)", keyFiles.length === 0, "Delete these from the repo and use GitHub Secrets instead: " + keyFiles.join(", "));
const gi = fs.existsSync(path.join(ROOT, ".gitignore")) ? fs.readFileSync(path.join(ROOT, ".gitignore"), "utf8") : "";
ok(".gitignore keeps key files out", ["*.keystore", "*.jks", "*.p12"].every(x => gi.includes(x)), ".gitignore must list *.keystore, *.jks, *.p12");
const scripts = ["patch-android.sh", "verify-apk.sh", "generate-key.sh"].map(f => fs.readFileSync(path.join(SRC, f), "utf8")).join("\n") + fs.readFileSync(path.join(ROOT, ".github/workflows/build-apk.yml"), "utf8");
ok("the scripts and workflow never contain a password or the public 'android' one", !/storePassword\s+"[^"]|keyPassword\s+"[^"]|androiddebugkey|debug\.keystore/.test(scripts), "found a hard-coded password or the old debug key in the scripts/workflow");

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
function makeKey(alias = "whatnext", pass = "S3cretPassw0rdForTests"){
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "key-")), ks = path.join(d, "k.p12");
  const r = spawnSync("keytool", ["-genkeypair", "-alias", alias, "-keyalg", "RSA", "-keysize", "2048", "-validity", "3650", "-storetype", "PKCS12", "-keystore", ks, "-storepass", pass, "-keypass", pass, "-dname", "CN=Test, O=Test, C=US"], { encoding: "utf8" });
  const l = spawnSync("keytool", ["-list", "-v", "-keystore", ks, "-storepass", pass], { encoding: "utf8" }).stdout || "";
  return { b64: fs.readFileSync(ks).toString("base64"), pass, fp: ((l.match(/SHA256: ([0-9A-F:]+)/) || [])[1] || "").replace(/:/g, "").toLowerCase() };
}
function project(gradle, fp){
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "apk-")); fs.mkdirSync(path.join(d, "android/app"), { recursive: true }); fs.mkdirSync(path.join(d, "android-signing")); fs.mkdirSync(path.join(d, "home"));
  if(gradle != null) fs.writeFileSync(path.join(d, "android/app/build.gradle"), gradle);
  for(const f of ["patch-android.sh", "verify-apk.sh"]) fs.copyFileSync(path.join(SRC, f), path.join(d, "android-signing", f));
  fs.writeFileSync(path.join(d, "android-signing/fingerprint.txt"), (fp || fs.readFileSync(path.join(SRC, "fingerprint.txt"), "utf8").trim()) + "\n");
  return d;
}
const sh = (d, script, args, env = {}) => spawnSync("bash", [path.join(d, "android-signing", script), ...args], { cwd: d, encoding: "utf8", env: Object.assign({}, process.env, { HOME: path.join(d, "home"), ANDROID_HOME: "", ANDROID_SDK_ROOT: "", ANDROID_KEYSTORE_BASE64: "", ANDROID_KEYSTORE_PASSWORD: "" }, env) });
const read = (d, f) => fs.readFileSync(path.join(d, f), "utf8");
const out = r => r.stdout + r.stderr;

// ---- patch-android.sh ----
if(!HAS_KEYTOOL){ skipped++; console.log("SKIP key tests: keytool (Java) was not found"); } else {
  const K = makeKey(), env = { ANDROID_KEYSTORE_BASE64: K.b64, ANDROID_KEYSTORE_PASSWORD: K.pass };
  let d = project(GRADLE, K.fp), r = sh(d, "patch-android.sh", ["2.1.1-b55", "1300123"], env), g = read(d, "android/app/build.gradle");
  ok("sets versionCode and versionName", r.status === 0 && /versionCode 1300123\b/.test(g) && g.includes('versionName "2.1.1-b55"') && !/versionCode 1\n/.test(g), out(r));
  ok("decodes the secret key next to the app", fs.existsSync(path.join(d, "android/app/release.keystore")) && fs.readFileSync(path.join(d, "android/app/release.keystore")).equals(Buffer.from(K.b64, "base64")));
  ok("the signing config reads the password from the environment, so it is never written to disk", /storePassword System\.getenv\("ANDROID_KEYSTORE_PASSWORD"\)/.test(g) && /keyAlias "whatnext"/.test(g) && !g.includes(K.pass) && !out(r).includes(K.pass), "password leaked into build.gradle or the output");
  ok("both debug and release builds use that key", /buildTypes\s*\{\s*debug \{ signingConfig signingConfigs\.shared \}\s*release \{ signingConfig signingConfigs\.shared \}/.test(g));
  sh(d, "patch-android.sh", ["2.1.1-b56", "1300124"], env); g = read(d, "android/app/build.gradle");
  ok("running it twice does not add the signing block twice", (g.match(/signingConfigs\.shared \}/g) || []).length === 2 && (g.match(/signingConfigs \{/g) || []).length === 1 && /versionCode 1300124\b/.test(g));
  r = sh(d = project(GRADLE, K.fp), "patch-android.sh", ["1", "2"], { ANDROID_KEYSTORE_BASE64: K.b64 });
  ok("stops with a clear message when the password secret is missing", r.status !== 0 && /ANDROID_KEYSTORE_PASSWORD is missing/.test(out(r)) && /New repository secret/.test(out(r)), out(r));
  r = sh(project(GRADLE, K.fp), "patch-android.sh", ["1", "2"], { ANDROID_KEYSTORE_PASSWORD: K.pass });
  ok("stops with a clear message when the key secret is missing", r.status !== 0 && /ANDROID_KEYSTORE_BASE64 is missing/.test(out(r)), out(r));
  r = sh(project(GRADLE, K.fp), "patch-android.sh", ["1", "2"], { ANDROID_KEYSTORE_BASE64: "!!!not base64!!!", ANDROID_KEYSTORE_PASSWORD: K.pass });
  ok("stops when the key secret is not valid base64", r.status !== 0 && /not valid base64|could not be opened/.test(out(r)), out(r));
  r = sh(project(GRADLE, K.fp), "patch-android.sh", ["1", "2"], { ANDROID_KEYSTORE_BASE64: K.b64, ANDROID_KEYSTORE_PASSWORD: "wrong-password" });
  ok("stops when the password does not open the key, without printing it", r.status !== 0 && /could not be opened/.test(out(r)) && !out(r).includes("wrong-password"), out(r));
  const K2 = makeKey("otheralias"); r = sh(project(GRADLE, K2.fp), "patch-android.sh", ["1", "2"], { ANDROID_KEYSTORE_BASE64: K2.b64, ANDROID_KEYSTORE_PASSWORD: K2.pass });
  ok("stops when the key inside is not named whatnext", r.status !== 0 && /could not be opened/.test(out(r)), out(r));
  r = sh(project(GRADLE, "ab".repeat(32)), "patch-android.sh", ["1", "2"], env);
  ok("stops when the secret key is not the one the repo expects (fingerprint.txt)", r.status !== 0 && /not the key this repo expects/.test(out(r)) && out(r).includes(K.fp), out(r));
  r = sh(project(GRADLE.replace("versionCode 1", "versionCode = 1").replace('versionName "1.0"', 'versionName = "1.0"'), K.fp), "patch-android.sh", ["9.9", "777"], env);
  ok("also works when the template writes 'versionCode = 1'", r.status === 0, out(r));
  r = sh(project(GRADLE.replace(/versionCode 1\n/, "").replace(/versionName "1.0"\n/, ""), K.fp), "patch-android.sh", ["2.1.1-b1", "123"], env);
  ok("stops with a clear message when the version cannot be set", r.status !== 0 && /Could not set versionCode 123/.test(out(r)), out(r));
  r = sh(project(null, K.fp), "patch-android.sh", ["1", "2"], env);
  ok("stops when the Android project has not been created", r.status !== 0 && /build\.gradle was not found/.test(out(r)), out(r));
  // ---- generate-key.sh ----
  const gk = spawnSync("bash", [path.join(SRC, "generate-key.sh")], { encoding: "utf8" }), lines = gk.stdout.split("\n");
  const pw = lines[lines.indexOf("1. GitHub secret ANDROID_KEYSTORE_PASSWORD:") + 1], b64 = lines[lines.indexOf("2. GitHub secret ANDROID_KEYSTORE_BASE64 (one line):") + 1], fp = lines[lines.indexOf("3. Put this in android-signing/fingerprint.txt (it is public, not a secret):") + 1];
  d = project(GRADLE, fp); r = sh(d, "patch-android.sh", ["1", "2"], { ANDROID_KEYSTORE_BASE64: b64, ANDROID_KEYSTORE_PASSWORD: pw });
  ok("generate-key.sh makes a key, password and fingerprint that patch-android.sh accepts", gk.status === 0 && pw.length === 32 && /^[0-9a-f]{64}$/.test(fp) && r.status === 0, gk.stderr + out(r));
}

// ---- verify-apk.sh ----
const WANT = fs.readFileSync(path.join(SRC, "fingerprint.txt"), "utf8").trim();
function tools(d, { digest = WANT, code = "1300123", name = "2.1.1-b55", signOk = true } = {}){
  const s = path.join(d, "apksigner"), a = path.join(d, "aapt2");
  fs.writeFileSync(s, `#!/usr/bin/env bash\n${signOk ? "" : "echo 'DOES NOT VERIFY' >&2; exit 1\n"}echo "Signer #1 certificate DN: CN=What Next"\necho "Signer #1 certificate SHA-256 digest: ${digest.toUpperCase()}"\necho "Signer #1 certificate SHA-1 digest: 0000"\n`, { mode: 0o755 });
  fs.writeFileSync(a, `#!/usr/bin/env bash\necho "package: name='com.whatnext.app' versionCode='${code}' versionName='${name}' platformBuildVersionName='15'"\necho "sdkVersion:'23'"\n`, { mode: 0o755 });
  fs.writeFileSync(path.join(d, "app.apk"), "x"); return { APKSIGNER: s, AAPT2: a };
}
let d = project(GRADLE), env = tools(d), r = sh(d, "verify-apk.sh", [path.join(d, "app.apk"), "1300123", "2.1.1-b55"], env);
ok("a correctly signed APK with the right version passes", r.status === 0 && /same signing key as every other build/.test(r.stdout) && r.stdout.includes("Signing certificate SHA-256: " + WANT), out(r));
env = tools(d, { digest: "ab".repeat(32) }); r = sh(d, "verify-apk.sh", [path.join(d, "app.apk"), "1300123", "2.1.1-b55"], env);
ok("an APK signed with a different key fails the build", r.status !== 0 && /different key/.test(out(r)) && /would not install over the previous build/.test(out(r)), out(r));
env = tools(d, { code: "1" }); r = sh(d, "verify-apk.sh", [path.join(d, "app.apk"), "1300123", "2.1.1-b55"], env);
ok("an APK with the wrong versionCode fails the build", r.status !== 0 && /versionCode 1300123/.test(out(r)), out(r));
env = tools(d, { name: "1.0" }); r = sh(d, "verify-apk.sh", [path.join(d, "app.apk"), "1300123", "2.1.1-b55"], env);
ok("an APK with the wrong versionName fails the build", r.status !== 0 && /versionName 2\.1\.1-b55/.test(out(r)), out(r));
env = tools(d, { signOk: false }); r = sh(d, "verify-apk.sh", [path.join(d, "app.apk"), "1300123", "2.1.1-b55"], env);
ok("an APK whose signature does not verify fails the build", r.status !== 0 && /signature is not valid/.test(out(r)), out(r));
r = sh(d, "verify-apk.sh", [path.join(d, "missing.apk"), "1", "1"], tools(d));
ok("a missing APK fails the build", r.status !== 0 && /was not built/.test(out(r)), out(r));
r = sh(d, "verify-apk.sh", [path.join(d, "app.apk"), "1300123", "2.1.1-b55"], { APKSIGNER: "", AAPT2: "", PATH: "/usr/bin:/bin" });
ok("without the Android tools it warns instead of failing", r.status === 0 && /apksigner was not found/.test(out(r)), out(r));
ok("fingerprint.txt is a SHA-256 in lowercase hex", /^[0-9a-f]{64}$/.test(WANT), "fingerprint.txt must hold 64 lowercase hex characters");

// ---- the workflow uses all of it ----
const wf = fs.readFileSync(path.join(ROOT, ".github/workflows/build-apk.yml"), "utf8");
ok("the workflow passes both secrets to the signing step", /patch-android\.sh/.test(wf) && /ANDROID_KEYSTORE_BASE64: \$\{\{ secrets\.ANDROID_KEYSTORE_BASE64 \}\}/.test(wf) && (wf.match(/ANDROID_KEYSTORE_PASSWORD: \$\{\{ secrets\.ANDROID_KEYSTORE_PASSWORD \}\}/g) || []).length === 2, "build-apk.yml must give the secrets to patch-android.sh and to the Gradle build");
ok("the workflow checks the finished APK with verify-apk.sh", wf.includes("bash android-signing/verify-apk.sh") && wf.indexOf("assembleDebug") < wf.indexOf("verify-apk.sh") && wf.indexOf("verify-apk.sh") < wf.indexOf("Name the APK"), "build-apk.yml does not verify the APK between the build and naming it");
ok("the version code comes from the clock, not from the run counter", /code=\$\(\( \(\$\(date \+%s\) - \d+\) \/ 60 \)\)/.test(wf) && !/1000 \+ \$\{\{ github\.run_number/.test(wf), "versionCode must not depend on github.run_number");
ok("the root copy of the workflow matches the real one", fs.readFileSync(path.join(ROOT, "build-apk.yml"), "utf8") === wf, "build-apk.yml (root) differs from .github/workflows/build-apk.yml");
console.log("\n" + pass + " passed, " + fail + " failed" + (skipped ? ", " + skipped + " skipped" : "")); process.exit(fail ? 1 : 0);
