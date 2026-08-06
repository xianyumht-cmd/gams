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
            "scripts/prepare_page5_second_purchase_scope_probe.py",
            "--output",
            args.output,
        ],
        check=True,
    )

    output = Path(args.output)
    text = output.read_text(encoding="utf-8")

    old_breakpoint = '''        const response = await purchaseTraceCdp.send("Debugger.setBreakpoint", {
          location: {
            scriptId: runtimeScript.scriptId,
            lineNumber: 0,
            columnNumber: target.columnNumber,
          },
        });'''
    new_breakpoint = '''        const response = await purchaseTraceCdp.send("Debugger.setBreakpointByUrl", {
          url: virtualSecondUrl,
          lineNumber: 0,
          columnNumber: target.columnNumber,
        });'''
    text = replace_once(text, old_breakpoint, new_breakpoint, "persistent URL breakpoint")

    old_item = '''          scriptId: runtimeScript.scriptId,
          breakpointId: response.breakpointId || null,
          locations: response.actualLocation ? [response.actualLocation] : [],'''
    new_item = '''          scriptId: runtimeScript.scriptId,
          breakpointId: response.breakpointId || null,
          locations: Array.isArray(response.locations) ? response.locations : [],'''
    text = replace_once(text, old_item, new_item, "persistent breakpoint result")

    old_pause = '''    if (!matchedId) return;
    const configured = purchaseScopeBreakpointById.get(matchedId);'''
    new_pause = '''    if (!matchedId) {
      try { await purchaseTraceCdp.send("Debugger.resume"); } catch {}
      return;
    }
    if (purchaseScopeSnapshots.length >= 36) {
      try { await purchaseTraceCdp.send("Debugger.resume"); } catch {}
      return;
    }
    const configured = purchaseScopeBreakpointById.get(matchedId);
    const purchaseScopeResumeWatchdog = setTimeout(() => {
      purchaseTraceCdp.send("Debugger.resume").catch(() => {});
    }, 3000);'''
    text = replace_once(text, old_pause, new_pause, "bounded pause handling")

    text = replace_once(
        text,
        '      for (const frame of (event.callFrames || []).slice(0, 8)) {',
        '      for (const frame of (event.callFrames || []).slice(0, 4)) {',
        "bounded frame capture",
    )

    old_finally = '''    } finally {
      try { await purchaseTraceCdp.send("Debugger.resume"); } catch {}
    }'''
    new_finally = '''    } finally {
      clearTimeout(purchaseScopeResumeWatchdog);
      try { await purchaseTraceCdp.send("Debugger.resume"); } catch {}
    }'''
    text = replace_once(text, old_finally, new_finally, "pause watchdog cleanup")

    text = replace_once(
        text,
        'mode: "persisted-runtime-page5-second-purchase-callback-scope-probe"',
        'mode: "persisted-runtime-page5-purchase-scope-triplet-probe"',
        "triplet mode",
    )

    output.write_text(text, encoding="utf-8")
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
