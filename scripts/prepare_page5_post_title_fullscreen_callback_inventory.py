#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label} marker mismatch: {count}")
    return text.replace(old, new, 1)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--source",
        default="scripts/run_page5_side_button_callback_inventory.mjs",
    )
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    text = Path(args.source).read_text(encoding="utf-8")

    text = replace_once(
        text,
        'const outputDir = process.env.OUTPUT_DIR || "page5-side-button-callback-inventory";',
        'const outputDir = process.env.OUTPUT_DIR || "page5-post-title-fullscreen-callback-inventory";',
        "output",
    )
    text = replace_once(
        text,
        'const triggerPoint = { nx: 1221 / 1280, ny: 72 / 720 };\nconst nodeIndexes = [8, 9, 10];',
        '''const coverCenterPoint = { nx: 640 / 1280, ny: 360 / 720 };
const coverPromptPoint = { nx: 650 / 1280, ny: 630 / 720 };
const triggerPoint = coverCenterPoint;
const nodeIndexes = [1];''',
        "points and node index",
    )
    text = replace_once(
        text,
        'mode: "page5-side-button-callback-inventory-read-only"',
        'mode: "page5-post-title-fullscreen-callback-inventory-read-only"',
        "mode",
    )

    page_marker = "  const page = await context.newPage();"
    page_replacement = '''  await context.addInitScript({ content: `
    (() => {
      const state = globalThis.__gamsNavigationGuard = globalThis.__gamsNavigationGuard || { supported: false, blocked: [], allowed: [] };
      try {
        if (globalThis.navigation && typeof globalThis.navigation.addEventListener === 'function') {
          state.supported = true;
          globalThis.navigation.addEventListener('navigate', (event) => {
            try {
              const url = new URL(event.destination.url, location.href);
              if (url.protocol !== 'http:' && url.protocol !== 'https:') {
                state.blocked.push({ url: url.protocol + '//' + url.host + url.pathname, at: Date.now() });
                if (event.cancelable) event.preventDefault();
                return;
              }
              state.allowed.push({ url: url.protocol + '//' + url.host + url.pathname, at: Date.now() });
            } catch (error) {
              state.blocked.push({ url: String(event.destination?.url || '').slice(0, 300), at: Date.now() });
              if (event.cancelable) event.preventDefault();
            }
          });
        }
      } catch (error) {
        state.error = String(error).slice(0, 300);
      }
    })();
  ` });

  const page = await context.newPage();'''
    text = replace_once(text, page_marker, page_replacement, "navigation guard")

    geometry_marker = '''  report.geometry = await canvasGeometry(page);
  if (!report.geometry) throw new Error("canvas geometry unavailable");
  report.triggerCssPoint = toCss(report.geometry, triggerPoint);
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
  report.triggerCssPoint = toCss(report.geometry, triggerPoint);
'''
    text = replace_once(text, geometry_marker, geometry_replacement, "pre-steps")

    gate_pattern = re.compile(
        r'''  const available = Array\.isArray\(report\.inventory\).*?\n  report\.pass = report\.pauseCaptured === true\n    && available === nodeIndexes\.length\n    && clickNodes === nodeIndexes\.length\n    && report\.mainFrameValid\n    && pageErrors\.length === 0\n    && blockedOrders\.length === 0\n    && debuggerErrors\.length === 0;''',
        re.S,
    )
    gate_replacement = '''  const available = Array.isArray(report.inventory) ? report.inventory.filter((item) => item?.available).length : 0;
  const downNodes = Array.isArray(report.inventory)
    ? report.inventory.filter((item) => Array.isArray(item?.events?.["mouse down"]) && item.events["mouse down"].length > 0).length
    : 0;
  const upNodes = Array.isArray(report.inventory)
    ? report.inventory.filter((item) => Array.isArray(item?.events?.["mouse up"]) && item.events["mouse up"].length > 0).length
    : 0;
  report.pass = report.pauseCaptured === true
    && available === nodeIndexes.length
    && downNodes === nodeIndexes.length
    && upNodes === nodeIndexes.length
    && report.mainFrameValid
    && pageErrors.length === 0
    && blockedOrders.length === 0
    && debuggerErrors.length === 0;'''
    text, count = gate_pattern.subn(gate_replacement, text, count=1)
    if count != 1:
        raise SystemExit(f"gate block mismatch: {count}")

    console_pattern = re.compile(
        r'''  inventoryCount: Array\.isArray\(report\.inventory\) \? report\.inventory\.length : 0,\n  clickNodeCount: Array\.isArray\(report\.inventory\)\n    \? report\.inventory\.filter\(\(item\) => Array\.isArray\(item\?\.events\?\.\["mouse click"\]\) && item\.events\["mouse click"\]\.length > 0\)\.length\n    : 0,''',
        re.S,
    )
    console_replacement = '''  inventoryCount: Array.isArray(report.inventory) ? report.inventory.length : 0,
  mouseDownNodeCount: Array.isArray(report.inventory)
    ? report.inventory.filter((item) => Array.isArray(item?.events?.["mouse down"]) && item.events["mouse down"].length > 0).length
    : 0,
  mouseUpNodeCount: Array.isArray(report.inventory)
    ? report.inventory.filter((item) => Array.isArray(item?.events?.["mouse up"]) && item.events["mouse up"].length > 0).length
    : 0,'''
    text, count = console_pattern.subn(console_replacement, text, count=1)
    if count != 1:
        raise SystemExit(f"console block mismatch: {count}")

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(text, encoding="utf-8")
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
