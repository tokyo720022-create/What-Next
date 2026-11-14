#!/usr/bin/env python3
"""Adds the Kotlin add-on (native/kotlin/WnSecurePlugin.kt) to the Android project that Capacitor generated.

    python3 native/apply-addon.py android                  (both add-ons)
    python3 native/apply-addon.py android --secure-only    (only the secure login storage)

The first add-on keeps the login in encrypted storage (WnSecurePlugin). The second checks AniList for new notifications in the
background (WnNotifyPlugin and WnPollWorker), so alerts such as "a sequel was added" arrive while the app is closed.
It changes four things: the Kotlin plugin in the root build.gradle, the Kotlin settings and the libraries in
app/build.gradle, copies of the Kotlin files, and MainActivity.java (to register the plugins).
Nothing is written until every check has passed. On any problem it prints a message and exits with 1, and the build goes on
without the add-on (the app then keeps the login in its normal storage). Running it twice does no harm.
"""
import os
import re
import shutil
import sys

PACKAGE = "app.whatnext.addon"
KOTLIN = "1.9.25"
CRYPTO = "androidx.security:security-crypto:1.1.0-alpha06"
WORK = "androidx.work:work-runtime:2.9.1"
KOTLIN_FILES = ["WnSecurePlugin.kt"]
NOTIFY_FILES = ["WnNotifyPlugin.kt", "WnPollWorker.kt"]
MARK = "what-next-addon"


def fail(msg):
    print("native add-on: " + msg)
    sys.exit(1)


def read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def main(android, here, notify=True):
    root_gradle = os.path.join(android, "build.gradle")
    app_gradle = os.path.join(android, "app", "build.gradle")
    cap_gradle = os.path.join(android, "app", "capacitor.build.gradle")
    names = KOTLIN_FILES + (NOTIFY_FILES if notify else [])
    sources = [os.path.join(here, "kotlin", n) for n in names]
    for f in [root_gradle, app_gradle] + sources:
        if not os.path.isfile(f):
            fail("cannot find " + f)

    # The Java version the project compiles with: Kotlin has to produce the same one, or Gradle refuses to build.
    jvm = None
    for f in (cap_gradle, app_gradle):
        if os.path.isfile(f):
            m = re.search(r"VERSION_(\d+)", read(f))
            if m:
                jvm = m.group(1)
                break
    if not jvm:
        fail("cannot tell which Java version the project uses (no JavaVersion.VERSION_xx in capacitor.build.gradle or app/build.gradle)")

    writes = {}  # path -> new text, written only when everything below has worked

    root = read(root_gradle)
    if MARK not in root:
        m = re.search(r"^([ \t]*)classpath\s+['\"]com\.android\.tools\.build:gradle:[^'\"]+['\"][^\n]*\n", root, re.M)
        if not m:
            fail("the Android Gradle plugin line was not found in build.gradle")
        line = '%sclasspath "org.jetbrains.kotlin:kotlin-gradle-plugin:%s"   // %s\n' % (m.group(1), KOTLIN, MARK)
        writes[root_gradle] = root[: m.end()] + line + root[m.end():]

    app = read(app_gradle)
    if MARK not in app:
        m = re.search(r"^apply plugin: ['\"]com\.android\.application['\"][^\n]*\n", app, re.M)
        if not m:
            fail("the line \"apply plugin: 'com.android.application'\" was not found in app/build.gradle")
        app = app[: m.end()] + "apply plugin: 'kotlin-android'   // %s\n" % MARK + app[m.end():]
        m = re.search(r"^android\s*\{[^\n]*\n", app, re.M)
        if not m:
            fail("the android { block was not found in app/build.gradle")
        app = app[: m.end()] + '    kotlinOptions { jvmTarget = "%s" }   // %s\n' % (jvm, MARK) + app[m.end():]
        app = app.rstrip("\n") + '\n\ndependencies {\n    implementation "%s"   // %s\n}\n' % (CRYPTO, MARK)
        writes[app_gradle] = app

    if notify and "androidx.work:work-runtime" not in app:
        writes[app_gradle] = (writes.get(app_gradle, app)).rstrip("\n") + '\n\ndependencies {\n    implementation "%s"   // %s\n}\n' % (WORK, MARK)

    # MainActivity: register the plugins before the bridge starts.
    java_root = os.path.join(android, "app", "src", "main", "java")
    found = []
    for d, _, files in os.walk(java_root):
        for f in files:
            if f in ("MainActivity.java", "MainActivity.kt"):
                found.append(os.path.join(d, f))
    if len(found) != 1:
        fail("expected one MainActivity under app/src/main/java, found %d" % len(found))
    main_activity = found[0]
    if main_activity.endswith(".kt"):
        fail("MainActivity is a Kotlin file, which this script does not change")
    text = read(main_activity)
    original = text
    if "registerPlugin(WnSecurePlugin.class)" not in text:
        m = re.search(r"public\s+class\s+MainActivity\s+extends\s+BridgeActivity\s*\{\s*\}", text)
        if not m:
            fail("MainActivity.java has code of its own, so the add-on is not registered automatically")
        body = (
            "public class MainActivity extends BridgeActivity {\n"
            "    @Override\n"
            "    public void onCreate(Bundle savedInstanceState) {\n"
            "        registerPlugin(WnSecurePlugin.class);   // %s\n"
            "%s"
            "        super.onCreate(savedInstanceState);\n"
            "    }\n"
            "}" % (MARK, "        registerPlugin(WnNotifyPlugin.class);   // %s\n" % MARK if notify else "")
        )
        text = text[: m.start()] + body + text[m.end():]
        p = re.search(r"^package [^\n]*\n", text, re.M)
        if not p:
            fail("MainActivity.java has no package line")
        text = text[: p.end()] + "\nimport android.os.Bundle;\nimport %s.WnSecurePlugin;\n%s" % (PACKAGE, "import %s.WnNotifyPlugin;\n" % PACKAGE if notify else "") + text[p.end():]
    elif notify and "registerPlugin(WnNotifyPlugin.class)" not in text:
        # an earlier run added only the secure login storage: add the second plugin next to the first
        text = text.replace("registerPlugin(WnSecurePlugin.class);", "registerPlugin(WnSecurePlugin.class);\n        registerPlugin(WnNotifyPlugin.class);", 1)
        text = text.replace("import %s.WnSecurePlugin;" % PACKAGE, "import %s.WnSecurePlugin;\nimport %s.WnNotifyPlugin;" % (PACKAGE, PACKAGE), 1)
        if "registerPlugin(WnNotifyPlugin.class)" not in text or "import %s.WnNotifyPlugin;" % PACKAGE not in text:
            fail("MainActivity.java was changed by hand, so the notify add-on cannot be registered automatically")
    if text != original:
        writes[main_activity] = text

    # Everything checked: now write.
    for path, content in writes.items():
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            f.write(content)
    dest_dir = os.path.join(java_root, *PACKAGE.split("."))
    os.makedirs(dest_dir, exist_ok=True)
    for src, n in zip(sources, names):
        shutil.copyfile(src, os.path.join(dest_dir, n))
    print("native add-on: added (Java %s, Kotlin %s, %d file(s) changed, background alerts: %s)" % (jvm, KOTLIN, len(writes), "yes" if notify else "no"))


if __name__ == "__main__":
    args = sys.argv[1:]
    secure_only = "--secure-only" in args
    args = [a for a in args if a != "--secure-only"]
    if len(args) != 1:
        fail("usage: python3 native/apply-addon.py <android folder> [--secure-only]")
    main(args[0], os.path.dirname(os.path.abspath(__file__)), not secure_only)
