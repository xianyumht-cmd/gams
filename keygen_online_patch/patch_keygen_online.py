from pathlib import Path
import re

manifest_path = Path('keygen/src/main/AndroidManifest.xml')
build_path = Path('keygen/build.gradle.kts')

manifest = manifest_path.read_text(encoding='utf-8')
if 'android.permission.INTERNET' not in manifest:
    manifest = manifest.replace(
        '<manifest xmlns:android="http://schemas.android.com/apk/res/android">',
        '<manifest xmlns:android="http://schemas.android.com/apk/res/android">\n'
        '    <uses-permission android:name="android.permission.INTERNET" />'
    )
manifest = manifest.replace(
    'android:theme="@android:style/Theme.Material.Light.NoActionBar">',
    'android:theme="@android:style/Theme.Material.Light.NoActionBar"\n'
    '        android:usesCleartextTraffic="false">'
)
manifest_path.write_text(manifest, encoding='utf-8')

build = build_path.read_text(encoding='utf-8')
build, code_count = re.subn(r'versionCode\s*=\s*\d+', 'versionCode = 2', build, count=1)
build, name_count = re.subn(r'versionName\s*=\s*"[^"]+"', 'versionName = "1.1.0"', build, count=1)
if code_count != 1 or name_count != 1:
    raise SystemExit('Cannot update keygen version')
build_path.write_text(build, encoding='utf-8')
print('Patched key generator for online administration')
