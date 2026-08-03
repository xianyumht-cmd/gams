#!/usr/bin/env bash
set -Eeuo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

LICENSE_ENDPOINT="${LICENSE_ENDPOINT:-https://gams-license-api.2320006072.workers.dev}"
RUNTIME_ENDPOINT="${RUNTIME_ENDPOINT:-https://gams-runtime-v2.2320006072.workers.dev}"
CERT_SHA256="${CERT_SHA256:-70:60:83:47:EE:8C:C3:CD:72:E7:DC:70:C5:04:01:3E:26:1C:9A:2F:EE:98:50:53:92:19:CD:A5:19:C8:7F:34}"
STATUS_PATH="docs/COMPLETE_RESTORE_STATUS.json"
DEPLOY_STARTED=false
PUBLISHED=false
CURRENT_STEP="initializing"
DATABASE_ID=""
CLIENT_SHA=""
MANAGER_SHA=""
CANDIDATE_SHA=""
PUBLISHED_SHA=""

required() {
  local name="$1"
  test -n "${!name:-}" || { echo "$name is missing" >&2; exit 1; }
}

record_status() {
  local ok="$1" failure="${2:-}"
  mkdir -p /tmp
  jq -n \
    --arg generatedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --argjson runId "${GITHUB_RUN_ID:-0}" \
    --argjson ok "$ok" \
    --arg step "$CURRENT_STEP" \
    --arg failure "$failure" \
    --arg clientSha "$CLIENT_SHA" \
    --arg managerSha "$MANAGER_SHA" \
    --arg candidateSha "$CANDIDATE_SHA" \
    --arg publishedSha "$PUBLISHED_SHA" \
    --argjson deployed "$DEPLOY_STARTED" \
    --argjson published "$PUBLISHED" \
    '{schemaVersion:2,generatedAt:$generatedAt,runId:$runId,ok:$ok,currentStep:$step,failure:$failure,
      client:{versionName:"2.0.3-stable",versionCode:16,protocolAppVersion:12,sha256:$clientSha,preRegressionBehavior:true},
      manager:{versionName:"2.0.3",versionCode:4,sha256:$managerSha,completeControlCenter:true},
      backend:{adminRouteCount:23,signedProtocolRetained:true,encryptedRuntimeRetained:true,databasePreserved:true,deploymentStarted:$deployed},
      commits:{candidate:$candidateSha,published:$publishedSha,publishedToMain:$published},
      secretsExposed:false}' > /tmp/complete-restore-status.json

  if [[ -n "${GH_TOKEN:-}" && -n "${GITHUB_REPOSITORY:-}" ]]; then
    local content old_sha
    content="$(base64 -w0 /tmp/complete-restore-status.json)"
    old_sha="$(gh api "repos/${GITHUB_REPOSITORY}/contents/${STATUS_PATH}?ref=main" --jq '.sha' 2>/dev/null || true)"
    local args=(--method PUT "repos/${GITHUB_REPOSITORY}/contents/${STATUS_PATH}" \
      -f message='Record atomic complete restore status' -f content="$content" -f branch=main)
    [[ -z "$old_sha" ]] || args+=(-f sha="$old_sha")
    gh api "${args[@]}" >/dev/null || true
  fi
}

generate_configs() {
  test -n "$DATABASE_ID"
  sed "s/__D1_DATABASE_ID__/${DATABASE_ID}/g" \
    license-api/wrangler.template.jsonc > license-api/wrangler.generated.jsonc
  sed "s/__D1_DATABASE_ID__/${DATABASE_ID}/g" \
    v2/runtime/wrangler.template.jsonc > v2/runtime/wrangler.generated.jsonc
}

deploy_current_tree() {
  generate_configs
  printf '%s' "$ADMIN_LOGIN_SECRET" \
    | (cd license-api && npx --yes wrangler@4 secret put ADMIN_LOGIN_SECRET --config wrangler.generated.jsonc)
  printf '%s' "$TOKEN_SIGNING_SECRET" \
    | (cd license-api && npx --yes wrangler@4 secret put TOKEN_SIGNING_SECRET --config wrangler.generated.jsonc)
  (cd license-api && npx --yes wrangler@4 d1 migrations apply gams-license-db --remote --config wrangler.generated.jsonc)
  (cd license-api && npx --yes wrangler@4 deploy --config wrangler.generated.jsonc)

  printf '%s' "$TOKEN_SIGNING_SECRET" \
    | (cd v2/runtime && npx --yes wrangler@4 secret put TOKEN_SIGNING_SECRET --config wrangler.generated.jsonc)
  printf '%s' "$RUNTIME_MASTER_KEY" \
    | (cd v2/runtime && npx --yes wrangler@4 secret put RUNTIME_MASTER_KEY --config wrangler.generated.jsonc)
  (cd v2/runtime && npx --yes wrangler@4 deploy --config wrangler.generated.jsonc)
}

rollback_if_needed() {
  local code=$?
  if [[ "$code" -ne 0 ]]; then
    local failure="step=${CURRENT_STEP}; exit=${code}"
    echo "Complete restore failed: $failure" >&2
    if [[ "$DEPLOY_STARTED" == true && "$PUBLISHED" == false && -n "$DATABASE_ID" ]]; then
      echo "Rolling production Workers back to origin/main..." >&2
      git fetch origin main || true
      git reset --hard origin/main || true
      deploy_current_tree || true
    fi
    record_status false "$failure"
  fi
  exit "$code"
}
trap rollback_if_needed EXIT

CURRENT_STEP="validate-secrets"
for name in \
  CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID ADMIN_LOGIN_SECRET \
  TOKEN_SIGNING_SECRET RUNTIME_MASTER_KEY \
  GG_RELEASE_KEYSTORE_BASE64 GG_RELEASE_KEYSTORE_PASSWORD GH_TOKEN; do
  required "$name"
done
test "${#TOKEN_SIGNING_SECRET}" -ge 32

CURRENT_STEP="generate-historical-control-center"
git fetch origin control-center-v1.4 --depth=1
git fetch origin 104e14015a32aa8ba05c6793935f94b9e649f11a --depth=1
git fetch origin bf07b7dccfe78fe4094abdee5632e61f4b83f3e2 --depth=1
rm -rf /tmp/control-center /tmp/complete-restore
mkdir -p /tmp/control-center/license-api/src /tmp/complete-restore
for part in $(git ls-tree -r --name-only origin/control-center-v1.4 hardening_backend_parts | sort); do
  git show "origin/control-center-v1.4:${part}"
done > /tmp/control-center/license-api/src/index.js
for file in control_center_patch.py client_config_patch.py release_baseline_patch.py; do
  git show "origin/control-center-v1.4:license-api/${file}" \
    > "/tmp/control-center/license-api/${file}"
done
(
  cd /tmp/control-center/license-api
  python3 control_center_patch.py
  python3 client_config_patch.py
  python3 release_baseline_patch.py
)
node --check /tmp/control-center/license-api/src/index.js

CURRENT_STEP="restore-pre-regression-client"
git show 104e14015a32aa8ba05c6793935f94b9e649f11a:v2/android/client/src/main/java/com/jinli/ggsecure/MainActivity.java \
  > v2/android/client/src/main/java/com/jinli/ggsecure/MainActivity.java
git show 104e14015a32aa8ba05c6793935f94b9e649f11a:v2/android/client/src/main/java/com/jinli/ggsecure/V2LicenseManager.java \
  > v2/android/client/src/main/java/com/jinli/ggsecure/V2LicenseManager.java
git show 104e14015a32aa8ba05c6793935f94b9e649f11a:v2/android/client/build.gradle.kts \
  > v2/android/client/build.gradle.kts
sed -i 's/versionCode = 12/versionCode = 16/' v2/android/client/build.gradle.kts
sed -i 's/versionName = "2.0.3"/versionName = "2.0.3-stable"/' v2/android/client/build.gradle.kts

CURRENT_STEP="restore-complete-manager"
git show bf07b7dccfe78fe4094abdee5632e61f4b83f3e2:v2/android/manager/src/main/java/com/jinli/ggsecure/manager/MainActivity.java \
  > v2/android/manager/src/main/java/com/jinli/ggsecure/manager/MainActivity.java
sed -i 's/versionCode = 3/versionCode = 4/' v2/android/manager/build.gradle.kts
sed -i 's/versionName = "2.0.2"/versionName = "2.0.3"/' v2/android/manager/build.gradle.kts

CURRENT_STEP="assemble-signed-control-center"
python3 -m py_compile scripts/assemble_full_control_center_restore.py
python3 scripts/assemble_full_control_center_restore.py
node --check license-api/src/index.js
node --check v2/runtime/src/index.js

CURRENT_STEP="validate-source-contracts"
license='license-api/src/index.js'
runtime='v2/runtime/src/index.js'
client='v2/android/client/src/main/java/com/jinli/ggsecure/MainActivity.java'
manager='v2/android/manager/src/main/java/com/jinli/ggsecure/manager/MainActivity.java'
for route in \
  /v1/admin/dashboard \
  /v1/admin/settings /v1/admin/settings/update /v1/admin/settings/history /v1/admin/settings/rollback \
  /v1/admin/licenses/detail /v1/admin/licenses/update /v1/admin/licenses/batch-action \
  /v1/admin/devices /v1/admin/devices/detail /v1/admin/devices/revoke /v1/admin/devices/revoke-all \
  /v1/admin/audit /v1/admin/sessions/revoke-all \
  /v1/admin/runtime /v1/admin/runtime/releases /v1/admin/runtime/pause /v1/admin/runtime/resume /v1/admin/runtime/select; do
  grep -Fq "$route" "$license"
  grep -Fq "$route" "$manager" || case "$route" in
    /v1/admin/settings|/v1/admin/settings/update|/v1/admin/settings/history|/v1/admin/settings/rollback|/v1/admin/runtime/pause|/v1/admin/runtime/resume|/v1/admin/runtime/select|/v1/admin/sessions/revoke-all) true ;;
    *) false ;;
  esac
done
grep -Fq 'completeControlCenter: true' "$license"
grep -Fq 'env.ADMIN_LOGIN_SECRET' "$license"
grep -Fq 'env.TOKEN_SIGNING_SECRET' "$license"
grep -Fq 'await requireRuntimeEnabled(env);' "$runtime"
test -s license-api/migrations/0003_control_center.sql

grep -Fq 'versionCode = 16' v2/android/client/build.gradle.kts
grep -Fq 'versionName = "2.0.3-stable"' v2/android/client/build.gradle.kts
grep -Fq 'PROTOCOL_APP_VERSION = 12' v2/android/client/src/main/java/com/jinli/ggsecure/V2LicenseManager.java
grep -Fq 'setSupportMultipleWindows(false)' "$client"
! grep -Fq 'boolean onCreateWindow' "$client"
! grep -Fq 'new WebView(MainActivity.this)' "$client"
grep -Fq 'versionCode = 4' v2/android/manager/build.gradle.kts
grep -Fq 'versionName = "2.0.3"' v2/android/manager/build.gradle.kts

CURRENT_STEP="build-and-lint"
(
  cd v2/android
  gradle --no-daemon \
    :client:clean :client:lintRelease :client:assembleRelease \
    :manager:clean :manager:lintRelease :manager:assembleRelease
)

CURRENT_STEP="sign-apks"
printf '%s' "$GG_RELEASE_KEYSTORE_BASE64" | base64 -d > /tmp/gg-release.jks
trap 'rm -f /tmp/gg-release.jks' RETURN
keytool -list -v -keystore /tmp/gg-release.jks \
  -storepass "$GG_RELEASE_KEYSTORE_PASSWORD" -alias gg-release > /tmp/keytool.txt
grep -Fq "SHA256: $CERT_SHA256" /tmp/keytool.txt
sdk_root="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}"
apksigner="$(find "$sdk_root/build-tools" -type f -name apksigner -perm -u+x 2>/dev/null | sort -V | tail -n1)"
aapt="$(find "$sdk_root/build-tools" -type f -name aapt -perm -u+x 2>/dev/null | sort -V | tail -n1)"
test -x "$apksigner" && test -x "$aapt"

sign_one() {
  local input="$1" output="$2"
  "$apksigner" sign --ks /tmp/gg-release.jks --ks-key-alias gg-release \
    --ks-pass env:GG_RELEASE_KEYSTORE_PASSWORD \
    --key-pass env:GG_RELEASE_KEYSTORE_PASSWORD \
    --v1-signing-enabled false --v2-signing-enabled true --v3-signing-enabled true \
    --v4-signing-enabled false --out "$output" "$input"
  "$apksigner" verify --min-sdk-version 24 "$output"
}
client_apk="$(find v2/android/client/build/outputs/apk/release -maxdepth 1 -type f -name '*.apk' | head -n1)"
manager_apk="$(find v2/android/manager/build/outputs/apk/release -maxdepth 1 -type f -name '*.apk' | head -n1)"
test -s "$client_apk" && test -s "$manager_apk"
sign_one "$client_apk" /tmp/complete-restore/GG-2.0.3-stable-code16.apk
sign_one "$manager_apk" /tmp/complete-restore/GG-Manager-2.0.3-code4.apk
"$aapt" dump badging /tmp/complete-restore/GG-2.0.3-stable-code16.apk > /tmp/client-badging.txt
"$aapt" dump badging /tmp/complete-restore/GG-Manager-2.0.3-code4.apk > /tmp/manager-badging.txt
grep -Fq "package: name='com.jinli.quickweb'" /tmp/client-badging.txt
grep -Fq "versionCode='16'" /tmp/client-badging.txt
grep -Fq "versionName='2.0.3-stable'" /tmp/client-badging.txt
grep -Fq "package: name='com.jinli.ggsecure.manager'" /tmp/manager-badging.txt
grep -Fq "versionCode='4'" /tmp/manager-badging.txt
grep -Fq "versionName='2.0.3'" /tmp/manager-badging.txt
sha256sum /tmp/complete-restore/*.apk > /tmp/complete-restore/SHA256SUMS.txt
CLIENT_SHA="$(awk '/GG-2.0.3-stable-code16.apk/{print $1}' /tmp/complete-restore/SHA256SUMS.txt)"
MANAGER_SHA="$(awk '/GG-Manager-2.0.3-code4.apk/{print $1}' /tmp/complete-restore/SHA256SUMS.txt)"
rm -f /tmp/gg-release.jks
trap - RETURN

CURRENT_STEP="create-candidate-commit"
git config user.name github-actions[bot]
git config user.email 41898282+github-actions[bot]@users.noreply.github.com
git add \
  license-api/src/index.js \
  license-api/migrations/0003_control_center.sql \
  v2/runtime/src/index.js \
  v2/android/client/build.gradle.kts \
  v2/android/client/src/main/java/com/jinli/ggsecure/MainActivity.java \
  v2/android/client/src/main/java/com/jinli/ggsecure/V2LicenseManager.java \
  v2/android/manager/build.gradle.kts \
  v2/android/manager/src/main/java/com/jinli/ggsecure/manager/MainActivity.java
git commit -m 'Restore complete control center and pre-regression GG client'
CANDIDATE_SHA="$(git rev-parse HEAD)"

CURRENT_STEP="locate-d1"
api="https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/d1/database"
response="$(curl -fsS -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" "$api?per_page=100")"
DATABASE_ID="$(printf '%s' "$response" | jq -r '.result[] | select(.name=="gams-license-db") | (.uuid // .id)' | head -n1)"
test -n "$DATABASE_ID" && test "$DATABASE_ID" != "null"

CURRENT_STEP="deploy-candidate"
DEPLOY_STARTED=true
deploy_current_tree

CURRENT_STEP="wait-for-health"
for attempt in $(seq 1 36); do
  license_status="$(curl -sS -o /tmp/license-health.json -w '%{http_code}' "$LICENSE_ENDPOINT/health" || true)"
  runtime_status="$(curl -sS -o /tmp/runtime-health.json -w '%{http_code}' "$RUNTIME_ENDPOINT/health" || true)"
  if [[ "$license_status" == "200" && "$runtime_status" == "200" ]] \
    && jq -e '.ok == true and .version == 2 and .signedProtocol == true and .completeControlCenter == true' /tmp/license-health.json >/dev/null \
    && jq -e '.ok == true and .version == 3 and .encryptedRuntime == true' /tmp/runtime-health.json >/dev/null; then
    break
  fi
  if [[ "$attempt" == 36 ]]; then
    cat /tmp/license-health.json 2>/dev/null || true
    cat /tmp/runtime-health.json 2>/dev/null || true
    exit 1
  fi
  sleep 5
done

CURRENT_STEP="verify-admin-routes"
login_payload="$(jq -n --arg password "$ADMIN_LOGIN_SECRET" '{password:$password}')"
login="$(curl -fsS -H 'Content-Type: application/json' --data "$login_payload" "$LICENSE_ENDPOINT/v1/admin/login")"
token="$(printf '%s' "$login" | jq -er '.token')"
auth="Authorization: Bearer $token"
for path in \
  '/v1/admin/dashboard' \
  '/v1/admin/settings' \
  '/v1/admin/settings/history?limit=5' \
  '/v1/admin/licenses?limit=5' \
  '/v1/admin/devices?limit=5' \
  '/v1/admin/audit?limit=5' \
  '/v1/admin/runtime' \
  '/v1/admin/runtime/releases'; do
  admin_response="$(curl -fsS -H "$auth" "$LICENSE_ENDPOINT$path")"
  printf '%s' "$admin_response" | jq -e '.ok == true' >/dev/null
done
config="$(curl -fsS -H 'Content-Type: application/json' \
  --data '{"appVersion":12}' "$LICENSE_ENDPOINT/v1/client/config")"
printf '%s' "$config" | jq -e '.ok == true and .minAppVersion >= 11 and .latestAppVersion >= 12' >/dev/null

CURRENT_STEP="verify-lifecycle"
export LICENSE_ENDPOINT RUNTIME_ENDPOINT ADMIN_LOGIN_SECRET
node scripts/v2-lifecycle-smoke.mjs

CURRENT_STEP="publish-source"
git pull --rebase origin main
git push origin HEAD:main
PUBLISHED_SHA="$(git rev-parse HEAD)"
PUBLISHED=true

CURRENT_STEP="publish-release"
cat > /tmp/release-notes.txt <<EOF
Complete recovery release

- GG client restores the exact 2.0.3 pre-browser-regression behavior.
- Android versionCode is 16 so it can replace 2.0.6 without uninstalling.
- GG manager restores the complete control center.
- License Worker restores all 23 administration routes while retaining the signed protocol.
- Existing encrypted Runtime V3, signing keys, card database and secrets are retained.
- Client SHA-256: ${CLIENT_SHA}
- Manager SHA-256: ${MANAGER_SHA}
EOF
gh release delete gg-complete-restore-20260804 --yes --cleanup-tag 2>/dev/null || true
gh release create gg-complete-restore-20260804 \
  /tmp/complete-restore/GG-2.0.3-stable-code16.apk \
  /tmp/complete-restore/GG-Manager-2.0.3-code4.apk \
  /tmp/complete-restore/SHA256SUMS.txt \
  --target "$PUBLISHED_SHA" \
  --title 'GG complete restore 2026-08-04' \
  --notes-file /tmp/release-notes.txt

CURRENT_STEP="complete"
record_status true ""
trap - EXIT
echo "Complete control center and stable GG client restore succeeded."
