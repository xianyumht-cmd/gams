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
        'const outputDir = process.env.OUTPUT_DIR || "page5-empty-callback-bridge-probe";',
        "output",
    )

    routes = '''const routes = [
  {
    page: "page5",
    targetId: "1691512",
    url: "https://m.66rpg.com/h5/1691512?ohp=v3&quality=32",
    steps: [
      { label: "cover-progress", x: 195, y: 422 },
      { label: "title-reveal", x: 50, y: 420 },
      {
        label: "target-precondition",
        x: 195,
        y: 422,
        longPressMs: 800,
        followupTap: { x: 228, y: 418, delayMs: 800 },
      },
      { label: "target-entry", x: 258, y: 732 },
    ],
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
  if (!candidate.includes(guardNew) || !candidate.includes(callbackNew)) throw new Error("candidate replacement verification failed");
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

    tap_marker = "      await page.touchscreen.tap(step.x, step.y);\n"
    tap_replacement = '''      if (Number(step.longPressMs || 0) > 0) {
        const inputSession = await page.context().newCDPSession(page);
        await inputSession.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [{ x: step.x, y: step.y, radiusX: 1, radiusY: 1, force: 1, id: 0 }],
        });
        await page.waitForTimeout(Number(step.longPressMs));
        await inputSession.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await inputSession.detach().catch(() => {});
      } else {
        await page.touchscreen.tap(step.x, step.y);
      }
'''
    text = replace_once(text, tap_marker, tap_replacement, "long press")

    event_marker = "      events.push({ at: Date.now(), type: \"route-tap\", stepIndex, ...step });\n"
    event_replacement = event_marker + '''      if (step.followupTap) {
        await page.waitForTimeout(Number(step.followupTap.delayMs || 0));
        await page.touchscreen.tap(step.followupTap.x, step.followupTap.y);
        events.push({
          at: Date.now(),
          type: "route-followup-tap",
          stepIndex,
          label: `${step.label}-followup`,
          x: step.followupTap.x,
          y: step.followupTap.y,
          delayMs: Number(step.followupTap.delayMs || 0),
        });
      }
'''
    text = replace_once(text, event_marker, event_replacement, "follow-up tap")

    wait_old = "      await page.waitForTimeout(isFinal ? 10000 : 5000);"
    wait_new = '''      const stepWaitMs = step.label === "target-precondition"
        ? 10000
        : (isFinal ? 15000 : 7000);
      await page.waitForTimeout(stepWaitMs);'''
    text = replace_once(text, wait_old, wait_new, "step wait")

    tail_pattern = re.compile(r"function markerPassed\(item\).*\Z", re.S)
    tail = '''function markerPassed(item) {
  return Number(item.targetWindow?.targetReadCount || 0) > 0;
}

const currentPage5 = cases.find((item) => item.pair === "current" && item.page === "page5");
const candidatePage5 = cases.find((item) => item.pair === "candidate" && item.page === "page5");
const summary = {
  totalCases: cases.length,
  fatalCases: cases.filter((item) => item.fatalError).length,
  runtimeEntryCompleteCases: cases.filter((item) => item.states?.["runtime-open"]?.runtimePanelVisible && !item.states?.["runtime-close"]?.runtimePanelVisible && item.states?.["runtime-reopen"]?.runtimePanelVisible).length,
  noLoginEnabledCases: cases.filter((item) => item.states?.["runtime-open"]?.noLoginEnabledTextPresent).length,
  secondFileLoadCases: cases.filter((item) => item.runtimeLoads?.second > 0).length,
  currentPageErrorCount: currentPage5?.pageErrors?.length || 0,
  currentTargetReadCount: currentPage5?.targetWindow?.targetReadCount || 0,
  currentTargetListCount: currentPage5?.targetWindow?.targetListCount || 0,
  candidatePageErrorCount: candidatePage5?.pageErrors?.length || 0,
  candidateTargetReadCount: candidatePage5?.targetWindow?.targetReadCount || 0,
  candidateTargetListCount: candidatePage5?.targetWindow?.targetListCount || 0,
  candidateScreenshotChanged: Boolean(candidatePage5?.targetScreenChanged),
  blockedOrderCases: cases.filter((item) => item.blockedOrders?.length).length,
  replacementCount: candidatePatch.count,
  guardReplacementCount: candidatePatch.guardCount,
  emptyCallbackReplacementCount: candidatePatch.callbackCount,
};

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  mode: "page5-empty-callback-bridge-probe",
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
  && summary.candidatePageErrorCount === 0
  && summary.candidateTargetReadCount > 0
  && summary.candidateTargetListCount > 0
  && summary.blockedOrderCases === 0
  && summary.replacementCount === 2
  && summary.guardReplacementCount === 1
  && summary.emptyCallbackReplacementCount === 1;

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
