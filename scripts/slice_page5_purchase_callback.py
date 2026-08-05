#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--needle", default="userRealName")
    parser.add_argument("--radius", type=int, default=3000)
    args = parser.parse_args()

    source_path = Path(args.source)
    source = source_path.read_text(encoding="utf-8")
    occurrences: list[dict[str, object]] = []
    cursor = 0
    while True:
        index = source.find(args.needle, cursor)
        if index < 0:
            break
        start = max(0, index - args.radius)
        end = min(len(source), index + len(args.needle) + args.radius)
        snippet = source[start:end]
        occurrences.append(
            {
                "index": index,
                "start": start,
                "end": end,
                "relativeNeedleIndex": index - start,
                "snippetSha256": sha256_text(snippet),
                "snippet": snippet,
            }
        )
        cursor = index + len(args.needle)

    report = {
        "schemaVersion": 1,
        "mode": "bounded-purchase-callback-source-slice",
        "sourceSize": len(source.encode("utf-8")),
        "sourceSha256": sha256_text(source),
        "needle": args.needle,
        "radius": args.radius,
        "occurrenceCount": len(occurrences),
        "occurrences": occurrences,
    }
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: report[k] for k in ("mode", "sourceSize", "sourceSha256", "needle", "occurrenceCount")}, ensure_ascii=False))
    if not occurrences:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
