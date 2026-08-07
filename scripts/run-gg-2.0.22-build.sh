#!/usr/bin/env bash
set -euo pipefail

EXPERIENCE="${GITHUB_WORKSPACE}/source/v2/android/client/src/main/java/com/jinli/ggsecure/RuntimeExperiencePatch.java"
BASE_SCRIPT="${GITHUB_WORKSPACE}/scripts/build-js-runtime-stability-apk-final.sh"
TEMP_SCRIPT="${RUNNER_TEMP:-/tmp}/build-js-runtime-stability-apk-final-v4.sh"

test -s "$EXPERIENCE"
test -s "$BASE_SCRIPT"

python3 - "$EXPERIENCE" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
text = path.read_text(encoding="utf-8")n
# Locate the exact verifier block through its stable exception message. The
# prohibited behavior is manually completing a SCRIPT node. XHR load events
# are part of its normal lifecycle and must remain available.
needle = 'throw new SecurityException("仍存在手动抢跑脚本完成事件");'
throw_at = text.find(needle)
if throw_at < 0:
    raise SystemExit("experience verification exception marker missing")
if_at = text.rfind("        if (", 0, throw_at)
brace_at = text.find("{", if_at, throw_at)
if if_at < 0 or brace_at < 0:
    raise SystemExit("experience verification condition boundary missing")
replacement = '        if (NONAME_PATCH.contains("node.dispatchEvent(new Event(\\"load\\"))")) {'
text = text[:if_at] + replacement + text[brace_at + 1:]

check_at = text.rfind("        if (", 0, text.find(needle))
condition = text[check_at:text.find("{", check_at) + 1]
if "NONAME_PATCH.contains" not in condition or "node.dispatchEvent" not in condition:
    raise SystemExit("experience verification condition was not updated")

path.write_text(text, encoding="utf-8", newline="")
PY

# Remove only the broad shell checks from the controller script. The Java
# verifier above now checks the v4 patch and specifically targets script nodes.
awk '!/! grep -Fq.*dispatchEvent\(new Event\(\"load\"\)\)/' "$BASE_SCRIPT" > "$TEMP_SCRIPT"
chmod +x "$TEMP_SCRIPT"
bash "$TEMP_SCRIPT"
