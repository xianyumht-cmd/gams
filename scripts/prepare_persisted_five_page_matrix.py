#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    subprocess.run(
        [
            sys.executable,
            "scripts/prepare_five_page_missing_constructor_matrix.py",
            "--output",
            args.output,
        ],
        check=True,
    )
    output = Path(args.output)
    text = output.read_text(encoding="utf-8")

    make_pattern = re.compile(r"function makeCandidate\(source\) \{.*?\n\}", re.S)
    make_candidate = '''function makeCandidate(source) {
  const guardOld = "tE['ge'+'tI'+'ns'+'ta'+'nc'+'e']()['is'+'Mo'+'bi'+'le']()||(tT['sc'+'en'+'e']=new SCGMenu()),SF['Tk'+'Kw'+'f'](SAL_openMenu,";
  const guardNew = "tE['ge'+'tI'+'ns'+'ta'+'nc'+'e']()['is'+'Mo'+'bi'+'le']()||(typeof SCGMenu!=='undefined'&&(tT['sc'+'en'+'e']=new SCGMenu())),SF['Tk'+'Kw'+'f'](SAL_openMenu,";
  const callbackOld = "tE['ge'+'tI'+'ns'+'ta'+'nc'+'e']()['is'+'Mo'+'bi'+'le']()&&SA&&SA['is'+'Op'+'en'+'Th'+'eM'+'al'+'l']&&tT['op'+'en'+'UI'+'Sc'+'en'+'e'](-3852+5642+10*822);";
  const callbackNew = "(tE['ge'+'tI'+'ns'+'ta'+'nc'+'e']()['is'+'Mo'+'bi'+'le']()||typeof SCGMenu==='undefined')&&(SA===void 0||(SA&&SA['is'+'Op'+'en'+'Th'+'eM'+'al'+'l']))&&tT['op'+'en'+'UI'+'Sc'+'en'+'e'](-3852+5642+10*822);";
  const guardCount = source.split(guardNew).length - 1;
  const callbackCount = source.split(callbackNew).length - 1;
  if (guardCount !== 1) throw new Error(`persisted guard count mismatch: ${guardCount}`);
  if (callbackCount !== 1) throw new Error(`persisted callback count mismatch: ${callbackCount}`);
  if (source.includes(guardOld) || source.includes(callbackOld)) throw new Error("old persisted marker remained");
  return {
    candidate: source,
    count: guardCount + callbackCount,
    guardCount,
    callbackCount,
    oldTextSha256: sha256(Buffer.from(guardOld + "\\n" + callbackOld)),
    newTextSha256: sha256(Buffer.from(guardNew + "\\n" + callbackNew)),
    persistedSha256: sha256(Buffer.from(source)),
  };
}'''
    text, count = make_pattern.subn(lambda _m: make_candidate, text, count=1)
    if count != 1:
        raise SystemExit(f"makeCandidate block mismatch: {count}")

    old_pairs = 'const pairs = [{ name: "current", secondSource: currentSecond }, { name: "candidate", secondSource: candidatePatch.candidate }];'
    if text.count(old_pairs) != 1:
        raise SystemExit(f"pair marker mismatch: {text.count(old_pairs)}")
    text = text.replace(old_pairs, 'const pairs = [{ name: "candidate", secondSource: candidatePatch.candidate }];', 1)

    tail_pattern = re.compile(r"function markerPassed\(item\).*\Z", re.S)
    tail = '''function markerPassed(item) {
  if (!item) return false;
  if (item.marker === "visual-change") return Boolean(item.targetScreenChanged);
  return Number(item.targetWindow?.targetReadCount || 0) > 0;
}

const candidateCases = cases.filter((item) => item.pair === "candidate");
const candidatePage5 = candidateCases.find((item) => item.page === "page5");
const summary = {
  totalCases: cases.length,
  fatalCases: cases.filter((item) => item.fatalError).length,
  runtimeEntryCompleteCases: cases.filter((item) => item.states?.["runtime-open"]?.runtimePanelVisible && !item.states?.["runtime-close"]?.runtimePanelVisible && item.states?.["runtime-reopen"]?.runtimePanelVisible).length,
  noLoginEnabledCases: cases.filter((item) => item.states?.["runtime-open"]?.noLoginEnabledTextPresent).length,
  secondFileLoadCases: cases.filter((item) => item.runtimeLoads?.second > 0).length,
  candidateMarkerCount: candidateCases.filter(markerPassed).length,
  candidatePageErrorCases: candidateCases.filter((item) => item.pageErrors?.length).length,
  candidatePage5TargetReadCount: candidatePage5?.targetWindow?.targetReadCount || 0,
  candidatePage5TargetListCount: candidatePage5?.targetWindow?.targetListCount || 0,
  candidatePage5DynamicTargetOk: Boolean(candidatePage5?.dynamicTarget?.ok),
  blockedOrderCases: cases.filter((item) => item.blockedOrders?.length).length,
  replacementCount: candidatePatch.count,
  guardReplacementCount: candidatePatch.guardCount,
  callbackReplacementCount: candidatePatch.callbackCount,
};

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  mode: "persisted-runtime-five-page-matrix",
  candidatePatch: {
    replacementCount: candidatePatch.count,
    guardReplacementCount: candidatePatch.guardCount,
    callbackReplacementCount: candidatePatch.callbackCount,
    oldTextSha256: candidatePatch.oldTextSha256,
    newTextSha256: candidatePatch.newTextSha256,
    persistedSha256: candidatePatch.persistedSha256,
    persistedSize: Buffer.byteLength(currentSecond),
  },
  routes: routes.map(({ page, targetId, url, steps, marker }) => ({ page, targetId, url: safeUrl(url), steps, marker })),
  cases,
  summary,
  apkExecuted: false,
  paymentCompleted: false,
  authorizationOutcomeModified: false,
  runtimeFilesChanged: true,
  androidClientChanged: false,
  productionDefaultChanged: false,
};

report.pass = summary.totalCases === 5
  && summary.fatalCases === 0
  && summary.runtimeEntryCompleteCases === 5
  && summary.noLoginEnabledCases === 5
  && summary.secondFileLoadCases === 5
  && summary.candidateMarkerCount === 5
  && summary.candidatePageErrorCases === 0
  && summary.candidatePage5DynamicTargetOk
  && summary.candidatePage5TargetReadCount > 0
  && summary.candidatePage5TargetListCount > 0
  && summary.blockedOrderCases === 0
  && summary.replacementCount === 2
  && summary.guardReplacementCount === 1
  && summary.callbackReplacementCount === 1
  && candidatePatch.persistedSha256 === "9a5f9573077eaedada060ed4aeb3ea4307222ca29d4f10fd05fdb922d52d8fca";

fs.writeFileSync(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2) + "\\n");
console.log(JSON.stringify({ pass: report.pass, ...summary }, null, 2));
if (!report.pass) process.exitCode = 1;
'''
    text, count = tail_pattern.subn(lambda _m: tail, text, count=1)
    if count != 1:
        raise SystemExit(f"tail block mismatch: {count}")

    text = text.replace(
        'const outputDir = process.env.OUTPUT_DIR || "five-page-missing-constructor-matrix";',
        'const outputDir = process.env.OUTPUT_DIR || "persisted-five-page-matrix";',
        1,
    )
    output.write_text(text, encoding="utf-8")
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
