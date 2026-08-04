#!/usr/bin/env python3
"""Review a lifecycle/request trace without changing page outcomes.

The browser runner's infrastructure pass only proves that cases completed and the
trace layer was installed. This reviewer applies the separate functional gate:
each first, second and post-re-entry interaction window must contain a positive
target-request marker. A screenshot existing is not accepted as proof that the
intended control was reached.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path
from typing import Any

INTERACTION_STAGES = (
    "interaction-first",
    "interaction-second-same-page",
    "interaction-third-after-reentry",
)


def is_target_request(request: dict[str, Any]) -> bool:
    """Return true for a target read/order marker without inspecting secrets."""
    kind = str(request.get("kind") or "")
    url = str(request.get("url") or "")
    return kind == "order-request" or "/PropShop/" in url


def target_label(case: dict[str, Any], index: int) -> str:
    raw = str(case.get("targetUrl") or "")
    path = raw.split("?", 1)[0].rstrip("/")
    suffix = path.rsplit("/", 1)[-1] if path else ""
    return suffix or f"page-{index + 1}"


def review_case(case: dict[str, Any], index: int, window_ms: int) -> dict[str, Any]:
    taps = {
        str(event.get("stage")): int(event.get("at"))
        for event in case.get("events", [])
        if event.get("type") == "tap" and event.get("stage") in INTERACTION_STAGES
    }
    requests = list(case.get("requests") or [])
    windows: dict[str, Any] = {}

    for stage in INTERACTION_STAGES:
        start = taps.get(stage)
        if start is None:
            windows[stage] = {
                "tapRecorded": False,
                "targetRequestCount": 0,
                "requestKinds": {},
                "passed": False,
            }
            continue

        matching = [
            request
            for request in requests
            if start <= int(request.get("at") or -1) <= start + window_ms
            and is_target_request(request)
        ]
        windows[stage] = {
            "tapRecorded": True,
            "targetRequestCount": len(matching),
            "requestKinds": dict(Counter(str(item.get("kind") or "") for item in matching)),
            "passed": bool(matching),
        }

    screenshots = case.get("screenshots") or {}
    target_hash = screenshots.get("target-screen")
    unchanged_after_first = bool(target_hash) and target_hash == screenshots.get("after-first")
    unchanged_after_second = bool(target_hash) and target_hash == screenshots.get("after-second")

    functional_ok = all(windows[stage]["passed"] for stage in INTERACTION_STAGES)
    return {
        "mode": case.get("mode"),
        "target": target_label(case, index),
        "fatalError": bool(case.get("fatalError")),
        "runtimeLoads": case.get("runtimeLoads"),
        "interactionWindows": windows,
        "targetScreenUnchangedAfterFirst": unchanged_after_first,
        "targetScreenUnchangedAfterSecond": unchanged_after_second,
        "functionalSequenceOk": functional_ok,
    }


def build_review(report: dict[str, Any], window_ms: int) -> dict[str, Any]:
    cases = list(report.get("cases") or [])
    reviewed_cases = [review_case(case, index, window_ms) for index, case in enumerate(cases)]
    baseline = [item for item in reviewed_cases if item.get("mode") == "baseline"]
    diagnostic = [item for item in reviewed_cases if item.get("mode") == "diagnostic"]

    stage_counts = {
        stage: sum(
            1
            for item in reviewed_cases
            if item["interactionWindows"][stage]["passed"]
        )
        for stage in INTERACTION_STAGES
    }
    trace_ok = bool(report.get("pass"))
    expected_shape = len(cases) == 10 and len(baseline) == 5 and len(diagnostic) == 5
    functional_ok = expected_shape and all(item["functionalSequenceOk"] for item in reviewed_cases)

    return {
        "schemaVersion": 1,
        "sourceGeneratedAt": report.get("generatedAt"),
        "windowMs": window_ms,
        "traceInfrastructureOk": trace_ok,
        "functionalSequenceOk": functional_ok,
        "overallOk": trace_ok and functional_ok,
        "expectedMatrixShape": expected_shape,
        "caseCounts": {
            "total": len(cases),
            "baseline": len(baseline),
            "diagnostic": len(diagnostic),
        },
        "interactionStageTargetRequestCases": stage_counts,
        "unchangedTargetScreenCases": {
            "afterFirst": sum(1 for item in reviewed_cases if item["targetScreenUnchangedAfterFirst"]),
            "afterSecond": sum(1 for item in reviewed_cases if item["targetScreenUnchangedAfterSecond"]),
        },
        "cases": reviewed_cases,
        "promotionAllowed": trace_ok and functional_ok,
        "reason": (
            "Trace infrastructure and all three functional interaction windows passed."
            if trace_ok and functional_ok
            else "Trace infrastructure completed, but one or more required interaction windows lacked a positive target-request marker."
        ),
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("report", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--window-ms", type=int, default=6000)
    parser.add_argument("--enforce", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.window_ms <= 0:
        raise SystemExit("--window-ms must be positive")
    report = json.loads(args.report.read_text(encoding="utf-8"))
    review = build_review(report, args.window_ms)
    rendered = json.dumps(review, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered, encoding="utf-8")
    sys.stdout.write(rendered)
    return 1 if args.enforce and not review["overallOk"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
