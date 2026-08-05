#!/usr/bin/env python3
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

OLD_SHA256 = "9a5f9573077eaedada060ed4aeb3ea4307222ca29d4f10fd05fdb922d52d8fca"
CURRENT_SHA256 = "57765fbb8d9a0529ed1463623f1bed9c05052e76396a6aaa89fdd2ecc673bc72"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label} marker mismatch: {count}")
    return text.replace(old, new, 1)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    subprocess.run(
        [
            sys.executable,
            "scripts/prepare_page5_purchase_action_probe.py",
            "--output",
            args.output,
        ],
        check=True,
    )

    output = Path(args.output)
    text = output.read_text(encoding="utf-8")
    text = replace_once(text, OLD_SHA256, CURRENT_SHA256, "generated persisted hash")
    if text.count(CURRENT_SHA256) != 1:
        raise SystemExit(f"current guarded runtime hash count mismatch: {text.count(CURRENT_SHA256)}")
    text = replace_once(
        text,
        "report.pass = report.safeProbeCompleted;",
        "report.pass = report.safeProbeCompleted && summary.candidatePageErrorCount === 0 && report.purchaseActionReached && report.purchaseResultObserved;",
        "strict guarded final gate",
    )
    output.write_text(text, encoding="utf-8")
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
