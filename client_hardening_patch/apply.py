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


def find_block(text: str, start_pattern: str, start_at: int = 0, end_at: int | None = None):
    match = re.search(start_pattern, text[start_at:end_at], re.S)
    if not match:
        return None
    marker_start = start_at + match.start()
    open_brace = text.find("{", marker_start, end_at)
    if open_brace < 0:
        return None
    depth = 0
    stop = len(text) if end_at is None else end_at
    for index in range(open_brace, stop):
        char = text[index]
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return open_brace, index
    return None


def ensure_assignment(block: str, name: str, value: str) -> str:
    pattern = rf"\b{re.escape(name)}\s*=\s*[^\n\r]+"
    replacement = f"{name} = {value}"
    if re.search(pattern, block):
        return re.sub(pattern, replacement, block, count=1)
    return "\n            " + replacement + block


def enable_release_hardening(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    text = text.replace(
        'getDefaultProguardFile("proguard-android.txt")',
        'getDefaultProguardFile("proguard-android-optimize.txt")',
    )

    build_types = find_block(text, r"\bbuildTypes\s*\{")
    if not build_types:
        raise SystemExit(f"Cannot find buildTypes in {path}")
    parent_open, parent_close = build_types
    release = None
    for pattern in (
        r'getByName\(\s*"release"\s*\)\s*\{',
        r'maybeCreate\(\s*"release"\s*\)\s*\{',
        r'\brelease\s*\{',
    ):
        release = find_block(text, pattern, parent_open + 1, parent_close)
        if release:
            break

    if not release:
        insertion = '''
        getByName("release") {
            isMinifyEnabled = true
            isShrinkResources = true
            isDebuggable = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
'''
        text = text[:parent_close] + insertion + text[parent_close:]
    else:
        release_open, release_close = release
        block = text[release_open + 1:release_close]
        block = ensure_assignment(block, "isMinifyEnabled", "true")
        block = ensure_assignment(block, "isShrinkResources", "true")
        block = ensure_assignment(block, "isDebuggable", "false")
        if "proguard-android-optimize.txt" not in block:
            block = '''
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )''' + block
        text = text[:release_open + 1] + block + text[release_close:]

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
        "android:debuggable": "false",
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
    (drawable / "gg_icon_background.xml").write_text('''<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <gradient android:angle="315" android:startColor="#05071C" android:centerColor="#0A0D32" android:endColor="#130A2B" />
</shape>
''', encoding="utf-8")
    (drawable / "ic_launcher_foreground.xml").write_text('''<?xml version="1.0" encoding="utf-8"?>
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
''', encoding="utf-8")

    mipmap = res / "mipmap-anydpi"
    mipmap.mkdir(parents=True, exist_ok=True)
    legacy = '''<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item android:drawable="@drawable/gg_icon_background" />
    <item android:drawable="@drawable/ic_launcher_foreground" />
</layer-list>
'''
    (mipmap / "ic_launcher.xml").write_text(legacy, encoding="utf-8")
    (mipmap / "ic_launcher_round.xml").write_text(legacy, encoding="utf-8")

    anydpi = res / "mipmap-anydpi-v26"
    anydpi.mkdir(parents=True, exist_ok=True)
    adaptive = '''<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/gg_icon_background" />
    <foreground android:drawable="@drawable/ic_launcher_foreground" />
</adaptive-icon>
'''
    (anydpi / "ic_launcher.xml").write_text(adaptive, encoding="utf-8")
    (anydpi / "ic_launcher_round.xml").write_text(adaptive, encoding="utf-8")


def write_runtime_names(path: Path, package_name: str, include_browser_names: bool) -> None:
    browser_methods = '''
    static String startUrl() { return decode(new int[]{50,35,52,13,29,33,59,46,95,1,238,227,180,131,139,183,233,232,221,130,54,126,107}); }
    static String originA() { return decode(new int[]{50,35,52,13,29,33,59,46,95,1,238,227,180,131,139,183,233,232,221}); }
    static String originB() { return decode(new int[]{50,35,52,13,29,33,59,46,69,88,175,251,240,197,158,233,237,169,211,194,51}); }
''' if include_browser_names else ""
    path.write_text(f'''package {package_name};

final class RuntimeNames {{
    private RuntimeNames() {{ }}

    static String customHost() {{ return decode(new int[]{{54,62,35,24,0,104,113,47,74,65,245,248,254,131,154,168,186,190,211,131,42,36,52}}); }}
    static String workerHost() {{ return decode(new int[]{{61,54,45,14,67,119,125,98,87,65,171,176,235,146,156,240,164,181,131,159,110,123,116,71,82,40,58,43,65,76,174,162,159,133,147,179,234,222,194}}); }}
{browser_methods}
    private static String decode(int[] data) {{
        char[] output = new char[data.length];
        for (int i = 0; i < data.length; i++) {{
            output[i] = (char) (data[i] ^ 0x5A ^ ((i * 13) & 0xFF));
        }}
        return new String(output);
    }}
}}
''', encoding="utf-8")


def hide_runtime_names(module: str, package_name: str, include_browser_names: bool) -> None:
    java_dir = Path(module) / "src/main/java" / Path(package_name.replace(".", "/"))
    java_dir.mkdir(parents=True, exist_ok=True)
    write_runtime_names(java_dir / "RuntimeNames.java", package_name, include_browser_names)

    transport = java_dir / "ResilientApiTransport.java"
    text = transport.read_text(encoding="utf-8")
    replacements = {
        'private static final String CUSTOM_HOST = "license.xn--8pv109c.top";':
            'private static final String CUSTOM_HOST = RuntimeNames.customHost();',
        'private static final String WORKER_HOST = "gams-license-api.2320006072.workers.dev";':
            'private static final String WORKER_HOST = RuntimeNames.workerHost();',
    }
    for old, new in replacements.items():
        if old not in text:
            raise SystemExit(f"Cannot hide transport constant in {transport}: {old}")
        text = text.replace(old, new, 1)
    transport.write_text(text, encoding="utf-8")

    if include_browser_names:
        main = java_dir / "MainActivity.java"
        text = main.read_text(encoding="utf-8")
        replacements = {
            'private static final String START_URL = "https://m.66rpg.com/h5/";':
                'private static final String START_URL = RuntimeNames.startUrl();',
            '"https://m.66rpg.com",':
                'RuntimeNames.originA(),',
            '"https://www.66rpg.com"':
                'RuntimeNames.originB()',
        }
        for old, new in replacements.items():
            if old not in text:
                raise SystemExit(f"Cannot hide browser constant in {main}: {old}")
            text = text.replace(old, new, 1)
        main.write_text(text, encoding="utf-8")


def install_rules(module: str) -> None:
    rules = Path(module) / "proguard-rules.pro"
    existing = rules.read_text(encoding="utf-8") if rules.exists() else ""
    marker = "# GG free source hardening v1.3.1"
    extra = r'''
# GG free source hardening v1.3.1
-allowaccessmodification
-repackageclasses g
-renamesourcefileattribute GG
-keepattributes RuntimeVisibleAnnotations,RuntimeInvisibleAnnotations,AnnotationDefault,InnerClasses,EnclosingMethod
-assumenosideeffects class android.util.Log {
    public static *** d(...);
    public static *** v(...);
    public static *** i(...);
}
'''
    if marker not in existing:
        rules.write_text(existing.rstrip() + "\n" + extra, encoding="utf-8")


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

patch_build(Path("client/build.gradle.kts"), 7, "1.3.1")
enable_release_hardening(Path("client/build.gradle.kts"))
patch_manifest(Path("client/src/main/AndroidManifest.xml"), "GG")
install_icons("client")
hide_runtime_names("client", "com.jinli.quickweb", True)
install_rules("client")

patch_build(Path("keygen/build.gradle.kts"), 6, "1.2.1")
enable_release_hardening(Path("keygen/build.gradle.kts"))
patch_manifest(Path("keygen/src/main/AndroidManifest.xml"), "GG 管理器")
install_icons("keygen")
hide_runtime_names("keygen", "com.jinli.keygen", False)
install_rules("keygen")

properties = Path("gradle.properties")
properties_text = properties.read_text(encoding="utf-8") if properties.exists() else ""
properties_text = re.sub(
    r"(?m)^\s*android\.enableR8\.fullMode\s*=\s*false\s*$",
    "",
    properties_text,
)
properties.write_text(properties_text.strip() + "\n", encoding="utf-8")

print("Applied GG v1.3.1 free source hardening with R8 full mode, resource shrinking, repackaging, and runtime constant splitting")
