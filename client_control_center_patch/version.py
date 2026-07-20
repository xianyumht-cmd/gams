from pathlib import Path
import re

path = Path("client/build.gradle.kts")
text = path.read_text(encoding="utf-8")
text, code_count = re.subn(r"versionCode\s*=\s*\d+", "versionCode = 8", text, count=1)
text, name_count = re.subn(r'versionName\s*=\s*"[^"]+"', 'versionName = "1.4.0"', text, count=1)
if code_count != 1 or name_count != 1:
    raise SystemExit("Cannot set GG v1.4 version")
path.write_text(text, encoding="utf-8")
print("Set GG 1.4.0 versionCode 8")
