#!/usr/bin/env python3
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", default="scripts/run_page5_guard_full_entry_matrix.mjs")
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    subprocess.run(
        [
            sys.executable,
            "scripts/prepare_page5_menu_callback_contract_probe.py",
            "--source",
            args.source,
            "--output",
            args.output,
        ],
        check=True,
    )

    output = Path(args.output)
    text = output.read_text(encoding="utf-8")
    old_fingerprint = 'mobileOld + "\n" + callbackOld'
    new_fingerprint = 'mobileNew + "\n" + callbackNew'
    old_count = text.count(old_fingerprint)
    new_count = text.count(new_fingerprint)
    if old_count != 1 or new_count != 1:
        raise SystemExit(
            f"generated fingerprint repair markers mismatch: old={old_count}, new={new_count}"
        )
    text = text.replace(
        old_fingerprint,
        "mobileOld + String.fromCharCode(10) + callbackOld",
        1,
    )
    text = text.replace(
        new_fingerprint,
        "mobileNew + String.fromCharCode(10) + callbackNew",
        1,
    )
    output.write_text(text, encoding="utf-8")
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
