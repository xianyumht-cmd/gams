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
            "scripts/prepare_page5_repeat_purchase_action_probe.py",
            "--output",
            args.output,
        ],
        check=True,
    )

    output = Path(args.output)
    text = output.read_text(encoding="utf-8")

    old_sequence = '''      result.purchaseProbe.resultConfirmations.push(await closePurchaseResult("first-result-confirm"));
      await purchaseFromVisibleList("second");
      result.purchaseProbe.resultConfirmations.push(await closePurchaseResult("second-result-confirm"));'''

    new_sequence = '''      result.purchaseProbe.resultConfirmations.push(await closePurchaseResult("first-result-confirm"));

      result.purchaseProbe.shopLifecycle = [];
      const shopReturnPoint = { x: 35, y: 423, label: "shop-page-return" };
      const beforeShopReturnHash = await capture(page, path.join(outputDir, `${prefix}-before-shop-page-return.png`));
      await page.touchscreen.tap(shopReturnPoint.x, shopReturnPoint.y);
      events.push({ at: Date.now(), type: "shop-page-return-touch", ...shopReturnPoint });
      await page.waitForTimeout(12000);
      await stage("after-shop-page-return");
      result.purchaseProbe.shopLifecycle.push({
        label: "shop-page-return",
        point: shopReturnPoint,
        screenChanged: beforeShopReturnHash !== result.screenshots["after-shop-page-return"],
        url: safeUrl(page.url()),
      });

      const secondListOpen = await openTarget("second-list-open-after-shop-return");
      result.purchaseProbe.shopLifecycle.push({
        label: "second-list-open-after-shop-return",
        screenChanged: Boolean(secondListOpen?.screenChanged),
        targetReadCount: Number(secondListOpen?.targetWindow?.targetReadCount || 0),
        targetListCount: Number(secondListOpen?.targetWindow?.targetListCount || 0),
        url: secondListOpen?.url || safeUrl(page.url()),
      });

      await purchaseFromVisibleList("second-after-shop-return");
      result.purchaseProbe.resultConfirmations.push(await closePurchaseResult("second-after-shop-return-result-confirm"));'''
    text = replace_once(text, old_sequence, new_sequence, "shop close and reopen sequence")

    text = replace_once(
        text,
        "  && summary.listOpenCount === 2",
        "  && summary.listOpenCount === 3",
        "list open gate",
    )
    text = replace_once(
        text,
        'mode: "persisted-runtime-page5-first-second-reentry-third-purchase-probe"',
        'mode: "persisted-runtime-page5-shop-close-reopen-purchase-probe"',
        "mode",
    )

    output.write_text(text, encoding="utf-8")
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
