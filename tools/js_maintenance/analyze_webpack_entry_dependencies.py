#!/usr/bin/env python3
"""Compare the Webpack entry structure of the modified and current official game bundles.

This tool records structural evidence only: module IDs, import-call context, chunk names,
source-map references, offsets and short sanitized snippets. It does not execute bundles
or copy third-party source into the repository.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import ssl
import urllib.request
from pathlib import Path
from typing import Any

TARGET_IDS = (36728, 6886, 75640)
MAX_BYTES = 32 * 1024 * 1024
USER_AGENT = "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36"
CHUNK_GLOBAL_RE = re.compile(rb"webpackChunk[A-Za-z0-9_$]+")
CHUNK_NAME_RE = re.compile(rb"\.push\(\[\s*\[\s*(['\"])([^'\"]{1,160})\1")
MODULE_DEF_RE = re.compile(
    rb"(?<![A-Za-z0-9_$])(?:['\"])?(\d{2,8})(?:['\"])?\s*:\s*"
    rb"(?:function\s*\(|\([^)]{0,260}\)\s*=>|[A-Za-z_$][A-Za-z0-9_$]*\s*=>)"
)
REQUIRE_CALL_RE = re.compile(rb"(?<![A-Za-z0-9_$])([A-Za-z_$][A-Za-z0-9_$]*)\(\s*(\d{2,8})\s*\)")
SOURCE_MAP_RE = re.compile(rb"sourceMappingURL\s*=\s*([^\s*]+)")
ENTRY_EXPORT_RE = re.compile(rb"\.d\([^,]+,\s*\{([^}]{0,1000})\}\)")


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def fetch(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/javascript,*/*;q=0.8"})
    with urllib.request.urlopen(request, timeout=45, context=ssl.create_default_context()) as response:
        chunks: list[bytes] = []
        total = 0
        while True:
            chunk = response.read(65536)
            if not chunk:
                break
            total += len(chunk)
            if total > MAX_BYTES:
                raise ValueError("official bundle exceeds size limit")
            chunks.append(chunk)
        return b"".join(chunks)


def clean_snippet(data: bytes, offset: int, radius: int = 260) -> str:
    left = max(0, offset - radius)
    right = min(len(data), offset + radius)
    text = data[left:right].decode("utf-8", errors="replace")
    text = re.sub(r"\s+", " ", text).strip()
    return text[:900]


def statement_context(data: bytes, start: int, end: int) -> dict[str, Any]:
    before = data[max(0, start - 80):start].decode("utf-8", errors="replace")
    after = data[end:min(len(data), end + 80)].decode("utf-8", errors="replace")
    compact_before = re.sub(r"\s+", "", before)
    compact_after = re.sub(r"\s+", "", after)
    assigned = bool(re.search(r"(?:=|return|=>|\[|\()\s*$", before))
    chained = compact_after.startswith(".") or compact_after.startswith("[")
    separated = compact_after.startswith(",") or compact_after.startswith(";") or compact_after.startswith(")")
    return {
        "assignedOrReturned": assigned,
        "chainedOrIndexed": chained,
        "followedBySeparator": separated,
        "before": before[-80:],
        "after": after[:80],
    }


def analyze(label: str, source: str, data: bytes) -> dict[str, Any]:
    module_defs = sorted({int(match.group(1)) for match in MODULE_DEF_RE.finditer(data)})
    require_calls: list[dict[str, Any]] = []
    for match in REQUIRE_CALL_RE.finditer(data):
        module_id = int(match.group(2))
        if module_id not in TARGET_IDS and len(require_calls) >= 2000:
            continue
        require_calls.append({
            "callee": match.group(1).decode("ascii", errors="replace"),
            "moduleId": module_id,
            "offset": match.start(),
            "target": module_id in TARGET_IDS,
            "context": statement_context(data, match.start(), match.end()),
            "snippet": clean_snippet(data, match.start()),
        })
    target_evidence: dict[str, Any] = {}
    for module_id in TARGET_IDS:
        literal = str(module_id).encode()
        offsets = [match.start() for match in re.finditer(rb"(?<!\d)" + literal + rb"(?!\d)", data)]
        calls = [item for item in require_calls if item["moduleId"] == module_id]
        target_evidence[str(module_id)] = {
            "definedInBundle": module_id in module_defs,
            "literalCount": len(offsets),
            "literalOffsets": offsets[:20],
            "requireCalls": calls,
            "allCallsDiscardResult": bool(calls) and all(
                not call["context"]["assignedOrReturned"] and
                not call["context"]["chainedOrIndexed"] and
                call["context"]["followedBySeparator"]
                for call in calls
            ),
        }
    chunk_globals = sorted({match.group(0).decode("ascii", errors="replace") for match in CHUNK_GLOBAL_RE.finditer(data)})
    chunk_names = sorted({match.group(2).decode("utf-8", errors="replace") for match in CHUNK_NAME_RE.finditer(data)})
    source_maps = [match.group(1).decode("utf-8", errors="replace") for match in SOURCE_MAP_RE.finditer(data)]
    export_matches = [match.group(1).decode("utf-8", errors="replace") for match in ENTRY_EXPORT_RE.finditer(data[:20000])]
    target_order = [item["moduleId"] for item in require_calls if item["moduleId"] in TARGET_IDS]
    return {
        "label": label,
        "source": source,
        "size": len(data),
        "sha256": sha256(data),
        "chunkGlobals": chunk_globals,
        "chunkNames": chunk_names,
        "moduleDefinitionCount": len(module_defs),
        "moduleDefinitionIds": module_defs[:2000],
        "entryModule71269Defined": 71269 in module_defs,
        "targetRequireOrder": target_order,
        "targetDependencies": target_evidence,
        "sourceMapReferences": source_maps,
        "entryExportFragments": export_matches[:10],
        "startsWith": data[:500].decode("utf-8", errors="replace"),
        "endsWith": data[-500:].decode("utf-8", errors="replace"),
    }


def render(result: dict[str, Any]) -> str:
    modified = result["modified"]
    official = result["official"]
    comparison = result["comparison"]
    lines = [
        "# Webpack 入口与三个依赖模块分析", "",
        "本报告比较修改版 `game.js 1.0.2` 与当前官方 `game.js` 的入口结构，不保存官方完整源码。", "",
        "## 文件结构", "",
        "| 项目 | 修改版 | 当前官方 |",
        "|---|---|---|",
        f"| 大小 | {modified['size']} | {official['size']} |",
        f"| SHA-256 | `{modified['sha256']}` | `{official['sha256']}` |",
        f"| chunk 全局 | `{', '.join(modified['chunkGlobals'])}` | `{', '.join(official['chunkGlobals'])}` |",
        f"| chunk 名称 | `{', '.join(modified['chunkNames'])}` | `{', '.join(official['chunkNames'])}` |",
        f"| 入口模块 71269 | {modified['entryModule71269Defined']} | {official['entryModule71269Defined']} |",
        f"| 识别到的模块定义数 | {modified['moduleDefinitionCount']} | {official['moduleDefinitionCount']} |",
        "", "## 依赖调用", "",
        "| 模块 | 修改版内定义 | 官方内定义 | 修改版结果是否被丢弃 | 官方结果是否被丢弃 |",
        "|---:|---|---|---|---|",
    ]
    for module_id in TARGET_IDS:
        left = modified["targetDependencies"][str(module_id)]
        right = official["targetDependencies"][str(module_id)]
        lines.append(
            f"| {module_id} | {left['definedInBundle']} | {right['definedInBundle']} | "
            f"{left['allCallsDiscardResult']} | {right['allCallsDiscardResult']} |"
        )
    lines += [
        "", "## 结论", "",
        f"- 两份文件目标依赖顺序一致：`{comparison['sameTargetRequireOrder']}`。",
        f"- 两份文件 chunk 全局一致：`{comparison['sameChunkGlobals']}`。",
        f"- 两份文件 chunk 名称一致：`{comparison['sameChunkNames']}`。",
        f"- 三个模块均不在两份 game.js 中定义：`{comparison['allTargetsExternalInBoth']}`。",
        f"- 三个模块调用结果均未被业务代码读取：`{comparison['allTargetResultsDiscardedInBoth']}`。",
        "",
        "因此这三个编号应归类为**入口阶段的外部副作用依赖**。它们可能负责 Polyfill、运行环境初始化、完整性或调试环境准备，但不是通过返回值向游戏业务提供对象的普通功能模块。具体职责仍需找到对应基础 bundle 或历史构建产物后才能最终命名。",
        "",
        "维护时不要把三个编号本身写死为业务功能。真正稳定的判断条件是：入口模块是否仍按相同顺序加载三个外部副作用依赖，以及页面基础运行环境是否在 game.js 执行前完成初始化。",
    ]
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root", default=".")
    parser.add_argument("--output-dir", default="docs/js-maintenance/official-current")
    args = parser.parse_args()
    root = Path(args.repo_root).resolve()
    output = (root / args.output_dir).resolve()
    manifest = json.loads((root / "game-engine/release/manifest.json").read_text(encoding="utf-8"))
    upstream = json.loads((root / "game-engine/upstream-baseline.json").read_text(encoding="utf-8"))
    modified_path = root / "game-engine/release" / manifest["file"]
    official_url = upstream["resources"]["officialGame"]["url"]
    modified = analyze("modified", str(modified_path.relative_to(root)), modified_path.read_bytes())
    official = analyze("official", official_url, fetch(official_url))
    comparison = {
        "sameTargetRequireOrder": modified["targetRequireOrder"] == official["targetRequireOrder"],
        "sameChunkGlobals": modified["chunkGlobals"] == official["chunkGlobals"],
        "sameChunkNames": modified["chunkNames"] == official["chunkNames"],
        "allTargetsExternalInBoth": all(
            not modified["targetDependencies"][str(mid)]["definedInBundle"] and
            not official["targetDependencies"][str(mid)]["definedInBundle"]
            for mid in TARGET_IDS
        ),
        "allTargetResultsDiscardedInBoth": all(
            modified["targetDependencies"][str(mid)]["allCallsDiscardResult"] and
            official["targetDependencies"][str(mid)]["allCallsDiscardResult"]
            for mid in TARGET_IDS
        ),
    }
    result = {"schemaVersion": 1, "modified": modified, "official": official, "comparison": comparison}
    output.mkdir(parents=True, exist_ok=True)
    (output / "webpack-entry-dependencies.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    (output / "webpack-entry-dependencies.md").write_text(render(result) + "\n", encoding="utf-8")
    print(json.dumps({"comparison": comparison, "output": str(output)}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
