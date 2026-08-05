#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

OLD_SHA256 = "9a5f9573077eaedada060ed4aeb3ea4307222ca29d4f10fd05fdb922d52d8fca"
NEW_SHA256 = "57765fbb8d9a0529ed1463623f1bed9c05052e76396a6aaa89fdd2ecc673bc72"
GUARD_TEXT = "if(typeof tp==='undefined'||tp==null)return;"
ACCESS_NEEDLE = "us'+'er'+'Re'+'al'+'Na'+'me"
OLD_HASH_LITERAL = OLD_SHA256
NEW_HASH_LITERAL = NEW_SHA256


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label} marker mismatch: {count}")
    return text.replace(old, new, 1)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--runtime", required=True)
    parser.add_argument("--five-helper", required=True)
    parser.add_argument("--repeat-helper", required=True)
    parser.add_argument("--metadata", required=True)
    args = parser.parse_args()

    runtime_path = Path(args.runtime)
    five_path = Path(args.five_helper)
    repeat_path = Path(args.repeat_helper)
    metadata_path = Path(args.metadata)

    source = runtime_path.read_text(encoding="utf-8")
    old_sha = sha256_text(source)
    if old_sha != OLD_SHA256:
        raise SystemExit(f"persisted runtime sha mismatch: {old_sha}")
    if GUARD_TEXT in source:
        raise SystemExit("purchase result guard already present")

    indices: list[int] = []
    cursor = 0
    while True:
        index = source.find(ACCESS_NEEDLE, cursor)
        if index < 0:
            break
        indices.append(index)
        cursor = index + len(ACCESS_NEEDLE)
    if len(indices) != 10:
        raise SystemExit(f"real-name access count mismatch: {len(indices)}")

    target_index = indices[1]
    function_start = source.rfind("function gy(){", 0, target_index)
    insert_anchor = source.rfind("else{", function_start, target_index)
    if function_start < 0 or insert_anchor < function_start:
        raise SystemExit("purchase result function guard anchor unavailable")

    insertion = insert_anchor + len("else{")
    candidate = source[:insertion] + GUARD_TEXT + source[insertion:]
    new_sha = sha256_text(candidate)
    if new_sha != NEW_SHA256:
        raise SystemExit(f"candidate runtime sha mismatch: {new_sha}")
    if candidate.count(GUARD_TEXT) != 1:
        raise SystemExit("purchase result guard count mismatch")
    runtime_path.write_text(candidate, encoding="utf-8")

    for helper_path, label in ((five_path, "five-page helper"), (repeat_path, "repeat helper")):
        helper = helper_path.read_text(encoding="utf-8")
        helper = replace_once(helper, OLD_HASH_LITERAL, NEW_HASH_LITERAL, label + " sha")
        helper_path.write_text(helper, encoding="utf-8")

    metadata = {
        "schemaVersion": 1,
        "oldSha256": old_sha,
        "newSha256": new_sha,
        "guardText": GUARD_TEXT,
        "guardCount": candidate.count(GUARD_TEXT),
        "targetAccessOrdinal": 2,
        "targetAccessIndex": target_index,
        "functionStart": function_start,
        "insertion": insertion,
        "runtimeSizeBefore": len(source.encode("utf-8")),
        "runtimeSizeAfter": len(candidate.encode("utf-8")),
        "updatedHelpers": [str(five_path), str(repeat_path)],
    }
    metadata_path.parent.mkdir(parents=True, exist_ok=True)
    metadata_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(metadata, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
