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
        'const outputDir = process.env.OUTPUT_DIR || "page5-direct-node-bridge-probe";',
        "output",
    )

    routes = '''const routes = [
  {
    page: "page5",
    targetId: "1691512",
    url: "https://m.66rpg.com/h5/1691512?ohp=v3&quality=32",
    steps: [],
    marker: "target-read",
  },
];'''
    text, count = re.subn(r"const routes = \[.*?\n\];", routes, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"route block mismatch: {count}")

    make_pattern = re.compile(r"function makeCandidate\(source\) \{.*?\n\}", re.S)
    make_candidate = '''function makeCandidate(source) {
  const guardOld = "tE['ge'+'tI'+'ns'+'ta'+'nc'+'e']()['is'+'Mo'+'bi'+'le']()||(tT['sc'+'en'+'e']=new SCGMenu()),SF['Tk'+'Kw'+'f'](SAL_openMenu,";
  const guardNew = "tE['ge'+'tI'+'ns'+'ta'+'nc'+'e']()['is'+'Mo'+'bi'+'le']()||(typeof SCGMenu!=='undefined'&&(tT['sc'+'en'+'e']=new SCGMenu())),SF['Tk'+'Kw'+'f'](SAL_openMenu,";
  const callbackOld = "tE['ge'+'tI'+'ns'+'ta'+'nc'+'e']()['is'+'Mo'+'bi'+'le']()&&SA&&SA['is'+'Op'+'en'+'Th'+'eM'+'al'+'l']&&tT['op'+'en'+'UI'+'Sc'+'en'+'e'](-3852+5642+10*822);";
  const callbackNew = "tE['ge'+'tI'+'ns'+'ta'+'nc'+'e']()['is'+'Mo'+'bi'+'le']()&&(arguments.length===0||(SA&&SA['is'+'Op'+'en'+'Th'+'eM'+'al'+'l']))&&tT['op'+'en'+'UI'+'Sc'+'en'+'e'](-3852+5642+10*822);";
  const guardCount = source.split(guardOld).length - 1;
  const callbackCount = source.split(callbackOld).length - 1;
  if (guardCount !== 1) throw new Error(`guard replacement count mismatch: ${guardCount}`);
  if (callbackCount !== 1) throw new Error(`empty-callback replacement count mismatch: ${callbackCount}`);
  const candidate = source.replace(guardOld, guardNew).replace(callbackOld, callbackNew);
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

    loop_pattern = re.compile(
        r'''    for \(let stepIndex = 0; stepIndex < route\.steps\.length; stepIndex \+= 1\) \{.*?\n    \}''',
        re.S,
    )
    direct_trigger = '''    const cdp = await context.newCDPSession(page);
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
          functionDeclaration: "function(){globalThis.__gamsDirectCanvasEngine=this;return {length:Array.isArray(this._elementList)?this._elementList.length:null};}",
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
      objectGroup: "gams-direct-node-probe",
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
      location: {
        scriptId: touchstart.scriptId,
        lineNumber: touchstart.lineNumber,
        columnNumber: touchstart.columnNumber,
      },
    });
    await page.touchscreen.tap(195, 422);
    const captured = await Promise.race([
      engineReady,
      new Promise((resolve) => setTimeout(() => resolve(false), 15000)),
    ]);
    try { await cdp.send("Debugger.removeBreakpoint", { breakpointId: breakpoint.breakpointId }); } catch {}
    cdp.off("Debugger.paused", pausedHandler);
    if (!captured) throw new Error("canvas engine capture timeout");
    await page.waitForTimeout(1500);

    result.directNodeInventory = await page.evaluate(() => {
      const engine = globalThis.__gamsDirectCanvasEngine;
      const node = engine?._elementList?.[9];
      const entries = node?.eventListenerMap?.["mouse click"];
      const entry = Array.isArray(entries) ? entries[0] : null;
      return {
        engineAvailable: Boolean(engine),
        listLength: Array.isArray(engine?._elementList) ? engine._elementList.length : null,
        nodeAvailable: Boolean(node),
        geometry: node ? { x: node.x, y: node.y, width: node.width, height: node.height, visible: node._visible, touchable: node._touchable } : null,
        eventNames: node?.eventListenerMap ? Object.getOwnPropertyNames(node.eventListenerMap) : [],
        clickEntryAvailable: Boolean(entry),
        clickEntryKeys: entry ? Object.getOwnPropertyNames(entry) : [],
        listenerType: typeof entry?.listener,
        listenerArity: typeof entry?.listener === "function" ? entry.listener.length : null,
      };
    });
    result.targetWindowStartIndex = requests.length;
    result.directNodeTrigger = await page.evaluate(() => {
      const engine = globalThis.__gamsDirectCanvasEngine;
      const node = engine?._elementList?.[9];
      const entry = node?.eventListenerMap?.["mouse click"]?.[0];
      if (!entry || typeof entry.listener !== "function") return { ok: false, reason: "target click entry unavailable" };
      try {
        const value = Reflect.apply(entry.listener, entry.caller || node, [entry.param]);
        return { ok: true, returnType: value === null ? "null" : typeof value };
      } catch (error) {
        return { ok: false, reason: String(error?.stack || error).slice(0, 1000) };
      }
    });
    events.push({ at: Date.now(), type: "direct-node-click", nodeIndex: 9, result: result.directNodeTrigger });
    await page.waitForTimeout(15000);
    await stage("after-direct-target-entry");
    result.targetScreenChanged = result.screenshots["runtime-final-close"] !== result.screenshots["after-direct-target-entry"];
    result.targetWindow = requestWindow(requests, result.targetWindowStartIndex);
    try { await cdp.send("Runtime.releaseObjectGroup", { objectGroup: "gams-direct-node-probe" }); } catch {}
    await cdp.detach().catch(() => {});'''
    text, count = loop_pattern.subn(lambda _m: direct_trigger, text, count=1)
    if count != 1:
        raise SystemExit(f"route loop mismatch: {count}")

    tail_pattern = re.compile(r"function markerPassed\(item\).*\Z", re.S)
    tail = '''function markerPassed(item) { return Number(item.targetWindow?.targetReadCount || 0) > 0; }
const currentPage5 = cases.find((item) => item.pair === "current");
const candidatePage5 = cases.find((item) => item.pair === "candidate");
const summary = {
  totalCases: cases.length,
  fatalCases: cases.filter((item) => item.fatalError).length,
  runtimeEntryCompleteCases: cases.filter((item) => item.states?.["runtime-open"]?.runtimePanelVisible && !item.states?.["runtime-close"]?.runtimePanelVisible && item.states?.["runtime-reopen"]?.runtimePanelVisible).length,
  noLoginEnabledCases: cases.filter((item) => item.states?.["runtime-open"]?.noLoginEnabledTextPresent).length,
  secondFileLoadCases: cases.filter((item) => item.runtimeLoads?.second > 0).length,
  engineCapturedCases: cases.filter((item) => item.engineCapture?.length >= 10).length,
  directTriggerOkCases: cases.filter((item) => item.directNodeTrigger?.ok).length,
  currentPageErrorCount: currentPage5?.pageErrors?.length || 0,
  currentTargetReadCount: currentPage5?.targetWindow?.targetReadCount || 0,
  currentTargetListCount: currentPage5?.targetWindow?.targetListCount || 0,
  candidatePageErrorCount: candidatePage5?.pageErrors?.length || 0,
  candidateTargetReadCount: candidatePage5?.targetWindow?.targetReadCount || 0,
  candidateTargetListCount: candidatePage5?.targetWindow?.targetListCount || 0,
  blockedOrderCases: cases.filter((item) => item.blockedOrders?.length).length,
  replacementCount: candidatePatch.count,
  guardReplacementCount: candidatePatch.guardCount,
  emptyCallbackReplacementCount: candidatePatch.callbackCount,
};
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  mode: "page5-direct-node-empty-callback-bridge-probe",
  apkExecuted: false,
  paymentCompleted: false,
  authorizationOutcomeModified: false,
  runtimeFilesChanged: false,
  androidClientChanged: false,
  productionDefaultChanged: false,
  candidatePatch: {
    replacementCount: candidatePatch.count,
    guardReplacementCount: candidatePatch.guardCount,
    emptyCallbackReplacementCount: candidatePatch.callbackCount,
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
report.pass = summary.totalCases === 2
  && summary.fatalCases === 0
  && summary.runtimeEntryCompleteCases === 2
  && summary.noLoginEnabledCases === 2
  && summary.secondFileLoadCases === 2
  && summary.engineCapturedCases === 2
  && summary.directTriggerOkCases === 2
  && summary.candidatePageErrorCount === 0
  && summary.candidateTargetReadCount > 0
  && summary.candidateTargetListCount > 0
  && summary.blockedOrderCases === 0
  && summary.replacementCount === 2;
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
