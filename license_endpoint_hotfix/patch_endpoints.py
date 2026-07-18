from pathlib import Path
import re

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
    f'    private static final String API_BASE = "{WORKERS_ENDPOINT}";\n',
    "",
    "client legacy endpoint",
)
client_manager = replace_once(
    client_manager,
    "    private static final int APP_VERSION_CODE = 3;",
    "    private static final int APP_VERSION_CODE = 5;",
    "client app version constant",
)
client_method = re.compile(
    r"    private HttpResult post\(String path, JSONObject body\) throws IOException \{.*?\n"
    r"    \}\n\n"
    r"    private byte\[\] readLimited",
    re.S,
)
client_replacement = '''    private HttpResult post(String path, JSONObject body) throws IOException {
        ResilientApiTransport.Response response = ResilientApiTransport.post(
                path,
                body.toString(),
                "QuickWeb/5 Android",
                null,
                MAX_RESPONSE_BYTES
        );
        return new HttpResult(
                response.status >= 200 && response.status < 300,
                response.body
        );
    }

    private byte[] readLimited'''
client_manager, count = client_method.subn(client_replacement, client_manager, count=1)
if count != 1:
    raise SystemExit(f"Cannot patch client resilient transport: got {count}")
client_manager_path.write_text(client_manager, encoding="utf-8")

admin_manager_path = Path("keygen/src/main/java/com/jinli/keygen/AdminApiManager.java")
admin_manager = admin_manager_path.read_text(encoding="utf-8")
admin_manager = replace_once(
    admin_manager,
    f'    private static final String API_BASE = "{WORKERS_ENDPOINT}";\n',
    "",
    "admin legacy endpoint",
)
admin_method = re.compile(
    r"    private JSONObject post\(String path, JSONObject body, boolean authorized\) throws Exception \{.*?\n"
    r"    \}\n\n"
    r"    private byte\[\] readLimited",
    re.S,
)
admin_replacement = '''    private JSONObject post(String path, JSONObject body, boolean authorized) throws Exception {
        String authorization = "";
        if (authorized) {
            String token = preferences.getString(PREF_TOKEN, "");
            if (token.isEmpty()) throw new UnauthorizedException();
            authorization = "Bearer " + token;
        }
        ResilientApiTransport.Response response = ResilientApiTransport.post(
                path,
                body.toString(),
                "CardKeyAdmin/4 Android",
                authorization,
                MAX_RESPONSE_BYTES
        );
        if (response.status == 401) throw new UnauthorizedException();
        return new JSONObject(response.body);
    }

    private byte[] readLimited'''
admin_manager, count = admin_method.subn(admin_replacement, admin_manager, count=1)
if count != 1:
    raise SystemExit(f"Cannot patch admin resilient transport: got {count}")
admin_manager_path.write_text(admin_manager, encoding="utf-8")

client_build_path = Path("client/build.gradle.kts")
client_build = client_build_path.read_text(encoding="utf-8")
client_build, code_count = re.subn(r"versionCode\s*=\s*\d+", "versionCode = 5", client_build, count=1)
client_build, name_count = re.subn(r'versionName\s*=\s*"[^"]+"', 'versionName = "1.2.2"', client_build, count=1)
if code_count != 1 or name_count != 1:
    raise SystemExit("Cannot update client resilient hotfix version")
client_build_path.write_text(client_build, encoding="utf-8")

admin_build_path = Path("keygen/build.gradle.kts")
admin_build = admin_build_path.read_text(encoding="utf-8")
admin_build, code_count = re.subn(r"versionCode\s*=\s*\d+", "versionCode = 4", admin_build, count=1)
admin_build, name_count = re.subn(r'versionName\s*=\s*"[^"]+"', 'versionName = "1.1.2"', admin_build, count=1)
if code_count != 1 or name_count != 1:
    raise SystemExit("Cannot update admin resilient hotfix version")
admin_build_path.write_text(admin_build, encoding="utf-8")

print("Patched authorization clients with resilient multi-channel transport")
