#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", default="scripts/run_page5_guard_full_entry_matrix.mjs")
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    source_path = Path(args.source)
    output_path = Path(args.output)
    text = source_path.read_text(encoding="utf-8")

    output_old = 'const outputDir = process.env.OUTPUT_DIR || "page5-guard-full-entry-matrix";'
    output_new = 'const outputDir = process.env.OUTPUT_DIR || "page5-platform-fallback-matrix";'
    if text.count(output_old) != 1:
        raise SystemExit("output marker mismatch")
    text = text.replace(output_old, output_new, 1)

    candidate_function = r'''function makeCandidate(source) {
  const oldText = `Sj['pr'+'ot'+'ot'+'yp'+'e']['is'+'Mo'+'bi'+'le']=function(){if(Sg['yI'+'hA'+'A'](Sg['Yz'+'Pf'+'J'],Sg['ka'+'gG'+'p']))return this['_f'+'oc'+'us'+'Gr'+'ou'+'pI'+'d'];else{var SF=this['us'+'er'+'Da'+'ta']['pl'+'at'+'fo'+'rm']['to'+'Lo'+'we'+'rC'+'as'+'e']();return-7096*1+-2669+9765<=SF['in'+'de'+'xO'+'f']('an'+'dr'+'oi'+'d')||Sg['Lr'+'NB'+'P'](327+-13*188+2117,SF['in'+'de'+'xO'+'f'](Sg['oM'+'lO'+'f']));}},`;
  const newText = `Sj['pr'+'ot'+'ot'+'yp'+'e']['is'+'Mo'+'bi'+'le']=function(){if(Sg['yI'+'hA'+'A'](Sg['Yz'+'Pf'+'J'],Sg['ka'+'gG'+'p']))return this['_f'+'oc'+'us'+'Gr'+'ou'+'pI'+'d'];else{var SF=this['us'+'er'+'Da'+'ta']['pl'+'at'+'fo'+'rm']['to'+'Lo'+'we'+'rC'+'as'+'e']();return-7096*1+-2669+9765<=SF['in'+'de'+'xO'+'f']('an'+'dr'+'oi'+'d')||Sg['Lr'+'NB'+'P'](327+-13*188+2117,SF['in'+'de'+'xO'+'f'](Sg['oM'+'lO'+'f']))||/android|iphone|ipad|ipod|mobile/i['te'+'st'](navigator['us'+'er'+'Ag'+'en'+'t']);}},`;
  const count = source.split(oldText).length - 1;
  if (count !== 1) throw new Error(`candidate replacement count mismatch: ${count}`);
  const candidate = source.replace(oldText, newText);
  if (!candidate.includes(newText) || candidate === source) throw new Error("candidate replacement verification failed");
  return { candidate, count, oldTextSha256: sha256(Buffer.from(oldText)), newTextSha256: sha256(Buffer.from(newText)) };
}'''

    pattern = re.compile(r"function makeCandidate\(source\) \{.*?\n\}\n\nfunction safeUrl", re.S)
    text, count = pattern.subn(candidate_function + "\n\nfunction safeUrl", text, count=1)
    if count != 1:
        raise SystemExit(f"candidate function marker mismatch: {count}")

    mode_old = 'mode: "page5-mobile-menu-guard-full-entry-matrix"'
    mode_new = 'mode: "page5-platform-fallback-full-entry-matrix"'
    if text.count(mode_old) != 1:
        raise SystemExit("mode marker mismatch")
    text = text.replace(mode_old, mode_new, 1)

    gate_old = "  && summary.candidatePage5TargetReadCount > 0\n"
    gate_new = "  && summary.candidatePage5TargetListCount > 0\n"
    if text.count(gate_old) != 1:
        raise SystemExit("page five gate marker mismatch")
    text = text.replace(gate_old, gate_new, 1)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(text, encoding="utf-8")
    print(output_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
