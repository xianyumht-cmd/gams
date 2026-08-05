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
            "scripts/prepare_page5_candidate_scope_state_probe_v5.py",
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
        'const outputDir = process.env.OUTPUT_DIR || "page5-candidate-scope-state-probe-v5";',
        'const outputDir = process.env.OUTPUT_DIR || "page5-candidate-immediate-return-probe-v6";',
        "output",
    )
    text = replace_once(
        text,
        'mode: "page5-candidate-scope-state-read-only-probe-v5"',
        'mode: "page5-candidate-immediate-return-read-only-probe-v6"',
        "mode",
    )

    handler_pattern = re.compile(
        r"  let resolveListener;.*?\n\n  const response = await page\.goto",
        re.S,
    )
    handler_block = r'''  let phase = "capture-listener";
  let functionCallBreakpointId = null;
  let resolveTransition;
  const transitionReady = new Promise((resolve) => { resolveTransition = resolve; });
  cdp.on("Debugger.paused", async (event) => {
    try {
      const frame = event.callFrames?.[0];
      if (!frame) throw new Error("pause without call frame");

      if (phase === "capture-listener") {
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
        const listenerSource = String(sourceRemote.result?.value || "");
        const properties = await cdp.send("Runtime.getProperties", {
          objectId: evaluated.result.objectId,
          ownProperties: true,
          accessorPropertiesOnly: false,
          generatePreview: false,
        });
        const functionLocation = (properties.internalProperties || []).find((item) => item.name === "[[FunctionLocation]]")?.value?.value || null;
        const scopesRemote = (properties.internalProperties || []).find((item) => item.name === "[[Scopes]]")?.value;
        if (scopesRemote?.objectId) {
          const scopes = await cdp.send("Runtime.getProperties", {
            objectId: scopesRemote.objectId,
            ownProperties: true,
            accessorPropertiesOnly: false,
            generatePreview: false,
          });
          for (const item of (scopes.result || []).filter((entry) => /^\d+$/.test(entry.name) && entry.value?.objectId)) {
            trackedScopeObjects.push({
              index: Number(item.name),
              objectId: item.value.objectId,
              description: String(item.value.description || "").slice(0, 200),
            });
          }
        }
        report.listener = {
          sourceLength: listenerSource.length,
          sourceSha256: sha256(Buffer.from(listenerSource)),
          functionLocation,
          scopeCount: trackedScopeObjects.length,
        };
        report.scopeAtTouchStart = await snapshotTrackedScopes();
        const callSet = await cdp.send("Debugger.setBreakpointOnFunctionCall", {
          objectId: evaluated.result.objectId,
        });
        functionCallBreakpointId = callSet.breakpointId;
        report.functionCallBreakpoint = { breakpointId: functionCallBreakpointId };
        phase = "await-function-call";
        for (const breakpointId of event.hitBreakpoints || []) {
          try { await cdp.send("Debugger.removeBreakpoint", { breakpointId }); } catch {}
        }
        await cdp.send("Debugger.resume");
        return;
      }

      if (phase === "await-function-call") {
        report.functionCallPause = {
          reason: event.reason,
          hitBreakpoints: event.hitBreakpoints || [],
          functionName: frame.functionName || "",
          location: frame.location,
        };
        report.scopeAtFunctionEntry = await snapshotTrackedScopes();
        phase = "await-step-out";
        await cdp.send("Debugger.stepOut");
        return;
      }

      if (phase === "await-step-out") {
        report.returnPause = {
          reason: event.reason,
          hitBreakpoints: event.hitBreakpoints || [],
          functionName: frame.functionName || "",
          location: frame.location,
        };
        report.scopeImmediatelyAfterReturn = await snapshotTrackedScopes();
        phase = "done";
        if (functionCallBreakpointId) {
          try { await cdp.send("Debugger.removeBreakpoint", { breakpointId: functionCallBreakpointId }); } catch {}
        }
        await cdp.send("Debugger.resume");
        resolveTransition(true);
        return;
      }

      await cdp.send("Debugger.resume");
    } catch (error) {
      debuggerErrors.push(String(error?.stack || error).slice(0, 3000));
      try { await cdp.send("Debugger.resume"); } catch {}
      resolveTransition(false);
    }
  });

  const response = await page.goto'''
    text, count = handler_pattern.subn(lambda _: handler_block, text, count=1)
    if count != 1:
        raise SystemExit(f"immediate handler mismatch: {count}")

    text = replace_once(
        text,
        "  await Promise.race([listenerReady, new Promise((resolve) => setTimeout(() => resolve(false), 15000))]);",
        "  await Promise.race([transitionReady, new Promise((resolve) => setTimeout(() => resolve(false), 15000))]);",
        "transition wait",
    )

    pass_pattern = re.compile(
        r"  const trackedBeforeCount = .*?\n    && debuggerErrors\.length === 0;",
        re.S,
    )
    pass_block = '''  const entryCount = (report.scopeAtFunctionEntry || []).reduce((sum, scope) => sum + Object.keys(scope.values || {}).length, 0);
  const returnCount = (report.scopeImmediatelyAfterReturn || []).reduce((sum, scope) => sum + Object.keys(scope.values || {}).length, 0);
  report.pass = phase === "done"
    && Number(report.listener?.sourceLength || 0) > 0
    && entryCount > 0
    && returnCount > 0
    && report.mainFrameValid
    && pageErrors.length === 0
    && blockedOrders.length === 0
    && debuggerErrors.length === 0;'''
    text, count = pass_pattern.subn(pass_block, text, count=1)
    if count != 1:
        raise SystemExit(f"immediate pass gate mismatch: {count}")

    text = re.sub(
        r'console\.log\(JSON\.stringify\(\{.*?\}, null, 2\)\);',
        '''console.log(JSON.stringify({
  pass: report.pass,
  phase,
  listener: report.listener || null,
  scopeAtTouchStart: report.scopeAtTouchStart || [],
  scopeAtFunctionEntry: report.scopeAtFunctionEntry || [],
  scopeImmediatelyAfterReturn: report.scopeImmediatelyAfterReturn || [],
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
