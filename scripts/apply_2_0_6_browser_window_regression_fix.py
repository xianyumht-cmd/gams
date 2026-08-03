#!/usr/bin/env python3
from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


main_path = Path("v2/android/client/src/main/java/com/jinli/ggsecure/MainActivity.java")
main = main_path.read_text(encoding="utf-8")

main = replace_once(main, "import android.os.Message;\n", "", "remove popup Message import")
main = replace_once(
    main,
    "        settings.setSupportMultipleWindows(true);",
    "        settings.setSupportMultipleWindows(false);",
    "restore single-window WebView mode",
)

start_marker = "            @Override\n            public boolean onCreateWindow("
end_marker = "            @Override\n            public boolean onJsAlert("
start = main.find(start_marker)
end = main.find(end_marker, start)
if start < 0 or end < 0 or end <= start:
    raise SystemExit("popup WebView method block was not found exactly once")
if main.find(start_marker, start + 1) >= 0:
    raise SystemExit("multiple popup WebView method blocks found")
main = main[:start] + main[end:]

old_http = '''        if ("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme)) {
            return false;
        }'''
new_http = '''        if ("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme)) {
            if (view != null) {
                String target = uri.toString();
                String current = view.getUrl();
                if (current == null || !current.equals(target)) {
                    view.loadUrl(target);
                }
            }
            return true;
        }'''
main = replace_once(main, old_http, new_http, "internal HTTP navigation ownership")
main = replace_once(main, "native-2.0.5", "native-2.0.6", "native version marker")

if "onCreateWindow(" in main:
    raise SystemExit("onCreateWindow remains after regression fix")
if "new WebView(MainActivity.this)" in main:
    raise SystemExit("temporary popup WebView remains after regression fix")
if "settings.setSupportMultipleWindows(false);" not in main:
    raise SystemExit("single-window mode was not restored")
if "view.loadUrl(target);" not in main:
    raise SystemExit("explicit internal navigation was not installed")
main_path.write_text(main, encoding="utf-8")

gradle_path = Path("v2/android/client/build.gradle.kts")
gradle = gradle_path.read_text(encoding="utf-8")
gradle = replace_once(gradle, "versionCode = 14", "versionCode = 15", "client versionCode")
gradle = replace_once(gradle, 'versionName = "2.0.5"', 'versionName = "2.0.6"', "client versionName")
gradle_path.write_text(gradle, encoding="utf-8")

license_path = Path("v2/android/client/src/main/java/com/jinli/ggsecure/V2LicenseManager.java")
license = license_path.read_text(encoding="utf-8")
license = replace_once(
    license,
    "private static final int PROTOCOL_APP_VERSION = 14;",
    "private static final int PROTOCOL_APP_VERSION = 15;",
    "protocol app version",
)
license_path.write_text(license, encoding="utf-8")

print("Applied GG 2.0.6 browser window regression fix")
