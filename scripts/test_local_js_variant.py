"""Static contract checks for the isolated Android JS test build."""

from hashlib import sha256, sha384
import base64
from pathlib import Path
import sys
import xml.etree.ElementTree as ET


ROOT = Path(__file__).resolve().parent.parent
CLIENT = ROOT / "v2/android/client"
PAIRS = {"1.1.4": "1.0.5", "1.1.3": "1.0.5", "1.1.2": "1.0.4"}
EXPECTED_SHA256 = {
    "noname-1.1.4.js": "ac4d465795a59fe9b6fe5f3f9fe29c2733de332de70f09228c04108792ea6818",
    "noname-1.1.3.js": "bb0337e6398658eec79e20da174206eb211807428960ea254b6bb4258dbe0a84",
    "noname-1.1.2.js": "0e2209f6091543d5e69e3c9a039366c88ca388da4df9007fa73ff9a420d732e7",
    "game-1.0.5.js": "61903eb697e82ae09f03a8ae87bd8808b6063191a224057fcb5e75813573e7a8",
    "game-1.0.4.js": "c679859cf322f6c2d1049e1017309a2ebee1850c83874a4586e29b784d68cbc5",
}


def local_mode(rel_path: str) -> str:
    path = CLIENT / rel_path
    root = ET.parse(path).getroot()
    entry = root.find("bool[@name='gg_local_test_mode']")
    assert entry is not None, f"Missing gg_local_test_mode: {path}"
    return (entry.text or "").strip()


def main() -> None:
    assert len(sys.argv) == 3, "Usage: test_local_js_variant.py NONAME_VERSION GAME_VERSION"
    noname_version, game_version = sys.argv[1:]
    assert PAIRS.get(noname_version) == game_version, f"Invalid pair: {noname_version} + {game_version}"
    assert local_mode("src/main/res/values/local_test.xml") == "false"
    assert local_mode("src/localTest/res/values/local_test.xml") == "true"
    gradle = (CLIENT / "build.gradle.kts").read_text(encoding="utf-8")
    assert 'create("localTest")' in gradle
    assert 'applicationIdSuffix = ".localtest$localVariantCode"' in gradle
    assert 'manifestPlaceholders["ggLocalTestLabel"]' in gradle
    workflow = (ROOT / ".github/workflows/gg-local-js-test-apk.yml").read_text(encoding="utf-8")
    for version, engine in PAIRS.items():
        assert f'"{version}:{engine}"' in workflow
    assert "GG-local-noname-${noname}-game-${game}.apk" in workflow

    manifest = ET.parse(CLIENT / "src/localTest/AndroidManifest.xml").getroot()
    application = manifest.find("application")
    assert application is not None
    assert application.attrib.get("{http://schemas.android.com/tools}replace") == "android:label"

    activity = (CLIENT / "src/main/java/com/jinli/ggsecure/MainActivity.java").read_text(encoding="utf-8")
    entry = activity.index("protected void onCreate(")
    local = activity.index("if (isLocalTest())", entry)
    license_setup = activity.index("licenseManager = new V2LicenseManager(this);", entry)
    assert local < license_setup, "Local test must bypass LicenseManager creation"
    assert "showBrowser(null, RuntimePayload.fromLocalAssets(getAssets()))" in activity
    assert "WebViewCompat.addDocumentStartJavaScript" in activity
    assert "shouldInterceptRequest" in activity
    assert "source.replace(REMOTE_ENGINE_URL, RuntimeNames.virtualGameUrl())" in activity
    assert "if (isLocalTest() && !nativeDocumentStartEnabled)" in activity
    assert "LocalHtmlRewriter.rewrite(" in activity
    shim_begin = activity.index("private WebResourceResponse emptyOfficialEngineResponse()")
    shim_end = activity.index("private boolean isLocalGameHtml(", shim_begin)
    assert 'headers.put("Access-Control-Allow-Origin", "*")' in activity[shim_begin:shim_end]
    shim = b"window.__gg_official_engine_blocked__=true;"
    shim_sri = "sha384-" + base64.b64encode(sha384(shim).digest()).decode("ascii")
    smoke = (ROOT / "scripts/LocalHtmlRewriterSmoke.java").read_text(encoding="utf-8")
    assert shim_sri in smoke, "The SRI replacement must match the intercepted official response"

    source = (CLIENT / "src/localTest/assets/noname.js").read_text(encoding="utf-8")
    remote = "https://gams-script-edge.2320006072.workers.dev/engine/stable.js"
    assert source.count(remote) >= 2
    injected = source.replace(remote, "https://ggv2.local/runtime/game.js")
    assert remote not in injected and "https://ggv2.local/runtime/game.js" in injected

    for name, source_path in {
        "noname.js": ROOT / f"remote-script/release/noname-{noname_version}.js",
        "game.js": ROOT / f"game-engine/release/game-{game_version}.js",
    }.items():
        expected_hash = EXPECTED_SHA256[source_path.name]
        source_hash = sha256(source_path.read_bytes()).hexdigest()
        assert source_hash == expected_hash, f"Repository source differs: {source_path}: {source_hash}"
        payload = CLIENT / "src/localTest/assets" / name
        digest = sha256(payload.read_bytes()).hexdigest()
        assert digest == expected_hash, f"{name} differs from repository {source_path.name}: {digest}"
        print(f"Verified {name}: {payload.stat().st_size} bytes, SHA256 {digest}")
    print("Verified isolated build, local mode, and WebView injection contract")


if __name__ == "__main__":
    main()
