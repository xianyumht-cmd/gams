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
            "scripts/prepare_page5_direct_node_sequence_bridge_probe.py",
            "--output",
            args.output,
        ],
        check=True,
    )
    output = Path(args.output)
    text = output.read_text(encoding="utf-8")

    old_trigger = '''    result.directNodeTrigger = await page.evaluate(() => {
      const engine = globalThis.__gamsDirectCanvasEngine;
      const node = engine?._elementList?.[9];
      const invoke = (eventName) => {
        const entry = node?.eventListenerMap?.[eventName]?.[0];
        if (!entry || typeof entry.listener !== "function") {
          return { eventName, ok: false, reason: "entry unavailable" };
        }
        try {
          const args = Object.prototype.hasOwnProperty.call(entry, "param") ? [entry.param] : [];
          const value = Reflect.apply(entry.listener, entry.caller, args);
          return {
            eventName,
            ok: true,
            argumentCount: args.length,
            callerType: entry.caller === null ? "null" : typeof entry.caller,
            returnType: value === null ? "null" : typeof value,
          };
        } catch (error) {
          return { eventName, ok: false, reason: String(error?.stack || error).slice(0, 1600) };
        }
      };
      const steps = [invoke("mouse down"), invoke("mouse up"), invoke("mouse click")];
      return { ok: steps.every((item) => item.ok), sequence: "mouse down -> mouse up -> mouse click", steps };
    });
    events.push({ at: Date.now(), type: "direct-node-sequence", nodeIndex: 9, result: result.directNodeTrigger });'''
    new_trigger = '''    result.directNodeTrigger = await page.evaluate(() => {
      const engine = globalThis.__gamsDirectCanvasEngine;
      const node = engine?._elementList?.[9];
      const logicalRoot = engine?._elementList?.find?.((item) => item && item.width >= 1000 && item.height >= 600);
      const canvas = document.querySelector("canvas#canvas") || document.querySelector("canvas");
      if (!engine || !node || !canvas) return { ok: false, reason: "engine, node, or canvas unavailable" };
      const rect = canvas.getBoundingClientRect();
      const logicalWidth = Number(logicalRoot?.width || 1280);
      const logicalHeight = Number(logicalRoot?.height || 720);
      if (!(logicalWidth > 0 && logicalHeight > 0 && canvas.width > 0 && canvas.height > 0 && rect.width > 0 && rect.height > 0)) {
        return { ok: false, reason: "invalid logical or canvas geometry" };
      }
      const nativeCenter = { x: node.x + node.width / 2, y: node.y + node.height / 2 };
      const dimensionsSwapped = Math.abs(canvas.width - logicalHeight) < 2 && Math.abs(canvas.height - logicalWidth) < 2;
      let cssPoint;
      let transform;
      if (dimensionsSwapped) {
        cssPoint = {
          x: rect.x + (logicalHeight - nativeCenter.y) / logicalHeight * rect.width,
          y: rect.y + nativeCenter.x / logicalWidth * rect.height,
        };
        transform = "logical-landscape-to-css-portrait-ccw";
      } else {
        cssPoint = {
          x: rect.x + nativeCenter.x / logicalWidth * rect.width,
          y: rect.y + nativeCenter.y / logicalHeight * rect.height,
        };
        transform = "logical-direct";
      }
      const insideViewport = cssPoint.x >= 0 && cssPoint.x <= innerWidth && cssPoint.y >= 0 && cssPoint.y <= innerHeight;
      return {
        ok: Number.isFinite(cssPoint.x) && Number.isFinite(cssPoint.y) && insideViewport,
        mode: "dynamic-rotated-real-touch",
        transform,
        dimensionsSwapped,
        logical: { width: logicalWidth, height: logicalHeight },
        nativeCenter,
        cssPoint,
        insideViewport,
        canvas: { width: canvas.width, height: canvas.height },
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
      };
    });
    if (!result.directNodeTrigger?.ok) throw new Error(`dynamic target point failed: ${JSON.stringify(result.directNodeTrigger)}`);
    await page.touchscreen.tap(result.directNodeTrigger.cssPoint.x, result.directNodeTrigger.cssPoint.y);
    events.push({ at: Date.now(), type: "dynamic-rotated-real-node-touch", nodeIndex: 9, result: result.directNodeTrigger });'''
    text = replace_once(text, old_trigger, new_trigger, "dynamic target trigger")
    text = text.replace(
        'mode: "page5-direct-node-sequence-empty-callback-bridge-probe"',
        'mode: "page5-dynamic-node-touch-empty-callback-bridge-probe"',
        1,
    )

    output.write_text(text, encoding="utf-8")
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
