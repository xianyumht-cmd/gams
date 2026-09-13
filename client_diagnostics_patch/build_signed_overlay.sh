#!/usr/bin/env bash
set -euo pipefail

: "${GG_RELEASE_KEYSTORE_BASE64:?missing GG_RELEASE_KEYSTORE_BASE64}"
: "${GG_RELEASE_KEYSTORE_PASSWORD:?missing GG_RELEASE_KEYSTORE_PASSWORD}"

python3 - <<'PY'
from pathlib import Path
import base64
import hashlib

names = [
    "part00", "part01", "part02",
    "part03a", "part03b", "part03c", "part03d",
    "part04",
    "part05a", "part05b", "part05c", "part05d",
    "part06", "part07", "part08",
]
expected = {
    "part03a": "55daa0b004d668fac704fcdafd4ed95e1f4972c8b21e4d9cdcbd4e45760f3a06",
    "part03b": "c15f08e8eed02a7def56ffadaab03263a14fe081802851987cffad3d64e1f7c4",
    "part03c": "832e962722e94114bba427ee0bb9c013d09514d91b7d786713399795e2c00937",
    "part03d": "3f1870c7564e9ae856945a14a724c02692708d2e209ffa0696ee621585a31256",
    "part05a": "43c475b28ae2f1d5e5d12bc718338a51dff4116ab8661c0ee2ac66a183c3064e",
    "part05b": "f45deca39cbe0398b3ce5d2209d0533c53198cfbd7a9c26b74eeb549de7c492f",
    "part05c": "7f1bcd7ab9310339247b7469a84de37af5a9c76fe39b5fe6cb073f38e523d3f2",
    "part05d": "ab252aed7f91fedeb9d6a6db184daae017d0fbed7248e464474ef837a7f45c65",
}
parts = [Path("payload_xz") / name for name in names]
for part in parts:
    if not part.is_file():
        raise SystemExit(f"Missing payload segment: {part.name}")
    cleaned = "".join(part.read_text(encoding="utf-8").split()).encode()
    if part.name in expected and hashlib.sha256(cleaned).hexdigest() != expected[part.name]:
        raise SystemExit(f"Checksum mismatch in {part.name}")
text = "".join("".join(part.read_text(encoding="utf-8").split()) for part in parts)
raw = base64.b64decode(text, validate=True)
if hashlib.sha256(raw).hexdigest() != "aab22ffe5e49fbcb6ba9efa8f960aa90057644ae5a94511d2334704dbb92ea9d":
    raise SystemExit("Payload checksum mismatch")
Path("project_payload.tar.xz").write_bytes(raw)
PY

tar -xJf project_payload.tar.xz

{
  set -x
  cp client_patch/src/main/java/com/jinli/quickweb/RemoteScriptManager.java client/src/main/java/com/jinli/quickweb/RemoteScriptManager.java
  python3 client_patch/patch_client.py
  cp client_online_patch/src/main/java/com/jinli/quickweb/OnlineLicenseManager.java client/src/main/java/com/jinli/quickweb/OnlineLicenseManager.java
  cp client_online_patch/src/main/java/com/jinli/quickweb/ResilientApiTransport.java client/src/main/java/com/jinli/quickweb/ResilientApiTransport.java
  python3 client_online_patch/patch_client_online.py
  cp keygen_online_patch/src/main/java/com/jinli/keygen/MainActivity.java keygen/src/main/java/com/jinli/keygen/MainActivity.java
  cp keygen_online_patch/src/main/java/com/jinli/keygen/AdminApiManager.java keygen/src/main/java/com/jinli/keygen/AdminApiManager.java
  sed 's/package com.jinli.quickweb;/package com.jinli.keygen;/' client_online_patch/src/main/java/com/jinli/quickweb/ResilientApiTransport.java > keygen/src/main/java/com/jinli/keygen/ResilientApiTransport.java
  python3 keygen_online_patch/patch_keygen_online.py
  python3 license_endpoint_hotfix/patch_endpoints.py
  target=client_hardening_patch/src/main/java/com/jinli/quickweb
  mkdir -p "$target"
  for name in SecureStore DeviceIdentity OnlineLicenseManager MainActivity; do
    cat "hardening_client_parts/${name}.java"/part* > "$target/${name}.java"
  done
  python3 client_hardening_patch/apply.py
  python3 client_control_center_patch/version.py
  python3 client_control_center_patch/activity_patch.py
  python3 client_diagnostics_patch/patch_client_diagnostics.py
  python3 client_diagnostics_patch/set_overlay_version.py
} 2>&1 | tee /tmp/apply-diagnostics.log

grep -q 'versionCode = 13' client/build.gradle.kts
grep -q 'versionName = "1.4.0-diag.20260806.2"' client/build.gradle.kts
grep -q 'android:label="GG 诊断版"' client/src/main/AndroidManifest.xml
grep -q 'diagnosticLogger.instrumentSource(source)' client/src/main/java/com/jinli/quickweb/MainActivity.java
grep -q 'addJavascriptInterface(diagnosticBridge, "__GG_DIAG__")' client/src/main/java/com/jinli/quickweb/MainActivity.java
grep -q 'Exact URLs, host names, page text' client/src/main/java/com/jinli/quickweb/DiagnosticLogger.java
grep -q 'responseLength' client/src/main/assets/diagnostic-prelude.js
! grep -q 'responseText:' client/src/main/assets/diagnostic-prelude.js
! grep -q 'requestBody' client/src/main/assets/diagnostic-prelude.js
test ! -e client/src/main/assets/noname.js

gradle :client:assembleRelease --stacktrace 2>&1 | tee /tmp/gradle-diagnostics.log

mkdir -p dist
unsigned="client/build/outputs/apk/release/client-release.apk"
test -s "$unsigned"
test -s client/build/outputs/mapping/release/mapping.txt
unzip -l "$unsigned" > /tmp/apk-files.txt
grep -q 'assets/diagnostic-prelude.js' /tmp/apk-files.txt
grep -q 'assets/diagnostic-postlude.js' /tmp/apk-files.txt
! grep -q 'assets/noname.js' /tmp/apk-files.txt

printf '%s' "$GG_RELEASE_KEYSTORE_BASE64" | tr -d '\r\n ' | base64 -d > /tmp/gg-release.jks
test -s /tmp/gg-release.jks
keytool -list -keystore /tmp/gg-release.jks \
  -storepass "$GG_RELEASE_KEYSTORE_PASSWORD" \
  -alias gg-release >/tmp/keytool-summary.txt

sdk_root="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}"
apksigner="$(find "$sdk_root/build-tools" -type f -name apksigner -perm -u+x 2>/dev/null | sort -V | tail -n1)"
aapt="$(find "$sdk_root/build-tools" -type f -name aapt -perm -u+x 2>/dev/null | sort -V | tail -n1)"
test -x "$apksigner"
test -x "$aapt"

signed="dist/GG-v1.4.0-JS运行诊断覆盖版-code13-20260806.apk"
"$apksigner" sign \
  --ks /tmp/gg-release.jks \
  --ks-key-alias gg-release \
  --ks-pass env:GG_RELEASE_KEYSTORE_PASSWORD \
  --key-pass env:GG_RELEASE_KEYSTORE_PASSWORD \
  --v1-signing-enabled false \
  --v2-signing-enabled true \
  --v3-signing-enabled true \
  --v4-signing-enabled false \
  --out "$signed" \
  "$unsigned"

"$apksigner" verify --verbose --print-certs "$signed" > /tmp/apksigner-verify.txt
grep -Fq 'Verified using v2 scheme (APK Signature Scheme v2): true' /tmp/apksigner-verify.txt
grep -Fq 'Verified using v3 scheme (APK Signature Scheme v3): true' /tmp/apksigner-verify.txt
"$aapt" dump badging "$signed" > /tmp/apk-badging.txt
grep -Fq "package: name='com.jinli.quickweb' versionCode='13' versionName='1.4.0-diag.20260806.2'" /tmp/apk-badging.txt

sha256sum "$signed" > dist/SHA256SUMS.txt
sed -n 's/^.*certificate SHA-256 digest: /certificate-sha256=/p' /tmp/apksigner-verify.txt | head -n1 > dist/SIGNING-CERTIFICATE.txt
cat > dist/使用说明.txt <<'TXT'
1. 不要卸载手机中现有 GG。
2. 直接点击此 code13 覆盖版 APK 安装，原有应用数据与激活状态应保留。
3. 正常运行并完整复现失效功能。
4. 点击顶部“日志”→“导出并发送”。
5. 将生成的 GG-diagnostic-*.zip 发回用于排查。
6. 日志不保存原始网址、页面文字、Cookie、激活码、Token、请求正文或响应正文。
TXT
