#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def bounded_window(source: str, index: int, radius: int, label: str) -> dict[str, object]:
    start = max(0, index - radius)
    end = min(len(source), index + radius)
    snippet = source[start:end]
    return {
        "label": label,
        "index": index,
        "start": start,
        "end": end,
        "relativeIndex": index - start,
        "snippetSha256": sha256_text(snippet),
        "snippet": snippet,
    }


def find_occurrences(source: str, needle: str, radius: int) -> list[dict[str, object]]:
    occurrences: list[dict[str, object]] = []
    cursor = 0
    while True:
        index = source.find(needle, cursor)
        if index < 0:
            break
        item = bounded_window(source, index, radius, needle)
        item["needle"] = needle
        occurrences.append(item)
        cursor = index + len(needle)
    return occurrences


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--radius", type=int, default=3500)
    parser.add_argument("--error-index", type=int, default=255076)
    args = parser.parse_args()

    source = Path(args.source).read_text(encoding="utf-8")
    needles = [
        "userRealName",
        "us'+'er'+'Re'+'al'+'Na'+'me",
        "Re'+'al'+'Na'+'me",
        "user'+'Real'+'Name",
        "realName",
    ]
    matches = {needle: find_occurrences(source, needle, args.radius) for needle in needles}
    fixed_windows = [
        bounded_window(source, args.error_index, 6000, "runtime-error-column"),
        bounded_window(source, 1209282, 4000, "user-state-assignment"),
    ]
    occurrence_count = sum(len(items) for items in matches.values())
    report = {
        "schemaVersion": 2,
        "mode": "bounded-purchase-callback-source-slice",
        "sourceSize": len(source.encode("utf-8")),
        "sourceSha256": sha256_text(source),
        "radius": args.radius,
        "errorIndex": args.error_index,
        "occurrenceCount": occurrence_count,
        "matchCounts": {needle: len(items) for needle, items in matches.items()},
        "matches": matches,
        "fixedWindows": fixed_windows,
    }
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "mode": report["mode"],
        "sourceSize": report["sourceSize"],
        "sourceSha256": report["sourceSha256"],
        "occurrenceCount": report["occurrenceCount"],
        "matchCounts": report["matchCounts"],
        "fixedWindowCount": len(fixed_windows),
    }, ensure_ascii=False))
    return 0 if occurrence_count > 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
