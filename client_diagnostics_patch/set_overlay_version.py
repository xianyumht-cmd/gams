from pathlib import Path
import re

build_path = Path("client/build.gradle.kts")
text = build_path.read_text(encoding="utf-8")
text, code_count = re.subn(r"versionCode\s*=\s*\d+", "versionCode = 13", text, count=1)
text, name_count = re.subn(
    r'versionName\s*=\s*"[^"]+"',
    'versionName = "1.4.0-diag.20260806.2"',
    text,
    count=1,
)
if code_count != 1 or name_count != 1:
    raise SystemExit(
        f"Cannot set overlay diagnostic version: code={code_count}, name={name_count}"
    )
build_path.write_text(text, encoding="utf-8")
print("Set overlay diagnostic APK versionCode=13 versionName=1.4.0-diag.20260806.2")
