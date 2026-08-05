#!/usr/bin/env python3
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    subprocess.run(
        [
            sys.executable,
            "scripts/prepare_target_open_menu_contract_probe.py",
            "--output",
            args.output,
        ],
        check=True,
    )

    output = Path(args.output)
    text = output.read_text(encoding="utf-8")
    bad = 'JSON.stringify(report, null, 2) + "' + "\n" + '");'
    good = r'JSON.stringify(report, null, 2) + "\n");'
    count = text.count(bad)
    if count != 1:
        raise SystemExit(f"generated report newline marker mismatch: {count}")
    output.write_text(text.replace(bad, good, 1), encoding="utf-8")
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
