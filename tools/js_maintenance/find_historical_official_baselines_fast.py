#!/usr/bin/env python3
"""Find and rank historical official game.js baselines by structural similarity.

The self-hosted version name 1.0.2 is a local release label, not assumed to be an
official engine version. Public archive candidates are ranked by bundle structure,
SAL surface, entry dependencies, field density and size. Full third-party source
remains transient and is never committed.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import ssl
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any

USER_AGENT = "Mozilla/5.0 (compatible; GG-Maintenance-History-Finder/2.0)"
TIMEOUT = 15
MAX_SCRIPT = 32 * 1024 * 1024
MAX_SELECTED_RECORDS = 22
SAL_RE = re.compile(r"\bSAL_[A-Za-z0-9_]+\b")
VERSION_RE = re.compile(r"^/\*\s*([^*]{1,80})\s*\*/")
LOGIC_RE = re.compile(r"logic\s+version\s*[:=]\s*([0-9A-Za-z_.-]{1,40})", re.I)
PAIR_RE = re.compile(r"(['\"])([^'\"\\\n]{0,180})\1\s*\+\s*(['\"])([^'\"\\\n]{0,180})\3")
FIELD_MARKERS = (
    "uid", "guid", "pver", "isLogin", "userData", "totalFlower", "freshFlower",
    "wildFlower", "tempFlower", "realFlower", "haveFlower", "mallViewData",
    "itemPrice", "goods", "goods_id", "order_id", "buy_num", "createBuyOrder",
    "get_goods_list", "saveData", "SaveData", "showLocal", "localStorage",
    "sessionStorage", "requestAnimationFrame", "XMLHttpRequest", "JSONP",
    "SAL_Login", "SAL_getUserData", "SAL_getStorage", "SAL_setStorage",
)
TARGET_DEPENDENCIES = (36728, 6886, 75640)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def get(url: str, maximum: int) -> tuple[int, bytes, str]:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "*/*"})
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT, context=ssl.create_default_context()) as response:
            chunks: list[bytes] = []
            total = 0
            while True:
                chunk = response.read(65536)
                if not chunk:
                    break
                total += len(chunk)
                if total > maximum:
                    return int(getattr(response, "status", response.getcode())), b"", "response too large"
                chunks.append(chunk)
            return int(getattr(response, "status", response.getcode())), b"".join(chunks), ""
    except urllib.error.HTTPError as error:
        return int(error.code), b"", f"HTTP {error.code}"
    except Exception as error:
        return 0, b"", f"{type(error).__name__}: {error}"


def json_get(url: str, maximum: int = 5 * 1024 * 1024) -> tuple[Any, str]:
    status, body, error = get(url, maximum)
    if status != 200 or not body:
        return None, error or f"HTTP {status}"
    try:
        return json.loads(body.decode("utf-8", errors="replace")), ""
    except Exception as exc:
        return None, f"JSON decode: {exc}"


def cdx(original: str) -> tuple[list[dict[str, Any]], str]:
    params = {
        "url": original,
        "output": "json",
        "fl": "timestamp,original,statuscode,mimetype,digest,length",
        "filter": "statuscode:200",
        "collapse": "digest",
        "from": "2020",
        "to": "2026",
    }
    payload, error = json_get("https://web.archive.org/cdx/search/cdx?" + urllib.parse.urlencode(params))
    if not isinstance(payload, list) or not payload:
        return [], error
    header = payload[0]
    return [dict(zip(header, row)) for row in payload[1:] if len(row) == len(header)], ""


def wayback_body(record: dict[str, Any]) -> tuple[bytes, str]:
    url = f"https://web.archive.org/web/{record.get('timestamp', '')}id_/{record.get('original', '')}"
    status, body, error = get(url, MAX_SCRIPT)
    return (body, "") if status == 200 and body else (b"", error or f"HTTP {status}")


def join_literals(text: str, rounds: int = 12) -> tuple[str, int]:
    current = text
    total = 0
    for _ in range(rounds):
        changed = 0
        def replace(match: re.Match[str]) -> str:
            nonlocal changed
            changed += 1
            quote = match.group(1)
            return quote + match.group(2) + match.group(4) + quote
        current = PAIR_RE.sub(replace, current)
        total += changed
        if changed == 0:
            break
    return current, total


def dependency_order(text: str) -> list[int]:
    positions = [(text.find(str(module_id)), module_id) for module_id in TARGET_DEPENDENCIES]
    if any(position < 0 for position, _ in positions):
        return []
    return [module_id for _, module_id in sorted(positions)]


def official_version_from_url(source: str) -> str:
    try:
        return urllib.parse.parse_qs(urllib.parse.urlsplit(source).query).get("v", [""])[0]
    except Exception:
        return ""


def architecture_label(chunk_globals: list[str], sal_count: int, entry: bool) -> str:
    if "webpackChunk_lodash_modules" in chunk_globals and sal_count >= 140 and entry:
        return "modern-ondemand-webpack"
    if chunk_globals and sal_count >= 120:
        return "webpack-transition"
    if sal_count <= 100:
        return "legacy-player"
    return "intermediate-player"


def fingerprint(data: bytes, archive: str, timestamp: str, source: str) -> dict[str, Any]:
    raw = data.decode("utf-8", errors="replace")
    joined, joins = join_literals(raw)
    version = VERSION_RE.search(raw[:300])
    sal = sorted(set(SAL_RE.findall(joined)))
    chunk_globals = sorted(set(re.findall(r"webpackChunk[A-Za-z0-9_$]+", joined)))
    chunk_names = sorted(set(re.findall(r"\.push\(\[\s*\[\s*['\"]([^'\"]{1,100})['\"]", joined)))
    entry = bool(re.search(r"(?<!\d)71269\s*:", joined))
    order = dependency_order(joined)
    fields = {marker: joined.count(marker) for marker in FIELD_MARKERS}
    return {
        "archive": archive,
        "timestamp": timestamp,
        "source": source,
        "officialVersion": official_version_from_url(source),
        "size": len(data),
        "sha256": sha256(data),
        "versionHeader": version.group(1).strip() if version else "",
        "logicVersions": sorted(set(LOGIC_RE.findall(joined))),
        "directSalCount": len(set(SAL_RE.findall(raw))),
        "reconstructedSalCount": len(sal),
        "salIdentifiers": sal,
        "joinedLiteralPairs": joins,
        "chunkGlobals": chunk_globals,
        "chunkNames": chunk_names,
        "entry71269Present": entry,
        "targetDependencyOrder": order,
        "fieldCounts": fields,
        "architecture": architecture_label(chunk_globals, len(sal), entry),
    }


def unique(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen = set()
    result = []
    for item in sorted(records, key=lambda value: value.get("timestamp", "")):
        key = item.get("digest") or (item.get("timestamp"), item.get("original"))
        if key in seen:
            continue
        seen.add(key)
        result.append(item)
    return result


def select_records(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Prioritize recent builds, annual representatives and compressed-size transitions."""
    if not records:
        return []
    chosen: dict[str, dict[str, Any]] = {}
    def add(record: dict[str, Any]) -> None:
        key = record.get("digest") or f"{record.get('timestamp')}:{record.get('original')}"
        chosen[key] = record

    # Recent versions matter most because the modified bundle uses the modern architecture.
    for record in records[-14:]:
        add(record)

    # One latest representative for every year keeps architecture evolution visible.
    by_year: dict[str, dict[str, Any]] = {}
    for record in records:
        year = str(record.get("timestamp", ""))[:4]
        if year:
            by_year[year] = record
    for record in by_year.values():
        add(record)

    # Capture the largest compressed-length transitions, which often mark bundler changes.
    transitions = []
    for previous, current in zip(records, records[1:]):
        try:
            delta = abs(int(current.get("length", 0)) - int(previous.get("length", 0)))
        except Exception:
            delta = 0
        transitions.append((delta, previous, current))
    for _, previous, current in sorted(transitions, key=lambda item: item[0], reverse=True)[:5]:
        add(previous)
        add(current)

    selected = sorted(chosen.values(), key=lambda value: value.get("timestamp", ""), reverse=True)
    return selected[:MAX_SELECTED_RECORDS]


def jaccard(left: list[str], right: list[str]) -> float:
    a, b = set(left), set(right)
    if not a and not b:
        return 1.0
    return len(a & b) / max(1, len(a | b))


def cosine_counts(left: dict[str, int], right: dict[str, int]) -> float:
    keys = sorted(set(left) | set(right))
    dot = sum(left.get(key, 0) * right.get(key, 0) for key in keys)
    left_norm = math.sqrt(sum(left.get(key, 0) ** 2 for key in keys))
    right_norm = math.sqrt(sum(right.get(key, 0) ** 2 for key in keys))
    if not left_norm or not right_norm:
        return 0.0
    return dot / (left_norm * right_norm)


def rank_candidate(candidate: dict[str, Any], modified: dict[str, Any]) -> dict[str, Any]:
    sal_similarity = jaccard(candidate["salIdentifiers"], modified["salIdentifiers"])
    field_similarity = cosine_counts(candidate["fieldCounts"], modified["fieldCounts"])
    size_similarity = min(candidate["size"], modified["size"]) / max(candidate["size"], modified["size"])
    chunk_global_match = candidate["chunkGlobals"] == modified["chunkGlobals"]
    chunk_name_match = candidate["chunkNames"] == modified["chunkNames"]
    entry_match = candidate["entry71269Present"] == modified["entry71269Present"] and candidate["entry71269Present"]
    dependency_match = candidate["targetDependencyOrder"] == modified["targetDependencyOrder"] and bool(candidate["targetDependencyOrder"])
    score = (
        (20 if chunk_global_match else 0)
        + (15 if chunk_name_match else 0)
        + (15 if entry_match else 0)
        + (10 if dependency_match else 0)
        + 20 * sal_similarity
        + 10 * field_similarity
        + 10 * size_similarity
    )
    ranked = dict(candidate)
    ranked["similarity"] = {
        "score": round(score, 3),
        "salJaccard": round(sal_similarity, 5),
        "fieldCosine": round(field_similarity, 5),
        "sizeRatio": round(size_similarity, 5),
        "chunkGlobalMatch": chunk_global_match,
        "chunkNameMatch": chunk_name_match,
        "entryMatch": entry_match,
        "dependencyOrderMatch": dependency_match,
    }
    return ranked


def render(result: dict[str, Any]) -> str:
    candidates = result["rankedCandidates"]
    lines = [
        "# 历史官方基线结构相似度检索", "",
        "`1.0.2` 是自托管修改版的发布标签，不被当作官方历史版本号。候选按运行结构相似度排名。", "",
        f"- Wayback 唯一记录：`{len(result['waybackRecords'])}`",
        f"- 本轮选择下载：`{len(result['selectedRecords'])}`",
        f"- 成功读取候选：`{len(candidates)}`",
        f"- 当前最佳结构候选：`{candidates[0]['officialVersion'] if candidates else '无'}`", "",
        "| 排名 | 官方版本参数 | 归档时间 | 架构 | 得分 | 大小 | SAL | 字段相似 | SHA-256 |",
        "|---:|---|---|---|---:|---:|---:|---:|---|",
    ]
    for index, item in enumerate(candidates[:20], 1):
        sim = item["similarity"]
        lines.append(
            f"| {index} | `{item['officialVersion'] or '-'}` | {item['timestamp']} | {item['architecture']} | "
            f"{sim['score']:.3f} | {item['size']} | {item['reconstructedSalCount']} | "
            f"{sim['fieldCosine']:.5f} | `{item['sha256']}` |"
        )
    if not candidates:
        lines.append("| - | - | - | - | - | - | - | - | - |")

    lines += ["", "## 结论", ""]
    if candidates:
        best = candidates[0]
        sim = best["similarity"]
        if best["architecture"] == "modern-ondemand-webpack" and sim["salJaccard"] == 1.0:
            lines.append(
                f"最接近修改版结构的公共归档候选是官方版本参数 `{best['officialVersion']}`（归档于 {best['timestamp']}）。"
            )
            lines.append(
                "它可以作为后续人工差异分析的优先候选，但在没有来源链或同日期证据前，仍不能断言它就是修改版的原始母版。"
            )
        else:
            lines.append("归档候选尚未进入与修改版相同的现代 Webpack/SAL 架构，不能作为直接母版。")
    else:
        lines.append("公共归档没有返回可读取候选。")
    lines += [
        "", "相似度由 chunk 全局、chunk 名称、入口模块、依赖顺序、SAL 集合、关键字段密度和文件大小共同计算。",
        "得分只用于排序候选，不是源码同源证明。",
    ]
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root", default=".")
    parser.add_argument("--output-dir", default="docs/js-maintenance/historical-search")
    args = parser.parse_args()
    root = Path(args.repo_root).resolve()
    out = (root / args.output_dir).resolve()
    upstream = json.loads((root / "game-engine/upstream-baseline.json").read_text(encoding="utf-8"))
    manifest = json.loads((root / "game-engine/release/manifest.json").read_text(encoding="utf-8"))
    modified_path = root / "game-engine/release" / manifest["file"]
    modified = fingerprint(modified_path.read_bytes(), "local", "", str(modified_path.relative_to(root)))

    official = upstream["resources"]["officialGame"]["url"].split("?", 1)[0]
    script_urls = sorted({official, official.replace("https://c2.", "https://c1.")})
    groups: list[dict[str, Any]] = []
    errors: dict[str, str] = {}
    with ThreadPoolExecutor(max_workers=2) as pool:
        future_map = {pool.submit(cdx, url + "*"): url for url in script_urls}
        for future in as_completed(future_map):
            url = future_map[future]
            try:
                rows, error = future.result()
            except Exception as exc:
                rows, error = [], str(exc)
            groups.extend(rows)
            if error:
                errors[url] = error

    records = unique(groups)
    selected = select_records(records)
    candidates = []
    candidate_errors = []
    with ThreadPoolExecutor(max_workers=6) as pool:
        future_map = {pool.submit(wayback_body, record): record for record in selected}
        for future in as_completed(future_map):
            record = future_map[future]
            try:
                body, error = future.result()
            except Exception as exc:
                body, error = b"", str(exc)
            if body:
                candidates.append(fingerprint(body, "wayback", record.get("timestamp", ""), record.get("original", "")))
            else:
                candidate_errors.append({
                    "timestamp": record.get("timestamp"),
                    "officialVersion": official_version_from_url(record.get("original", "")),
                    "error": error,
                })

    ranked = sorted((rank_candidate(item, modified) for item in candidates), key=lambda item: item["similarity"]["score"], reverse=True)
    result = {
        "schemaVersion": 3,
        "method": {
            "timeoutSeconds": TIMEOUT,
            "maxSelectedRecords": MAX_SELECTED_RECORDS,
            "selection": "recent + annual representatives + largest compressed-size transitions",
            "scoreMaximum": 100,
            "warning": "Similarity ranking is not proof of source lineage.",
        },
        "modifiedBaseline": modified,
        "searchedUrls": script_urls,
        "waybackRecords": records,
        "selectedRecords": selected,
        "rankedCandidates": ranked,
        "candidateErrors": candidate_errors,
        "indexErrors": errors,
    }
    out.mkdir(parents=True, exist_ok=True)
    (out / "historical-search.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (out / "README.md").write_text(render(result) + "\n", encoding="utf-8")
    print(json.dumps({
        "waybackRecords": len(records),
        "selectedRecords": len(selected),
        "readableCandidates": len(ranked),
        "bestCandidate": ranked[0]["officialVersion"] if ranked else "",
        "bestScore": ranked[0]["similarity"]["score"] if ranked else 0,
        "output": str(out),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
