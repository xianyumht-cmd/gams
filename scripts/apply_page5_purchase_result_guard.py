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


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label} marker mismatch: {count}")
    return text.replace(old, new, 1)


def verify_new_state(runtime: str, five_helper: str, repeat_helper: str) -> None:
    if sha256_text(runtime) != NEW_SHA256:
        raise SystemExit("new runtime hash verification failed")
    if runtime.count(GUARD_TEXT) != 1:
        raise SystemExit(f"purchase result guard count mismatch: {runtime.count(GUARD_TEXT)}")
    for helper, label in ((five_helper, "five-page helper"), (repeat_helper, "repeat helper")):
        if helper.count(NEW_SHA256) != 1:
            raise SystemExit(f"{label} new hash count mismatch: {helper.count(NEW_SHA256)}")
        if OLD_SHA256 in helper:
            raise SystemExit(f"{label} still contains old hash")


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
    five_source = five_path.read_text(encoding="utf-8")
    repeat_source = repeat_path.read_text(encoding="utf-8")
    source_sha = sha256_text(source)

    if source_sha == NEW_SHA256:
        verify_new_state(source, five_source, repeat_source)
        metadata = {
            "schemaVersion": 1,
            "alreadyApplied": True,
            "oldSha256": OLD_SHA256,
            "newSha256": NEW_SHA256,
            "guardText": GUARD_TEXT,
            "guardCount": source.count(GUARD_TEXT),
            "runtimeSizeBefore": len(source.encode("utf-8")),
            "runtimeSizeAfter": len(source.encode("utf-8")),
            "updatedHelpers": [],
        }
    elif source_sha == OLD_SHA256:
        if GUARD_TEXT in source:
            raise SystemExit("guard present on old runtime hash")

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
        five_candidate = replace_once(five_source, OLD_SHA256, NEW_SHA256, "five-page helper sha")
        repeat_candidate = replace_once(repeat_source, OLD_SHA256, NEW_SHA256, "repeat helper sha")
        verify_new_state(candidate, five_candidate, repeat_candidate)

        runtime_path.write_text(candidate, encoding="utf-8")
        five_path.write_text(five_candidate, encoding="utf-8")
        repeat_path.write_text(repeat_candidate, encoding="utf-8")
        metadata = {
            "schemaVersion": 1,
            "alreadyApplied": False,
            "oldSha256": source_sha,
            "newSha256": sha256_text(candidate),
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
    else:
        raise SystemExit(f"unexpected persisted runtime sha: {source_sha}")

    metadata_path.parent.mkdir(parents=True, exist_ok=True)
    metadata_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(metadata, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
