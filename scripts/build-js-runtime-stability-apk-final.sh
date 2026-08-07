#!/usr/bin/env bash
set -euo pipefail

SOURCE_DIR="${GITHUB_WORKSPACE}/source"
ARTIFACT_DIR="${GITHUB_WORKSPACE}/artifact"
VERSION_NAME="2.0.22-mobile-sheet-action-fix"
VERSION_CODE="102"
EXPECTED_CERT_SHA256="70:60:83:47:EE:8C:C3:CD:72:E7:DC:70:C5:04:01:3E:26:1C:9A:2F:EE:98:50:53:92:19:CD:A5:19:C8:7F:34"

: "${GG_RELEASE_KEYSTORE_BASE64:?Missing GG_RELEASE_KEYSTORE_BASE64}"
: "${GG_RELEASE_KEYSTORE_PASSWORD:?Missing GG_RELEASE_KEYSTORE_PASSWORD}"

test -d "$SOURCE_DIR"
rm -rf "$ARTIFACT_DIR" /tmp/runtime-stability-java /tmp/runtime-stability-output
mkdir -p "$ARTIFACT_DIR" /tmp/runtime-stability-java/com/jinli/ggsecure /tmp/runtime-stability-output

PATCHER="$SOURCE_DIR/v2/android/client/src/main/java/com/jinli/ggsecure/RuntimeStabilityPatch.java"
EXPERIENCE="$SOURCE_DIR/v2/android/client/src/main/java/com/jinli/ggsecure/RuntimeExperiencePatch.java"
PAYLOAD="$SOURCE_DIR/v2/android/client/src/main/java/com/jinli/ggsecure/RuntimePayload.java"
MANAGER="$SOURCE_DIR/v2/android/client/src/main/java/com/jinli/ggsecure/V2LicenseManager.java"
CLIENT_GRADLE="$SOURCE_DIR/v2/android/client/build.gradle.kts"

test -s "$PATCHER"
test -s "$EXPERIENCE"
test -s "$PAYLOAD"
test -s "$MANAGER"
test -s "$CLIENT_GRADLE"

python3 - "$PATCHER" "$MANAGER" "$CLIENT_GRADLE" <<'PY'
from pathlib import Path
import re
import sys

patcher = Path(sys.argv[1])
manager = Path(sys.argv[2])
gradle = Path(sys.argv[3])

text = patcher.read_text(encoding="utf-8")
if "candidateOpen < text.length()" not in text:
    start_token = "    private static String replaceMethodBody(String text, String marker, String newBody) {"
    end_token = "    private static String patchEngineWrapper(String text) {"
    start = text.find(start_token)
    end = text.find(end_token, start + len(start_token))
    if start < 0 or end < 0 or end <= start:
        raise SystemExit(f"method boundary mismatch: start={start}, end={end}")
    replacement = r'''    private static String replaceMethodBody(String text, String marker, String newBody) {
        int start = -1;
        int openIndex = -1;
        int cursor = 0;
        while (true) {
            int candidate = text.indexOf(marker, cursor);
            if (candidate < 0) break;
            int candidateOpen = skipSpace(text, candidate + marker.length());
            if (candidateOpen < text.length() && text.charAt(candidateOpen) == '{') {
                if (start >= 0) throw new SecurityException("方法定义不唯一: " + marker);
                start = candidate;
                openIndex = candidateOpen;
            }
            cursor = candidate + marker.length();
        }
        if (start < 0) throw new SecurityException("缺少方法定义: " + marker);
        int closeIndex = findMatchingBrace(text, openIndex);
        String body = "{\n" + newBody.strip() + "\n    }";
        return text.substring(0, openIndex) + body + text.substring(closeIndex + 1);
    }

'''
    text = text[:start] + replacement + text[end:]
    patcher.write_text(text, encoding="utf-8", newline="")

text = manager.read_text(encoding="utf-8")
if "PROTOCOL_APP_VERSION = 24" not in text:
    if text.count("PROTOCOL_APP_VERSION = 12") != 1:
        raise SystemExit("protocol version baseline mismatch")
    manager.write_text(
        text.replace("PROTOCOL_APP_VERSION = 12", "PROTOCOL_APP_VERSION = 24", 1),
        encoding="utf-8",
        newline="",
    )

text = gradle.read_text(encoding="utf-8")
text, code_count = re.subn(r"versionCode\s*=\s*\d+", "versionCode = 102", text, count=1)
text, name_count = re.subn(
    r'versionName\s*=\s*"[^"]+"',
    'versionName = "2.0.22-mobile-sheet-action-fix"',
    text,
    count=1,
)
if code_count != 1 or name_count != 1:
    raise SystemExit(f"APK identifier replacement mismatch: code={code_count}, name={name_count}")
gradle.write_text(text, encoding="utf-8", newline="")
PY

grep -Fq 'candidateOpen < text.length()' "$PATCHER"
grep -Fq 'RuntimeStabilityPatch.patchNoname(noname)' "$PAYLOAD"
grep -Fq 'RuntimeExperiencePatch.patchNoname(stabilityNoname)' "$PAYLOAD"
grep -Fq 'RuntimeStabilityPatch.patchGame(game)' "$PAYLOAD"
grep -Fq 'Symbol.for("gg.runtime.storage-hook.v2")' "$PATCHER"
grep -Fq 'Symbol.for("gg.runtime.xhr-open.v2")' "$PATCHER"
grep -Fq 'Symbol.for("gg.runtime.jsonp-create-element.v2")' "$PATCHER"
grep -Fq '__gg_engine_load_started_at__' "$PATCHER"

grep -Fq 'gg.runtime.experience.v4' "$EXPERIENCE"
grep -Fq 'gg-runtime-mobile-sheet-v4' "$EXPERIENCE"
grep -Fq 'gg-v4-sheet' "$EXPERIENCE"
grep -Fq 'gg-v4-fab-core' "$EXPERIENCE"
grep -Fq 'buildSynchronousJsonpSource' "$EXPERIENCE"
grep -Fq 'data:text/javascript;charset=utf-8' "$EXPERIENCE"
grep -Fq 'gg.runtime.xhr-transport.v4' "$EXPERIENCE"
! grep -Fq 'dispatchEvent(new Event("load"))' "$EXPERIENCE"

grep -Fq 'PROTOCOL_APP_VERSION = 24' "$MANAGER"
grep -Fq 'versionCode = 102' "$CLIENT_GRADLE"
grep -Fq 'versionName = "2.0.22-mobile-sheet-action-fix"' "$CLIENT_GRADLE"

node --check "$SOURCE_DIR/remote-script/src/noname.js"
node --check "$SOURCE_DIR/game-engine/release/game-1.0.5.js"

cp "$PATCHER" /tmp/runtime-stability-java/com/jinli/ggsecure/RuntimeStabilityPatch.java
cp "$EXPERIENCE" /tmp/runtime-stability-java/com/jinli/ggsecure/RuntimeExperiencePatch.java
cat > /tmp/runtime-stability-java/com/jinli/ggsecure/RuntimeStabilityPatchTest.java <<'JAVA'
package com.jinli.ggsecure;
import java.nio.file.Files;
import java.nio.file.Path;
final class RuntimeStabilityPatchTest {
    public static void main(String[] args) throws Exception {
        byte[] noname = Files.readAllBytes(Path.of(args[0]));
        byte[] game = Files.readAllBytes(Path.of(args[1]));
        byte[] stabilityNoname = RuntimeStabilityPatch.patchNoname(noname);
        byte[] stableNoname = RuntimeExperiencePatch.patchNoname(stabilityNoname);
        byte[] stableGame = RuntimeStabilityPatch.patchGame(game);
        Files.write(Path.of(args[2]), stableNoname);
        Files.write(Path.of(args[3]), stableGame);
        if (stableNoname.length == 0 || stableGame.length == 0) {
            throw new IllegalStateException("empty output");
        }
    }
}
JAVA

javac -encoding UTF-8 -d /tmp/runtime-stability-java \
  /tmp/runtime-stability-java/com/jinli/ggsecure/RuntimeStabilityPatch.java \
  /tmp/runtime-stability-java/com/jinli/ggsecure/RuntimeExperiencePatch.java \
  /tmp/runtime-stability-java/com/jinli/ggsecure/RuntimeStabilityPatchTest.java

java -cp /tmp/runtime-stability-java com.jinli.ggsecure.RuntimeStabilityPatchTest \
  "$SOURCE_DIR/remote-script/src/noname.js" \
  "$SOURCE_DIR/game-engine/release/game-1.0.5.js" \
  /tmp/runtime-stability-output/noname.js \
  /tmp/runtime-stability-output/game.js

node --check /tmp/runtime-stability-output/noname.js
node --check /tmp/runtime-stability-output/game.js
grep -Fq 'Symbol.for("gg.runtime.storage-hook.v2")' /tmp/runtime-stability-output/noname.js
grep -Fq 'Symbol.for("gg.runtime.experience.v4")' /tmp/runtime-stability-output/noname.js
grep -Fq 'gg-runtime-mobile-sheet-v4' /tmp/runtime-stability-output/noname.js
grep -Fq 'buildSynchronousJsonpSource' /tmp/runtime-stability-output/noname.js
grep -Fq 'gg.runtime.xhr-transport.v4' /tmp/runtime-stability-output/noname.js
! grep -Fq 'dispatchEvent(new Event("load"))' /tmp/runtime-stability-output/noname.js
grep -Fq '__gg_engine_load_started_at__' /tmp/runtime-stability-output/game.js
! grep -Fq 'Object["defineProperty"](Object["prototype"]' /tmp/runtime-stability-output/noname.js
! grep -Fq '__gg_engine_alert_filter_installed__' /tmp/runtime-stability-output/game.js

gradle --no-daemon -p "$SOURCE_DIR/v2/android" \
  :client:clean :client:lintRelease :client:assembleRelease

UNSIGNED_APK="$(find "$SOURCE_DIR/v2/android/client/build/outputs/apk/release" -maxdepth 1 -type f -name '*.apk' | head -n1)"
test -s "$UNSIGNED_APK"

KEYSTORE=/tmp/gg-release.jks
trap 'rm -f "$KEYSTORE"' EXIT
printf '%s' "$GG_RELEASE_KEYSTORE_BASE64" | tr -d '\r\n ' | base64 -d > "$KEYSTORE"
test -s "$KEYSTORE"

keytool -list -v \
  -keystore "$KEYSTORE" \
  -storepass "$GG_RELEASE_KEYSTORE_PASSWORD" \
  -alias gg-release > /tmp/keytool-stability.txt
grep -Fq "SHA256: $EXPECTED_CERT_SHA256" /tmp/keytool-stability.txt

SDK_ROOT="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}"
test -d "$SDK_ROOT/build-tools"
APKSIGNER="$(find "$SDK_ROOT/build-tools" -type f -name apksigner -perm -u+x 2>/dev/null | sort -V | tail -n1)"
AAPT="$(find "$SDK_ROOT/build-tools" -type f -name aapt -perm -u+x 2>/dev/null | sort -V | tail -n1)"
test -x "$APKSIGNER"
test -x "$AAPT"

SIGNED_APK="$ARTIFACT_DIR/GG-${VERSION_NAME}-code${VERSION_CODE}.apk"
"$APKSIGNER" sign \
  --ks "$KEYSTORE" \
  --ks-key-alias gg-release \
  --ks-pass env:GG_RELEASE_KEYSTORE_PASSWORD \
  --key-pass env:GG_RELEASE_KEYSTORE_PASSWORD \
  --v1-signing-enabled false \
  --v2-signing-enabled true \
  --v3-signing-enabled true \
  --v4-signing-enabled false \
  --out "$SIGNED_APK" \
  "$UNSIGNED_APK"

"$APKSIGNER" verify --verbose --print-certs "$SIGNED_APK" > "$ARTIFACT_DIR/APK_VERIFY.txt"
grep -Fq 'Verified using v2 scheme (APK Signature Scheme v2): true' "$ARTIFACT_DIR/APK_VERIFY.txt"
grep -Fq 'Verified using v3 scheme (APK Signature Scheme v3): true' "$ARTIFACT_DIR/APK_VERIFY.txt"

"$AAPT" dump badging "$SIGNED_APK" > "$ARTIFACT_DIR/APK_BADGING.txt"
grep -Fq "package: name='com.jinli.quickweb' versionCode='102' versionName='2.0.22-mobile-sheet-action-fix'" "$ARTIFACT_DIR/APK_BADGING.txt"
sha256sum "$SIGNED_APK" | tee "$ARTIFACT_DIR/SHA256SUMS.txt"

cat > "$ARTIFACT_DIR/BUILD_INFO.txt" <<EOF
versionName=$VERSION_NAME
versionCode=$VERSION_CODE
package=com.jinli.quickweb
sourceBranch=fix/page5-missing-constructor-mobile-bridge-20260806
workflow=gg-2.0.22-mobile-sheet-action-fix
panelStructure=mobile-bottom-sheet-v4
floatingControl=mobile-squircle-v4
repeatActionTransport=synchronous-jsonp-and-virtual-xhr-v4
EOF
