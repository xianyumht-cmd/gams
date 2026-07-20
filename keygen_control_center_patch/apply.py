from pathlib import Path
import re

root = Path(__file__).resolve().parent
java = Path("keygen/src/main/java/com/jinli/keygen")
java.mkdir(parents=True, exist_ok=True)

for name in ("AdminApiManager", "MainActivity"):
    source_dir = root / f"{name}.java"
    parts = sorted(source_dir.glob("part*"))
    if not parts:
        raise SystemExit(f"Missing {name} source parts")
    text = "".join(part.read_text(encoding="utf-8") for part in parts)
    text = text.replace("new JSONObject()", "new J()")
    (java / f"{name}.java").write_text(text, encoding="utf-8")

(java / "J.java").write_bytes((root / "J.java").read_bytes())

build = Path("keygen/build.gradle.kts")
text = build.read_text(encoding="utf-8")
text, code_count = re.subn(r"versionCode\s*=\s*\d+", "versionCode = 7", text, count=1)
text, name_count = re.subn(r'versionName\s*=\s*"[^"]+"', 'versionName = "1.3.0"', text, count=1)
if code_count != 1 or name_count != 1:
    raise SystemExit("Cannot set GG 管理器 1.3.0 version")
build.write_text(text, encoding="utf-8")

required = {
    java / "MainActivity.java": [
        "showDashboard", "showLicenseManager", "showDeviceManager", "showVersionSettings",
        "showSecuritySettings", "showRuntimeManager", "showAudit", "showSettingsHistory",
        "/v1/admin/sessions/revoke-all",
    ],
    java / "AdminApiManager.java": [
        "ResilientApiTransport.post", "RuntimeNames.customHost", "RuntimeNames.workerHost",
    ],
}
for path, markers in required.items():
    content = path.read_text(encoding="utf-8")
    for marker in markers:
        if marker not in content:
            raise SystemExit(f"Missing {marker} in {path}")

print("Installed GG 管理器 1.3.0 complete control console")
