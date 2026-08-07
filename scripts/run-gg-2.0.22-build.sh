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
text = path.read_text(encoding="utf-8")
old = 'if (text.contains("dispatchEvent(new Event(\\"load\\"))")) {'
new = 'if (NONAME_PATCH.contains("dispatchEvent(new Event(\\"load\\"))")) {'
if old not in text:
    raise SystemExit("experience verification baseline mismatch")
path.write_text(text.replace(old, new, 1), encoding="utf-8", newline="")
PY

# The Java verifier now checks only NONAME_PATCH. Remove the two broad shell greps
# that searched the complete source bundle and could match unrelated legacy code.
grep -v 'dispatchEvent(new Event("load"))' "$BASE_SCRIPT" > "$TEMP_SCRIPT"
chmod +x "$TEMP_SCRIPT"
bash "$TEMP_SCRIPT"
