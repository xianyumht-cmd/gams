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
            "scripts/prepare_page5_candidate_mouseup_state_probe_v2.py",
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
        'const outputDir = process.env.OUTPUT_DIR || "page5-candidate-mouseup-state-probe-v2";',
        'const outputDir = process.env.OUTPUT_DIR || "page5-candidate-cover-listener-probe";',
        "output",
    )
    text = replace_once(
        text,
        'mode: "page5-candidate-mouseup-state-read-only-probe-v2"',
        'mode: "page5-candidate-cover-listener-read-only-probe"',
        "mode",
    )

    handler_pattern = re.compile(
        r"  const breakpointLabels = new Map\(\);.*?\n\n  const response = await page\.goto",
        re.S,
    )
    handler_block = r'''  let resolveListener;
  const listenerReady = new Promise((resolve) => { resolveListener = resolve; });
  let listenerCaptured = false;
  cdp.on("Debugger.paused", async (event) => {
    if (listenerCaptured) {
      try { await cdp.send("Debugger.resume"); } catch {}
      return;
    }
    try {
      const frame = event.callFrames?.[0];
      if (!frame) throw new Error("pause without call frame");
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
      const internalProperties = (properties.internalProperties || []).map((item) => ({
        name: item.name,
        type: item.value?.type || null,
        subtype: item.value?.subtype || null,
        description: String(item.value?.description || "").slice(0, 200),
        value: item.value?.value || null,
        hasObjectId: Boolean(item.value?.objectId),
      }));
      const functionLocation = (properties.internalProperties || []).find((item) => item.name === "[[FunctionLocation]]")?.value?.value || null;
      let scopeCount = null;
      const scopesRemote = (properties.internalProperties || []).find((item) => item.name === "[[Scopes]]")?.value;
      if (scopesRemote?.objectId) {
        const scopes = await cdp.send("Runtime.getProperties", {
          objectId: scopesRemote.objectId,
          ownProperties: true,
          accessorPropertiesOnly: false,
          generatePreview: false,
        });
        scopeCount = (scopes.result || []).filter((item) => /^\d+$/.test(item.name)).length;
      }
      report.canvasPause = {
        reason: event.reason,
        hitBreakpoints: event.hitBreakpoints || [],
        functionName: frame.functionName || "",
        location: frame.location,
      };
      report.listener = {
        remote: {
          type: evaluated.result.type || null,
          className: evaluated.result.className || null,
          description: String(evaluated.result.description || "").slice(0, 500),
        },
        source: listenerSource,
        sourceLength: listenerSource.length,
        sourceSha256: sha256(Buffer.from(listenerSource)),
        functionLocation,
        scopeCount,
        internalProperties,
      };
      listenerCaptured = true;
      await cdp.send("Debugger.resume");
      resolveListener(true);
    } catch (error) {
      debuggerErrors.push(String(error?.stack || error).slice(0, 3000));
      try { await cdp.send("Debugger.resume"); } catch {}
      resolveListener(false);
    }
  });

  const response = await page.goto'''
    text, count = handler_pattern.subn(lambda _: handler_block, text, count=1)
    if count != 1:
        raise SystemExit(f"pause handler mismatch: {count}")

    setup_pattern = re.compile(
        r"  const gpRemote = await cdp\.send\(\"Runtime\.evaluate\".*?\n\n  report\.screenshots\.beforeFinalTap",
        re.S,
    )
    setup_block = r'''  const canvasRemote = await cdp.send("Runtime.evaluate", {
    expression: "document.querySelector('canvas#canvas') || document.querySelector('canvas')",
    objectGroup: "gams-page5-candidate-cover-listener",
    returnByValue: false,
    silent: true,
  });
  if (!canvasRemote.result?.objectId) throw new Error("candidate canvas unavailable");
  const inventory = await cdp.send("DOMDebugger.getEventListeners", {
    objectId: canvasRemote.result.objectId,
    depth: -1,
    pierce: true,
  });
  const touchstart = (inventory.listeners || []).find((listener) => listener.type === "touchstart");
  if (!touchstart) throw new Error("candidate touchstart listener unavailable");
  const canvasBreakpoint = await cdp.send("Debugger.setBreakpoint", {
    location: {
      scriptId: touchstart.scriptId,
      lineNumber: touchstart.lineNumber,
      columnNumber: touchstart.columnNumber,
    },
  });
  report.canvasListener = {
    type: touchstart.type,
    scriptId: touchstart.scriptId,
    lineNumber: touchstart.lineNumber,
    columnNumber: touchstart.columnNumber,
    breakpointId: canvasBreakpoint.breakpointId,
    actualLocation: canvasBreakpoint.actualLocation,
  };

  report.screenshots.beforeFinalTap'''
    text, count = setup_pattern.subn(lambda _: setup_block, text, count=1)
    if count != 1:
        raise SystemExit(f"listener setup mismatch: {count}")

    text = replace_once(
        text,
        "  await Promise.race([pausesReady, new Promise((resolve) => setTimeout(() => resolve(false), 15000))]);",
        "  await Promise.race([listenerReady, new Promise((resolve) => setTimeout(() => resolve(false), 15000))]);",
        "listener wait",
    )
    pass_pattern = re.compile(
        r"  report\.pass = pauses\.length >= 2.*?\n    && debuggerErrors\.length === 0;",
        re.S,
    )
    pass_block = '''  report.pass = listenerCaptured
    && Number(report.listener?.sourceLength || 0) > 0
    && report.mainFrameValid
    && pageErrors.length === 0
    && blockedOrders.length === 0
    && debuggerErrors.length === 0;'''
    text, count = pass_pattern.subn(pass_block, text, count=1)
    if count != 1:
        raise SystemExit(f"pass gate mismatch: {count}")
    text = text.replace(
        '  try { await cdp.send("Runtime.releaseObjectGroup", { objectGroup: "gams-page5-candidate-mouseup-state" }); } catch {}',
        '  try { await cdp.send("Runtime.releaseObjectGroup", { objectGroup: "gams-page5-candidate-cover-listener" }); } catch {}',
    )
    text = re.sub(
        r'console\.log\(JSON\.stringify\(\{.*?\}, null, 2\)\);',
        '''console.log(JSON.stringify({
  pass: report.pass,
  listenerCaptured: Boolean(report.listener),
  listenerSourceLength: report.listener?.sourceLength || 0,
  listenerSourceSha256: report.listener?.sourceSha256 || null,
  listenerScopeCount: report.listener?.scopeCount ?? null,
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
