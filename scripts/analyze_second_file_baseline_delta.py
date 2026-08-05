#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def common_prefix(a: bytes, b: bytes) -> int:
    limit = min(len(a), len(b))
    index = 0
    chunk = 1024 * 1024
    while index + chunk <= limit and a[index:index + chunk] == b[index:index + chunk]:
        index += chunk
    while index < limit and a[index] == b[index]:
        index += 1
    return index


def common_suffix(a: bytes, b: bytes, prefix: int) -> int:
    limit = min(len(a), len(b)) - prefix
    index = 0
    chunk = 1024 * 1024
    while index + chunk <= limit and a[len(a) - index - chunk:len(a) - index] == b[len(b) - index - chunk:len(b) - index]:
        index += chunk
    while index < limit and a[len(a) - index - 1] == b[len(b) - index - 1]:
        index += 1
    return index


def bounded_text(data: bytes, start: int, end: int, radius: int = 6000) -> dict:
    left = max(0, start - radius)
    right = min(len(data), end + radius)
    raw = data[left:right]
    return {
        "start": left,
        "end": right,
        "size": len(raw),
        "sha256": sha256(raw),
        "text": raw.decode("utf-8", errors="replace"),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--baseline", required=True)
    parser.add_argument("--current", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    baseline = Path(args.baseline).read_bytes()
    current = Path(args.current).read_bytes()
    prefix = common_prefix(baseline, current)
    suffix = common_suffix(baseline, current, prefix)
    baseline_middle_end = len(baseline) - suffix
    current_middle_end = len(current) - suffix
    baseline_middle = baseline[prefix:baseline_middle_end]
    current_middle = current[prefix:current_middle_end]

    report = {
        "schemaVersion": 1,
        "mode": "second-file-old-baseline-delta-analysis",
        "baseline": {
            "size": len(baseline),
            "sha256": sha256(baseline),
        },
        "current": {
            "size": len(current),
            "sha256": sha256(current),
        },
        "commonPrefixLength": prefix,
        "commonSuffixLength": suffix,
        "baselineMiddle": {
            "start": prefix,
            "end": baseline_middle_end,
            "size": len(baseline_middle),
            "sha256": sha256(baseline_middle),
        },
        "currentMiddle": {
            "start": prefix,
            "end": current_middle_end,
            "size": len(current_middle),
            "sha256": sha256(current_middle),
        },
        "sizeDelta": len(current) - len(baseline),
        "singleContiguousDelta": prefix + suffix == min(len(baseline), len(current)),
        "baselineContext": bounded_text(baseline, prefix, baseline_middle_end),
        "currentContext": bounded_text(current, prefix, current_middle_end),
        "runtimeFilesChanged": False,
        "androidClientChanged": False,
        "productionDefaultChanged": False,
        "authorizationOutcomeModified": False,
        "paymentCompleted": False,
        "apkExecuted": False,
    }
    report["pass"] = (
        report["baseline"]["size"] > 0
        and report["current"]["size"] > 0
        and report["baseline"]["sha256"] != report["current"]["sha256"]
        and prefix > 0
        and suffix > 0
    )

    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    (output / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (output / "baseline-context.txt").write_text(report["baselineContext"]["text"], encoding="utf-8")
    (output / "current-context.txt").write_text(report["currentContext"]["text"], encoding="utf-8")
    print(json.dumps({
        "pass": report["pass"],
        "baselineSize": report["baseline"]["size"],
        "currentSize": report["current"]["size"],
        "sizeDelta": report["sizeDelta"],
        "commonPrefixLength": prefix,
        "commonSuffixLength": suffix,
        "baselineMiddleSize": len(baseline_middle),
        "currentMiddleSize": len(current_middle),
        "singleContiguousDelta": report["singleContiguousDelta"],
    }, ensure_ascii=False, indent=2))
    return 0 if report["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
