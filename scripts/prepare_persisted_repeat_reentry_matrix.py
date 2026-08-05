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
            "scripts/prepare_page5_repeat_reentry_matrix.py",
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

    text = text.replace(
        'mode: "page5-first-second-reentry-third-repeat-matrix"',
        'mode: "persisted-runtime-page5-first-second-reentry-third-repeat-matrix"',
        1,
    )
    text = text.replace(
        'const outputDir = process.env.OUTPUT_DIR || "page5-repeat-reentry-matrix";',
        'const outputDir = process.env.OUTPUT_DIR || "persisted-repeat-reentry-matrix";',
        1,
    )
    gate_anchor = '  && summary.callbackReplacementCount === 1;'
    gate_new = '  && summary.callbackReplacementCount === 1\n  && candidatePatch.persistedSha256 === "9a5f9573077eaedada060ed4aeb3ea4307222ca29d4f10fd05fdb922d52d8fca";'
    if text.count(gate_anchor) != 1:
        raise SystemExit(f"gate anchor mismatch: {text.count(gate_anchor)}")
    text = text.replace(gate_anchor, gate_new, 1)
    patch_anchor = '    newTextSha256: candidatePatch.newTextSha256,\n    currentSecondSize: Buffer.byteLength(currentSecond),'
    patch_new = '    newTextSha256: candidatePatch.newTextSha256,\n    persistedSha256: candidatePatch.persistedSha256,\n    currentSecondSize: Buffer.byteLength(currentSecond),'
    if text.count(patch_anchor) != 1:
        raise SystemExit(f"patch report anchor mismatch: {text.count(patch_anchor)}")
    text = text.replace(patch_anchor, patch_new, 1)

    output.write_text(text, encoding="utf-8")
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
