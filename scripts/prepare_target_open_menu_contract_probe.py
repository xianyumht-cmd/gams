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
    parser.add_argument("--source", default="scripts/run_page5_guard_full_entry_matrix.mjs")
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    output = Path(args.output)
    subprocess.run(
        [
            sys.executable,
            "scripts/prepare_page5_scoped_mobile_contract_matrix.py",
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
        'const outputDir = process.env.OUTPUT_DIR || "page5-scoped-mobile-contract-matrix";',
        'const outputDir = process.env.OUTPUT_DIR || "target-open-menu-contract-probe";',
        "output",
    )

    routes = '''const routes = [
  {
    page: "working-page",
    targetId: "1682748",
    url: "https://m.66rpg.com/h5/1682748?ohp=v3&quality=32",
    steps: [
      { label: "common-menu", x: 328, y: 740 },
      { label: "target-entry", x: 175, y: 510 },
    ],
    marker: "target-read",
  },
  {
    page: "page5",
    targetId: "1691512",
    url: "https://m.66rpg.com/h5/1691512?ohp=v3&quality=32",
    steps: [
      { label: "target-entry", x: 258, y: 732 },
    ],
    marker: "target-read",
  },
];'''
    text, count = re.subn(r"const routes = \[.*?\n\];", routes, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"route block mismatch: {count}")

    install_marker = '    await clickRuntimeButton(page, events, "runtime-final-close"); await stage("runtime-final-close");\n\n'
    install_block = install_marker + '''    result.openMenuContractInstall = await page.evaluate(() => {
      const state = globalThis.__gamsOpenMenuContractProbe = {
        installed: false,
        originalType: typeof globalThis.SAL_openMenu,
        calls: [],
        callbacks: [],
      };
      const original = globalThis.SAL_openMenu;
      if (typeof original !== "function") return state;
      const summarize = (value) => {
        const type = value === null ? "null" : typeof value;
        const summary = { type };
        if (type === "object" || type === "function") {
          try { summary.ownKeys = Object.getOwnPropertyNames(value).slice(0, 120); }
          catch { summary.ownKeys = []; }
        }
        return summary;
      };
      const booleanFields = (value) => {
        const result = {};
        if (!value || (typeof value !== "object" && typeof value !== "function")) return result;
        for (const key of Object.getOwnPropertyNames(value).slice(0, 240)) {
          try { if (typeof value[key] === "boolean") result[key] = value[key]; }
          catch {}
        }
        return result;
      };
      const wrapper = function(...incoming) {
        const callIndex = state.calls.length;
        const args = incoming.slice();
        const callbackIndex = args.findIndex((value) => typeof value === "function");
        state.calls.push({
          at: Date.now(),
          argCount: args.length,
          callbackIndex,
          args: args.map(summarize),
        });
        if (callbackIndex >= 0) {
          const callback = args[callbackIndex];
          args[callbackIndex] = function(...callbackArgs) {
            const second = callbackArgs[1];
            state.callbacks.push({
              at: Date.now(),
              callIndex,
              argCount: callbackArgs.length,
              args: callbackArgs.map(summarize),
              secondOwnKeys: second && (typeof second === "object" || typeof second === "function")
                ? (() => { try { return Object.getOwnPropertyNames(second).slice(0, 240); } catch { return []; } })()
                : [],
              secondBooleanFields: booleanFields(second),
            });
            return Reflect.apply(callback, this, callbackArgs);
          };
        }
        return Reflect.apply(original, this, args);
      };
      try {
        globalThis.SAL_openMenu = wrapper;
        state.installed = globalThis.SAL_openMenu === wrapper;
      } catch (error) {
        state.installError = String(error).slice(0, 300);
      }
      return {
        installed: state.installed,
        originalType: state.originalType,
        installError: state.installError || null,
      };
    });

'''
    text = replace_once(text, install_marker, install_block, "contract install")

    finally_marker = '''    result.blockedExternalNavigations = blockedExternalNavigations; result.mainFrameNavigation = mainFrameNavigation; result.runtimeLoads = runtimeLoads;
    await context.close();'''
    finally_block = '''    result.blockedExternalNavigations = blockedExternalNavigations; result.mainFrameNavigation = mainFrameNavigation; result.runtimeLoads = runtimeLoads;
    result.openMenuContract = await page.evaluate(() => globalThis.__gamsOpenMenuContractProbe || null).catch(() => null);
    await context.close();'''
    text = replace_once(text, finally_marker, finally_block, "contract result")

    text = replace_once(
        text,
        'const pairs = [{ name: "current", secondSource: currentSecond }, { name: "candidate", secondSource: candidatePatch.candidate }];',
        'const pairs = [{ name: "candidate", secondSource: candidatePatch.candidate }];',
        "candidate-only pair",
    )

    tail_pattern = re.compile(r"function markerPassed\(item\).*\Z", re.S)
    tail = '''function markerPassed(item) {
  return Number(item.targetWindow?.targetReadCount || 0) > 0;
}

const working = cases.find((item) => item.page === "working-page");
const page5 = cases.find((item) => item.page === "page5");
const callbackBooleanUnion = (item) => {
  const result = {};
  for (const callback of item?.openMenuContract?.callbacks || []) {
    for (const [key, value] of Object.entries(callback.secondBooleanFields || {})) result[key] = value;
  }
  return result;
};
const summary = {
  totalCases: cases.length,
  fatalCases: cases.filter((item) => item.fatalError).length,
  runtimeEntryCompleteCases: cases.filter((item) => item.states?.["runtime-open"]?.runtimePanelVisible && !item.states?.["runtime-close"]?.runtimePanelVisible && item.states?.["runtime-reopen"]?.runtimePanelVisible).length,
  noLoginEnabledCases: cases.filter((item) => item.states?.["runtime-open"]?.noLoginEnabledTextPresent).length,
  secondFileLoadCases: cases.filter((item) => item.runtimeLoads?.second > 0).length,
  contractInstalledCases: cases.filter((item) => item.openMenuContract?.installed).length,
  workingCallCount: working?.openMenuContract?.calls?.length || 0,
  workingCallbackCount: working?.openMenuContract?.callbacks?.length || 0,
  workingTargetReadCount: working?.targetWindow?.targetReadCount || 0,
  workingTargetListCount: working?.targetWindow?.targetListCount || 0,
  workingCallbackBooleanFields: callbackBooleanUnion(working),
  page5CallCount: page5?.openMenuContract?.calls?.length || 0,
  page5CallbackCount: page5?.openMenuContract?.callbacks?.length || 0,
  page5TargetReadCount: page5?.targetWindow?.targetReadCount || 0,
  page5TargetListCount: page5?.targetWindow?.targetListCount || 0,
  page5CallbackBooleanFields: callbackBooleanUnion(page5),
  pageErrorCases: cases.filter((item) => item.pageErrors?.length).length,
  blockedOrderCases: cases.filter((item) => item.blockedOrders?.length).length,
  replacementCount: candidatePatch.count,
};

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  mode: "target-open-menu-contract-read-only-probe",
  apkExecuted: false,
  paymentCompleted: false,
  authorizationOutcomeModified: false,
  runtimeFilesChanged: false,
  androidClientChanged: false,
  productionDefaultChanged: false,
  candidatePatch: {
    replacementCount: candidatePatch.count,
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
  && summary.contractInstalledCases === 2
  && summary.workingCallCount > 0
  && summary.workingCallbackCount > 0
  && summary.workingTargetListCount > 0
  && summary.page5CallCount > 0
  && summary.page5CallbackCount > 0
  && summary.page5TargetReadCount > 0
  && summary.pageErrorCases === 0
  && summary.blockedOrderCases === 0
  && summary.replacementCount === 1;

fs.writeFileSync(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2) + "\\n");
console.log(JSON.stringify({ pass: report.pass, ...summary }, null, 2));
if (!report.pass) process.exitCode = 1;
'''
    text, count = tail_pattern.subn(tail, text, count=1)
    if count != 1:
        raise SystemExit(f"tail block mismatch: {count}")

    text = replace_once(
        text,
        'mode: "page5-scoped-mobile-contract-full-entry-matrix"',
        'mode: "target-open-menu-contract-read-only-probe"',
        "mode",
    )

    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(text, encoding="utf-8")
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
