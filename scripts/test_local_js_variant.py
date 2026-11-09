"""Static contract checks for the isolated Android JS test build."""

from hashlib import sha256
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

    activity = (CLIENT / "src/main/java/com/jinli/ggsecure/MainActivity.java").read_text(encoding="utf-8")
    entry = activity.index("protected void onCreate(")
    local = activity.index("if (isLocalTest())", entry)
    license_setup = activity.index("licenseManager = new V2LicenseManager(this);", entry)
    assert local < license_setup, "Local test must bypass LicenseManager creation"
    assert "showBrowser(null, RuntimePayload.fromLocalAssets(getAssets()))" in activity
    assert "WebViewCompat.addDocumentStartJavaScript" in activity
    assert "shouldInterceptRequest" in activity

    for name, expected_hash in EXPECTED.items():
        payload = CLIENT / "src/localTest/assets" / name
        digest = sha256(payload.read_bytes()).hexdigest()
        assert digest == expected_hash, f"{name} differs from the supplied file: {digest}"
        print(f"Verified {name}: {payload.stat().st_size} bytes, SHA256 {digest}")
    print("Verified isolated build, local mode, and WebView injection contract")


if __name__ == "__main__":
    main()
