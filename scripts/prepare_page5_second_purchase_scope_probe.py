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
        [sys.executable, "scripts/prepare_page5_repeat_purchase_action_probe.py", "--output", args.output],
        check=True,
    )

    output = Path(args.output)
    text = output.read_text(encoding="utf-8")

    anchor = "  const loginInitiators = [];"
    instrumentation = r'''  const loginInitiators = [];
  const purchaseScopeSnapshots = [];
  const purchaseScopeBreakpoints = [];
  const purchaseScopeBreakpointById = new Map();
  const purchaseScopeRuntimeScripts = [];
  const purchaseScopeOffsets = [
    { label: "click-confirm-before-router", columnNumber: 2046389 },
    { label: "click-confirm-after-router", columnNumber: 2058919 },
    { label: "purchase-router", columnNumber: 1935617 },
    { label: "login-entry", columnNumber: 3522415 },
  ];
  let resolvePurchaseRuntimeScript;
  const purchaseRuntimeScriptReady = new Promise((resolve) => { resolvePurchaseRuntimeScript = resolve; });

  purchaseTraceCdp.on("Debugger.scriptParsed", (event) => {
    const url = String(event.url || "");
    const lower = url.toLowerCase();
    if (lower === virtualSecondUrl.toLowerCase() || lower.includes("ggv2.local/runtime/game.js")) {
      const item = {
        scriptId: String(event.scriptId || ""),
        url,
        startLine: event.startLine,
        startColumn: event.startColumn,
        endLine: event.endLine,
        endColumn: event.endColumn,
      };
      purchaseScopeRuntimeScripts.push(item);
      if (item.scriptId) resolvePurchaseRuntimeScript(item);
    }
  });

  const purchaseScopeExpression = `
    (function(){
      const scalar = (value) => {
        const type = typeof value;
        if (value === null || type === 'number' || type === 'boolean') return value;
        if (type === 'string') return value.slice(0, 120);
        if (type === 'undefined') return null;
        return '[' + type + ']';
      };
      const read = (reader) => { try { return scalar(reader()); } catch (error) { return null; } };
      const record = {
        stage: read(() => globalThis.__gamsPurchaseAttemptStage),
        NO: read(() => typeof NO === 'undefined' ? undefined : NO),
        g4: read(() => typeof g4 === 'undefined' ? undefined : g4),
        SH: read(() => typeof SH === 'undefined' ? undefined : SH),
        buyNumber: read(() => this && this['bu'+'yN'+'um'+'be'+'r']),
        itemType: read(() => this && this['it'+'em'+'Da'+'ta'] && this['it'+'em'+'Da'+'ta']['it'+'em'+'Ty'+'pe']),
        itemPrice: read(() => this && this['it'+'em'+'Pr'+'ic'+'e']),
        userIsLogin: read(() => tE['ge'+'tI'+'ns'+'ta'+'nc'+'e']()['us'+'er'+'Da'+'ta']['is'+'Lo'+'gi'+'n']),
        Sf: null,
      };
      try {
        if (typeof Sf !== 'undefined' && Sf !== null) {
          record.Sf = {
            type: typeof Sf,
            count: read(() => Sf['co'+'un'+'t']),
            max: read(() => Sf['ma'+'x']),
            isRepeat: read(() => Sf['is'+'Re'+'pe'+'at']),
            itemDiscount: read(() => Sf['it'+'em'+'Di'+'sc'+'ou'+'nt']),
          };
        }
      } catch (error) {
        record.Sf = { error: String(error).slice(0, 160) };
      }
      return record;
    }).call(this)
  `;

  const bindPurchaseScopeBreakpoints = async () => {
    if (purchaseScopeBreakpoints.length) return;
    const runtimeScript = await Promise.race([
      purchaseRuntimeScriptReady,
      new Promise((resolve) => setTimeout(() => resolve(null), 15000)),
    ]);
    if (!runtimeScript?.scriptId) throw new Error("purchase runtime script id unavailable");
    for (const target of purchaseScopeOffsets) {
      try {
        const response = await purchaseTraceCdp.send("Debugger.setBreakpoint", {
          location: {
            scriptId: runtimeScript.scriptId,
            lineNumber: 0,
            columnNumber: target.columnNumber,
          },
        });
        const item = {
          ...target,
          scriptId: runtimeScript.scriptId,
          breakpointId: response.breakpointId || null,
          locations: response.actualLocation ? [response.actualLocation] : [],
        };
        purchaseScopeBreakpoints.push(item);
        if (item.breakpointId) purchaseScopeBreakpointById.set(item.breakpointId, item);
      } catch (error) {
        purchaseScopeBreakpoints.push({
          ...target,
          scriptId: runtimeScript.scriptId,
          error: redactText(error?.stack || error),
          locations: [],
        });
      }
    }
  };

  purchaseTraceCdp.on("Debugger.paused", async (event) => {
    const matchedId = (event.hitBreakpoints || []).find((id) => purchaseScopeBreakpointById.has(id));
    if (!matchedId) return;
    const configured = purchaseScopeBreakpointById.get(matchedId);
    const top = event.callFrames?.[0] || null;
    const actualColumnNumber = Number(top?.location?.columnNumber ?? -1);
    const frames = [];
    try {
      for (const frame of (event.callFrames || []).slice(0, 8)) {
        let values = null;
        try {
          const evaluated = await purchaseTraceCdp.send("Debugger.evaluateOnCallFrame", {
            callFrameId: frame.callFrameId,
            expression: purchaseScopeExpression,
            returnByValue: true,
            silent: true,
          });
          values = evaluated.result?.value || null;
        } catch (error) {
          values = { evaluationError: redactText(error?.stack || error) };
        }
        frames.push({
          functionName: String(frame.functionName || "").slice(0, 180),
          lineNumber: Number(frame.location?.lineNumber ?? -1),
          columnNumber: Number(frame.location?.columnNumber ?? -1),
          values,
        });
      }
      purchaseScopeSnapshots.push({
        at: Date.now(),
        reason: event.reason || null,
        hitBreakpointId: matchedId,
        configuredLabel: configured?.label || null,
        configuredColumnNumber: configured?.columnNumber ?? null,
        actualColumnNumber,
        frames,
      });
    } finally {
      try { await purchaseTraceCdp.send("Debugger.resume"); } catch {}
    }
  });'''
    text = replace_once(text, anchor, instrumentation, "scope instrumentation anchor")

    list_open_anchor = '      const listOpen = await openTarget("purchase-list-open");'
    list_open_replacement = '''      const listOpen = await openTarget("purchase-list-open");
      await bindPurchaseScopeBreakpoints();'''
    text = replace_once(text, list_open_anchor, list_open_replacement, "breakpoint binding stage")

    tap_marker = "await page.touchscreen.tap(finalBuyPoint.x, finalBuyPoint.y);"
    parts = text.split(tap_marker)
    if len(parts) - 1 != 2:
        raise SystemExit(f"final purchase tap marker mismatch: {len(parts) - 1}")
    text = (
        parts[0]
        + 'await page.evaluate(() => { globalThis.__gamsPurchaseAttemptStage = "first"; });\n      '
        + tap_marker
        + parts[1]
        + 'await page.evaluate((stage) => { globalThis.__gamsPurchaseAttemptStage = stage; }, label);\n        '
        + tap_marker
        + parts[2]
    )

    finalizer = '''    result.loginInitiators = loginInitiators.slice(0, 80);
    await purchaseTraceCdp.detach().catch(() => {});'''
    finalizer_replacement = '''    result.loginInitiators = loginInitiators.slice(0, 80);
    result.purchaseScopeRuntimeScripts = purchaseScopeRuntimeScripts.slice(0, 20);
    result.purchaseScopeBreakpoints = purchaseScopeBreakpoints;
    result.purchaseScopeSnapshots = purchaseScopeSnapshots.slice(0, 120);
    await purchaseTraceCdp.detach().catch(() => {});'''
    text = replace_once(text, finalizer, finalizer_replacement, "scope result finalizer")

    text = replace_once(
        text,
        'mode: "persisted-runtime-page5-first-second-reentry-third-purchase-probe"',
        'mode: "persisted-runtime-page5-second-purchase-callback-scope-probe"',
        "scope mode",
    )

    output.write_text(text, encoding="utf-8")
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
