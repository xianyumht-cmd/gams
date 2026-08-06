from pathlib import Path

ROOT = Path(__file__).resolve().parent
MODULE = Path("v2/android/client")
JAVA = MODULE / "src/main/java/com/jinli/ggsecure"
ASSETS = MODULE / "src/main/assets"
BUILD = MODULE / "build.gradle.kts"
MANIFEST = MODULE / "src/main/AndroidManifest.xml"

for source, destination in (
    (ROOT / "src/main/java/com/jinli/ggsecure/DiagnosticLogger.java", JAVA / "DiagnosticLogger.java"),
    (ROOT / "src/main/assets/diagnostic-prelude.js", ASSETS / "diagnostic-prelude.js"),
    (ROOT / "src/main/assets/diagnostic-postlude.js", ASSETS / "diagnostic-postlude.js"),
):
    if not source.is_file():
        raise SystemExit(f"missing strict privacy source: {source}")
    destination.write_bytes(source.read_bytes())

build = BUILD.read_text(encoding="utf-8")
if build.count("versionCode = 26") != 1:
    raise SystemExit("code26 diagnostic baseline mismatch")
if build.count('versionName = "2.0.15-page5-bridge-diag"') != 1:
    raise SystemExit("diagnostic versionName baseline mismatch")
build = build.replace("versionCode = 26", "versionCode = 28", 1)
build = build.replace(
    'versionName = "2.0.15-page5-bridge-diag"',
    'versionName = "2.0.17-private-diagnostic"',
    1,
)
BUILD.write_text(build, encoding="utf-8")

manifest = MANIFEST.read_text(encoding="utf-8")
if manifest.count('android:label="GG 诊断版"') != 1:
    raise SystemExit("diagnostic label baseline mismatch")
manifest = manifest.replace('android:label="GG 诊断版"', 'android:label="匿名诊断工具"', 1)
MANIFEST.write_text(manifest, encoding="utf-8")

logger = (JAVA / "DiagnosticLogger.java").read_text(encoding="utf-8")
prelude = (ASSETS / "diagnostic-prelude.js").read_text(encoding="utf-8")
postlude = (ASSETS / "diagnostic-postlude.js").read_text(encoding="utf-8")

required_logger = (
    "assertPrivacySafe(logFile)",
    "No exact or hashed domain",
    "routeToken(String value)",
    "LONG_HEX_PATTERN",
    "privateSessionNonce",
)
for marker in required_logger:
    if marker not in logger:
        raise SystemExit(f"missing strict logger marker: {marker}")

required_js = (
    "routeToken",
    "selectorToken",
    "callbackToken",
    "durationBucket",
    "dynamic_script_start",
    "callback_state",
)
combined = prelude + "\n" + postlude
for marker in required_js:
    if marker not in combined:
        raise SystemExit(f"missing strict JS marker: {marker}")

for forbidden in (
    "66rpg",
    "cgyouxi",
    "createBuyOrder",
    "goods_id",
    "buy_num",
    "mallViewData",
    "https://",
    "http://",
    "userAgentHash",
    "messageHash",
    "stackHash",
    "sha256",
    "textLength",
    "className",
):
    if forbidden.lower() in combined.lower():
        raise SystemExit(f"strict JS privacy guard failed: {forbidden}")

print("Applied strict non-identifying diagnostics, versionCode=28")
