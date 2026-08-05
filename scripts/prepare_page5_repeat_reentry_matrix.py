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
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    subprocess.run(
        [
            sys.executable,
            "scripts/prepare_five_page_missing_constructor_matrix.py",
            "--output",
            args.output,
        ],
        check=True,
    )

    output = Path(args.output)
    text = output.read_text(encoding="utf-8")

    routes = '''const routes = [
  { page: "page5", targetId: "1691512", url: "https://m.66rpg.com/h5/1691512?ohp=v3&quality=32", steps: [], marker: "target-read" },
];'''
    text, count = re.subn(r"const routes = \[.*?\n\];", routes, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"route block mismatch: {count}")

    text = replace_once(
        text,
        'const pairs = [{ name: "current", secondSource: currentSecond }, { name: "candidate", secondSource: candidatePatch.candidate }];',
        'const pairs = [{ name: "candidate", secondSource: candidatePatch.candidate }];',
        "candidate-only pair",
    )

    execution_pattern = re.compile(
        r'''    if \(route\.page !== "page5"\) \{.*?      await cdp\.detach\(\)\.catch\(\(\) => \{\}\);\n    \}''',
        re.S,
    )

    execution = '''    {
      result.repeatSequence = [];
      result.returnSequence = [];
      result.reentry = {};
      const engineKey = "__gamsRepeatCanvasEngine";
      const returnCssPoint = { x: 35, y: 423 };

      const captureEngine = async (label) => {
        const cdp = await context.newCDPSession(page);
        await cdp.send("Runtime.enable");
        await cdp.send("Debugger.enable", { maxScriptsCacheSize: 30_000_000 });
        let resolveEngine;
        const engineReady = new Promise((resolve) => { resolveEngine = resolve; });
        let engineCaptured = false;
        const pausedHandler = async (event) => {
          if (engineCaptured) {
            try { await cdp.send("Debugger.resume"); } catch {}
            return;
          }
          engineCaptured = true;
          try {
            const frame = event.callFrames?.[0];
            if (!frame?.this?.objectId) throw new Error("canvas engine object unavailable");
            const exposed = await cdp.send("Runtime.callFunctionOn", {
              objectId: frame.this.objectId,
              functionDeclaration: `function(key){globalThis[key]=this;return {length:Array.isArray(this._elementList)?this._elementList.length:null};}`,
              arguments: [{ value: engineKey }],
              returnByValue: true,
              silent: true,
            });
            const value = exposed.result?.value || null;
            await cdp.send("Debugger.resume");
            resolveEngine({ ok: true, label, value });
          } catch (error) {
            try { await cdp.send("Debugger.resume"); } catch {}
            resolveEngine({ ok: false, label, error: redactText(error?.stack || error) });
          }
        };
        cdp.on("Debugger.paused", pausedHandler);
        try {
          const canvasRemote = await cdp.send("Runtime.evaluate", {
            expression: "document.querySelector('canvas#canvas') || document.querySelector('canvas')",
            objectGroup: `gams-repeat-${label}`,
            returnByValue: false,
            silent: true,
          });
          if (!canvasRemote.result?.objectId) throw new Error("canvas remote object unavailable");
          const listenerInventory = await cdp.send("DOMDebugger.getEventListeners", {
            objectId: canvasRemote.result.objectId,
            depth: -1,
            pierce: true,
          });
          const touchstart = (listenerInventory.listeners || []).find((listener) => listener.type === "touchstart");
          if (!touchstart) throw new Error("touchstart listener unavailable");
          const breakpoint = await cdp.send("Debugger.setBreakpoint", {
            location: { scriptId: touchstart.scriptId, lineNumber: touchstart.lineNumber, columnNumber: touchstart.columnNumber },
          });
          await page.touchscreen.tap(195, 422);
          const captured = await Promise.race([
            engineReady,
            new Promise((resolve) => setTimeout(() => resolve({ ok: false, label, error: "canvas engine capture timeout" }), 15000)),
          ]);
          try { await cdp.send("Debugger.removeBreakpoint", { breakpointId: breakpoint.breakpointId }); } catch {}
          if (!captured?.ok) throw new Error(captured?.error || "canvas engine capture failed");
          return captured.value;
        } finally {
          cdp.off("Debugger.paused", pausedHandler);
          try { await cdp.send("Runtime.releaseObjectGroup", { objectGroup: `gams-repeat-${label}` }); } catch {}
          await cdp.detach().catch(() => {});
        }
      };

      const dynamicPoint = async (nodeIndex) => page.evaluate(({ key, index }) => {
        const engine = globalThis[key];
        const node = engine?._elementList?.[index];
        const logicalRoot = engine?._elementList?.find?.((item) => item && item.width >= 1000 && item.height >= 600);
        const canvas = document.querySelector("canvas#canvas") || document.querySelector("canvas");
        if (!engine || !node || !canvas) return { ok: false, reason: "engine, node, or canvas unavailable" };
        const rect = canvas.getBoundingClientRect();
        const logicalWidth = Number(logicalRoot?.width || 1280);
        const logicalHeight = Number(logicalRoot?.height || 720);
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
          nodeIndex: index,
          nodeGeometry: { x: node.x, y: node.y, width: node.width, height: node.height, visible: node._visible, touchable: node._touchable },
          nativeCenter,
          cssPoint,
          transform,
          dimensionsSwapped,
          logical: { width: logicalWidth, height: logicalHeight },
          canvas: { width: canvas.width, height: canvas.height },
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
        };
      }, { key: engineKey, index: nodeIndex });

      const openTarget = async (label) => {
        const point = await dynamicPoint(10);
        if (!point?.ok) throw new Error(`dynamic target point failed for ${label}: ${JSON.stringify(point)}`);
        const startIndex = requests.length;
        const beforeHash = await capture(page, path.join(outputDir, `${prefix}-before-${label}.png`));
        await page.touchscreen.tap(point.cssPoint.x, point.cssPoint.y);
        events.push({ at: Date.now(), type: "repeat-target-touch", label, ...point });
        await page.waitForTimeout(25000);
        await stage(`after-${label}`);
        const window = requestWindow(requests, startIndex);
        const item = {
          label,
          point,
          screenChanged: beforeHash !== result.screenshots[`after-${label}`],
          targetWindow: window,
          url: safeUrl(page.url()),
        };
        result.repeatSequence.push(item);
        return item;
      };

      const closeTarget = async (label) => {
        const beforeHash = await capture(page, path.join(outputDir, `${prefix}-before-${label}.png`));
        await page.touchscreen.tap(returnCssPoint.x, returnCssPoint.y);
        events.push({ at: Date.now(), type: "repeat-return-touch", label, ...returnCssPoint });
        await page.waitForTimeout(12000);
        await stage(`after-${label}`);
        const state = await page.evaluate(({ key }) => {
          const engine = globalThis[key];
          const node = engine?._elementList?.[10];
          return {
            engineAvailable: Boolean(engine),
            node10Available: Boolean(node),
            node10Visible: Boolean(node?._visible),
            node10Touchable: Boolean(node?._touchable),
          };
        }, { key: engineKey });
        const item = {
          label,
          returnCssPoint,
          screenChanged: beforeHash !== result.screenshots[`after-${label}`],
          state,
          url: safeUrl(page.url()),
        };
        result.returnSequence.push(item);
        return item;
      };

      result.initialEngineCapture = await captureEngine("initial");
      await page.waitForTimeout(22000);
      await stage("before-first-open");
      await openTarget("first-open");
      await closeTarget("first-return");
      await openTarget("second-open");
      await closeTarget("second-return");

      const reentryStartLoads = { ...runtimeLoads };
      const reentryResponse = await page.goto(route.url, { waitUntil: "domcontentloaded", timeout: 45000 });
      result.reentry.goto = { status: reentryResponse?.status() ?? null, url: safeUrl(page.url()) };
      await page.waitForTimeout(28000);
      await stage("reentry-initial-ready");
      await clickRuntimeButton(page, events, "reentry-runtime-open"); await stage("reentry-runtime-open");
      await clickRuntimeButton(page, events, "reentry-runtime-close"); await stage("reentry-runtime-close");
      result.reentry.engineCapture = await captureEngine("reentry");
      await page.waitForTimeout(22000);
      await stage("before-third-open");
      await openTarget("third-open-after-reentry");
      result.reentry.runtimeLoadsDelta = {
        first: runtimeLoads.first - reentryStartLoads.first,
        second: runtimeLoads.second - reentryStartLoads.second,
        official: runtimeLoads.official - reentryStartLoads.official,
      };
      result.targetWindow = result.repeatSequence[result.repeatSequence.length - 1]?.targetWindow || null;
      result.targetScreenChanged = result.repeatSequence.every((item) => item.screenChanged);
    }'''

    text, count = execution_pattern.subn(lambda _m: execution, text, count=1)
    if count != 1:
        raise SystemExit(f"page5 execution block mismatch: {count}")

    tail_pattern = re.compile(r"function markerPassed\(item\).*\Z", re.S)
    tail = '''const candidateCase = cases.find((item) => item.pair === "candidate" && item.page === "page5");
const opens = candidateCase?.repeatSequence || [];
const returns = candidateCase?.returnSequence || [];
const summary = {
  totalCases: cases.length,
  fatalCases: cases.filter((item) => item.fatalError).length,
  runtimeEntryCompleteCases: cases.filter((item) => item.states?.["runtime-open"]?.runtimePanelVisible && !item.states?.["runtime-close"]?.runtimePanelVisible && item.states?.["runtime-reopen"]?.runtimePanelVisible).length,
  reentryRuntimeCompleteCases: cases.filter((item) => item.states?.["reentry-runtime-open"]?.runtimePanelVisible && !item.states?.["reentry-runtime-close"]?.runtimePanelVisible).length,
  noLoginEnabledCases: cases.filter((item) => item.states?.["runtime-open"]?.noLoginEnabledTextPresent && item.states?.["reentry-runtime-open"]?.noLoginEnabledTextPresent).length,
  secondFileLoadCount: candidateCase?.runtimeLoads?.second || 0,
  openCount: opens.length,
  openScreenChangedCount: opens.filter((item) => item.screenChanged).length,
  openTargetReadCount: opens.filter((item) => Number(item.targetWindow?.targetReadCount || 0) > 0).length,
  openTargetListCount: opens.filter((item) => Number(item.targetWindow?.targetListCount || 0) > 0).length,
  returnCount: returns.length,
  returnScreenChangedCount: returns.filter((item) => item.screenChanged).length,
  returnNodeRestoredCount: returns.filter((item) => item.state?.node10Visible && item.state?.node10Touchable).length,
  candidatePageErrorCount: candidateCase?.pageErrors?.length || 0,
  blockedOrderCases: cases.filter((item) => item.blockedOrders?.length).length,
  blockedExternalNavigationCases: cases.filter((item) => item.blockedExternalNavigations?.length).length,
  replacementCount: candidatePatch.count,
  guardReplacementCount: candidatePatch.guardCount,
  callbackReplacementCount: candidatePatch.callbackCount,
};

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  mode: "page5-first-second-reentry-third-repeat-matrix",
  candidatePatch: {
    replacementCount: candidatePatch.count,
    guardReplacementCount: candidatePatch.guardCount,
    callbackReplacementCount: candidatePatch.callbackCount,
    oldTextSha256: candidatePatch.oldTextSha256,
    newTextSha256: candidatePatch.newTextSha256,
    currentSecondSize: Buffer.byteLength(currentSecond),
    currentSecondSha256: sha256(Buffer.from(currentSecond)),
    candidateSecondSize: Buffer.byteLength(candidatePatch.candidate),
    candidateSecondSha256: sha256(Buffer.from(candidatePatch.candidate)),
  },
  cases,
  summary,
  returnCssPoint: { x: 35, y: 423 },
  apkExecuted: false,
  paymentCompleted: false,
  authorizationOutcomeModified: false,
  runtimeFilesChanged: false,
  androidClientChanged: false,
  productionDefaultChanged: false,
};

report.pass = summary.totalCases === 1
  && summary.fatalCases === 0
  && summary.runtimeEntryCompleteCases === 1
  && summary.reentryRuntimeCompleteCases === 1
  && summary.noLoginEnabledCases === 1
  && summary.secondFileLoadCount >= 2
  && summary.openCount === 3
  && summary.openScreenChangedCount === 3
  && summary.openTargetReadCount === 3
  && summary.openTargetListCount === 3
  && summary.returnCount === 2
  && summary.returnScreenChangedCount === 2
  && summary.returnNodeRestoredCount === 2
  && summary.candidatePageErrorCount === 0
  && summary.blockedOrderCases === 0
  && summary.blockedExternalNavigationCases === 0
  && summary.replacementCount === 2
  && summary.guardReplacementCount === 1
  && summary.callbackReplacementCount === 1;

fs.writeFileSync(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2) + "\\n");
console.log(JSON.stringify({ pass: report.pass, ...summary }, null, 2));
if (!report.pass) process.exitCode = 1;
'''
    text, count = tail_pattern.subn(lambda _m: tail, text, count=1)
    if count != 1:
        raise SystemExit(f"tail block mismatch: {count}")

    text = text.replace(
        'const outputDir = process.env.OUTPUT_DIR || "five-page-missing-constructor-matrix";',
        'const outputDir = process.env.OUTPUT_DIR || "page5-repeat-reentry-matrix";',
        1,
    )

    output.write_text(text, encoding="utf-8")
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
