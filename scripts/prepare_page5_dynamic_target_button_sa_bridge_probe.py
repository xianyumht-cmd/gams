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
            "scripts/prepare_page5_dynamic_target_button_bridge_probe.py",
            "--output",
            args.output,
        ],
        check=True,
    )
    output = Path(args.output)
    text = output.read_text(encoding="utf-8")

    old = "arguments.length===0||(SA&&SA['is'+'Op'+'en'+'Th'+'eM'+'al'+'l'])"
    new = "SA===void 0||(SA&&SA['is'+'Op'+'en'+'Th'+'eM'+'al'+'l'])"
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"menu callback parameter marker mismatch: {count}")
    text = text.replace(old, new, 1)

    old_mode = 'mode: "page5-dynamic-target-button-empty-callback-bridge-probe"'
    mode_count = text.count(old_mode)
    if mode_count != 1:
        raise SystemExit(f"target-button mode marker mismatch: {mode_count}")
    text = text.replace(
        old_mode,
        'mode: "page5-dynamic-target-button-missing-state-bridge-probe"',
        1,
    )

    output.write_text(text, encoding="utf-8")
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
