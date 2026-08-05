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
        'const outputDir = process.env.OUTPUT_DIR || "page5-candidate-scope-state-probe-v5";',
        "output",
    )
    text = replace_once(
        text,
        'mode: "page5-candidate-cover-listener-read-only-probe"',
        'mode: "page5-candidate-scope-state-read-only-probe-v5"',
        "mode",
    )

    helper_marker = '''  let resolveListener;
  const listenerReady = new Promise((resolve) => { resolveListener = resolve; });
'''
    helper_block = r'''  const trackedScopeObjects = [];
  const trackedScopeNames = new Set(["tB", "tb", "tx", "tO", "tm", "tU", "tR", "tv", "NN"]);
  async function snapshotTrackedScopes() {
    const snapshots = [];
    for (const scope of trackedScopeObjects) {
      const properties = await cdp.send("Runtime.getProperties", {
        objectId: scope.objectId,
        ownProperties: true,
        accessorPropertiesOnly: false,
        generatePreview: false,
      });
      const values = {};
      for (const item of properties.result || []) {
        if (!trackedScopeNames.has(item.name)) continue;
        const value = item.value || {};
        values[item.name] = {
          type: value.type || null,
          value: value.value ?? null,
          description: String(value.description || "").slice(0, 120),
        };
      }
      snapshots.push({
        index: scope.index,
        description: scope.description,
        values,
      });
    }
    return snapshots;
  }

  let resolveListener;
  const listenerReady = new Promise((resolve) => { resolveListener = resolve; });
'''
    text = replace_once(text, helper_marker, helper_block, "scope helper")

    scope_pattern = re.compile(
        r"      let scopeCount = null;\n      const scopesRemote = .*?\n      \}\n      report\.canvasPause =",
        re.S,
    )
    scope_block = r'''      let scopeCount = null;
      const scopesRemote = (properties.internalProperties || []).find((item) => item.name === "[[Scopes]]")?.value;
      if (scopesRemote?.objectId) {
        const scopes = await cdp.send("Runtime.getProperties", {
          objectId: scopesRemote.objectId,
          ownProperties: true,
          accessorPropertiesOnly: false,
          generatePreview: false,
        });
        const numericScopes = (scopes.result || []).filter((item) => /^\d+$/.test(item.name) && item.value?.objectId);
        scopeCount = numericScopes.length;
        for (const item of numericScopes) {
          trackedScopeObjects.push({
            index: Number(item.name),
            objectId: item.value.objectId,
            description: String(item.value.description || "").slice(0, 200),
          });
        }
        report.scopeBefore = await snapshotTrackedScopes();
      }
      report.canvasPause ='''
    text, count = scope_pattern.subn(lambda _: scope_block, text, count=1)
    if count != 1:
        raise SystemExit(f"scope capture mismatch: {count}")

    text = replace_once(
        text,
        "  await page.waitForTimeout(12000);\n  report.screenshots.afterFinalTap = await capture(page, \"after-final-tap\");",
        "  await page.waitForTimeout(12000);\n  report.scopeAfter = await snapshotTrackedScopes();\n  report.screenshots.afterFinalTap = await capture(page, \"after-final-tap\");",
        "after snapshot",
    )

    pass_pattern = re.compile(
        r"  report\.pass = listenerCaptured.*?\n    && debuggerErrors\.length === 0;",
        re.S,
    )
    pass_block = '''  const trackedBeforeCount = (report.scopeBefore || []).reduce((sum, scope) => sum + Object.keys(scope.values || {}).length, 0);
  const trackedAfterCount = (report.scopeAfter || []).reduce((sum, scope) => sum + Object.keys(scope.values || {}).length, 0);
  report.pass = listenerCaptured
    && Number(report.listener?.sourceLength || 0) > 0
    && trackedBeforeCount > 0
    && trackedAfterCount > 0
    && report.mainFrameValid
    && pageErrors.length === 0
    && blockedOrders.length === 0
    && debuggerErrors.length === 0;'''
    text, count = pass_pattern.subn(pass_block, text, count=1)
    if count != 1:
        raise SystemExit(f"scope pass gate mismatch: {count}")
    text = re.sub(
        r'console\.log\(JSON\.stringify\(\{.*?\}, null, 2\)\);',
        '''console.log(JSON.stringify({
  pass: report.pass,
  listenerCaptured: Boolean(report.listener),
  listenerSourceLength: report.listener?.sourceLength || 0,
  listenerSourceSha256: report.listener?.sourceSha256 || null,
  scopeBefore: report.scopeBefore || [],
  scopeAfter: report.scopeAfter || [],
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
