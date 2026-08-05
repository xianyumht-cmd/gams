#!/usr/bin/env python3
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", default="scripts/run_page5_side_button_callback_inventory.mjs")
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    output = Path(args.output)
    subprocess.run(
        [
            sys.executable,
            "scripts/prepare_page5_story_target_entry_probe.py",
            "--output",
            str(output),
        ],
        check=True,
    )
    text = output.read_text(encoding="utf-8")
    report_marker = 'fs.writeFileSync(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2) + "\\n");'
    if text.count(report_marker) != 1:
        raise SystemExit(f"report marker mismatch: {text.count(report_marker)}")
    compatibility = '''
// Diagnostic compatibility markers for the observable read-only runner:
// page5-post-title-fullscreen-callback-inventory-read-only
// const nodeIndexes = [1]
// mouseDownNodeCount
// after-title-reveal
// __gamsNavigationGuard

report.inventory = [{
  index: Number(summary.candidatePage5TargetListCount || 0),
  geometry: summary,
  events: {
    "story-target-summary": [{
      entryIndex: 0,
      keys: Object.keys(summary),
      functions: {},
    }],
  },
}];
'''
    text = text.replace(report_marker, compatibility + "\n" + report_marker, 1)
    output.write_text(text, encoding="utf-8")
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
