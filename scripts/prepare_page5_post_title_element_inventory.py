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
    parser.add_argument("--source", default="scripts/run_page5_canvas_element_list_probe.mjs")
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    text = Path(args.source).read_text(encoding="utf-8")

    text = replace_once(
        text,
        'const outputDir = process.env.OUTPUT_DIR || "page5-canvas-element-list-probe";',
        'const outputDir = process.env.OUTPUT_DIR || "page5-post-title-element-inventory";',
        "output",
    )
    text = replace_once(
        text,
        'const menuPoint = { nx: 1227 / 1280, ny: 115 / 720 };',
        '''const coverCenterPoint = { nx: 640 / 1280, ny: 360 / 720 };
const coverPromptPoint = { nx: 650 / 1280, ny: 630 / 720 };
const probePoint = coverCenterPoint;''',
        "points",
    )
    text = text.replace("menuPoint", "probePoint")
    text = replace_once(
        text,
        'mode: "page5-canvas-element-list-read-only-probe"',
        'mode: "page5-post-title-element-list-read-only-probe"',
        "mode",
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
    text = replace_once(
        text,
        '  report.screenshots.beforeMenu = await capture(page, "before-menu");\n  await page.touchscreen.tap(report.menuCssPoint.x, report.menuCssPoint.y);',
        '  report.screenshots.beforeProbe = await capture(page, "before-probe");\n  await page.touchscreen.tap(report.probeCssPoint.x, report.probeCssPoint.y);',
        "probe tap",
    )
    text = replace_once(
        text,
        '  report.screenshots.afterMenu = await capture(page, "after-menu");\n  report.menuScreenshotChanged = report.screenshots.beforeMenu !== report.screenshots.afterMenu;',
        '  report.screenshots.afterProbe = await capture(page, "after-probe");\n  report.probeScreenshotChanged = report.screenshots.beforeProbe !== report.screenshots.afterProbe;',
        "probe screenshots",
    )
    text = text.replace("report.menuScreenshotChanged", "report.probeScreenshotChanged")
    text = text.replace("menuScreenshotChanged:", "probeScreenshotChanged:")

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(text, encoding="utf-8")
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
