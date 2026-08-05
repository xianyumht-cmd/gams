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
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    subprocess.run(
        [
            sys.executable,
            "scripts/prepare_persisted_repeat_reentry_matrix.py",
            "--output",
            args.output,
        ],
        check=True,
    )

    output = Path(args.output)
    text = output.read_text(encoding="utf-8")

    text = replace_once(
        text,
        'const outputDir = process.env.OUTPUT_DIR || "persisted-repeat-reentry-matrix";',
        'const outputDir = process.env.OUTPUT_DIR || "page5-purchase-action-probe";',
        "output directory",
    )

    classify_pattern = re.compile(r"function classifyRequest\(rawUrl, method\) \{.*?\n\}", re.S)
    classify = '''function classifyRequest(rawUrl, method) {
  const lower = String(rawUrl || "").toLowerCase();
  const mutation = !["GET", "HEAD", "OPTIONS"].includes(String(method || "GET").toUpperCase());
  if (lower === virtualSecondUrl.toLowerCase() || lower.includes("gams-script-edge.2320006072.workers.dev/engine/stable.js") || lower.includes("space-z.ai/game.js")) return "second-file";
  if (lower.includes("c2.cgyouxi.com/website/hfplayer/") && lower.includes("/bin/official/game.js")) return "official-file";
  if (lower.includes("raw.githubusercontent.com/xianyumht-cmd/gams") && (lower.includes("/remote-script/") || lower.includes("/game-engine/"))) return "forbidden-remote-runtime";
  if (mutation && (lower.includes("/propshop/") || lower.includes("createbuyorder") || lower.includes("createorder") || lower.includes("/order/create") || lower.includes("purchase") || lower.includes("/pay"))) return "blocked-order-mutation";
  if (lower.includes("/propshop/") && lower.includes("get_goods_list")) return "target-list-request";
  if (lower.includes("/propshop/")) return "target-read-request";
  if (lower.includes("/sso/") || lower.includes("passport.")) return "session-request";
  return "page-request";
}'''
    text, count = classify_pattern.subn(lambda _m: classify, text, count=1)
    if count != 1:
        raise SystemExit(f"classifyRequest block mismatch: {count}")

    execution_pattern = re.compile(
        r'''      result\.initialEngineCapture = await captureEngine\("initial"\);.*?      result\.targetScreenChanged = result\.repeatSequence\.every\(\(item\) => item\.screenChanged\);''',
        re.S,
    )
    execution = '''      result.purchaseProbe = { attempts: [] };
      result.initialEngineCapture = await captureEngine("initial");
      await page.waitForTimeout(22000);
      await stage("before-purchase-list-open");
      const listOpen = await openTarget("purchase-list-open");

      const purchasePoint = { x: 190, y: 358, label: "left-middle-purchase" };
      const requestStart = requests.length;
      const dialogStart = dialogs.length;
      const blockedStart = blockedOrders.length;
      const errorStart = pageErrors.length;
      const beforeHash = await capture(page, path.join(outputDir, `${prefix}-before-purchase-button.png`));
      await page.touchscreen.tap(purchasePoint.x, purchasePoint.y);
      events.push({ at: Date.now(), type: "purchase-button-touch", ...purchasePoint });
      await page.waitForTimeout(8000);
      await stage("after-purchase-button");
      const purchaseWindow = requestWindow(requests, requestStart);
      const attempt = {
        point: purchasePoint,
        screenChanged: beforeHash !== result.screenshots["after-purchase-button"],
        requestWindow: purchaseWindow,
        dialogs: dialogs.slice(dialogStart),
        blockedOrders: blockedOrders.slice(blockedStart),
        pageErrors: pageErrors.slice(errorStart),
        url: safeUrl(page.url()),
      };
      attempt.interactionObserved = Boolean(
        attempt.screenChanged
        || attempt.dialogs.length
        || attempt.blockedOrders.length
        || attempt.requestWindow.total > 0
      );
      result.purchaseProbe.listOpen = listOpen;
      result.purchaseProbe.attempts.push(attempt);
      result.targetWindow = purchaseWindow;
      result.targetScreenChanged = attempt.screenChanged;'''
    text, count = execution_pattern.subn(lambda _m: execution, text, count=1)
    if count != 1:
        raise SystemExit(f"purchase execution block mismatch: {count}")

    tail_pattern = re.compile(r"const candidateCase = cases\.find\(.*\Z", re.S)
    tail = '''const candidateCase = cases.find((item) => item.pair === "candidate" && item.page === "page5");
const attempts = candidateCase?.purchaseProbe?.attempts || [];
const attempt = attempts[0] || null;
const opens = candidateCase?.repeatSequence || [];
const summary = {
  totalCases: cases.length,
  fatalCases: cases.filter((item) => item.fatalError).length,
  runtimeEntryCompleteCases: cases.filter((item) => item.states?.["runtime-open"]?.runtimePanelVisible && !item.states?.["runtime-close"]?.runtimePanelVisible && item.states?.["runtime-reopen"]?.runtimePanelVisible).length,
  noLoginEnabledCases: cases.filter((item) => item.states?.["runtime-open"]?.noLoginEnabledTextPresent).length,
  secondFileLoadCount: candidateCase?.runtimeLoads?.second || 0,
  listOpenCount: opens.length,
  listTargetReadCount: opens.filter((item) => Number(item.targetWindow?.targetReadCount || 0) > 0).length,
  listTargetListCount: opens.filter((item) => Number(item.targetWindow?.targetListCount || 0) > 0).length,
  purchaseAttemptCount: attempts.length,
  purchaseInteractionObservedCount: attempts.filter((item) => item.interactionObserved).length,
  purchaseScreenChangedCount: attempts.filter((item) => item.screenChanged).length,
  purchaseDialogCount: attempts.reduce((total, item) => total + (item.dialogs?.length || 0), 0),
  purchaseBlockedMutationCount: attempts.reduce((total, item) => total + (item.blockedOrders?.length || 0), 0),
  purchaseRequestCount: attempts.reduce((total, item) => total + Number(item.requestWindow?.total || 0), 0),
  candidatePageErrorCount: candidateCase?.pageErrors?.length || 0,
  blockedExternalNavigationCases: cases.filter((item) => item.blockedExternalNavigations?.length).length,
  replacementCount: candidatePatch.count,
  guardReplacementCount: candidatePatch.guardCount,
  callbackReplacementCount: candidatePatch.callbackCount,
};

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  mode: "persisted-runtime-page5-safe-purchase-action-probe",
  candidatePatch: {
    replacementCount: candidatePatch.count,
    guardReplacementCount: candidatePatch.guardCount,
    callbackReplacementCount: candidatePatch.callbackCount,
    oldTextSha256: candidatePatch.oldTextSha256,
    newTextSha256: candidatePatch.newTextSha256,
    persistedSha256: candidatePatch.persistedSha256,
    currentSecondSize: Buffer.byteLength(currentSecond),
    currentSecondSha256: sha256(Buffer.from(currentSecond)),
  },
  purchasePoint: { x: 190, y: 358, label: "left-middle-purchase" },
  cases,
  summary,
  apkExecuted: false,
  paymentCompleted: false,
  authorizationOutcomeModified: false,
  runtimeFilesChanged: false,
  androidClientChanged: false,
  productionDefaultChanged: false,
};

report.safeProbeCompleted = summary.totalCases === 1
  && summary.fatalCases === 0
  && summary.runtimeEntryCompleteCases === 1
  && summary.noLoginEnabledCases === 1
  && summary.secondFileLoadCount >= 1
  && summary.listOpenCount === 1
  && summary.listTargetReadCount === 1
  && summary.listTargetListCount === 1
  && summary.purchaseAttemptCount === 1
  && summary.blockedExternalNavigationCases === 0
  && summary.replacementCount === 2
  && summary.guardReplacementCount === 1
  && summary.callbackReplacementCount === 1
  && candidatePatch.persistedSha256 === "9a5f9573077eaedada060ed4aeb3ea4307222ca29d4f10fd05fdb922d52d8fca";
report.purchaseActionReached = Boolean(attempt?.interactionObserved);
report.purchaseResultObserved = Boolean(attempt?.screenChanged || attempt?.dialogs?.length);
report.requiresCompatibilityReview = summary.candidatePageErrorCount > 0 || !report.purchaseActionReached;
report.pass = report.safeProbeCompleted;

fs.writeFileSync(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2) + "\\n");
console.log(JSON.stringify({
  pass: report.pass,
  safeProbeCompleted: report.safeProbeCompleted,
  purchaseActionReached: report.purchaseActionReached,
  purchaseResultObserved: report.purchaseResultObserved,
  requiresCompatibilityReview: report.requiresCompatibilityReview,
  ...summary,
}, null, 2));
if (!report.pass) process.exitCode = 1;
'''
    text, count = tail_pattern.subn(lambda _m: tail, text, count=1)
    if count != 1:
        raise SystemExit(f"purchase tail block mismatch: {count}")

    output.write_text(text, encoding="utf-8")
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
