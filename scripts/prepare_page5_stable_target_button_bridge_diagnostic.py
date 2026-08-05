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
            "scripts/prepare_page5_dynamic_target_button_sa_bridge_probe.py",
            "--output",
            args.output,
        ],
        check=True,
    )
    output = Path(args.output)
    text = output.read_text(encoding="utf-8")

    old_callback = "const callbackNew = \"tE['ge'+'tI'+'ns'+'ta'+'nc'+'e']()['is'+'Mo'+'bi'+'le']()&&(SA===void 0||(SA&&SA['is'+'Op'+'en'+'Th'+'eM'+'al'+'l']))&&tT['op'+'en'+'UI'+'Sc'+'en'+'e'](-3852+5642+10*822);\";"
    new_callback = "const callbackNew = \"(globalThis.__gamsTargetBridgeDiag=globalThis.__gamsTargetBridgeDiag||{innerCalls:0,missingStateHits:0,openSceneCalls:0},globalThis.__gamsTargetBridgeDiag.innerCalls++,SA===void 0&&globalThis.__gamsTargetBridgeDiag.missingStateHits++,tE['ge'+'tI'+'ns'+'ta'+'nc'+'e']()['is'+'Mo'+'bi'+'le']()&&(SA===void 0||(SA&&SA['is'+'Op'+'en'+'Th'+'eM'+'al'+'l']))&&(globalThis.__gamsTargetBridgeDiag.openSceneCalls++,tT['op'+'en'+'UI'+'Sc'+'en'+'e'](-3852+5642+10*822)));\";"
    text = replace_once(text, old_callback, new_callback, "diagnostic callback")

    text = replace_once(
        text,
        "    await page.waitForTimeout(1500);",
        '''    await page.waitForTimeout(22000);
    await stage("before-stable-dynamic-target-touch");''',
        "stable pre-touch wait",
    )
    text = replace_once(
        text,
        "    await page.waitForTimeout(15000);",
        "    await page.waitForTimeout(25000);",
        "post-touch wait",
    )

    result_marker = '''    result.targetScreenChanged = result.screenshots["runtime-final-close"] !== result.screenshots["after-direct-target-entry"];
    result.targetWindow = requestWindow(requests, result.targetWindowStartIndex);'''
    result_replacement = '''    result.targetScreenChanged = result.screenshots["before-stable-dynamic-target-touch"] !== result.screenshots["after-direct-target-entry"];
    result.targetWindow = requestWindow(requests, result.targetWindowStartIndex);
    result.targetBridgeDiagnostic = await page.evaluate(() => globalThis.__gamsTargetBridgeDiag || null).catch(() => null);'''
    text = replace_once(text, result_marker, result_replacement, "diagnostic result")

    old_mode = 'mode: "page5-dynamic-target-button-missing-state-bridge-probe"'
    text = replace_once(
        text,
        old_mode,
        'mode: "page5-stable-target-button-bridge-diagnostic"',
        "diagnostic mode",
    )

    output.write_text(text, encoding="utf-8")
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
