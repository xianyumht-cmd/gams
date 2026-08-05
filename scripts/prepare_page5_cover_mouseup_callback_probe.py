#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label} marker mismatch: {count}")
    return text.replace(old, new, 1)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", default="scripts/run_page5_menu_callback_scope_probe.mjs")
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    text = Path(args.source).read_text(encoding="utf-8")

    text = replace_once(
        text,
        'const outputDir = process.env.OUTPUT_DIR || "page5-menu-callback-scope-probe";',
        'const outputDir = process.env.OUTPUT_DIR || "page5-cover-mouseup-callback-probe";',
        "output",
    )
    text = replace_once(
        text,
        'const menuPoint = { nx: 1227 / 1280, ny: 115 / 720 };\nconst selectedNodeIndex = 8;',
        '''const coverCenterPoint = { nx: 640 / 1280, ny: 360 / 720 };
const coverPromptPoint = { nx: 650 / 1280, ny: 630 / 720 };
const probePoint = coverCenterPoint;
const selectedNodeIndex = 1;''',
        "points and node",
    )
    text = text.replace("menuPoint", "probePoint")
    text = replace_once(
        text,
        'mode: "page5-menu-callback-scope-read-only-probe"',
        'mode: "page5-cover-mouseup-callback-scope-read-only-probe"',
        "mode",
    )
    text = replace_once(
        text,
        "const expression = `this._elementList[${selectedNodeIndex}].eventListenerMap['mouse click'][0].listener`;",
        "const expression = `this._elementList[${selectedNodeIndex}].eventListenerMap['mouse up'][0].listener`;",
        "callback expression",
    )
    text = replace_once(
        text,
        'if (!evaluated.result?.objectId) throw new Error("menu callback function unavailable");',
        'if (!evaluated.result?.objectId) throw new Error("cover mouse-up callback function unavailable");',
        "callback error",
    )
    text = replace_once(
        text,
        'expressionLabel: "selected-node mouse-click listener",',
        'expressionLabel: "post-title full-screen mouse-up listener",',
        "callback label",
    )

    geometry_marker = '''  report.geometry = await canvasGeometry(page);
  if (!report.geometry) throw new Error("canvas geometry unavailable");
  report.menuCssPoint = toCss(report.geometry, probePoint);
'''
    geometry_replacement = '''  report.geometry = await canvasGeometry(page);
  if (!report.geometry) throw new Error("canvas geometry unavailable");
  report.preStepCssPoints = {
    coverCenter: toCss(report.geometry, coverCenterPoint),
    coverPrompt: toCss(report.geometry, coverPromptPoint),
  };
  report.screenshots.beforeCoverProgress = await capture(page, "before-cover-progress");
  await page.touchscreen.tap(report.preStepCssPoints.coverCenter.x, report.preStepCssPoints.coverCenter.y);
  await page.waitForTimeout(7000);
  report.screenshots.afterCoverProgress = await capture(page, "after-cover-progress");
  await page.touchscreen.tap(report.preStepCssPoints.coverPrompt.x, report.preStepCssPoints.coverPrompt.y);
  await page.waitForTimeout(7000);
  report.screenshots.afterTitleReveal = await capture(page, "after-title-reveal");
  report.probeCssPoint = toCss(report.geometry, probePoint);
'''
    text = replace_once(text, geometry_marker, geometry_replacement, "geometry pre-steps")
    text = text.replace("report.menuCssPoint", "report.probeCssPoint")
    text = text.replace('"before-menu"', '"before-cover-mouseup"')
    text = text.replace('"after-menu"', '"after-cover-mouseup"')
    text = text.replace("menuScreenshotChanged", "coverScreenshotChanged")

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(text, encoding="utf-8")
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
