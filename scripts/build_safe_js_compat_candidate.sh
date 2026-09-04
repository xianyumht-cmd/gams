#!/usr/bin/env bash
set -euo pipefail

IMPLEMENTATION_BRANCH="fix/page5-missing-constructor-mobile-bridge-20260806"
RUNTIME_BRANCH="candidate-page5-bridge-20260806-c2"
WORKER_BRANCH="candidate-page5-worker-20260806-c2"
RUNTIME_DIR="candidate-runtime-page5-bridge-c2/release"
RUNTIME_VERSION="2.0.10-page5-bridge-c2"
APP_VERSION="25"
APK_VERSION_NAME="2.0.14-page5-bridge"
APK_VERSION_CODE="25"
FIRST_FILE="remote-script/src/noname.js"
SECOND_FILE="game-engine/release/game-1.0.5.js"
SECOND_SIZE="11590659"
SECOND_SHA256="57765fbb8d9a0529ed1463623f1bed9c05052e76396a6aaa89fdd2ecc673bc72"
RUNTIME_WORKER_HOST="gams-runtime-v2.2320006072.workers.dev"
RUNTIME_CUSTOM_HOST="runtime.xn--8pv109c.top"
CERT_SHA256="70:60:83:47:EE:8C:C3:CD:72:E7:DC:70:C5:04:01:3E:26:1C:9A:2F:EE:98:50:53:92:19:CD:A5:19:C8:7F:34"
ARTIFACT_DIR="/tmp/safe-compat-artifact"

for name in CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID TOKEN_SIGNING_SECRET RUNTIME_MASTER_KEY GG_RELEASE_KEYSTORE_BASE64 GG_RELEASE_KEYSTORE_PASSWORD; do
  test -n "${!name:-}" || { echo "$name is missing"; exit 1; }
done
test "${#TOKEN_SIGNING_SECRET}" -ge 32

node --check "$FIRST_FILE"
node --check "$SECOND_FILE"
test "$(stat -c%s "$SECOND_FILE")" = "$SECOND_SIZE"
test "$(sha256sum "$SECOND_FILE" | awk '{print $1}')" = "$SECOND_SHA256"
FIRST_SHA256="$(sha256sum "$FIRST_FILE" | awk '{print $1}')"

python3 -m pip install --quiet cryptography

git fetch origin "$IMPLEMENTATION_BRANCH" --quiet
git fetch origin "$RUNTIME_BRANCH" --quiet || true
git fetch origin "$WORKER_BRANCH" --quiet || true

rm -rf /tmp/gams-safe-runtime /tmp/gams-safe-worker "$ARTIFACT_DIR"

if git show-ref --verify --quiet "refs/remotes/origin/${RUNTIME_BRANCH}"; then
  git worktree add /tmp/gams-safe-runtime "origin/${RUNTIME_BRANCH}"
  cd /tmp/gams-safe-runtime
  git checkout -B "$RUNTIME_BRANCH" "origin/${RUNTIME_BRANCH}"
  git reset --hard "origin/${IMPLEMENTATION_BRANCH}"
else
  git worktree add -b "$RUNTIME_BRANCH" /tmp/gams-safe-runtime "origin/${IMPLEMENTATION_BRANCH}"
  cd /tmp/gams-safe-runtime
fi

git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'

export RUNTIME_SIGNING_PASSWORD="$(python3 - <<'PY'
import hashlib, hmac, os
print(hmac.new(
    os.environ['GG_RELEASE_KEYSTORE_PASSWORD'].encode(),
    b'gams-runtime-release-signing-v1',
    hashlib.sha256,
).hexdigest())
PY
)"
trap 'rm -f /tmp/safe-runtime-private.pem /tmp/safe-runtime.sig /tmp/v2-runtime-canonical.txt /tmp/v2-runtime-unsigned.json /tmp/gg-release.jks' EXIT
openssl enc -d -aes-256-cbc -pbkdf2 \
  -in remote-script/keys/private.pem.enc \
  -out /tmp/safe-runtime-private.pem \
  -pass env:RUNTIME_SIGNING_PASSWORD
unset RUNTIME_SIGNING_PASSWORD

rm -rf "$RUNTIME_DIR"
mkdir -p "$RUNTIME_DIR"
python3 v2/runtime/tools/build_release.py \
  "$FIRST_FILE" \
  "$SECOND_FILE" \
  "$RUNTIME_VERSION" \
  "$RUNTIME_MASTER_KEY" \
  "$RUNTIME_DIR"
openssl dgst -sha256 -sign /tmp/safe-runtime-private.pem \
  -out /tmp/safe-runtime.sig /tmp/v2-runtime-canonical.txt
openssl dgst -sha256 -verify remote-script/keys/public.pem \
  -signature /tmp/safe-runtime.sig /tmp/v2-runtime-canonical.txt

python3 - <<'PY'
import base64, hashlib, io, json, os, re, zipfile
from pathlib import Path
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

release = Path(os.environ['RUNTIME_DIR'])
manifest = json.loads(Path('/tmp/v2-runtime-unsigned.json').read_text(encoding='utf-8'))
manifest['signatureAlgorithm'] = 'SHA256withECDSA'
manifest['signature'] = base64.b64encode(Path('/tmp/safe-runtime.sig').read_bytes()).decode('ascii')
(release / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

bundle = (release / manifest['file']).read_bytes()
assert len(bundle) == manifest['size']
assert hashlib.sha256(bundle).hexdigest() == manifest['sha256']
assert manifest['gameSize'] == int(os.environ['SECOND_SIZE'])
assert manifest['gameSha256'] == os.environ['SECOND_SHA256']

text = os.environ['RUNTIME_MASTER_KEY'].strip()
if re.fullmatch(r'[0-9a-fA-F]{64}', text):
    master = bytes.fromhex(text)
else:
    normalized = text.replace('-', '+').replace('_', '/')
    normalized += '=' * ((4 - len(normalized) % 4) % 4)
    master = base64.b64decode(normalized)
content_key = AESGCM(master).decrypt(
    base64.b64decode(manifest['keyIv']),
    base64.b64decode(manifest['keyCipher']),
    f"gg-v2-key|{manifest['versionName']}".encode(),
)
plain = AESGCM(content_key).decrypt(
    base64.b64decode(manifest['iv']),
    bundle,
    f"gg-v2-runtime|{manifest['versionName']}".encode(),
)
with zipfile.ZipFile(io.BytesIO(plain)) as archive:
    assert archive.namelist() == ['noname.js', 'game.js']
    assert archive.testzip() is None
    first = archive.read('noname.js')
    second = archive.read('game.js')
expected_first = Path(os.environ['FIRST_FILE']).read_bytes()
for old in (
    b'https://gams-script-edge.2320006072.workers.dev/engine/stable.js',
    b'https://preview-chat-1b176371-f9ab-4760-b15c-b9d70ed59d23.space-z.ai/game.js',
):
    expected_first = expected_first.replace(old, b'https://ggv2.local/runtime/game.js')
assert first == expected_first
assert second == Path(os.environ['SECOND_FILE']).read_bytes()
PY

git add "$RUNTIME_DIR"
git add -f "$RUNTIME_DIR/bundle-${RUNTIME_VERSION}.bin"
git commit -m 'Build isolated safe compatibility runtime c2'
git push --force-with-lease origin "HEAD:${RUNTIME_BRANCH}"
RUNTIME_COMMIT="$(git rev-parse HEAD)"

RAW_BASE="https://raw.githubusercontent.com/${GITHUB_REPOSITORY}/${RUNTIME_BRANCH}/${RUNTIME_DIR}"
PUBLISHED_VERSION=''
for attempt in $(seq 1 30); do
  PUBLISHED_VERSION="$(curl -fsS "${RAW_BASE}/manifest.json?attempt=${attempt}" | jq -r '.versionName' 2>/dev/null || true)"
  if [[ "$PUBLISHED_VERSION" == "$RUNTIME_VERSION" ]]; then break; fi
  sleep 3
done
test "$PUBLISHED_VERSION" = "$RUNTIME_VERSION"

cd "$GITHUB_WORKSPACE"
if git show-ref --verify --quiet "refs/remotes/origin/${WORKER_BRANCH}"; then
  git worktree add /tmp/gams-safe-worker "origin/${WORKER_BRANCH}"
  cd /tmp/gams-safe-worker
  git checkout -B "$WORKER_BRANCH" "origin/${WORKER_BRANCH}"
  git reset --hard "origin/${IMPLEMENTATION_BRANCH}"
else
  git worktree add -b "$WORKER_BRANCH" /tmp/gams-safe-worker "origin/${IMPLEMENTATION_BRANCH}"
  cd /tmp/gams-safe-worker
fi

git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
python3 - <<'PY'
from pathlib import Path

path = Path('v2/runtime/src/index.js')
text = path.read_text(encoding='utf-8')
replacements = {
    'const PAGE5_BRIDGE_APP_VERSION = 24;': 'const PAGE5_BRIDGE_APP_VERSION = 25;',
    'const PAGE5_BRIDGE_RUNTIME_VERSION = "2.0.9-page5-bridge-c1";': 'const PAGE5_BRIDGE_RUNTIME_VERSION = "2.0.10-page5-bridge-c2";',
    'https://raw.githubusercontent.com/xianyumht-cmd/gams/candidate-page5-bridge-20260806/candidate-runtime-page5-bridge/release/': 'https://raw.githubusercontent.com/xianyumht-cmd/gams/candidate-page5-bridge-20260806-c2/candidate-runtime-page5-bridge-c2/release/',
    'if (candidateQuery === "24") {': 'if (candidateQuery === "25") {',
}
for old, new in replacements.items():
    if text.count(old) != 1:
        raise SystemExit(f'worker replacement mismatch: {old!r} -> {text.count(old)}')
    text = text.replace(old, new, 1)
path.write_text(text, encoding='utf-8')
PY
node --check v2/runtime/src/index.js

git add v2/runtime/src/index.js
git commit -m 'Add isolated safe compatibility runtime channel c2'
git push --force-with-lease origin "HEAD:${WORKER_BRANCH}"
WORKER_COMMIT="$(git rev-parse HEAD)"

api="https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/d1/database"
response="$(curl -fsS -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" "$api?per_page=100")"
database_id="$(printf '%s' "$response" | jq -r '.result[] | select(.name=="gams-license-db") | (.uuid // .id)' | head -n1)"
test -n "$database_id" && test "$database_id" != null
sed "s/__D1_DATABASE_ID__/${database_id}/g" v2/runtime/wrangler.template.jsonc > v2/runtime/wrangler.safe-compat.generated.jsonc
(
  cd v2/runtime
  printf '%s' "$TOKEN_SIGNING_SECRET" | npx --yes wrangler@4 secret put TOKEN_SIGNING_SECRET --config wrangler.safe-compat.generated.jsonc
  printf '%s' "$RUNTIME_MASTER_KEY" | npx --yes wrangler@4 secret put RUNTIME_MASTER_KEY --config wrangler.safe-compat.generated.jsonc
  npx --yes wrangler@4 deploy --config wrangler.safe-compat.generated.jsonc
)

candidate_ok=false
default_ok=false
for attempt in $(seq 1 24); do
  candidate_body="$(curl -fsS --connect-timeout 5 --max-time 15 "https://${RUNTIME_WORKER_HOST}/health?candidate=25&attempt=${attempt}" 2>/dev/null || true)"
  default_body="$(curl -fsS --connect-timeout 5 --max-time 15 "https://${RUNTIME_WORKER_HOST}/health?attempt=${attempt}" 2>/dev/null || true)"
  if printf '%s' "$candidate_body" | jq -e '.ok == true and .page5BridgeAppVersion == 25 and .page5BridgeRuntimeVersion == "2.0.10-page5-bridge-c2"' >/dev/null 2>&1; then candidate_ok=true; fi
  if printf '%s' "$default_body" | jq -e '.ok == true and .encryptedRuntime == true' >/dev/null 2>&1; then default_ok=true; fi
  if [[ "$candidate_ok" == true && "$default_ok" == true ]]; then break; fi
  sleep 5
done
[[ "$candidate_ok" == true && "$default_ok" == true ]]
CUSTOM_CODE="$(curl -sS --connect-timeout 5 --max-time 15 -o /tmp/safe-compat-custom.json -w '%{http_code}' "https://${RUNTIME_CUSTOM_HOST}/health?candidate=25" || true)"

python3 - <<'PY'
from pathlib import Path

manager = Path('v2/android/client/src/main/java/com/jinli/ggsecure/V2LicenseManager.java')
text = manager.read_text(encoding='utf-8')
if text.count('PROTOCOL_APP_VERSION = 12') != 1:
    raise SystemExit('protocol baseline mismatch')
manager.write_text(text.replace('PROTOCOL_APP_VERSION = 12', 'PROTOCOL_APP_VERSION = 25', 1), encoding='utf-8')

gradle = Path('v2/android/client/build.gradle.kts')
text = gradle.read_text(encoding='utf-8')
if text.count('versionCode = 16') != 1 or text.count('versionName = "2.0.3-stable"') != 1:
    raise SystemExit('APK baseline mismatch')
text = text.replace('versionCode = 16', 'versionCode = 25', 1)
text = text.replace('versionName = "2.0.3-stable"', 'versionName = "2.0.14-page5-bridge"', 1)
gradle.write_text(text, encoding='utf-8')
PY

gradle --no-daemon -p v2/android :client:clean :client:lintRelease :client:assembleRelease
UNSIGNED="$(find v2/android/client/build/outputs/apk/release -maxdepth 1 -type f -name '*.apk' | head -n1)"
test -s "$UNSIGNED"

printf '%s' "$GG_RELEASE_KEYSTORE_BASE64" | tr -d '\r\n ' | base64 -d > /tmp/gg-release.jks
test -s /tmp/gg-release.jks
keytool -list -v -keystore /tmp/gg-release.jks -storepass "$GG_RELEASE_KEYSTORE_PASSWORD" -alias gg-release > /tmp/safe-compat-keytool.txt
grep -Fq "SHA256: $CERT_SHA256" /tmp/safe-compat-keytool.txt

sdk_root="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}"
apksigner="$(find "$sdk_root/build-tools" -type f -name apksigner -perm -u+x 2>/dev/null | sort -V | tail -n1)"
aapt="$(find "$sdk_root/build-tools" -type f -name aapt -perm -u+x 2>/dev/null | sort -V | tail -n1)"
test -x "$apksigner" && test -x "$aapt"

mkdir -p "$ARTIFACT_DIR"
SIGNED="$ARTIFACT_DIR/GG-${APK_VERSION_NAME}-code${APK_VERSION_CODE}.apk"
"$apksigner" sign \
  --ks /tmp/gg-release.jks --ks-key-alias gg-release \
  --ks-pass env:GG_RELEASE_KEYSTORE_PASSWORD --key-pass env:GG_RELEASE_KEYSTORE_PASSWORD \
  --v1-signing-enabled false --v2-signing-enabled true --v3-signing-enabled true \
  --v4-signing-enabled false --out "$SIGNED" "$UNSIGNED"
"$apksigner" verify --verbose --print-certs "$SIGNED" > /tmp/safe-compat-apk-verify.txt
grep -Fq 'Verified using v2 scheme (APK Signature Scheme v2): true' /tmp/safe-compat-apk-verify.txt
grep -Fq 'Verified using v3 scheme (APK Signature Scheme v3): true' /tmp/safe-compat-apk-verify.txt
"$aapt" dump badging "$SIGNED" > /tmp/safe-compat-apk-badging.txt
grep -Fq "package: name='com.jinli.quickweb' versionCode='25' versionName='2.0.14-page5-bridge'" /tmp/safe-compat-apk-badging.txt
APK_SHA256="$(sha256sum "$SIGNED" | awk '{print $1}')"
printf '%s  %s\n' "$APK_SHA256" "$(basename "$SIGNED")" > "$ARTIFACT_DIR/SHA256SUMS.txt"

jq -n \
  --arg versionName "$APK_VERSION_NAME" \
  --argjson versionCode "$APK_VERSION_CODE" \
  --arg runtimeVersion "$RUNTIME_VERSION" \
  --arg runtimeBranch "$RUNTIME_BRANCH" \
  --arg runtimeCommit "$RUNTIME_COMMIT" \
  --arg workerBranch "$WORKER_BRANCH" \
  --arg workerCommit "$WORKER_COMMIT" \
  --arg firstSha256 "$FIRST_SHA256" \
  --arg secondSha256 "$SECOND_SHA256" \
  --arg apkSha256 "$APK_SHA256" \
  --arg customDomainHttpCode "$CUSTOM_CODE" \
  '{schemaVersion:1,kind:"isolated-safe-js-compat-candidate",apk:{versionName:$versionName,versionCode:$versionCode,sha256:$apkSha256},runtime:{version:$runtimeVersion,branch:$runtimeBranch,commit:$runtimeCommit},worker:{branch:$workerBranch,commit:$workerCommit,customDomainHttpCode:$customDomainHttpCode},files:{firstSha256:$firstSha256,secondSha256:$secondSha256},isolation:{productionDefaultChannelChanged:false,mainBranchChanged:false},verified:true}' \
  > "$ARTIFACT_DIR/CANDIDATE_INFO.json"

cat "$ARTIFACT_DIR/CANDIDATE_INFO.json"
