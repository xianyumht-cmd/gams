#!/usr/bin/env bash
set -euo pipefail

: "${CANDIDATE_BRANCH:?}"
: "${EXPECTED_GAME_SHA256:?}"
: "${CANDIDATE_RUNTIME_VERSION:?}"
: "${CANDIDATE_WORKER_NAME:?}"
: "${CANDIDATE_WORKER_HOST:?}"
: "${APK_VERSION_NAME:?}"
: "${APK_VERSION_CODE:?}"
: "${WORKTREE:?}"
: "${OUTPUT_DIR:?}"
: "${CLOUDFLARE_API_TOKEN:?}"
: "${CLOUDFLARE_ACCOUNT_ID:?}"
: "${TOKEN_SIGNING_SECRET:?}"
: "${RUNTIME_MASTER_KEY:?}"
: "${GG_RELEASE_KEYSTORE_BASE64:?}"
: "${GG_RELEASE_KEYSTORE_PASSWORD:?}"
: "${CERT_SHA256:?}"

export APK_VERSION_NAME="2.0.12-page5-candidate"
export APK_VERSION_CODE="25"
if [[ -n "${GITHUB_ENV:-}" ]]; then
  printf 'APK_VERSION_NAME=%s\n' "$APK_VERSION_NAME" >> "$GITHUB_ENV"
  printf 'APK_VERSION_CODE=%s\n' "$APK_VERSION_CODE" >> "$GITHUB_ENV"
fi

test "${#TOKEN_SIGNING_SECRET}" -ge 32
jq -e \
  '.ok == true
   and .runtimeSha256 == env.EXPECTED_GAME_SHA256
   and .fivePage.pass == true
   and .repeatReentry.pass == true
   and .finalInteraction.pass == true
   and .finalInteraction.pageErrors == []
   and .finalInteraction.blockedOrderCount == 0' \
  docs/FINAL_PERSISTED_RUNTIME_BROWSER_VALIDATION_STATUS.json >/dev/null
jq -e \
  '.ok == true
   and .runtimeSha256 == env.EXPECTED_GAME_SHA256
   and .pageErrors == []
   and .blockedOrderCount == 0' \
  docs/PAGE5_PURCHASE_ACTION_PROBE_V3_STATUS.json >/dev/null

python3 -m pip install --quiet cryptography
node --input-type=module - <<'NODE'
import { decodeRuntimeMasterKey } from "./v2/runtime/src/runtime-key.js";
const key = decodeRuntimeMasterKey(process.env.RUNTIME_MASTER_KEY);
key.fill(0);
NODE

git fetch origin "$CANDIDATE_BRANCH:refs/remotes/origin/$CANDIDATE_BRANCH"
rm -rf "$WORKTREE"
git worktree add --detach "$WORKTREE" "origin/$CANDIDATE_BRANCH"
test "$(sha256sum "$WORKTREE/game-engine/release/game-1.0.5.js" | awk '{print $1}')" = "$EXPECTED_GAME_SHA256"
node --check "$WORKTREE/remote-script/src/noname.js"
node --check "$WORKTREE/game-engine/release/game-1.0.5.js"

cd "$WORKTREE"
rm -rf candidate-runtime/release
mkdir -p candidate-runtime/release "$OUTPUT_DIR"
trap 'rm -f /tmp/page5-runtime-private.pem /tmp/page5-runtime.sig /tmp/v2-runtime-canonical.txt /tmp/v2-runtime-unsigned.json /tmp/page5-device-release.jks' EXIT

export RUNTIME_SIGNING_PASSWORD="$(python3 - <<'PY'
import hashlib, hmac, os
print(hmac.new(
    os.environ['GG_RELEASE_KEYSTORE_PASSWORD'].encode(),
    b'gams-runtime-release-signing-v1',
    hashlib.sha256,
).hexdigest())
PY
)"
openssl enc -d -aes-256-cbc -pbkdf2 \
  -in remote-script/keys/private.pem.enc \
  -out /tmp/page5-runtime-private.pem \
  -pass env:RUNTIME_SIGNING_PASSWORD
unset RUNTIME_SIGNING_PASSWORD

game_file="$(jq -r '.file' game-engine/release/manifest.json)"
test "$game_file" = "game-1.0.5.js"
test -s "game-engine/release/$game_file"
test "$(sha256sum "game-engine/release/$game_file" | awk '{print $1}')" = "$EXPECTED_GAME_SHA256"

python3 v2/runtime/tools/build_release.py \
  remote-script/src/noname.js \
  "game-engine/release/$game_file" \
  "$CANDIDATE_RUNTIME_VERSION" \
  "$RUNTIME_MASTER_KEY" \
  candidate-runtime/release

openssl dgst -sha256 -sign /tmp/page5-runtime-private.pem \
  -out /tmp/page5-runtime.sig /tmp/v2-runtime-canonical.txt
openssl dgst -sha256 -verify remote-script/keys/public.pem \
  -signature /tmp/page5-runtime.sig /tmp/v2-runtime-canonical.txt

python3 - <<'PY'
import base64, hashlib, json, os
from pathlib import Path
manifest = json.loads(Path('/tmp/v2-runtime-unsigned.json').read_text(encoding='utf-8'))
manifest['signatureAlgorithm'] = 'SHA256withECDSA'
manifest['signature'] = base64.b64encode(Path('/tmp/page5-runtime.sig').read_bytes()).decode()
release = Path('candidate-runtime/release')
(release / 'manifest.json').write_text(
    json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
bundle = (release / manifest['file']).read_bytes()
assert manifest['versionName'] == os.environ['CANDIDATE_RUNTIME_VERSION']
assert len(bundle) == manifest['size']
assert hashlib.sha256(bundle).hexdigest() == manifest['sha256']
assert manifest['gameSha256'] == os.environ['EXPECTED_GAME_SHA256']
assert manifest['gameSize'] > 11_000_000
assert manifest['nonameSize'] > 300_000
PY
jq -e --arg v "$CANDIDATE_RUNTIME_VERSION" --arg g "$EXPECTED_GAME_SHA256" \
  '.versionName == $v and .gameSha256 == $g and .gameSize > 11000000 and .nonameSize > 300000' \
  candidate-runtime/release/manifest.json >/dev/null
cp candidate-runtime/release/manifest.json /tmp/page5-candidate-runtime-manifest.json

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git add candidate-runtime/release/manifest.json
bundle="candidate-runtime/release/$(jq -r '.file' candidate-runtime/release/manifest.json)"
git add -f "$bundle"
git commit -m "Refresh isolated page five device runtime candidate"
runtime_commit="$(git rev-parse HEAD)"
printf '%s\n' "$runtime_commit" > /tmp/page5-device-runtime-commit.txt
git push origin "HEAD:$CANDIDATE_BRANCH"

base="https://raw.githubusercontent.com/${GITHUB_REPOSITORY}/${CANDIDATE_BRANCH}/candidate-runtime/release"
propagated=false
for attempt in $(seq 1 48); do
  response="$(curl -fsS "${base}/manifest.json?attempt=${attempt}" 2>/dev/null || true)"
  version="$(printf '%s' "$response" | jq -r '.versionName // empty' 2>/dev/null || true)"
  game_sha="$(printf '%s' "$response" | jq -r '.gameSha256 // empty' 2>/dev/null || true)"
  if [[ "$version" == "$CANDIDATE_RUNTIME_VERSION" && "$game_sha" == "$EXPECTED_GAME_SHA256" ]]; then
    propagated=true
    break
  fi
  sleep 5
done
test "$propagated" = true

api="https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/d1/database"
response="$(curl -fsS -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" "$api?per_page=100")"
database_id="$(printf '%s' "$response" | jq -r '.result[] | select(.name=="gams-license-db") | (.uuid // .id)' | head -n1)"
test -n "$database_id" && test "$database_id" != null
export D1_DATABASE_ID="$database_id"

python3 - <<'PY'
import json, os
from pathlib import Path
source_path = Path('v2/runtime/src/index.js')
source = source_path.read_text(encoding='utf-8')
old_base = '  "https://raw.githubusercontent.com/xianyumht-cmd/gams/main/v2/runtime/release/";'
new_base = f'  "https://raw.githubusercontent.com/xianyumht-cmd/gams/{os.environ["CANDIDATE_BRANCH"]}/candidate-runtime/release/";'
if source.count(old_base) != 1:
    raise SystemExit(f'candidate release base mismatch: {source.count(old_base)}')
source_path.write_text(source.replace(old_base, new_base, 1), encoding='utf-8')

template = json.loads(Path('v2/runtime/wrangler.template.jsonc').read_text(encoding='utf-8'))
template['name'] = os.environ['CANDIDATE_WORKER_NAME']
template['workers_dev'] = True
template['preview_urls'] = False
template['routes'] = []
template['d1_databases'][0]['database_id'] = os.environ['D1_DATABASE_ID']
Path('v2/runtime/wrangler.page5-worker.jsonc').write_text(
    json.dumps(template, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
PY
node --check v2/runtime/src/index.js
jq -e --arg name "$CANDIDATE_WORKER_NAME" --arg db "$database_id" \
  '.name == $name and .workers_dev == true and (.routes | length) == 0 and .d1_databases[0].database_id == $db' \
  v2/runtime/wrangler.page5-worker.jsonc >/dev/null

cd v2/runtime
npx --yes wrangler@4 deploy --config wrangler.page5-worker.jsonc
printf '%s' "$TOKEN_SIGNING_SECRET" | npx --yes wrangler@4 secret put TOKEN_SIGNING_SECRET --config wrangler.page5-worker.jsonc
printf '%s' "$RUNTIME_MASTER_KEY" | npx --yes wrangler@4 secret put RUNTIME_MASTER_KEY --config wrangler.page5-worker.jsonc
npx --yes wrangler@4 deploy --config wrangler.page5-worker.jsonc
cd "$WORKTREE"

worker_ok=false
worker_code=000
for attempt in $(seq 1 48); do
  worker_code="$(curl -sS --connect-timeout 5 --max-time 15 -o /tmp/page5-worker-body -w '%{http_code}' \
    "https://${CANDIDATE_WORKER_HOST}/health?attempt=${attempt}" 2>/tmp/page5-worker-error || true)"
  if [[ "$worker_code" == 200 ]] && jq -e '.ok == true and .encryptedRuntime == true' /tmp/page5-worker-body >/dev/null 2>&1; then
    worker_ok=true
    break
  fi
  sleep 5
done
jq -n \
  --argjson primaryOk "$worker_ok" --arg primaryCode "$worker_code" \
  --arg primaryBody "$(tr '\r\n' '  ' </tmp/page5-worker-body 2>/dev/null | head -c 500 || true)" \
  --arg primaryError "$(tr '\r\n' '  ' </tmp/page5-worker-error 2>/dev/null | head -c 500 || true)" \
  --argjson fallbackOk "$worker_ok" --arg fallbackCode "$worker_code" \
  --arg fallbackBody "$(tr '\r\n' '  ' </tmp/page5-worker-body 2>/dev/null | head -c 500 || true)" \
  --arg fallbackError "$(tr '\r\n' '  ' </tmp/page5-worker-error 2>/dev/null | head -c 500 || true)" \
  '{primary:{ok:$primaryOk,httpCode:$primaryCode,body:$primaryBody,error:$primaryError},fallback:{ok:$fallbackOk,httpCode:$fallbackCode,body:$fallbackBody,error:$fallbackError}}' \
  > /tmp/page5-device-route-probe.json
test "$worker_ok" = true

python3 - <<'PY'
import os
from pathlib import Path
names_path = Path('v2/android/client/src/main/java/com/jinli/ggsecure/RuntimeNames.java')
names = names_path.read_text(encoding='utf-8')
old_custom = '        return "runtime." + "xn--8pv109c.top";'
old_worker = '        return "gams-runtime-v2." + "2320006072.workers.dev";'
new_host = f'        return "{os.environ["CANDIDATE_WORKER_HOST"]}";'
if names.count(old_custom) != 1 or names.count(old_worker) != 1:
    raise SystemExit('runtime host baseline mismatch')
names = names.replace(old_custom, new_host, 1).replace(old_worker, new_host, 1)
if names.count(os.environ['CANDIDATE_WORKER_HOST']) != 2:
    raise SystemExit('candidate worker host patch count mismatch')
names_path.write_text(names, encoding='utf-8')

gradle_path = Path('v2/android/client/build.gradle.kts')
gradle = gradle_path.read_text(encoding='utf-8')
if gradle.count('versionCode = 16') != 1 or gradle.count('versionName = "2.0.3-stable"') != 1:
    raise SystemExit('stable candidate version baseline mismatch')
gradle = gradle.replace('versionCode = 16', f'versionCode = {os.environ["APK_VERSION_CODE"]}', 1)
gradle = gradle.replace('versionName = "2.0.3-stable"', f'versionName = "{os.environ["APK_VERSION_NAME"]}"', 1)
gradle_path.write_text(gradle, encoding='utf-8')
PY
grep -Fq "$CANDIDATE_WORKER_HOST" v2/android/client/src/main/java/com/jinli/ggsecure/RuntimeNames.java
test "$(grep -Fo "$CANDIDATE_WORKER_HOST" v2/android/client/src/main/java/com/jinli/ggsecure/RuntimeNames.java | wc -l)" -eq 2
grep -Fq "versionCode = $APK_VERSION_CODE" v2/android/client/build.gradle.kts
grep -Fq "versionName = \"$APK_VERSION_NAME\"" v2/android/client/build.gradle.kts

gradle --no-daemon -p v2/android :client:clean :client:lintRelease :client:assembleRelease
unsigned="$(find v2/android/client/build/outputs/apk/release -maxdepth 1 -type f -name '*.apk' | head -n1)"
test -s "$unsigned"

printf '%s' "$GG_RELEASE_KEYSTORE_BASE64" | tr -d '\r\n ' | base64 -d > /tmp/page5-device-release.jks
test -s /tmp/page5-device-release.jks
keytool -list -v -keystore /tmp/page5-device-release.jks \
  -storepass "$GG_RELEASE_KEYSTORE_PASSWORD" -alias gg-release > /tmp/page5-device-keytool.txt
grep -Fq "SHA256: $CERT_SHA256" /tmp/page5-device-keytool.txt

sdk_root="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}"
apksigner="$(find "$sdk_root/build-tools" -type f -name apksigner -perm -u+x 2>/dev/null | sort -V | tail -n1)"
aapt="$(find "$sdk_root/build-tools" -type f -name aapt -perm -u+x 2>/dev/null | sort -V | tail -n1)"
test -x "$apksigner" && test -x "$aapt"
output="$OUTPUT_DIR/GG-${APK_VERSION_NAME}-code${APK_VERSION_CODE}.apk"
"$apksigner" sign --ks /tmp/page5-device-release.jks --ks-key-alias gg-release \
  --ks-pass env:GG_RELEASE_KEYSTORE_PASSWORD --key-pass env:GG_RELEASE_KEYSTORE_PASSWORD \
  --v1-signing-enabled false --v2-signing-enabled true --v3-signing-enabled true \
  --v4-signing-enabled false --out "$output" "$unsigned"
"$apksigner" verify --verbose --print-certs --min-sdk-version 24 "$output" > "$OUTPUT_DIR/apksigner.txt"
grep -Fq 'Verified using v2 scheme (APK Signature Scheme v2): true' "$OUTPUT_DIR/apksigner.txt"
grep -Fq 'Verified using v3 scheme (APK Signature Scheme v3): true' "$OUTPUT_DIR/apksigner.txt"
"$aapt" dump badging "$output" > "$OUTPUT_DIR/badging.txt"
grep -Fq "package: name='com.jinli.quickweb' versionCode='${APK_VERSION_CODE}' versionName='${APK_VERSION_NAME}'" "$OUTPUT_DIR/badging.txt"
sha256sum "$output" > "$OUTPUT_DIR/SHA256SUMS.txt"
cp /tmp/page5-candidate-runtime-manifest.json "$OUTPUT_DIR/runtime-manifest.json"
cp /tmp/page5-device-route-probe.json "$OUTPUT_DIR/route-probe.json"
cp /tmp/page5-device-keytool.txt "$OUTPUT_DIR/signing-certificate.txt"

echo "workers-dev isolated device candidate build complete"
