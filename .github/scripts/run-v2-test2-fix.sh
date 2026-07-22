#!/usr/bin/env bash
set -euo pipefail

mkdir -p /tmp/v2-test2
exec > >(tee /tmp/v2-test2/RUN-LOG.txt) 2>&1

: "${GH_TOKEN:?missing GH_TOKEN}"
TARGET_BRANCH="v2-server-authoritative"
WORKER_HOST="gams-runtime-v2.2320006072.workers.dev"
WORKER_ENDPOINT="https://${WORKER_HOST}"
CUSTOM_ENDPOINT="https://runtime.xn--8pv109c.top"

git remote set-url origin "https://x-access-token:${GH_TOKEN}@github.com/${GITHUB_REPOSITORY}.git"
git fetch -q origin main "${TARGET_BRANCH}"
git checkout -B "${TARGET_BRANCH}" "origin/${TARGET_BRANCH}"
git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

python3 - <<'PY'
from pathlib import Path

manager = Path('v2/android/client/src/main/java/com/jinli/ggsecure/V2LicenseManager.java')
text = manager.read_text(encoding='utf-8')
text = text.replace('客户端：2.0.0-test1', '客户端：2.0.0-test3')
text = text.replace('客户端：2.0.0-test2', '客户端：2.0.0-test3')
if '客户端：2.0.0-test3' not in text:
    raise SystemExit('V2 client status version patch failed')
manager.write_text(text, encoding='utf-8')

readme = Path('v2/README.md')
text = readme.read_text(encoding='utf-8')
marker = '## Test3 resilient transport'
if marker not in text:
    text += '''\n\n## Test3 resilient transport\n\n- Adds multi-resolver DNS recovery for the V2 runtime Worker.\n- Adds direct Cloudflare-IP TLS transport while preserving Worker SNI and hostname verification.\n- Keeps the custom domain and normal Worker HTTPS paths ahead of the direct fallback.\n- V1 version 8 remains unchanged.\n'''
readme.write_text(text, encoding='utf-8')
PY

node --check v2/runtime/src/index.js
grep -q 'RSA/ECB/OAEPWithSHA-1AndMGF1Padding' v2/android/client/src/main/java/com/jinli/ggsecure/RuntimeKeyManager.java
grep -q 'MGF1ParameterSpec.SHA1' v2/android/client/src/main/java/com/jinli/ggsecure/RuntimeKeyManager.java
grep -q 'directTlsRequest' v2/android/client/src/main/java/com/jinli/ggsecure/RuntimeTransport.java
grep -q '223.5.5.5' v2/android/client/src/main/java/com/jinli/ggsecure/RuntimeTransport.java
grep -q '119.29.29.29' v2/android/client/src/main/java/com/jinli/ggsecure/RuntimeTransport.java
grep -q 'setEndpointIdentificationAlgorithm("HTTPS")' v2/android/client/src/main/java/com/jinli/ggsecure/RuntimeTransport.java
grep -q 'HostnameVerifier' v2/android/client/src/main/java/com/jinli/ggsecure/RuntimeTransport.java
grep -q 'versionCode = 3' v2/android/client/build.gradle.kts
grep -q 'versionName = "2.0.0-test3"' v2/android/client/build.gradle.kts
grep -q '客户端：2.0.0-test3' v2/android/client/src/main/java/com/jinli/ggsecure/V2LicenseManager.java

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
cp "$apk" '/tmp/v2-test2/GG-V2-客户端-2.0.0-test3.apk'
sha256sum /tmp/v2-test2/GG-V2-客户端-2.0.0-test3.apk > /tmp/v2-test2/SHA256SUMS.txt

challenge="$(python3 - <<'PY'
import json
print(json.dumps({'deviceId':'b'*64,'purpose':'runtime','appVersion':9}))
PY
)"

normal_health_status="$(curl --silent --show-error \
  --dump-header /tmp/v2-test2/worker-normal-health-headers.txt \
  --output /tmp/v2-test2/worker-normal-health-body.txt \
  --write-out '%{http_code}' \
  "${WORKER_ENDPOINT}/health" || true)"
test "$normal_health_status" = '200'
jq -e '.ok == true and .service == "gams-runtime-v2" and .version == 2 and .keyWrap == "RSA-OAEP-SHA1"' \
  /tmp/v2-test2/worker-normal-health-body.txt >/dev/null

normal_post_status="$(curl --silent --show-error -X POST \
  -H 'Content-Type: application/json' \
  --dump-header /tmp/v2-test2/worker-normal-post-headers.txt \
  --output /tmp/v2-test2/worker-normal-post-body.txt \
  --write-out '%{http_code}' \
  --data "$challenge" \
  "${WORKER_ENDPOINT}/v2/runtime/challenge" || true)"
test "$normal_post_status" = '200'
jq -e '.ok == true and .purpose == "runtime" and (.nonce|length) > 20' \
  /tmp/v2-test2/worker-normal-post-body.txt >/dev/null

mapfile -t worker_ips < <(getent ahostsv4 "$WORKER_HOST" | awk '{print $1}' | sort -u)
test "${#worker_ips[@]}" -gt 0
printf '%s\n' "${worker_ips[@]}" > /tmp/v2-test2/worker-resolved-ipv4.txt

direct_ok=0
for ip in "${worker_ips[@]}"; do
  echo "Testing direct TLS Worker channel through ${ip}"
  status="$(curl --silent --show-error \
    --connect-timeout 8 --max-time 30 \
    --resolve "${WORKER_HOST}:443:${ip}" \
    --dump-header /tmp/v2-test2/worker-direct-health-headers.txt \
    --output /tmp/v2-test2/worker-direct-health-body.txt \
    --write-out '%{http_code}' \
    "${WORKER_ENDPOINT}/health" || true)"
  if [[ "$status" != '200' ]] \
    || ! jq -e '.ok == true and .keyWrap == "RSA-OAEP-SHA1"' \
      /tmp/v2-test2/worker-direct-health-body.txt >/dev/null 2>&1; then
    continue
  fi

  post_status="$(curl --silent --show-error -X POST \
    --connect-timeout 8 --max-time 30 \
    --resolve "${WORKER_HOST}:443:${ip}" \
    -H 'Content-Type: application/json' \
    --dump-header /tmp/v2-test2/worker-direct-post-headers.txt \
    --output /tmp/v2-test2/worker-direct-post-body.txt \
    --write-out '%{http_code}' \
    --data "$challenge" \
    "${WORKER_ENDPOINT}/v2/runtime/challenge" || true)"
  if [[ "$post_status" == '200' ]] \
    && jq -e '.ok == true and .purpose == "runtime" and (.nonce|length) > 20' \
      /tmp/v2-test2/worker-direct-post-body.txt >/dev/null 2>&1; then
    direct_ok=1
    printf '%s\n' "$ip" > /tmp/v2-test2/worker-direct-success-ip.txt
    break
  fi
done
test "$direct_ok" = '1'

custom_status="$(curl --silent --show-error \
  --dump-header /tmp/v2-test2/custom-domain-health-headers.txt \
  --output /tmp/v2-test2/custom-domain-health-body.txt \
  --write-out '%{http_code}' \
  "${CUSTOM_ENDPOINT}/health" || true)"
printf '%s\n' "$custom_status" > /tmp/v2-test2/custom-domain-health-status.txt

cat > /tmp/v2-test2/TEST-RESULT.txt <<'EOF'
Android compile: passed
APK plaintext core scan: passed
Android key wrap: RSA-OAEP SHA-1 / MGF1 SHA-1
Normal workers.dev health and POST: passed
Direct Cloudflare-IP TLS with Worker SNI and certificate verification: passed
Multi-resolver DNS fallback included: yes
Custom runtime domain: retained as first channel; current zone challenge may reject it
V1 version 8: unchanged
EOF

cat > v2/android/.gitignore <<'EOF'
.gradle/
**/build/
local.properties
EOF

git rm -r --cached --ignore-unmatch \
  v2/android/.gradle \
  v2/android/client/build \
  v2/android/manager/build || true
rm -rf v2/android/.gradle v2/android/client/build v2/android/manager/build

git add \
  v2/android/.gitignore \
  v2/android/client/build.gradle.kts \
  v2/android/client/src/main/java/com/jinli/ggsecure/RuntimeTransport.java \
  v2/android/client/src/main/java/com/jinli/ggsecure/V2LicenseManager.java \
  v2/README.md

if ! git diff --cached --quiet; then
  git commit -m 'Finalize V2 test3 resilient runtime transport'
  git fetch -q origin "${TARGET_BRANCH}"
  git rebase "origin/${TARGET_BRANCH}"
  git push origin HEAD:"${TARGET_BRANCH}"
fi
