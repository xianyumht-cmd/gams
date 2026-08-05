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
        'const outputDir = process.env.OUTPUT_DIR || "page5-candidate-mouseup-state-probe-v4";',
        "output",
    )
    text = replace_once(
        text,
        'mode: "page5-candidate-cover-listener-read-only-probe"',
        'mode: "page5-candidate-mouseup-state-read-only-probe-v4"',
        "mode",
    )

    handler_pattern = re.compile(
        r"  let resolveListener;.*?\n\n  const response = await page\.goto",
        re.S,
    )
    handler_block = r'''  const breakpointLabels = new Map();
  let canvasBreakpointId = null;
  let gpBreakpointsInstalled = false;
  let resolveStates;
  const statesReady = new Promise((resolve) => { resolveStates = resolve; });
  cdp.on("Debugger.paused", async (event) => {
    try {
      const frame = event.callFrames?.[0];
      if (!frame) throw new Error("pause without call frame");
      const hit = event.hitBreakpoints || [];
      if (!gpBreakpointsInstalled && canvasBreakpointId && hit.includes(canvasBreakpointId)) {
        const evaluated = await cdp.send("Debugger.evaluateOnCallFrame", {
          callFrameId: frame.callFrameId,
          expression: "this._elementList[1].eventListenerMap['mouse up'][0].listener",
          returnByValue: false,
          silent: true,
        });
        if (!evaluated.result?.objectId) throw new Error("candidate full-screen listener unavailable");
        const sourceRemote = await cdp.send("Runtime.callFunctionOn", {
          objectId: evaluated.result.objectId,
          functionDeclaration: "function(){return Function.prototype.toString.call(this);}",
          returnByValue: true,
          silent: true,
        });
        const functionSource = String(sourceRemote.result?.value || "");
        const properties = await cdp.send("Runtime.getProperties", {
          objectId: evaluated.result.objectId,
          ownProperties: true,
          accessorPropertiesOnly: false,
          generatePreview: false,
        });
        const functionLocation = (properties.internalProperties || []).find((item) => item.name === "[[FunctionLocation]]")?.value?.value;
        if (!functionLocation?.scriptId) throw new Error("candidate listener function location unavailable");
        if (functionSource.length !== 1278 || sha256(Buffer.from(functionSource)) !== "8c4369715f263e16bd3d3e4654f19a51d58a66b6fc0138c446dfbde66c0cf913") {
          throw new Error(`candidate listener source mismatch: ${functionSource.length}`);
        }
        const script = await cdp.send("Debugger.getScriptSource", { scriptId: functionLocation.scriptId });
        const sourceStart = script.scriptSource.indexOf(functionSource);
        if (sourceStart < 0 || script.scriptSource.indexOf(functionSource, sourceStart + 1) >= 0) {
          throw new Error("candidate listener source occurrence mismatch");
        }
        const beforeOffset = functionSource.indexOf("tB=");
        const afterOffset = functionSource.indexOf("tU=");
        if (beforeOffset < 0 || afterOffset <= beforeOffset) throw new Error("candidate listener breakpoint markers unavailable");
        for (const [label, columnNumber] of [
          ["before-core", sourceStart + beforeOffset],
          ["after-click-decision", sourceStart + afterOffset],
        ]) {
          const set = await cdp.send("Debugger.setBreakpoint", {
            location: { scriptId: functionLocation.scriptId, lineNumber: 0, columnNumber },
          });
          breakpointLabels.set(set.breakpointId, label);
          report[label] = { breakpointId: set.breakpointId, requestedColumn: columnNumber, actualLocation: set.actualLocation };
        }
        report.listener = {
          sourceLength: functionSource.length,
          sourceSha256: sha256(Buffer.from(functionSource)),
          functionLocation,
          sourceStart,
          beforeOffset,
          afterOffset,
        };
        gpBreakpointsInstalled = true;
        try { await cdp.send("Debugger.removeBreakpoint", { breakpointId: canvasBreakpointId }); } catch {}
        await cdp.send("Debugger.resume");
        return;
      }

      const labels = hit.map((id) => breakpointLabels.get(id) || id);
      const state = await valueOnFrame(
        cdp,
        frame.callFrameId,
        "({tb:typeof tb==='undefined'?null:tb,tx:typeof tx==='undefined'?null:tx,tO:typeof tO==='undefined'?null:tO,tm:typeof tm==='undefined'?null:tm,tU:typeof tU==='undefined'?null:tU,tR:typeof tR==='undefined'?null:tR,tv:typeof tv==='undefined'?null:tv,NN:typeof NN==='undefined'?null:NN,tB:typeof tB==='undefined'?null:tB})",
      );
      pauses.push({
        at: Date.now(),
        labels,
        reason: event.reason,
        functionName: frame.functionName || "",
        location: frame.location,
        state,
      });
      await cdp.send("Debugger.resume");
      if (pauses.length >= 2) resolveStates(true);
    } catch (error) {
      debuggerErrors.push(String(error?.stack || error).slice(0, 3000));
      try { await cdp.send("Debugger.resume"); } catch {}
      resolveStates(false);
    }
  });

  const response = await page.goto'''
    text, count = handler_pattern.subn(lambda _: handler_block, text, count=1)
    if count != 1:
        raise SystemExit(f"state handler mismatch: {count}")

    text = replace_once(
        text,
        '  const canvasBreakpoint = await cdp.send("Debugger.setBreakpoint", {',
        '  const canvasBreakpoint = await cdp.send("Debugger.setBreakpoint", {',
        "canvas breakpoint marker",
    )
    text = replace_once(
        text,
        '''  report.canvasListener = {
    type: touchstart.type,''',
        '''  canvasBreakpointId = canvasBreakpoint.breakpointId;
  report.canvasListener = {
    type: touchstart.type,''',
        "canvas breakpoint id",
    )
    text = replace_once(
        text,
        "  await Promise.race([listenerReady, new Promise((resolve) => setTimeout(() => resolve(false), 15000))]);",
        "  await Promise.race([statesReady, new Promise((resolve) => setTimeout(() => resolve(false), 15000))]);",
        "state wait",
    )
    pass_pattern = re.compile(
        r"  report\.pass = listenerCaptured.*?\n    && debuggerErrors\.length === 0;",
        re.S,
    )
    pass_block = '''  report.pass = gpBreakpointsInstalled
    && pauses.length >= 2
    && pauses.some((item) => item.labels.includes("before-core"))
    && pauses.some((item) => item.labels.includes("after-click-decision"))
    && report.mainFrameValid
    && pageErrors.length === 0
    && blockedOrders.length === 0
    && debuggerErrors.length === 0;'''
    text, count = pass_pattern.subn(pass_block, text, count=1)
    if count != 1:
        raise SystemExit(f"state pass gate mismatch: {count}")
    text = re.sub(
        r'console\.log\(JSON\.stringify\(\{.*?\}, null, 2\)\);',
        '''console.log(JSON.stringify({
  pass: report.pass,
  gpBreakpointsInstalled,
  pauseCount: pauses.length,
  pauseLabels: pauses.flatMap((item) => item.labels),
  states: pauses.map((item) => item.state?.value || null),
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
