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

path.write_text(text, encoding='utf-8')
PY

exec bash scripts/run_complete_restore.sh
