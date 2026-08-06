from pathlib import Path

MODULE = Path("v2/android/client")
BUILD = MODULE / "build.gradle.kts"
MANIFEST = MODULE / "src/main/AndroidManifest.xml"
POSTLUDE = MODULE / "src/main/assets/diagnostic-postlude.js"

build = BUILD.read_text(encoding="utf-8")
old_code = "versionCode = 26"
old_name = 'versionName = "2.0.15-page5-bridge-diag"'
if build.count(old_code) != 1 or build.count(old_name) != 1:
    raise SystemExit("code26 diagnostic baseline mismatch")
build = build.replace(old_code, "versionCode = 27", 1)
build = build.replace(old_name, 'versionName = "2.0.16-page5-jsonp-probe"', 1)
BUILD.write_text(build, encoding="utf-8")

manifest = MANIFEST.read_text(encoding="utf-8")
if manifest.count('android:label="GG 诊断版"') != 1:
    raise SystemExit("diagnostic manifest label baseline mismatch")
manifest = manifest.replace('android:label="GG 诊断版"', 'android:label="GG JSONP定位版"', 1)
MANIFEST.write_text(manifest, encoding="utf-8")

postlude = POSTLUDE.read_text(encoding="utf-8")
required = (
    "order_jsonp_probe_installed",
    "order_jsonp_src",
    "order_callback_state",
    "navigation_beforeunload",
    "navigation_pagehide_after_order",
)
for marker in required:
    if marker not in postlude:
        raise SystemExit(f"missing JSONP probe marker: {marker}")
for forbidden in ("responseBody", "requestBody", "callbackName:", "goods_id:"):
    if forbidden in postlude and forbidden not in ("callbackName:",):
        raise SystemExit(f"privacy guard failed: {forbidden}")

print("Applied observation-only JSONP probe overlay, versionCode=27")
