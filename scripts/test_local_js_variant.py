"""Static contract checks for the isolated Android JS test build."""

from hashlib import sha256, sha384
import base64
from pathlib import Path
import xml.etree.ElementTree as ET


ROOT = Path(__file__).resolve().parent.parent
CLIENT = ROOT / "v2/android/client"
EXPECTED = {
    "noname.js": "1dd13ae38f3000c080427afb919bfe25aff71a7715c239eb233bd551a0d3533c",
    "game.js": "b7756055a87cb8bef4409746fce0208ea0edd3e7e515e88f8ee73018a8c2019c",
}


def local_mode(rel_path: str) -> str:
    path = CLIENT / rel_path
    root = ET.parse(path).getroot()
    entry = root.find("bool[@name='gg_local_test_mode']")
    assert entry is not None, f"Missing gg_local_test_mode: {path}"
    return (entry.text or "").strip()


def main() -> None:
    assert local_mode("src/main/res/values/local_test.xml") == "false"
    assert local_mode("src/localTest/res/values/local_test.xml") == "true"
    gradle = (CLIENT / "build.gradle.kts").read_text(encoding="utf-8")
    assert 'create("localTest")' in gradle
    assert 'applicationIdSuffix = ".localtest"' in gradle

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

    for name, expected_hash in EXPECTED.items():
        payload = CLIENT / "src/localTest/assets" / name
        digest = sha256(payload.read_bytes()).hexdigest()
        assert digest == expected_hash, f"{name} differs from the supplied file: {digest}"
        print(f"Verified {name}: {payload.stat().st_size} bytes, SHA256 {digest}")
    print("Verified isolated build, local mode, and WebView injection contract")


if __name__ == "__main__":
    main()
