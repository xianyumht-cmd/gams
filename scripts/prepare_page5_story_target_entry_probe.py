#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
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
    parser.add_argument("--source", default="scripts/run_page5_guard_full_entry_matrix.mjs")
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    output = Path(args.output)
    subprocess.run(
        [
            sys.executable,
            "scripts/prepare_page5_scoped_mobile_contract_matrix.py",
            "--source",
            args.source,
            "--output",
            str(output),
        ],
        check=True,
    )
    text = output.read_text(encoding="utf-8")
    text = replace_once(
        text,
        'const outputDir = process.env.OUTPUT_DIR || "page5-scoped-mobile-contract-matrix";',
        'const outputDir = process.env.OUTPUT_DIR || "page5-story-target-entry-probe";',
        "output",
    )

    route_block = '''const routes = [
  {
    page: "page5",
    targetId: "1691512",
    url: "https://m.66rpg.com/h5/1691512?ohp=v3&quality=32",
    steps: [
      { label: "cover-progress", x: 195, y: 422 },
      { label: "title-reveal", x: 50, y: 420 },
      {
        label: "story-entry",
        x: 195,
        y: 422,
        followupTap: { x: 228, y: 418, delayMs: 800 },
      },
      { label: "target-side-entry", x: 258, y: 732 },
    ],
    marker: "target-read",
  },
];'''
    text, count = re.subn(r"const routes = \[.*?\n\];", route_block, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"route block mismatch: {count}")

    event_marker = "      events.push({ at: Date.now(), type: \"route-tap\", stepIndex, ...step });\n"
    event_replacement = event_marker + '''      if (step.followupTap) {
        await page.waitForTimeout(Number(step.followupTap.delayMs || 0));
        await page.touchscreen.tap(step.followupTap.x, step.followupTap.y);
        events.push({
          at: Date.now(),
          type: "route-followup-tap",
          stepIndex,
          label: `${step.label}-followup`,
          x: step.followupTap.x,
          y: step.followupTap.y,
          delayMs: Number(step.followupTap.delayMs || 0),
        });
      }
'''
    text = replace_once(text, event_marker, event_replacement, "follow-up tap")

    wait_old = "      await page.waitForTimeout(isFinal ? 10000 : 5000);"
    wait_new = '''      const stepWaitMs = step.label === "story-entry"
        ? 30000
        : (isFinal ? 15000 : 7000);
      await page.waitForTimeout(stepWaitMs);'''
    text = replace_once(text, wait_old, wait_new, "step wait")

    text = replace_once(
        text,
        'mode: "page5-scoped-mobile-contract-full-entry-matrix"',
        'mode: "page5-story-target-entry-probe"',
        "mode",
    )

    pass_pattern = re.compile(
        r"report\.pass = .*?\n  && summary\.replacementCount === 1;",
        re.S,
    )
    pass_block = '''report.pass = summary.totalCases === 2
  && summary.fatalCases === 0
  && summary.runtimeEntryCompleteCases === 2
  && summary.noLoginEnabledCases === 2
  && summary.secondFileLoadCases === 2
  && summary.candidatePage5PageErrorCount === 0
  && summary.candidatePage5TargetReadCount > 0
  && summary.candidatePage5TargetListCount > 0
  && summary.blockedOrderCases === 0
  && summary.replacementCount === 1;'''
    text, count = pass_pattern.subn(pass_block, text, count=1)
    if count != 1:
        raise SystemExit(f"pass gate mismatch: {count}")

    output.write_text(text, encoding="utf-8")
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
