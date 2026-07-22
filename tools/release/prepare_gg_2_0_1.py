#!/usr/bin/env python3
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path

APP_VERSION = "2.0.1"
APP_CODE = "10"
NONAME_VERSION = "1.1.2"
ENGINE_VERSION = "1.0.4"
ENGINE_CODE = 10004
RUNTIME_VERSION = "2.0.1-r1"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one occurrence, found {count}")
    return text.replace(old, new, 1)


def update_android() -> None:
    gradle = Path("v2/android/client/build.gradle.kts")
    text = gradle.read_text(encoding="utf-8")
    text, c1 = re.subn(r"versionCode\s*=\s*9\b", f"versionCode = {APP_CODE}", text, count=1)
    text, c2 = re.subn(r'versionName\s*=\s*"2\.0\.0"', f'versionName = "{APP_VERSION}"', text, count=1)
    if c1 != 1 or c2 != 1:
        raise SystemExit("Android version fields were not updated exactly once")
    gradle.write_text(text, encoding="utf-8")

    manager = Path("v2/android/client/src/main/java/com/jinli/ggsecure/V2LicenseManager.java")
    text = manager.read_text(encoding="utf-8")
    text, c1 = re.subn(r"PROTOCOL_APP_VERSION\s*=\s*9;", f"PROTOCOL_APP_VERSION = {APP_CODE};", text, count=1)
    text, c2 = re.subn(r"版本：2\.0\.0", f"版本：{APP_VERSION}", text, count=1)
    if c1 != 1 or c2 != 1:
        raise SystemExit("V2LicenseManager version fields were not updated exactly once")
    manager.write_text(text, encoding="utf-8")

    activity = Path("v2/android/client/src/main/java/com/jinli/ggsecure/MainActivity.java")
    text = activity.read_text(encoding="utf-8")
    old = """                String url = request.getUrl().toString();
                if (isEngineRequest(url)) return memoryGameResponse();"""
    new = """                String url = request.getUrl().toString();
                if (isOfficialEngineRequest(url)) return emptyOfficialEngineResponse();
                if (isEngineRequest(url)) return memoryGameResponse();"""
    text = replace_once(text, old, new, "WebView interception")
    old_method = """    private boolean isEngineRequest(String url) {
        String lower = url == null ? "" : url.toLowerCase(Locale.ROOT);
        return lower.equals(RuntimeNames.virtualGameUrl().toLowerCase(Locale.ROOT))
                || lower.contains("gams-script-edge.2320006072.workers.dev/engine/stable.js")
                || lower.contains("space-z.ai/game.js");
    }
"""
    methods = """    private WebResourceResponse emptyOfficialEngineResponse() {
        byte[] body = "window.__gg_official_engine_blocked__=true;".getBytes(
                java.nio.charset.StandardCharsets.UTF_8);
        Map<String, String> headers = new java.util.HashMap<>();
        headers.put("Cache-Control", "no-store, no-cache, max-age=0");
        headers.put("Pragma", "no-cache");
        headers.put("X-Content-Type-Options", "nosniff");
        headers.put("Content-Length", String.valueOf(body.length));
        return new WebResourceResponse(
                "application/javascript", "UTF-8", 200, "OK",
                headers, new ByteArrayInputStream(body));
    }

    private boolean isOfficialEngineRequest(String url) {
        String lower = url == null ? "" : url.toLowerCase(Locale.ROOT);
        return lower.contains("c2.cgyouxi.com/website/hfplayer/")
                && lower.contains("/bin/official/game.js");
    }

    private boolean isEngineRequest(String url) {
        String lower = url == null ? "" : url.toLowerCase(Locale.ROOT);
        return lower.equals(RuntimeNames.virtualGameUrl().toLowerCase(Locale.ROOT))
                || lower.contains("gams-script-edge.2320006072.workers.dev/engine/stable.js")
                || lower.contains("space-z.ai/game.js");
    }
"""
    activity.write_text(replace_once(text, old_method, methods, "engine request methods"), encoding="utf-8")


def update_android_ci() -> None:
    ci = Path(".github/workflows/v2-build-apks.yml")
    text = ci.read_text(encoding="utf-8")
    text = replace_once(text, "Build GG 2.0.0 formal client release", f"Build GG {APP_VERSION} formal client release", "CI title")
    text = replace_once(text, "permissions:\n  contents: read", "permissions:\n  contents: write", "CI permissions")
    text = replace_once(text, 'test "$client_version" = "2.0.0"', f'test "$client_version" = "{APP_VERSION}"', "CI version")
    text = replace_once(text, 'test "$client_code" = "9"', f'test "$client_code" = "{APP_CODE}"', "CI code")
    text = replace_once(text, "versionCode='9' versionName='2.0.0'", f"versionCode='{APP_CODE}' versionName='{APP_VERSION}'", "CI badging")
    text = replace_once(text, "name: GG-2.0.0-formal-client-release-input", f"name: GG-{APP_VERSION}-formal-client-release-input", "CI artifact")
    locator = f'''

      - name: Publish unsigned build locator
        if: github.event_name == 'push'
        shell: bash
        run: |
          set -euo pipefail
          mkdir -p release-download
          cat > release-download/latest-unsigned-build.json <<EOF
          {{"ok":true,"run_id":${{GITHUB_RUN_ID}},"artifact_name":"GG-{APP_VERSION}-formal-client-release-input","versionName":"{APP_VERSION}","versionCode":{APP_CODE}}}
          EOF
          git config user.name github-actions[bot]
          git config user.email 41898282+github-actions[bot]@users.noreply.github.com
          git add -f release-download/latest-unsigned-build.json
          git commit -m "Publish GG {APP_VERSION} unsigned build locator" || exit 0
          git push origin HEAD:main
'''
    if "Publish unsigned build locator" not in text:
        text = text.rstrip() + locator
    if "2.0.0" in text:
        raise SystemExit("stale 2.0.0 remains in Android CI")
    ci.write_text(text + ("" if text.endswith("\n") else "\n"), encoding="utf-8")


def update_noname() -> None:
    path = Path("remote-script/src/noname.js")
    text = path.read_text(encoding="utf-8")
    text, count = re.subn(r"//\s*@version\s+1\.1\.1", f"// @version      {NONAME_VERSION}", text, count=1)
    if count != 1:
        raise SystemExit("noname.js version replacement failed")
    text = text.replace("状态：2026年7月22日正常使用", "状态：2026年7月23日正常使用")
    fragmented = '"https://pre"+"view-chat-1"+"b176371-f9a"+"b-4760-b15c"+"-b9d70ed59d"+"23.space-z."+"ai/game.js"'
    stable = '"https://gams-script-edge.2320006072.workers.dev/engine/stable.js"'
    text = replace_once(text, fragmented, stable, "fragmented preview URL")
    if "preview-chat-1b176371" in text:
        raise SystemExit("legacy preview URL remains")
    path.write_text(text, encoding="utf-8")


def build_engine() -> None:
    source = Path("game-engine/release/game-1.0.3.js")
    target = Path(f"game-engine/release/game-{ENGINE_VERSION}.js")
    if target.exists():
        raise SystemExit(f"engine target already exists: {target}")
    data = source.read_bytes()
    header = b"/*1.0.3*/"
    old_probe = (
        'try{Object.defineProperty(window,"__gg_runtime_probe__",'
        '{value:Object.freeze({engine:"1.0.3",ready:true,loadedAt:Date.now()}),'
        'enumerable:false,configurable:false,writable:false});}catch(_){}'
    ).encode("utf-8")
    if not data.startswith(header) or not data.endswith(old_probe):
        raise SystemExit("unexpected game-1.0.3 structure")
    body = data[len(header):-len(old_probe)]
    prefix = (
        '/*1.0.4*/(function(){'
        'if(window.__gg_engine_load_state__==="ready"||window.__gg_engine_load_state__==="loading")return;'
        'window.__gg_engine_load_state__="loading";try{'
    ).encode("utf-8")
    probe = (
        'try{Object.defineProperty(window,"__gg_runtime_probe__",'
        '{value:Object.freeze({engine:"1.0.4",ready:true,loadedAt:Date.now()}),'
        'enumerable:false,configurable:false,writable:false});}catch(_){}'
    ).encode("utf-8")
    suffix = (
        'window.__gg_engine_load_state__="ready";'
        '}catch(e){window.__gg_engine_load_state__="";throw e;}})();'
    ).encode("utf-8")
    updated = prefix + body + probe + suffix
    if "脚本加载完成~".encode("utf-8") in updated:
        raise SystemExit("visible loading alert remains")
    target.write_bytes(updated)

    published = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    manifest = {
        "schemaVersion": 1,
        "channel": "stable",
        "version": ENGINE_CODE,
        "versionName": ENGINE_VERSION,
        "file": target.name,
        "sha256": hashlib.sha256(updated).hexdigest(),
        "size": len(updated),
        "sourceUrl": f"https://raw.githubusercontent.com/xianyumht-cmd/gams/main/game-engine/release/{target.name}",
        "minNonameVersion": NONAME_VERSION,
        "publishedAt": published,
    }
    keys = ("schemaVersion", "channel", "version", "versionName", "file", "sha256", "size", "sourceUrl", "minNonameVersion", "publishedAt")
    Path("/tmp/engine-canonical.txt").write_text("".join(f"{key}={manifest[key]}\n" for key in keys), encoding="utf-8", newline="\n")
    Path("/tmp/engine-unsigned.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    compatibility = Path("game-engine/compatibility.json")
    data = json.loads(compatibility.read_text(encoding="utf-8"))
    data["stable"]["engineVersion"] = ENGINE_VERSION
    data["stable"]["nonameVersion"] = NONAME_VERSION
    compatibility.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    update_android()
    update_android_ci()
    update_noname()
    build_engine()
    print(json.dumps({"app": APP_VERSION, "versionCode": int(APP_CODE), "noname": NONAME_VERSION, "engine": ENGINE_VERSION, "runtime": RUNTIME_VERSION}, ensure_ascii=False))
