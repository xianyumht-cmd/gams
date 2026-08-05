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
    parser.add_argument("--source", default="scripts/run_page5_guard_full_entry_matrix.mjs")
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    text = Path(args.source).read_text(encoding="utf-8")
    text = replace_once(
        text,
        'const outputDir = process.env.OUTPUT_DIR || "page5-guard-full-entry-matrix";',
        'const outputDir = process.env.OUTPUT_DIR || "five-page-missing-constructor-matrix";',
        "output",
    )

    make_pattern = re.compile(r"function makeCandidate\(source\) \{.*?\n\}", re.S)
    make_candidate = '''function makeCandidate(source) {
  const guardOld = "tE['ge'+'tI'+'ns'+'ta'+'nc'+'e']()['is'+'Mo'+'bi'+'le']()||(tT['sc'+'en'+'e']=new SCGMenu()),SF['Tk'+'Kw'+'f'](SAL_openMenu,";
  const guardNew = "tE['ge'+'tI'+'ns'+'ta'+'nc'+'e']()['is'+'Mo'+'bi'+'le']()||(typeof SCGMenu!=='undefined'&&(tT['sc'+'en'+'e']=new SCGMenu())),SF['Tk'+'Kw'+'f'](SAL_openMenu,";
  const callbackOld = "tE['ge'+'tI'+'ns'+'ta'+'nc'+'e']()['is'+'Mo'+'bi'+'le']()&&SA&&SA['is'+'Op'+'en'+'Th'+'eM'+'al'+'l']&&tT['op'+'en'+'UI'+'Sc'+'en'+'e'](-3852+5642+10*822);";
  const callbackNew = "(tE['ge'+'tI'+'ns'+'ta'+'nc'+'e']()['is'+'Mo'+'bi'+'le']()||typeof SCGMenu==='undefined')&&(SA===void 0||(SA&&SA['is'+'Op'+'en'+'Th'+'eM'+'al'+'l']))&&tT['op'+'en'+'UI'+'Sc'+'en'+'e'](-3852+5642+10*822);";
  const guardCount = source.split(guardOld).length - 1;
  const callbackCount = source.split(callbackOld).length - 1;
  if (guardCount !== 1) throw new Error(`guard replacement count mismatch: ${guardCount}`);
  if (callbackCount !== 1) throw new Error(`callback replacement count mismatch: ${callbackCount}`);
  const candidate = source.replace(guardOld, guardNew).replace(callbackOld, callbackNew);
  if (!candidate.includes(guardNew) || !candidate.includes(callbackNew)) throw new Error("candidate replacement verification failed");
  return {
    candidate,
    count: guardCount + callbackCount,
    guardCount,
    callbackCount,
    oldTextSha256: sha256(Buffer.from(guardOld + "\\n" + callbackOld)),
    newTextSha256: sha256(Buffer.from(guardNew + "\\n" + callbackNew)),
  };
}'''
    text, count = make_pattern.subn(lambda _m: make_candidate, text, count=1)
    if count != 1:
        raise SystemExit(f"makeCandidate block mismatch: {count}")

    old_loop = '''    for (let stepIndex = 0; stepIndex < route.steps.length; stepIndex += 1) {
      const step = route.steps[stepIndex];
      const isFinal = stepIndex === route.steps.length - 1;
      if (isFinal) result.targetWindowStartIndex = requests.length;
      const beforeHash = await capture(page, path.join(outputDir, `${prefix}-before-${step.label}.png`));
      await page.touchscreen.tap(step.x, step.y);
      events.push({ at: Date.now(), type: "route-tap", stepIndex, ...step });
      await page.waitForTimeout(isFinal ? 10000 : 5000);
      const stageName = `after-${String(stepIndex + 1).padStart(2, "0")}-${step.label}`;
      await stage(stageName);
      const afterHash = result.screenshots[stageName];
      if (isFinal) { result.targetScreenChanged = beforeHash !== afterHash; result.targetWindow = requestWindow(requests, result.targetWindowStartIndex); }
    }'''
    new_loop = '''    if (route.page !== "page5") {
      for (let stepIndex = 0; stepIndex < route.steps.length; stepIndex += 1) {
        const step = route.steps[stepIndex];
        const isFinal = stepIndex === route.steps.length - 1;
        if (isFinal) result.targetWindowStartIndex = requests.length;
        const beforeHash = await capture(page, path.join(outputDir, `${prefix}-before-${step.label}.png`));
        await page.touchscreen.tap(step.x, step.y);
        events.push({ at: Date.now(), type: "route-tap", stepIndex, ...step });
        await page.waitForTimeout(isFinal ? 10000 : 5000);
        const stageName = `after-${String(stepIndex + 1).padStart(2, "0")}-${step.label}`;
        await stage(stageName);
        const afterHash = result.screenshots[stageName];
        if (isFinal) { result.targetScreenChanged = beforeHash !== afterHash; result.targetWindow = requestWindow(requests, result.targetWindowStartIndex); }
      }
    } else {
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
            functionDeclaration: "function(){globalThis.__gamsFivePageCanvasEngine=this;return {length:Array.isArray(this._elementList)?this._elementList.length:null};}",
            returnByValue: true,
            silent: true,
          });
          result.engineCapture = exposed.result?.value || null;
          await cdp.send("Debugger.resume");
          resolveEngine(true);
        } catch (error) {
          result.engineCaptureError = redactText(error?.stack || error);
          try { await cdp.send("Debugger.resume"); } catch {}
          resolveEngine(false);
        }
      };
      cdp.on("Debugger.paused", pausedHandler);
      const canvasRemote = await cdp.send("Runtime.evaluate", {
        expression: "document.querySelector('canvas#canvas') || document.querySelector('canvas')",
        objectGroup: "gams-five-page-matrix",
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
        new Promise((resolve) => setTimeout(() => resolve(false), 15000)),
      ]);
      try { await cdp.send("Debugger.removeBreakpoint", { breakpointId: breakpoint.breakpointId }); } catch {}
      cdp.off("Debugger.paused", pausedHandler);
      if (!captured) throw new Error("canvas engine capture timeout");
      await page.waitForTimeout(22000);
      await stage("before-stable-dynamic-target-touch");

      result.dynamicTarget = await page.evaluate(() => {
        const engine = globalThis.__gamsFivePageCanvasEngine;
        const node = engine?._elementList?.[10];
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
          nodeIndex: 10,
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
      });
      if (!result.dynamicTarget?.ok) throw new Error(`dynamic target point failed: ${JSON.stringify(result.dynamicTarget)}`);
      result.targetWindowStartIndex = requests.length;
      const beforeHash = await capture(page, path.join(outputDir, `${prefix}-before-dynamic-target-entry.png`));
      await page.touchscreen.tap(result.dynamicTarget.cssPoint.x, result.dynamicTarget.cssPoint.y);
      events.push({ at: Date.now(), type: "dynamic-target-touch", ...result.dynamicTarget });
      await page.waitForTimeout(25000);
      await stage("after-dynamic-target-entry");
      result.targetScreenChanged = beforeHash !== result.screenshots["after-dynamic-target-entry"];
      result.targetWindow = requestWindow(requests, result.targetWindowStartIndex);
      try { await cdp.send("Runtime.releaseObjectGroup", { objectGroup: "gams-five-page-matrix" }); } catch {}
      await cdp.detach().catch(() => {});
    }'''
    text = replace_once(text, old_loop, new_loop, "route execution")

    tail_pattern = re.compile(r"function markerPassed\(item\).*\Z", re.S)
    tail = '''function markerPassed(item) {
  if (!item) return false;
  if (item.marker === "visual-change") return Boolean(item.targetScreenChanged);
  return Number(item.targetWindow?.targetReadCount || 0) > 0;
}

const currentCases = cases.filter((item) => item.pair === "current");
const candidateCases = cases.filter((item) => item.pair === "candidate");
const currentPage5 = currentCases.find((item) => item.page === "page5");
const candidatePage5 = candidateCases.find((item) => item.page === "page5");
const summary = {
  totalCases: cases.length,
  fatalCases: cases.filter((item) => item.fatalError).length,
  runtimeEntryCompleteCases: cases.filter((item) => item.states?.["runtime-open"]?.runtimePanelVisible && !item.states?.["runtime-close"]?.runtimePanelVisible && item.states?.["runtime-reopen"]?.runtimePanelVisible).length,
  noLoginEnabledCases: cases.filter((item) => item.states?.["runtime-open"]?.noLoginEnabledTextPresent).length,
  secondFileLoadCases: cases.filter((item) => item.runtimeLoads?.second > 0).length,
  currentFirstFourMarkerCount: currentCases.filter((item) => item.page !== "page5" && markerPassed(item)).length,
  candidateFirstFourMarkerCount: candidateCases.filter((item) => item.page !== "page5" && markerPassed(item)).length,
  currentPage5PageErrorCount: currentPage5?.pageErrors?.length || 0,
  currentPage5TargetReadCount: currentPage5?.targetWindow?.targetReadCount || 0,
  currentPage5TargetListCount: currentPage5?.targetWindow?.targetListCount || 0,
  candidatePageErrorCases: candidateCases.filter((item) => item.pageErrors?.length).length,
  candidatePage5TargetReadCount: candidatePage5?.targetWindow?.targetReadCount || 0,
  candidatePage5TargetListCount: candidatePage5?.targetWindow?.targetListCount || 0,
  candidatePage5DynamicTargetOk: Boolean(candidatePage5?.dynamicTarget?.ok),
  blockedOrderCases: cases.filter((item) => item.blockedOrders?.length).length,
  replacementCount: candidatePatch.count,
  guardReplacementCount: candidatePatch.guardCount,
  callbackReplacementCount: candidatePatch.callbackCount,
};

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  mode: "five-page-missing-constructor-mobile-bridge-matrix",
  apkExecuted: false,
  paymentCompleted: false,
  authorizationOutcomeModified: false,
  runtimeFilesChanged: false,
  androidClientChanged: false,
  productionDefaultChanged: false,
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
  routes: routes.map(({ page, targetId, url, steps, marker }) => ({ page, targetId, url: safeUrl(url), steps, marker })),
  cases,
  summary,
};

report.pass = summary.totalCases === 10
  && summary.fatalCases === 0
  && summary.runtimeEntryCompleteCases === 10
  && summary.noLoginEnabledCases === 10
  && summary.secondFileLoadCases === 10
  && summary.currentFirstFourMarkerCount === 4
  && summary.candidateFirstFourMarkerCount === 4
  && summary.currentPage5PageErrorCount > 0
  && summary.candidatePageErrorCases === 0
  && summary.candidatePage5DynamicTargetOk
  && summary.candidatePage5TargetReadCount > 0
  && summary.candidatePage5TargetListCount > 0
  && summary.blockedOrderCases === 0
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

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(text, encoding="utf-8")
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
