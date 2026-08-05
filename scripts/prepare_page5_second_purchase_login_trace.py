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
            "scripts/prepare_page5_repeat_purchase_action_probe.py",
            "--output",
            args.output,
        ],
        check=True,
    )

    output = Path(args.output)
    text = output.read_text(encoding="utf-8")

    page_anchor = '  const page = await context.newPage();'
    page_injection = '''  const page = await context.newPage();
  const networkTraceCdp = await context.newCDPSession(page);
  await networkTraceCdp.send("Network.enable");
  await networkTraceCdp.send("Runtime.enable");
  await networkTraceCdp.send("Debugger.enable", { maxScriptsCacheSize: 30_000_000 });
  await networkTraceCdp.send("Debugger.setAsyncCallStackDepth", { maxDepth: 32 }).catch(() => {});
  const loginInitiators = [];

  const classifyTraceUrl = (raw) => {
    const value = String(raw || "");
    const lower = value.toLowerCase();
    if (lower === virtualSecondUrl.toLowerCase()) return "runtime-second";
    if (lower.includes("/bin/official/game.js")) return "official-page-runtime";
    if (lower.includes("webgllib.js")) return "official-render-library";
    if (lower.startsWith(targetPrefix.toLowerCase())) return "target-page";
    if (lower.startsWith("chrome-error://")) return "browser-error";
    if (!value) return "missing";
    return "other-script";
  };

  const flattenTraceStack = (root) => {
    const frames = [];
    let stack = root || null;
    let depth = 0;
    while (stack && frames.length < 40 && depth < 16) {
      for (const frame of stack.callFrames || []) {
        frames.push({
          functionName: String(frame.functionName || "").slice(0, 180),
          sourceClass: classifyTraceUrl(frame.url),
          lineNumber: Number.isFinite(frame.lineNumber) ? frame.lineNumber : null,
          columnNumber: Number.isFinite(frame.columnNumber) ? frame.columnNumber : null,
          scriptId: String(frame.scriptId || "").slice(0, 80),
        });
        if (frames.length >= 40) break;
      }
      stack = stack.parent || null;
      depth += 1;
    }
    return frames;
  };

  networkTraceCdp.on("Network.requestWillBeSent", (event) => {
    try {
      const raw = String(event.request?.url || "");
      const lower = raw.toLowerCase();
      const isLoginOrSession = lower.includes("/sso/")
        || lower.includes("login")
        || lower.includes("crosscheck")
        || lower.includes("passport.");
      if (!isLoginOrSession) return;
      const frames = flattenTraceStack(event.initiator?.stack || null);
      loginInitiators.push({
        at: Date.now(),
        initiatorType: event.initiator?.type || null,
        requestMethod: event.request?.method || null,
        requestClass: "login-or-session",
        documentClass: classifyTraceUrl(event.documentURL),
        frameCount: frames.length,
        frames,
      });
    } catch (error) {
      loginInitiators.push({
        at: Date.now(),
        initiatorType: "trace-error",
        requestClass: "login-or-session",
        error: redactText(error?.stack || error),
        frameCount: 0,
        frames: [],
      });
    }
  });'''
    text = replace_once(text, page_anchor, page_injection, "network trace page anchor")

    final_anchor = '''    result.blockedExternalNavigations = blockedExternalNavigations; result.mainFrameNavigation = mainFrameNavigation; result.runtimeLoads = runtimeLoads;
    await context.close();'''
    final_replacement = '''    result.blockedExternalNavigations = blockedExternalNavigations; result.mainFrameNavigation = mainFrameNavigation; result.runtimeLoads = runtimeLoads;
    result.loginInitiators = loginInitiators.slice(0, 80);
    await networkTraceCdp.detach().catch(() => {});
    await context.close();'''
    text = replace_once(text, final_anchor, final_replacement, "network trace finalizer")

    text = replace_once(
        text,
        'mode: "persisted-runtime-page5-first-second-reentry-third-purchase-probe"',
        'mode: "persisted-runtime-page5-second-purchase-login-initiator-trace"',
        "trace mode",
    )

    output.write_text(text, encoding="utf-8")
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
