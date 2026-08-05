#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import math
from collections import Counter
from pathlib import Path


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def entropy(data: bytes) -> float:
    if not data:
        return 0.0
    counts = Counter(data)
    total = len(data)
    return -sum((count / total) * math.log2(count / total) for count in counts.values())


def ascii_strings(data: bytes, minimum: int = 6, limit: int = 100) -> list[str]:
    out: list[str] = []
    current = bytearray()
    for value in data:
        if 32 <= value <= 126:
            current.append(value)
        else:
            if len(current) >= minimum:
                out.append(current.decode("ascii", errors="replace"))
                if len(out) >= limit:
                    break
            current.clear()
    if len(out) < limit and len(current) >= minimum:
        out.append(current.decode("ascii", errors="replace"))
    return out[:limit]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--bundle", required=True)
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--search-results", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    bundle = Path(args.bundle).read_bytes()
    manifest = json.loads(Path(args.manifest).read_text(encoding="utf-8"))
    search_lines = [line for line in Path(args.search_results).read_text(encoding="utf-8", errors="replace").splitlines() if line.strip()]
    search_paths = sorted({line.split(":", 1)[0] for line in search_lines if ":" in line})

    report = {
        "schemaVersion": 1,
        "mode": "runtime-bundle-format-and-decryptor-discovery",
        "bundle": {
            "size": len(bundle),
            "sha256": sha256(bundle),
            "headHex": bundle[:128].hex(),
            "headBase64": base64.b64encode(bundle[:128]).decode("ascii"),
            "entropyFirst64K": entropy(bundle[:65536]),
            "entropyWhole": entropy(bundle),
            "asciiStrings": ascii_strings(bundle[:1024 * 1024]),
        },
        "manifest": {
            "schemaVersion": manifest.get("schemaVersion"),
            "versionName": manifest.get("versionName"),
            "file": manifest.get("file"),
            "size": manifest.get("size"),
            "sha256": manifest.get("sha256"),
            "ivLength": len(str(manifest.get("iv") or "")),
            "keyIvLength": len(str(manifest.get("keyIv") or "")),
            "keyCipherLength": len(str(manifest.get("keyCipher") or "")),
            "nonameSize": manifest.get("nonameSize"),
            "nonameSha256": manifest.get("nonameSha256"),
            "gameSize": manifest.get("gameSize"),
            "gameSha256": manifest.get("gameSha256"),
        },
        "searchResultCount": len(search_lines),
        "searchPaths": search_paths,
        "searchLines": search_lines[:500],
        "runtimeFilesChanged": False,
        "androidClientChanged": False,
        "productionDefaultChanged": False,
        "authorizationOutcomeModified": False,
        "paymentCompleted": False,
        "apkExecuted": False,
    }
    report["pass"] = (
        len(bundle) > 0
        and report["bundle"]["sha256"] == manifest.get("sha256")
        and len(search_lines) > 0
    )

    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    (output / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (output / "decryptor-search.txt").write_text("\n".join(search_lines) + "\n", encoding="utf-8")
    print(json.dumps({
        "pass": report["pass"],
        "bundleSize": len(bundle),
        "bundleSha256": report["bundle"]["sha256"],
        "entropyWhole": report["bundle"]["entropyWhole"],
        "searchResultCount": len(search_lines),
        "searchPaths": search_paths,
    }, ensure_ascii=False, indent=2))
    return 0 if report["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
