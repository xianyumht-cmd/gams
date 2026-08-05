#!/usr/bin/env python3
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


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
            "scripts/prepare_page5_stable_target_button_bridge_diagnostic.py",
            "--output",
            args.output,
        ],
        check=True,
    )
    output = Path(args.output)
    text = output.read_text(encoding="utf-8")

    old_condition = "tE['ge'+'tI'+'ns'+'ta'+'nc'+'e']()['is'+'Mo'+'bi'+'le']()&&(SA===void 0||(SA&&SA['is'+'Op'+'en'+'Th'+'eM'+'al'+'l']))&&(globalThis.__gamsTargetBridgeDiag.openSceneCalls++"
    new_condition = "(tE['ge'+'tI'+'ns'+'ta'+'nc'+'e']()['is'+'Mo'+'bi'+'le']()||typeof SCGMenu==='undefined')&&(SA===void 0||(SA&&SA['is'+'Op'+'en'+'Th'+'eM'+'al'+'l']))&&(globalThis.__gamsTargetBridgeDiag.openSceneCalls++"
    text = replace_once(text, old_condition, new_condition, "page-scoped mobile fallback")

    text = replace_once(
        text,
        'mode: "page5-stable-target-button-bridge-diagnostic"',
        'mode: "page5-missing-constructor-mobile-bridge-probe"',
        "mode",
    )

    output.write_text(text, encoding="utf-8")
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
