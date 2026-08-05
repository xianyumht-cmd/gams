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
            "scripts/prepare_page5_purchase_action_probe.py",
            "--output",
            args.output,
        ],
        check=True,
    )
    output = Path(args.output)
    text = output.read_text(encoding="utf-8")

    make_pattern = re.compile(r"function makeCandidate\(source\) \{.*?\n\}", re.S)
    make_candidate = '''function makeCandidate(source) {
  const guardNew = "tE['ge'+'tI'+'ns'+'ta'+'nc'+'e']()['is'+'Mo'+'bi'+'le']()||(typeof SCGMenu!=='undefined'&&(tT['sc'+'en'+'e']=new SCGMenu())),SF['Tk'+'Kw'+'f'](SAL_openMenu,";
  const callbackNew = "(tE['ge'+'tI'+'ns'+'ta'+'nc'+'e']()['is'+'Mo'+'bi'+'le']()||typeof SCGMenu==='undefined')&&(SA===void 0||(SA&&SA['is'+'Op'+'en'+'Th'+'eM'+'al'+'l']))&&tT['op'+'en'+'UI'+'Sc'+'en'+'e'](-3852+5642+10*822);";
  const guardCount = source.split(guardNew).length - 1;
  const callbackCount = source.split(callbackNew).length - 1;
  if (guardCount !== 1) throw new Error(`persisted guard count mismatch: ${guardCount}`);
  if (callbackCount !== 1) throw new Error(`persisted callback count mismatch: ${callbackCount}`);
  const needle = "us'+'er'+'Re'+'al'+'Na'+'me";
  const indices = [];
  let cursor = 0;
  while (true) {
    const index = source.indexOf(needle, cursor);
    if (index < 0) break;
    indices.push(index);
    cursor = index + needle.length;
  }
  if (indices.length !== 10) throw new Error(`real-name access count mismatch: ${indices.length}`);
  const targetIndex = indices[1];
  const functionStart = source.lastIndexOf("function gy(){", targetIndex);
  const insertAt = source.lastIndexOf("else{", targetIndex);
  if (functionStart < 0 || insertAt < functionStart) throw new Error("purchase result function guard anchor unavailable");
  const guardText = "if(typeof tp==='undefined'||tp==null)return;";
  if (source.includes(guardText)) throw new Error("purchase result guard already present");
  const insertion = insertAt + "else{".length;
  const candidate = source.slice(0, insertion) + guardText + source.slice(insertion);
  if (candidate.slice(insertion, insertion + guardText.length) !== guardText) throw new Error("purchase result guard insertion failed");
  return {
    candidate,
    count: guardCount + callbackCount + 1,
    guardCount,
    callbackCount,
    tpGuardCount: 1,
    targetAccessOrdinal: 2,
    targetAccessIndex: targetIndex,
    functionStart,
    insertion,
    guardText,
    oldTextSha256: sha256(Buffer.from(source)),
    newTextSha256: sha256(Buffer.from(candidate)),
    persistedSha256: sha256(Buffer.from(source)),
  };
}'''
    text, count = make_pattern.subn(lambda _m: make_candidate, text, count=1)
    if count != 1:
        raise SystemExit(f"makeCandidate block mismatch: {count}")

    text = replace_once(
        text,
        'mode: "persisted-runtime-page5-safe-final-purchase-action-probe"',
        'mode: "page5-browser-only-purchase-result-state-guard-candidate"',
        "mode",
    )
    text = replace_once(
        text,
        '  callbackReplacementCount: candidatePatch.callbackCount,\n};\n\nconst report = {',
        '  callbackReplacementCount: candidatePatch.callbackCount,\n  tpGuardCount: candidatePatch.tpGuardCount,\n};\n\nconst report = {',
        "summary tp guard count",
    )
    text = replace_once(
        text,
        'callbackReplacementCount: candidatePatch.callbackCount,\n    oldTextSha256:',
        'callbackReplacementCount: candidatePatch.callbackCount,\n    tpGuardCount: candidatePatch.tpGuardCount,\n    targetAccessOrdinal: candidatePatch.targetAccessOrdinal,\n    targetAccessIndex: candidatePatch.targetAccessIndex,\n    functionStart: candidatePatch.functionStart,\n    insertion: candidatePatch.insertion,\n    guardText: candidatePatch.guardText,\n    oldTextSha256:',
        "candidate patch report",
    )
    text = replace_once(
        text,
        '&& summary.replacementCount === 2\n  && summary.guardReplacementCount === 1\n  && summary.callbackReplacementCount === 1',
        '&& summary.replacementCount === 3\n  && summary.guardReplacementCount === 1\n  && summary.callbackReplacementCount === 1\n  && summary.tpGuardCount === 1',
        "replacement gate",
    )
    text = replace_once(
        text,
        'report.pass = report.safeProbeCompleted;',
        'report.pass = report.safeProbeCompleted && summary.candidatePageErrorCount === 0 && report.purchaseActionReached && report.purchaseResultObserved;',
        "candidate acceptance gate",
    )
    output.write_text(text, encoding="utf-8")
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
