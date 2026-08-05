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
            "scripts/prepare_page5_dynamic_node_tap_bridge_probe.py",
            "--output",
            args.output,
        ],
        check=True,
    )
    output = Path(args.output)
    text = output.read_text(encoding="utf-8")

    node_expr = "engine?._elementList?.[9]"
    node_count = text.count(node_expr)
    if node_count != 2:
        raise SystemExit(f"dynamic node expression mismatch: {node_count}")
    text = text.replace(node_expr, "engine?._elementList?.[10]")

    event_marker = 'nodeIndex: 9, result: result.directNodeTrigger'
    event_count = text.count(event_marker)
    if event_count != 1:
        raise SystemExit(f"dynamic event node marker mismatch: {event_count}")
    text = text.replace(event_marker, 'nodeIndex: 10, result: result.directNodeTrigger', 1)

    old_mode = 'mode: "page5-dynamic-node-touch-empty-callback-bridge-probe"'
    mode_count = text.count(old_mode)
    if mode_count != 1:
        raise SystemExit(f"dynamic mode marker mismatch: {mode_count}")
    text = text.replace(
        old_mode,
        'mode: "page5-dynamic-target-button-empty-callback-bridge-probe"',
        1,
    )

    output.write_text(text, encoding="utf-8")
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
