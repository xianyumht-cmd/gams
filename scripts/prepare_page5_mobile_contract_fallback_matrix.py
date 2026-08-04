#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", default="scripts/run_page5_guard_full_entry_matrix.mjs")
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    source_path = Path(args.source)
    output_path = Path(args.output)
    text = source_path.read_text(encoding="utf-8")

    replacements = [
        (
            'const outputDir = process.env.OUTPUT_DIR || "page5-guard-full-entry-matrix";',
            'const outputDir = process.env.OUTPUT_DIR || "page5-mobile-contract-fallback-matrix";',
        ),
        (
            '  const newText = "tE[\'ge\'+\'tI\'+\'ns\'+\'ta\'+\'nc\'+\'e\']()[\'is\'+\'Mo\'+\'bi\'+\'le\']()||(typeof SCGMenu!==\'undefined\'&&(tT[\'sc\'+\'en\'+\'e\']=new SCGMenu())),SF[\'Tk\'+\'Kw\'+\'f\'](SAL_openMenu,";',
            '  const newText = "(typeof SCGMenu===\'undefined\'&&!tE[\'ge\'+\'tI\'+\'ns\'+\'ta\'+\'nc\'+\'e\']()[\'is\'+\'Mo\'+\'bi\'+\'le\']()&&(tE[\'ge\'+\'tI\'+\'ns\'+\'ta\'+\'nc\'+\'e\']()[\'is\'+\'Mo\'+\'bi\'+\'le\']=function(){return!0;})),tE[\'ge\'+\'tI\'+\'ns\'+\'ta\'+\'nc\'+\'e\']()[\'is\'+\'Mo\'+\'bi\'+\'le\']()||(tT[\'sc\'+\'en\'+\'e\']=new SCGMenu()),SF[\'Tk\'+\'Kw\'+\'f\'](SAL_openMenu,";',
        ),
        (
            '  if (!candidate.includes(newText) || candidate.includes(oldText)) throw new Error("candidate replacement verification failed");',
            '  if (!candidate.includes(newText) || candidate === source) throw new Error("candidate replacement verification failed");',
        ),
        (
            'mode: "page5-mobile-menu-guard-full-entry-matrix"',
            'mode: "page5-mobile-contract-fallback-full-entry-matrix"',
        ),
    ]

    for old, new in replacements:
        count = text.count(old)
        if count != 1:
            raise SystemExit(f"replacement marker count mismatch ({count}): {old[:120]}")
        text = text.replace(old, new, 1)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(text, encoding="utf-8")
    print(output_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
