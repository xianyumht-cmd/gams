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
    parser.add_argument("--source", default="scripts/run_page5_candidate_mouseup_state_probe.mjs")
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    output = Path(args.output)
    subprocess.run(
        [
            sys.executable,
            "scripts/prepare_page5_candidate_cover_listener_probe.py",
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
        'const outputDir = process.env.OUTPUT_DIR || "page5-candidate-cover-listener-probe";',
        'const outputDir = process.env.OUTPUT_DIR || "page5-candidate-post-title-inventory";',
        "output",
    )
    text = replace_once(
        text,
        'mode: "page5-candidate-cover-listener-read-only-probe"',
        'mode: "page5-candidate-post-title-element-list-read-only-probe"',
        "mode",
    )

    handler_pattern = re.compile(
        r"  let resolveListener;.*?\n\n  const response = await page\.goto",
        re.S,
    )
    handler_block = r'''  let resolveInventory;
  const inventoryReady = new Promise((resolve) => { resolveInventory = resolve; });
  let inventoryCaptured = false;
  cdp.on("Debugger.paused", async (event) => {
    if (inventoryCaptured) {
      try { await cdp.send("Debugger.resume"); } catch {}
      return;
    }
    try {
      const frame = event.callFrames?.[0];
      if (!frame) throw new Error("pause without call frame");
      const serialized = await cdp.send("Runtime.callFunctionOn", {
        objectId: frame.this.objectId,
        functionDeclaration: `function() {
          const list = Array.isArray(this._elementList) ? this._elementList : [];
          const primitive = (value) => {
            if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
            if (typeof value === 'string') return { type: 'string', length: value.length };
            if (typeof value === 'function') return { type: 'function', name: value.name || '', sourceLength: (() => { try { return Function.prototype.toString.call(value).length; } catch { return null; } })() };
            return undefined;
          };
          const describeNested = (value, depth = 1) => {
            if (!value || (typeof value !== 'object' && typeof value !== 'function')) return null;
            const result = { constructorName: '', ownKeys: [], primitives: {} };
            try { result.constructorName = value.constructor && value.constructor.name || ''; } catch {}
            let descriptors = {};
            try { descriptors = Object.getOwnPropertyDescriptors(value); } catch { return result; }
            result.ownKeys = Object.keys(descriptors).slice(0, 180);
            for (const [key, descriptor] of Object.entries(descriptors).slice(0, 180)) {
              if (!('value' in descriptor)) continue;
              const direct = primitive(descriptor.value);
              if (direct !== undefined) result.primitives[key] = direct;
              if (depth > 0 && descriptor.value && typeof descriptor.value === 'object') {
                const lower = key.toLowerCase();
                if (lower.includes('event') || lower.includes('listener') || lower.includes('click') || lower.includes('touch') || lower.includes('mouse') || lower.includes('children')) {
                  result[key] = describeNested(descriptor.value, depth - 1);
                } else if (Array.isArray(descriptor.value)) {
                  result[key] = { type: 'array', length: descriptor.value.length };
                }
              }
            }
            return result;
          };
          return {
            length: list.length,
            items: list.slice(0, 600).map((element, index) => ({ index, ...(describeNested(element, 2) || {}) })),
            viewWidth: this.viewWidth,
            viewHeight: this.viewHeight,
            left: this._left,
            top: this._top,
            deviceRatio: this._deviceRatio,
            objectKeys: Object.getOwnPropertyNames(this).slice(0, 220),
          };
        }`,
        returnByValue: true,
        awaitPromise: false,
        silent: true,
      });
      report.canvasPause = {
        reason: event.reason,
        hitBreakpoints: event.hitBreakpoints || [],
        functionName: frame.functionName || "",
        location: frame.location,
      };
      report.elementList = serialized.result?.value || null;
      if (serialized.exceptionDetails) {
        report.serializationException = {
          text: serialized.exceptionDetails.text || "",
          description: String(serialized.exceptionDetails.exception?.description || "").slice(0, 1000),
        };
      }
      inventoryCaptured = true;
      await cdp.send("Debugger.resume");
      resolveInventory(true);
    } catch (error) {
      debuggerErrors.push(String(error?.stack || error).slice(0, 3000));
      try { await cdp.send("Debugger.resume"); } catch {}
      resolveInventory(false);
    }
  });

  const response = await page.goto'''
    text, count = handler_pattern.subn(lambda _: handler_block, text, count=1)
    if count != 1:
        raise SystemExit(f"inventory handler mismatch: {count}")

    text = replace_once(
        text,
        "  await Promise.race([listenerReady, new Promise((resolve) => setTimeout(() => resolve(false), 15000))]);",
        "  await Promise.race([inventoryReady, new Promise((resolve) => setTimeout(() => resolve(false), 15000))]);",
        "inventory wait",
    )
    pass_pattern = re.compile(
        r"  report\.pass = listenerCaptured.*?\n    && debuggerErrors\.length === 0;",
        re.S,
    )
    pass_block = '''  report.pass = inventoryCaptured
    && Number(report.elementList?.length || 0) > 0
    && report.mainFrameValid
    && pageErrors.length === 0
    && blockedOrders.length === 0
    && debuggerErrors.length === 0;'''
    text, count = pass_pattern.subn(pass_block, text, count=1)
    if count != 1:
        raise SystemExit(f"inventory pass gate mismatch: {count}")
    text = re.sub(
        r'console\.log\(JSON\.stringify\(\{.*?\}, null, 2\)\);',
        '''console.log(JSON.stringify({
  pass: report.pass,
  inventoryCaptured: Boolean(report.elementList),
  elementListLength: report.elementList?.length || 0,
  viewWidth: report.elementList?.viewWidth || null,
  viewHeight: report.elementList?.viewHeight || null,
  pageErrorCount: pageErrors.length,
  blockedOrderCount: blockedOrders.length,
  debuggerErrorCount: debuggerErrors.length,
}, null, 2));''',
        text,
        count=1,
        flags=re.S,
    )

    output.write_text(text, encoding="utf-8")
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
