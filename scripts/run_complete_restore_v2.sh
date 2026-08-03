#!/usr/bin/env bash
set -euo pipefail

python3 - <<'PY'
from pathlib import Path

path = Path('scripts/run_complete_restore.sh')
text = path.read_text(encoding='utf-8')

assemble_old = """python3 scripts/assemble_full_control_center_restore.py\nnode --check license-api/src/index.js"""
assemble_new = """python3 scripts/assemble_full_control_center_restore.py\npython3 -m py_compile scripts/apply_complete_restore_protocol_compat.py\npython3 scripts/apply_complete_restore_protocol_compat.py\nnode --check license-api/src/index.js"""
if text.count(assemble_old) != 1:
    raise SystemExit(f'assembler insertion marker expected once, found {text.count(assemble_old)}')
text = text.replace(assemble_old, assemble_new, 1)

migration_check_old = """test -s license-api/migrations/0003_control_center.sql"""
migration_check_new = """test -s license-api/migrations/0003_control_center.sql\ntest -s license-api/migrations/0004_signed_control_center_compat.sql\ngrep -Fq 'value.offlineGraceSeconds = Math.max(86400' \"$license\""""
if text.count(migration_check_old) != 1:
    raise SystemExit(f'migration validation marker expected once, found {text.count(migration_check_old)}')
text = text.replace(migration_check_old, migration_check_new, 1)

git_add_old = """  license-api/migrations/0003_control_center.sql \\\n  v2/runtime/src/index.js"""
git_add_new = """  license-api/migrations/0003_control_center.sql \\\n  license-api/migrations/0004_signed_control_center_compat.sql \\\n  v2/runtime/src/index.js"""
if text.count(git_add_old) != 1:
    raise SystemExit(f'candidate migration marker expected once, found {text.count(git_add_old)}')
text = text.replace(git_add_old, git_add_new, 1)

admin_old = '''for path in \\
  '/v1/admin/dashboard' \\
  '/v1/admin/settings' \\
  '/v1/admin/settings/history?limit=5' \\
  '/v1/admin/licenses?limit=5' \\
  '/v1/admin/devices?limit=5' \\
  '/v1/admin/audit?limit=5' \\
  '/v1/admin/runtime' \\
  '/v1/admin/runtime/releases'; do
  admin_response="$(curl -fsS -H "$auth" "$LICENSE_ENDPOINT$path")"
  printf '%s' "$admin_response" | jq -e '.ok == true' >/dev/null
done'''
admin_new = '''for path in \\
  '/v1/admin/dashboard' \\
  '/v1/admin/settings' \\
  '/v1/admin/settings/history?limit=5' \\
  '/v1/admin/licenses?limit=5' \\
  '/v1/admin/devices?limit=5' \\
  '/v1/admin/audit?limit=5' \\
  '/v1/admin/runtime' \\
  '/v1/admin/runtime/releases'; do
  route_ok=false
  for route_attempt in $(seq 1 12); do
    route_status="$(curl -sS -H "$auth" -o /tmp/admin-route.json -w '%{http_code}' "$LICENSE_ENDPOINT$path" || true)"
    if [[ "$route_status" == "200" ]] && jq -e '.ok == true' /tmp/admin-route.json >/dev/null 2>&1; then
      echo "Verified management route: $path"
      route_ok=true
      break
    fi
    echo "Waiting for management route propagation: $path attempt $route_attempt/12 HTTP ${route_status:-network-error}"
    cat /tmp/admin-route.json 2>/dev/null || true
    sleep 3
  done
  [[ "$route_ok" == true ]] || { echo "Management route did not become ready: $path" >&2; exit 1; }
done'''
if text.count(admin_old) != 1:
    raise SystemExit(f'admin route loop marker expected once, found {text.count(admin_old)}')
text = text.replace(admin_old, admin_new, 1)

publish_old = """CURRENT_STEP=\"publish-source\"\ngit pull --rebase origin main\ngit push origin HEAD:main"""
publish_new = """CURRENT_STEP=\"publish-source\"\n# The compatibility runner intentionally edits this tracked helper only in the ephemeral workspace.\n# Reset all unstaged build/deploy helpers to the already verified candidate commit before rebasing.\ngit reset --hard HEAD\ngit clean -fd\ngit fetch origin main\ngit rebase origin/main\ngit push origin HEAD:main"""
if text.count(publish_old) != 1:
    raise SystemExit(f'publish cleanup marker expected once, found {text.count(publish_old)}')
text = text.replace(publish_old, publish_new, 1)

path.write_text(text, encoding='utf-8')
PY

exec bash scripts/run_complete_restore.sh
