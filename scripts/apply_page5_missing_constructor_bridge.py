#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def replace_exactly_once(text: str, old: str, new: str, label: str) -> tuple[str, int]:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label} marker mismatch: {count}")
    return text.replace(old, new, 1), count


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", default="game-engine/release/game-1.0.5.js")
    parser.add_argument("--report", default="")
    args = parser.parse_args()

    target = Path(args.target)
    before = target.read_bytes()
    source = before.decode("utf-8")

    guard_old = "tE['ge'+'tI'+'ns'+'ta'+'nc'+'e']()['is'+'Mo'+'bi'+'le']()||(tT['sc'+'en'+'e']=new SCGMenu()),SF['Tk'+'Kw'+'f'](SAL_openMenu,"
    guard_new = "tE['ge'+'tI'+'ns'+'ta'+'nc'+'e']()['is'+'Mo'+'bi'+'le']()||(typeof SCGMenu!=='undefined'&&(tT['sc'+'en'+'e']=new SCGMenu())),SF['Tk'+'Kw'+'f'](SAL_openMenu,"
    callback_old = "tE['ge'+'tI'+'ns'+'ta'+'nc'+'e']()['is'+'Mo'+'bi'+'le']()&&SA&&SA['is'+'Op'+'en'+'Th'+'eM'+'al'+'l']&&tT['op'+'en'+'UI'+'Sc'+'en'+'e'](-3852+5642+10*822);"
    callback_new = "(tE['ge'+'tI'+'ns'+'ta'+'nc'+'e']()['is'+'Mo'+'bi'+'le']()||typeof SCGMenu==='undefined')&&(SA===void 0||(SA&&SA['is'+'Op'+'en'+'Th'+'eM'+'al'+'l']))&&tT['op'+'en'+'UI'+'Sc'+'en'+'e'](-3852+5642+10*822);"

    patched, guard_count = replace_exactly_once(source, guard_old, guard_new, "guard")
    patched, callback_count = replace_exactly_once(patched, callback_old, callback_new, "callback")

    if guard_old in patched or callback_old in patched:
        raise SystemExit("old marker remained after patch")
    if patched.count(guard_new) != 1 or patched.count(callback_new) != 1:
        raise SystemExit("new marker verification failed")

    after = patched.encode("utf-8")
    target.write_bytes(after)

    report = {
        "schemaVersion": 1,
        "target": str(target),
        "guardReplacementCount": guard_count,
        "callbackReplacementCount": callback_count,
        "replacementCount": guard_count + callback_count,
        "beforeSize": len(before),
        "afterSize": len(after),
        "beforeSha256": sha256(before),
        "afterSha256": sha256(after),
        "changed": before != after,
    }
    if args.report:
        report_path = Path(args.report)
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
