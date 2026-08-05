#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def compact(value: str, limit: int) -> str:
    return value.replace("\n", "\\n").replace("\r", "\\r")[:limit]


def function_context(source: str, index: int) -> dict[str, object]:
    search_start = max(0, index - 8000)
    prefix = source[search_start:index]
    positions = [prefix.rfind("function "), prefix.rfind("function("), prefix.rfind("function (")]
    relative = max(positions)
    if relative < 0:
        return {"start": None, "header": None}
    start = search_start + relative
    return {"start": start, "header": compact(source[start:start + 240], 240)}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--error-index", type=int, default=255076)
    args = parser.parse_args()

    source = Path(args.source).read_text(encoding="utf-8")
    needle = "us'+'er'+'Re'+'al'+'Na'+'me"
    accesses: list[dict[str, object]] = []
    cursor = 0
    while True:
        index = source.find(needle, cursor)
        if index < 0:
            break
        before = source[max(0, index - 260):index]
        after = source[index + len(needle):min(len(source), index + len(needle) + 420)]
        base_match = re.search(r"([A-Za-z_$][A-Za-z0-9_$]*)\s*\[\s*'$", before)
        accesses.append({
            "ordinal": len(accesses) + 1,
            "index": index,
            "distanceFromErrorIndex": index - args.error_index,
            "baseToken": base_match.group(1) if base_match else None,
            "before": compact(before, 260),
            "after": compact(after, 420),
            "function": function_context(source, index),
        })
        cursor = index + len(needle)

    plain_index = source.find("userRealName")
    error_start = max(0, args.error_index - 1000)
    error_end = min(len(source), args.error_index + 1400)
    error_snippet = source[error_start:error_end]
    report = {
        "schemaVersion": 3,
        "mode": "compact-purchase-callback-access-analysis",
        "sourceSize": len(source.encode("utf-8")),
        "sourceSha256": sha256_text(source),
        "errorIndex": args.error_index,
        "plainAssignmentIndex": plain_index,
        "accessCount": len(accesses),
        "baseTokens": sorted({item["baseToken"] for item in accesses if item["baseToken"]}),
        "accesses": accesses,
        "errorWindow": {
            "start": error_start,
            "end": error_end,
            "relativeErrorIndex": args.error_index - error_start,
            "snippetSha256": sha256_text(error_snippet),
            "snippet": compact(error_snippet, 2600),
        },
    }
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "mode": report["mode"],
        "sourceSha256": report["sourceSha256"],
        "accessCount": report["accessCount"],
        "baseTokens": report["baseTokens"],
        "errorIndex": report["errorIndex"],
    }, ensure_ascii=False))
    return 0 if accesses else 1


if __name__ == "__main__":
    raise SystemExit(main())
