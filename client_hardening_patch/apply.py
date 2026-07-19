from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent


def patch_build(path: Path, code: int, name: str) -> None:
    text = path.read_text(encoding="utf-8")
    text, c1 = re.subn(r"versionCode\s*=\s*\d+", f"versionCode = {code}", text, count=1)
    text, c2 = re.subn(r'versionName\s*=\s*"[^"]+"', f'versionName = "{name}"', text, count=1)
    if c1 != 1 or c2 != 1:
        raise SystemExit(f"Cannot patch version in {path}")
    path.write_text(text, encoding="utf-8")


def patch_manifest(path: Path, label: str) -> None:
    text = path.read_text(encoding="utf-8")
    app = re.search(r"<application\b[^>]*>", text, re.S)
    if not app:
        raise SystemExit(f"Missing application element in {path}")
    block = app.group(0)
    attrs = {
        "android:allowBackup": "false",
        "android:fullBackupContent": "false",
        "android:label": label,
        "android:icon": "@mipmap/ic_launcher",
        "android:roundIcon": "@mipmap/ic_launcher_round",
        "android:usesCleartextTraffic": "false",
    }
    for key, value in attrs.items():
        pattern = rf'{re.escape(key)}="[^"]*"'
        if re.search(pattern, block):
            block = re.sub(pattern, f'{key}="{value}"', block)
        else:
            block = block[:-1] + f'\n        {key}="{value}">'
    text = text[:app.start()] + block + text[app.end():]
    path.write_text(text, encoding="utf-8")


def install_icons(module: str) -> None:
    res = Path(module) / "src/main/res"
    drawable = res / "drawable"
    drawable.mkdir(parents=True, exist_ok=True)
    (drawable / "gg_icon_background.xml").write_text("""<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <gradient android:angle="315" android:startColor="#05071C" android:centerColor="#0A0D32" android:endColor="#130A2B" />
</shape>
""", encoding="utf-8")
    (drawable / "ic_launcher_foreground.xml").write_text("""<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp" android:height="108dp"
    android:viewportWidth="108" android:viewportHeight="108">
    <path android:fillColor="#173BFF" android:strokeColor="#44E7FF" android:strokeWidth="1.6"
        android:pathData="M47,29 C34,29 24,39 24,54 C24,69 34,79 47,79 L58,79 L58,55 L44,55 L44,63 L49,63 L49,70 L47,70 C39,70 33,64 33,54 C33,44 39,38 47,38 L59,38 L66,29 Z" />
    <path android:fillColor="#C400FF" android:strokeColor="#FF56EF" android:strokeWidth="1.6"
        android:pathData="M78,29 C65,29 55,39 55,54 C55,69 65,79 78,79 L89,79 L89,55 L75,55 L75,63 L80,63 L80,70 L78,70 C70,70 64,64 64,54 C64,44 70,38 78,38 L90,38 L97,29 Z" />
    <path android:fillColor="#00000000" android:strokeColor="#346FFF" android:strokeWidth="1.1"
        android:pathData="M24,46 C29,23 52,13 74,23" />
    <path android:fillColor="#00000000" android:strokeColor="#E623FF" android:strokeWidth="1.1"
        android:pathData="M84,77 C66,94 39,92 25,72" />
</vector>
""", encoding="utf-8")

    mipmap = res / "mipmap-anydpi"
    mipmap.mkdir(parents=True, exist_ok=True)
    legacy = """<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item android:drawable="@drawable/gg_icon_background" />
    <item android:drawable="@drawable/ic_launcher_foreground" />
</layer-list>
"""
    (mipmap / "ic_launcher.xml").write_text(legacy, encoding="utf-8")
    (mipmap / "ic_launcher_round.xml").write_text(legacy, encoding="utf-8")

    anydpi = res / "mipmap-anydpi-v26"
    anydpi.mkdir(parents=True, exist_ok=True)
    adaptive = """<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/gg_icon_background" />
    <foreground android:drawable="@drawable/ic_launcher_foreground" />
</adaptive-icon>
"""
    (anydpi / "ic_launcher.xml").write_text(adaptive, encoding="utf-8")
    (anydpi / "ic_launcher_round.xml").write_text(adaptive, encoding="utf-8")


client_java = Path("client/src/main/java/com/jinli/quickweb")
client_java.mkdir(parents=True, exist_ok=True)
for source in (ROOT / "src/main/java/com/jinli/quickweb").glob("*.java"):
    (client_java / source.name).write_bytes(source.read_bytes())
for obsolete in ("RemoteScriptManager.java",):
    target = client_java / obsolete
    if target.exists():
        target.unlink()
asset = Path("client/src/main/assets/noname.js")
if asset.exists():
    asset.unlink()
patch_build(Path("client/build.gradle.kts"), 6, "1.3.0")
patch_manifest(Path("client/src/main/AndroidManifest.xml"), "GG")
install_icons("client")

patch_build(Path("keygen/build.gradle.kts"), 5, "1.2.0")
patch_manifest(Path("keygen/src/main/AndroidManifest.xml"), "GG 管理器")
install_icons("keygen")

rules = Path("client/proguard-rules.pro")
existing = rules.read_text(encoding="utf-8") if rules.exists() else ""
extra = """
# GG release hardening before external reinforcement.
-renamesourcefileattribute SourceFile
-keepattributes RuntimeVisibleAnnotations,RuntimeInvisibleAnnotations,AnnotationDefault
-assumenosideeffects class android.util.Log {
    public static *** d(...);
    public static *** v(...);
    public static *** i(...);
}
"""
if "GG release hardening" not in existing:
    rules.write_text(existing.rstrip() + "\n" + extra, encoding="utf-8")

print("Applied GG v1.3.0 hardening, branding, secure runtime, and administrator branding")
