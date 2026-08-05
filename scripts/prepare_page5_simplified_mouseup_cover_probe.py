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
        'const outputDir = process.env.OUTPUT_DIR || "page5-simplified-mouseup-cover-probe";',
        "output",
    )

    route_block = '''const routes = [
  {
    page: "page5",
    targetId: "1691512",
    url: "https://m.66rpg.com/h5/1691512?ohp=v3&quality=32",
    steps: [
      { label: "cover-progress", x: 195, y: 422 },
      { label: "title-reveal", x: 50, y: 420 },
      { label: "cover-center-enter", x: 195, y: 422 },
    ],
    marker: "visual-change",
  },
];'''
    text, count = re.subn(r"const routes = \[.*?\n\];", route_block, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"route block mismatch: {count}")

    candidate_function = r'''function makeCandidate(source) {
  const mobileOld = `Sj['pr'+'ot'+'ot'+'yp'+'e']['is'+'Mo'+'bi'+'le']=function(){if(Sg['yI'+'hA'+'A'](Sg['Yz'+'Pf'+'J'],Sg['ka'+'gG'+'p']))return this['_f'+'oc'+'us'+'Gr'+'ou'+'pI'+'d'];else{var SF=this['us'+'er'+'Da'+'ta']['pl'+'at'+'fo'+'rm']['to'+'Lo'+'we'+'rC'+'as'+'e']();return-7096*1+-2669+9765<=SF['in'+'de'+'xO'+'f']('an'+'dr'+'oi'+'d')||Sg['Lr'+'NB'+'P'](327+-13*188+2117,SF['in'+'de'+'xO'+'f'](Sg['oM'+'lO'+'f']));}},`;
  const mobileNew = `Sj['pr'+'ot'+'ot'+'yp'+'e']['is'+'Mo'+'bi'+'le']=function(){if(Sg['yI'+'hA'+'A'](Sg['Yz'+'Pf'+'J'],Sg['ka'+'gG'+'p']))return this['_f'+'oc'+'us'+'Gr'+'ou'+'pI'+'d'];else{var SF=this['us'+'er'+'Da'+'ta']['pl'+'at'+'fo'+'rm']['to'+'Lo'+'we'+'rC'+'as'+'e']();return-7096*1+-2669+9765<=SF['in'+'de'+'xO'+'f']('an'+'dr'+'oi'+'d')||Sg['Lr'+'NB'+'P'](327+-13*188+2117,SF['in'+'de'+'xO'+'f'](Sg['oM'+'lO'+'f']))||(location['pa'+'th'+'na'+'me']['in'+'de'+'xO'+'f']('/h5/1691512')>=0&&/android|iphone|ipad|ipod|mobile/i['te'+'st'](navigator['us'+'er'+'Ag'+'en'+'t']));}},`;

  function extractNamedFunction(input, name) {
    const marker = `function ${name}(`;
    const start = input.indexOf(marker);
    if (start < 0 || input.indexOf(marker, start + marker.length) >= 0) {
      throw new Error(`${name} function occurrence mismatch`);
    }
    const brace = input.indexOf('{', start + marker.length);
    if (brace < 0) throw new Error(`${name} function brace unavailable`);
    let depth = 0;
    let quote = null;
    let escaped = false;
    for (let index = brace; index < input.length; index += 1) {
      const char = input[index];
      if (quote) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === quote) quote = null;
        continue;
      }
      if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
      if (char === '{') depth += 1;
      else if (char === '}') {
        depth -= 1;
        if (depth === 0) return { start, end: index + 1, source: input.slice(start, index + 1) };
      }
    }
    throw new Error(`${name} function end unavailable`);
  }

  const mobileCount = source.split(mobileOld).length - 1;
  if (mobileCount !== 1) throw new Error(`mobile replacement count mismatch: ${mobileCount}`);
  let candidate = source.replace(mobileOld, mobileNew);

  const mouseUp = extractNamedFunction(candidate, 'gp');
  const expectedMouseUpLength = 1278;
  const expectedMouseUpSha256 = '8c4369715f263e16bd3d3e4654f19a51d58a66b6fc0138c446dfbde66c0cf913';
  if (mouseUp.source.length !== expectedMouseUpLength) {
    throw new Error(`gp length mismatch: ${mouseUp.source.length}`);
  }
  if (sha256(Buffer.from(mouseUp.source)) !== expectedMouseUpSha256) {
    throw new Error('gp source fingerprint mismatch');
  }
  const simplifiedMouseUp = "function gp(Sg){tB=true;var Sj=tb,SF=tx,ST=tO;G2['gP'+'hR'+'S'](gA),Sj?tm=false:ST&&SF<G2['bl'+'FG'+'B'](0.35,NN)&&(tm=true),tU=false,tR=tv=-1;}";
  candidate = candidate.slice(0, mouseUp.start) + simplifiedMouseUp + candidate.slice(mouseUp.end);
  if (candidate === source || !candidate.includes(simplifiedMouseUp) || candidate.includes(mouseUp.source)) {
    throw new Error('candidate verification failed');
  }
  return {
    candidate,
    count: mobileCount + 1,
    oldTextSha256: sha256(Buffer.from(mobileOld + "\n" + mouseUp.source)),
    newTextSha256: sha256(Buffer.from(mobileNew + "\n" + simplifiedMouseUp)),
    originalMouseUpLength: mouseUp.source.length,
    simplifiedMouseUpLength: simplifiedMouseUp.length,
  };
}'''
    pattern = re.compile(r"function makeCandidate\(source\) \{.*?\n\}\n\nfunction safeUrl", re.S)
    text, count = pattern.subn(lambda _: candidate_function + "\n\nfunction safeUrl", text, count=1)
    if count != 1:
        raise SystemExit(f"candidate function mismatch: {count}")

    text = replace_once(
        text,
        "      await page.waitForTimeout(isFinal ? 10000 : 5000);",
        "      await page.waitForTimeout(isFinal ? 30000 : 7000);",
        "step wait",
    )
    text = replace_once(
        text,
        'mode: "page5-mobile-menu-guard-full-entry-matrix"',
        'mode: "page5-simplified-mouseup-cover-probe"',
        "mode",
    )

    summary_marker = "  candidatePage5ScreenshotChanged: Boolean(candidatePage5?.targetScreenChanged),\n"
    summary_addition = summary_marker + '''  candidatePage5FinalRequestTotal: candidatePage5?.targetWindow?.total || 0,
  candidatePage5FinalStage: candidatePage5?.states?.["after-03-cover-center-enter"] || null,
'''
    text = replace_once(text, summary_marker, summary_addition, "summary")

    pass_pattern = re.compile(r"report\.pass = .*?\n  && summary\.replacementCount === 1;", re.S)
    pass_block = '''report.pass = summary.totalCases === 2
  && summary.fatalCases === 0
  && summary.runtimeEntryCompleteCases === 2
  && summary.noLoginEnabledCases === 2
  && summary.secondFileLoadCases === 2
  && summary.candidatePage5PageErrorCount === 0
  && summary.candidatePage5ScreenshotChanged
  && summary.candidatePage5FinalRequestTotal > 0
  && summary.blockedOrderCases === 0
  && summary.replacementCount === 2;'''
    text, count = pass_pattern.subn(pass_block, text, count=1)
    if count != 1:
        raise SystemExit(f"pass gate mismatch: {count}")

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(text, encoding="utf-8")
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
