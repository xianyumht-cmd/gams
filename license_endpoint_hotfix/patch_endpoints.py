from pathlib import Path
import re

CUSTOM_ENDPOINT = "https://license.xn--8pv109c.top"
WORKERS_ENDPOINT = "https://gams-license-api.2320006072.workers.dev"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Cannot patch {label}: expected 1 match, got {count}")
    return text.replace(old, new, 1)


client_manager_path = Path("client/src/main/java/com/jinli/quickweb/OnlineLicenseManager.java")
client_manager = client_manager_path.read_text(encoding="utf-8")
client_manager = replace_once(
    client_manager,
    f'    private static final String API_BASE = "{WORKERS_ENDPOINT}";',
    f'    private static final String API_BASE = "{CUSTOM_ENDPOINT}";',
    "client API endpoint",
)
client_manager_path.write_text(client_manager, encoding="utf-8")

admin_manager_path = Path("keygen/src/main/java/com/jinli/keygen/AdminApiManager.java")
admin_manager = admin_manager_path.read_text(encoding="utf-8")
admin_manager = replace_once(
    admin_manager,
    f'    private static final String API_BASE = "{WORKERS_ENDPOINT}";',
    f'    private static final String API_BASE = "{CUSTOM_ENDPOINT}";',
    "admin API endpoint",
)
admin_manager_path.write_text(admin_manager, encoding="utf-8")

client_build_path = Path("client/build.gradle.kts")
client_build = client_build_path.read_text(encoding="utf-8")
client_build, code_count = re.subn(r"versionCode\s*=\s*\d+", "versionCode = 4", client_build, count=1)
client_build, name_count = re.subn(r'versionName\s*=\s*"[^"]+"', 'versionName = "1.2.1"', client_build, count=1)
if code_count != 1 or name_count != 1:
    raise SystemExit("Cannot update client hotfix version")
client_build_path.write_text(client_build, encoding="utf-8")

admin_build_path = Path("keygen/build.gradle.kts")
admin_build = admin_build_path.read_text(encoding="utf-8")
admin_build, code_count = re.subn(r"versionCode\s*=\s*\d+", "versionCode = 3", admin_build, count=1)
admin_build, name_count = re.subn(r'versionName\s*=\s*"[^"]+"', 'versionName = "1.1.1"', admin_build, count=1)
if code_count != 1 or name_count != 1:
    raise SystemExit("Cannot update admin hotfix version")
admin_build_path.write_text(admin_build, encoding="utf-8")

print("Patched authorization endpoint to custom domain")
