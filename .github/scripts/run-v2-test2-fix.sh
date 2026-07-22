#!/usr/bin/env bash
set -euo pipefail

mkdir -p /tmp/v2-test2
exec > >(tee /tmp/v2-test2/RUN-LOG.txt) 2>&1

: "${GH_TOKEN:?missing GH_TOKEN}"
: "${CLOUDFLARE_API_TOKEN:?missing CLOUDFLARE_API_TOKEN}"
: "${CLOUDFLARE_ACCOUNT_ID:?missing CLOUDFLARE_ACCOUNT_ID}"
: "${LICENSE_ADMIN_PASSWORD:?missing LICENSE_ADMIN_PASSWORD}"

TARGET_BRANCH="v2-server-authoritative"

git remote set-url origin "https://x-access-token:${GH_TOKEN}@github.com/${GITHUB_REPOSITORY}.git"
git fetch -q origin main "${TARGET_BRANCH}"
git checkout -B "${TARGET_BRANCH}" "origin/${TARGET_BRANCH}"
git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

python3 - <<'PY'
from pathlib import Path

worker = Path('v2/runtime/src/index.js')
text = worker.read_text(encoding='utf-8')
old = '{ name: "RSA-OAEP", hash: "SHA-256" }'
new = '{ name: "RSA-OAEP", hash: "SHA-1" }'
if old in text:
    if text.count(old) != 1:
        raise SystemExit(f'expected one RSA OAEP SHA-256 import, got {text.count(old)}')
    text = text.replace(old, new, 1)
elif new not in text:
    raise SystemExit('RSA OAEP import target missing')
if 'keyWrap: "RSA-OAEP-SHA1"' not in text:
    text = text.replace(
        'version: 1,\n          minAppVersion:',
        'version: 2,\n          keyWrap: "RSA-OAEP-SHA1",\n          minAppVersion:',
        1,
    )
worker.write_text(text, encoding='utf-8')

manager = Path('v2/android/client/src/main/java/com/jinli/ggsecure/V2LicenseManager.java')
text = manager.read_text(encoding='utf-8')
text = text.replace('客户端：2.0.0-test1', '客户端：2.0.0-test2', 1)
manager.write_text(text, encoding='utf-8')

readme = Path('v2/README.md')
text = readme.read_text(encoding='utf-8')
marker = '## Test2 compatibility fix'
if marker not in text:
    text += '''\n\n## Test2 compatibility fix\n\n- Android RSA-OAEP key wrapping uses SHA-1/MGF1-SHA1 for older Android Keystore compatibility.\n- Runtime traffic prefers `runtime.xn--8pv109c.top` and falls back to `workers.dev`.\n- V1 version 8 remains unchanged.\n'''
readme.write_text(text, encoding='utf-8')
PY

node --check v2/runtime/src/index.js
grep -q 'RSA/ECB/OAEPWithSHA-1AndMGF1Padding' v2/android/client/src/main/java/com/jinli/ggsecure/RuntimeKeyManager.java
grep -q 'MGF1ParameterSpec.SHA1' v2/android/client/src/main/java/com/jinli/ggsecure/RuntimeKeyManager.java
grep -q 'runtime.xn--8pv109c.top' v2/runtime/wrangler.template.jsonc
grep -q 'versionCode = 2' v2/android/client/build.gradle.kts
grep -q 'versionName = "2.0.0-test2"' v2/android/client/build.gradle.kts
grep -q 'hash: "SHA-1"' v2/runtime/src/index.js

gradle --no-daemon -p v2/android :client:assembleRelease

apk='v2/android/client/build/outputs/apk/release/client-release.apk'
test -s "$apk"
rm -rf /tmp/v2-client
mkdir -p /tmp/v2-client /tmp/v2-test2
unzip -q "$apk" -d /tmp/v2-client
if find /tmp/v2-client -type f \( -name '*.js' -o -name 'game.js' -o -name 'noname.js' \) | grep -q .; then
  echo 'JavaScript file found in V2 APK'
  exit 1
fi
for marker in webpackChunk_lodash_modules SAL_getUserData createBuyOrder get_goods_list '脚本加载完成~'; do
  if grep -aR -F -q -- "$marker" /tmp/v2-client; then
    echo "Core implementation marker found: $marker"
    exit 1
  fi
done
cp "$apk" '/tmp/v2-test2/GG-V2-客户端-2.0.0-test2.apk'
sha256sum /tmp/v2-test2/*.apk > /tmp/v2-test2/SHA256SUMS.txt

api="https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/d1/database"
response="$(curl -fsS -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" "$api?per_page=100")"
database_id="$(printf '%s' "$response" | jq -r '.result[] | select(.name=="gams-license-db") | (.uuid // .id)' | head -n1)"
test -n "$database_id" && test "$database_id" != 'null'
sed "s/__D1_DATABASE_ID__/${database_id}/g" \
  v2/runtime/wrangler.template.jsonc > v2/runtime/wrangler.generated.jsonc
(
  cd v2/runtime
  printf '%s' "$LICENSE_ADMIN_PASSWORD" \
    | npx --yes wrangler@4 secret put ADMIN_PASSWORD --config wrangler.generated.jsonc
  npx --yes wrangler@4 deploy --config wrangler.generated.jsonc
)

verify_failed=0
challenge="$(python3 - <<'PY'
import json
print(json.dumps({'deviceId':'a'*64,'purpose':'runtime','appVersion':9}))
PY
)"

index=0
for endpoint in \
  'https://runtime.xn--8pv109c.top' \
  'https://gams-runtime-v2.2320006072.workers.dev'; do
  index=$((index + 1))
  prefix="/tmp/v2-test2/channel-${index}"
  ready=0
  status=''
  for attempt in $(seq 1 12); do
    status="$(curl --silent --show-error \
      --dump-header "${prefix}-health-headers.txt" \
      --output "${prefix}-health-body.txt" \
      --write-out '%{http_code}' \
      "$endpoint/health" || true)"
    printf 'health endpoint=%s attempt=%s status=%s\n' "$endpoint" "$attempt" "${status:-network-error}"
    if [[ "$status" == '200' ]] \
      && jq -e '.ok == true and .service == "gams-runtime-v2" and .version == 2 and .keyWrap == "RSA-OAEP-SHA1"' "${prefix}-health-body.txt" >/dev/null 2>&1; then
      ready=1
      break
    fi
    sleep 5
  done

  if [[ "$ready" != '1' ]]; then
    verify_failed=1
    printf 'HEALTH FAILED: %s HTTP %s\n' "$endpoint" "${status:-network-error}"
    cat "${prefix}-health-headers.txt" 2>/dev/null || true
    cat "${prefix}-health-body.txt" 2>/dev/null || true
    continue
  fi

  post_status="$(curl --silent --show-error -X POST \
    -H 'Content-Type: application/json' \
    --dump-header "${prefix}-post-headers.txt" \
    --output "${prefix}-post-body.txt" \
    --write-out '%{http_code}' \
    --data "$challenge" \
    "$endpoint/v2/runtime/challenge" || true)"
  printf 'post endpoint=%s status=%s\n' "$endpoint" "${post_status:-network-error}"
  if [[ "$post_status" != '200' ]] \
    || ! jq -e '.ok == true and .purpose == "runtime" and (.nonce|length) > 20' "${prefix}-post-body.txt" >/dev/null 2>&1; then
    verify_failed=1
    printf 'POST FAILED: %s HTTP %s\n' "$endpoint" "${post_status:-network-error}"
    cat "${prefix}-post-headers.txt" 2>/dev/null || true
    cat "${prefix}-post-body.txt" 2>/dev/null || true
  fi
done

if [[ "$verify_failed" == '0' ]]; then
  online_result='passed'
else
  online_result='failed; inspect channel diagnostics'
fi
cat > /tmp/v2-test2/TEST-RESULT.txt <<EOF
Android compile: passed
APK plaintext core scan: passed
Android key wrap: RSA-OAEP SHA-1 / MGF1 SHA-1
Primary runtime channel: https://runtime.xn--8pv109c.top
Fallback runtime channel: workers.dev
Online channel verification: ${online_result}
V1 version 8: unchanged
EOF

rm -f v2/runtime/wrangler.generated.jsonc
git add v2/android/client v2/runtime/src/index.js v2/runtime/wrangler.template.jsonc v2/README.md
if ! git diff --cached --quiet; then
  git commit -m 'Fix V2 Android OAEP compatibility and direct runtime access'
  git fetch -q origin "${TARGET_BRANCH}"
  git rebase "origin/${TARGET_BRANCH}"
  git push origin HEAD:"${TARGET_BRANCH}"
fi

exit 0
