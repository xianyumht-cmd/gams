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
            "scripts/prepare_page5_purchase_action_probe.py",
            "--output",
            args.output,
        ],
        check=True,
    )
    output = Path(args.output)
    text = output.read_text(encoding="utf-8")

    anchor = '''      const beforeFinalHash = await capture(page, path.join(outputDir, `${prefix}-before-final-buy.png`));
      await page.touchscreen.tap(finalBuyPoint.x, finalBuyPoint.y);'''
    replacement = '''      const beforeFinalHash = await capture(page, path.join(outputDir, `${prefix}-before-final-buy.png`));
      const exceptionCdp = await context.newCDPSession(page);
      await exceptionCdp.send("Runtime.enable");
      await exceptionCdp.send("Debugger.enable", { maxScriptsCacheSize: 40_000_000 });
      await exceptionCdp.send("Debugger.setPauseOnExceptions", { state: "all" });
      let resolveExceptionTrace;
      const exceptionTracePromise = new Promise((resolve) => { resolveExceptionTrace = resolve; });
      let exceptionCaptured = false;
      const evaluateFrame = async (callFrameId, expression) => {
        try {
          const evaluated = await exceptionCdp.send("Debugger.evaluateOnCallFrame", {
            callFrameId,
            expression,
            returnByValue: true,
            silent: true,
            throwOnSideEffect: true,
            timeout: 3000,
          });
          if (evaluated.exceptionDetails) return { ok: false, exception: redactText(evaluated.exceptionDetails.text || "evaluation exception") };
          return { ok: true, value: evaluated.result?.value, type: evaluated.result?.type, subtype: evaluated.result?.subtype || null };
        } catch (error) {
          return { ok: false, error: redactText(error?.stack || error) };
        }
      };
      const pausedHandler = async (event) => {
        if (exceptionCaptured) {
          try { await exceptionCdp.send("Debugger.resume"); } catch {}
          return;
        }
        exceptionCaptured = true;
        const trace = {
          reason: event.reason || null,
          data: event.data ? { description: redactText(event.data.description || ""), className: event.data.className || null } : null,
          callFrames: [],
          evaluations: {},
        };
        try {
          const frames = (event.callFrames || []).slice(0, 4);
          for (const frame of frames) {
            const frameInfo = {
              functionName: frame.functionName || "",
              url: safeUrl(frame.url || ""),
              location: frame.location || null,
              scopeChain: [],
            };
            for (const scope of (frame.scopeChain || []).filter((item) => item.type !== "global").slice(0, 6)) {
              const scopeInfo = { type: scope.type, name: scope.name || null, propertyNames: [] };
              if (scope.object?.objectId) {
                try {
                  const props = await exceptionCdp.send("Runtime.getProperties", {
                    objectId: scope.object.objectId,
                    ownProperties: true,
                    accessorPropertiesOnly: false,
                    generatePreview: false,
                  });
                  scopeInfo.propertyNames = (props.result || []).map((item) => item.name).filter(Boolean).slice(0, 120);
                } catch (error) {
                  scopeInfo.error = redactText(error?.stack || error);
                }
              }
              frameInfo.scopeChain.push(scopeInfo);
            }
            trace.callFrames.push(frameInfo);
          }
          const topFrame = frames[0];
          if (topFrame?.callFrameId) {
            const expressions = {
              tpType: "typeof tp",
              tpUndefined: "typeof tp==='undefined'",
              tpNull: "typeof tp!=='undefined'&&tp===null",
              tpKeys: "typeof tp!=='undefined'&&tp?Object.keys(tp).slice(0,80):null",
              tpShape: "typeof tp!=='undefined'&&tp?({hasRealName:Object.prototype.hasOwnProperty.call(tp,'userRealName'),hasRealAge:Object.prototype.hasOwnProperty.call(tp,'userRealAge'),hasVisitor:Object.prototype.hasOwnProperty.call(tp,'userIsVisitor')}):null",
              isMType: "typeof isM",
              isMBoolean: "typeof isM!=='undefined'?Boolean(isM):null",
              currentUserState: "(()=>{try{const i=tE['ge'+'tI'+'ns'+'ta'+'nc'+'e']();const d=i&&i['us'+'er'+'Da'+'ta'];return {instancePresent:Boolean(i),userDataType:typeof d,userDataPresent:Boolean(d),userDataKeys:d?Object.keys(d).slice(0,100):[],isLoginPresent:Boolean(d&&Object.prototype.hasOwnProperty.call(d,'isLogin')),uidPresent:Boolean(d&&d['uid']),tokenPresent:Boolean(d&&d['token'])};}catch(error){return {error:String(error)}}})()",
            };
            for (const [name, expression] of Object.entries(expressions)) trace.evaluations[name] = await evaluateFrame(topFrame.callFrameId, expression);
            try {
              const scriptId = topFrame.location?.scriptId;
              if (scriptId) {
                const script = await exceptionCdp.send("Debugger.getScriptSource", { scriptId });
                const source = String(script.scriptSource || "");
                const lineNumber = Number(topFrame.location?.lineNumber || 0);
                const columnNumber = Number(topFrame.location?.columnNumber || 0);
                let absoluteIndex = columnNumber;
                if (lineNumber > 0) {
                  const lines = source.split("\\n");
                  absoluteIndex = lines.slice(0, lineNumber).reduce((total, line) => total + line.length + 1, 0) + columnNumber;
                }
                trace.script = {
                  length: source.length,
                  lineNumber,
                  columnNumber,
                  absoluteIndex,
                  snippet: source.slice(Math.max(0, absoluteIndex - 1800), Math.min(source.length, absoluteIndex + 2800)),
                };
              }
            } catch (error) {
              trace.scriptError = redactText(error?.stack || error);
            }
          }
        } catch (error) {
          trace.captureError = redactText(error?.stack || error);
        }
        try { await exceptionCdp.send("Debugger.resume"); } catch {}
        resolveExceptionTrace(trace);
      };
      exceptionCdp.on("Debugger.paused", pausedHandler);
      await page.touchscreen.tap(finalBuyPoint.x, finalBuyPoint.y);'''
    text = replace_once(text, anchor, replacement, "final purchase exception hook")

    after_anchor = '''      await page.waitForTimeout(10000);
      await stage("after-final-buy");
      const attempt = {'''
    after_replacement = '''      const exceptionTrace = await Promise.race([
        exceptionTracePromise,
        new Promise((resolve) => setTimeout(() => resolve({ captured: false, reason: "exception pause timeout" }), 12000)),
      ]);
      exceptionCdp.off("Debugger.paused", pausedHandler);
      try { await exceptionCdp.send("Debugger.setPauseOnExceptions", { state: "none" }); } catch {}
      await exceptionCdp.detach().catch(() => {});
      await page.waitForTimeout(2000);
      await stage("after-final-buy");
      const attempt = {'''
    text = replace_once(text, after_anchor, after_replacement, "exception trace completion")

    attempt_anchor = '''        pageErrors: pageErrors.slice(finalErrorStart),
        url: safeUrl(page.url()),'''
    attempt_replacement = '''        pageErrors: pageErrors.slice(finalErrorStart),
        exceptionTrace,
        url: safeUrl(page.url()),'''
    text = replace_once(text, attempt_anchor, attempt_replacement, "attempt exception trace")

    text = text.replace(
        'mode: "persisted-runtime-page5-safe-final-purchase-action-probe"',
        'mode: "persisted-runtime-page5-purchase-exception-scope-probe"',
        1,
    )
    output.write_text(text, encoding="utf-8")
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
