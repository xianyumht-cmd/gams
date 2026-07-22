#!/usr/bin/env python3
"""Rank the closest archived official bundles using deep structural fingerprints.

The report contains similarity metrics only. Historical third-party source and direct
patches are never stored. The result helps choose a maintenance reference candidate;
it does not prove source lineage.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import ssl
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any, Iterable

USER_AGENT = "Mozilla/5.0 (compatible; GG-Historical-Deep-Compare/1.0)"
TIMEOUT = 40
MAX_BYTES = 32 * 1024 * 1024
TOP_CANDIDATES = 5
BLOCK_SIZE = 4096
BLOCK_STRIDE = 1024
SHINGLE_WIDTH = 16
SHINGLE_STRIDE = 8
PAIR_RE = re.compile(r"(['\"])([^'\"\\\n]{0,180})\1\s*\+\s*(['\"])([^'\"\\\n]{0,180})\3")
TOKEN_RE = re.compile(
    r"(?:'(?:\\.|[^'\\])*'|\"(?:\\.|[^\"\\])*\"|"
    r"[A-Za-z_$][A-Za-z0-9_$]*|0[xX][0-9A-Fa-f]+|\d+(?:\.\d+)?|"
    r"===|!==|>>>|<<|>>|=>|==|!=|<=|>=|&&|\|\||\+\+|--|\*\*|\?\?|\.\.|.)",
    re.S,
)
SAL_RE = re.compile(r"\bSAL_[A-Za-z0-9_]+\b")
LITERAL_RE = re.compile(r"'([^'\\\n]{2,220})'|\"([^\"\\\n]{2,220})\"")
VERSION_COMMENT_RE = re.compile(rb"^/\*[^*]{0,100}\*/")
JS_KEYWORDS = {
    "break", "case", "catch", "class", "const", "continue", "debugger", "default",
    "delete", "do", "else", "export", "extends", "finally", "for", "function", "if",
    "import", "in", "instanceof", "let", "new", "return", "super", "switch", "this",
    "throw", "try", "typeof", "var", "void", "while", "with", "yield", "async", "await",
    "true", "false", "null", "undefined",
}
SEMANTIC_TERMS = (
    "sal_", "propshop", "mall", "goods", "order", "buy", "flower", "user", "login",
    "save", "storage", "audio", "video", "canvas", "webgl", "texture", "preload",
    "request", "json", "http", "api", "report", "collect", "debug", "crack", "devtool",
    "itemprice", "showlocal", "userdata", "uid", "guid", "global_cfg", "sign_in",
)
FIELD_MARKERS = (
    "uid", "guid", "pver", "isLogin", "userData", "totalFlower", "freshFlower",
    "wildFlower", "tempFlower", "realFlower", "haveFlower", "mallViewData",
    "itemPrice", "goods", "goods_id", "order_id", "buy_num", "createBuyOrder",
    "get_goods_list", "saveData", "SaveData", "showLocal", "localStorage",
    "sessionStorage", "requestAnimationFrame", "XMLHttpRequest", "JSONP",
    "SAL_Login", "SAL_getUserData", "SAL_getStorage", "SAL_setStorage",
)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def fetch_wayback(timestamp: str, source: str) -> tuple[bytes, str]:
    url = f"https://web.archive.org/web/{timestamp}id_/{source}"
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/javascript,*/*;q=0.8"})
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT, context=ssl.create_default_context()) as response:
            chunks: list[bytes] = []
            total = 0
            while True:
                chunk = response.read(65536)
                if not chunk:
                    break
                total += len(chunk)
                if total > MAX_BYTES:
                    return b"", "response too large"
                chunks.append(chunk)
            return b"".join(chunks), ""
    except urllib.error.HTTPError as error:
        return b"", f"HTTP {error.code}"
    except Exception as error:
        return b"", f"{type(error).__name__}: {error}"


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


def stable_hash(value: bytes) -> int:
    return int.from_bytes(hashlib.blake2b(value, digest_size=8).digest(), "big")


def block_hashes(data: bytes) -> set[int]:
    if len(data) <= BLOCK_SIZE:
        return {stable_hash(data)} if data else set()
    return {
        stable_hash(data[offset:offset + BLOCK_SIZE])
        for offset in range(0, len(data) - BLOCK_SIZE + 1, BLOCK_STRIDE)
    }


def normalize_token(token: str) -> str:
    if not token:
        return ""
    if token[0] in "'\"" and token[-1:] == token[0]:
        content = token[1:-1]
        low = content.lower()
        if any(term in low for term in SEMANTIC_TERMS) or low.startswith(("http://", "https://", "/")):
            compact = re.sub(r"\s+", " ", low)[:120]
            return "S:" + compact
        return "S"
    if re.fullmatch(r"0[xX][0-9A-Fa-f]+|\d+(?:\.\d+)?", token):
        return "N"
    if re.fullmatch(r"[A-Za-z_$][A-Za-z0-9_$]*", token):
        if token in JS_KEYWORDS or token.startswith("SAL_"):
            return token
        low = token.lower()
        if any(term in low for term in SEMANTIC_TERMS):
            return "I:" + low[:100]
        return "I"
    if token.isspace():
        return ""
    return token


def token_shingles(text: str) -> set[int]:
    window: list[str] = []
    result: set[int] = set()
    token_index = 0
    for match in TOKEN_RE.finditer(text):
        normalized = normalize_token(match.group(0))
        if not normalized:
            continue
        window.append(normalized)
        if len(window) > SHINGLE_WIDTH:
            window.pop(0)
        if len(window) == SHINGLE_WIDTH and token_index % SHINGLE_STRIDE == 0:
            result.add(stable_hash("\x1f".join(window).encode("utf-8", errors="replace")))
        token_index += 1
    return result


def semantic_literals(text: str) -> set[str]:
    result: set[str] = set()
    for match in LITERAL_RE.finditer(text):
        value = match.group(1) if match.group(1) is not None else match.group(2)
        if value is None or len(value) > 220:
            continue
        low = re.sub(r"\s+", " ", value.lower()).strip()
        if any(term in low for term in SEMANTIC_TERMS) or low.startswith(("http://", "https://", "/")):
            result.add(low)
    return result


def common_prefix(left: bytes, right: bytes) -> int:
    limit = min(len(left), len(right))
    index = 0
    while index < limit and left[index] == right[index]:
        index += 1
    return index


def common_suffix(left: bytes, right: bytes) -> int:
    limit = min(len(left), len(right))
    index = 0
    while index < limit and left[-1 - index] == right[-1 - index]:
        index += 1
    return index


def jaccard(left: Iterable[Any], right: Iterable[Any]) -> float:
    a, b = set(left), set(right)
    if not a and not b:
        return 1.0
    return len(a & b) / max(1, len(a | b))


def cosine(left: dict[str, int], right: dict[str, int]) -> float:
    keys = sorted(set(left) | set(right))
    dot = sum(left.get(key, 0) * right.get(key, 0) for key in keys)
    a = math.sqrt(sum(left.get(key, 0) ** 2 for key in keys))
    b = math.sqrt(sum(right.get(key, 0) ** 2 for key in keys))
    return dot / (a * b) if a and b else 0.0


def prepare(data: bytes) -> dict[str, Any]:
    raw = data.decode("utf-8", errors="replace")
    joined, joins = join_literals(raw)
    stripped = VERSION_COMMENT_RE.sub(b"", data, count=1)
    return {
        "size": len(data),
        "sha256": sha256(data),
        "joinedLiteralPairs": joins,
        "sal": sorted(set(SAL_RE.findall(joined))),
        "fields": {marker: joined.count(marker) for marker in FIELD_MARKERS},
        "semanticLiterals": semantic_literals(joined),
        "tokenShingles": token_shingles(joined),
        "blockHashes": block_hashes(stripped),
        "stripped": stripped,
    }


def compare(candidate: dict[str, Any], modified: dict[str, Any]) -> dict[str, Any]:
    token_similarity = jaccard(candidate["tokenShingles"], modified["tokenShingles"])
    semantic_similarity = jaccard(candidate["semanticLiterals"], modified["semanticLiterals"])
    block_intersection = candidate["blockHashes"] & modified["blockHashes"]
    candidate_block_coverage = len(block_intersection) / max(1, len(candidate["blockHashes"]))
    modified_block_coverage = len(block_intersection) / max(1, len(modified["blockHashes"]))
    sal_similarity = jaccard(candidate["sal"], modified["sal"])
    field_similarity = cosine(candidate["fields"], modified["fields"])
    size_ratio = min(candidate["size"], modified["size"]) / max(candidate["size"], modified["size"])
    prefix = common_prefix(candidate["stripped"], modified["stripped"])
    suffix = common_suffix(candidate["stripped"], modified["stripped"])
    score = (
        35 * token_similarity
        + 25 * semantic_similarity
        + 10 * candidate_block_coverage
        + 10 * modified_block_coverage
        + 8 * field_similarity
        + 7 * sal_similarity
        + 5 * size_ratio
    )
    return {
        "score": round(score, 5),
        "tokenShingleJaccard": round(token_similarity, 7),
        "semanticLiteralJaccard": round(semantic_similarity, 7),
        "candidateBlockCoverage": round(candidate_block_coverage, 7),
        "modifiedBlockCoverage": round(modified_block_coverage, 7),
        "sharedBlockCount": len(block_intersection),
        "fieldCosine": round(field_similarity, 7),
        "salJaccard": round(sal_similarity, 7),
        "sizeRatio": round(size_ratio, 7),
        "commonPrefixBytesAfterVersionHeader": prefix,
        "commonSuffixBytes": suffix,
    }


def public_summary(prepared: dict[str, Any]) -> dict[str, Any]:
    return {
        "size": prepared["size"],
        "sha256": prepared["sha256"],
        "joinedLiteralPairs": prepared["joinedLiteralPairs"],
        "salCount": len(prepared["sal"]),
        "semanticLiteralCount": len(prepared["semanticLiterals"]),
        "tokenShingleCount": len(prepared["tokenShingles"]),
        "blockHashCount": len(prepared["blockHashes"]),
        "fieldCounts": prepared["fields"],
    }


def render(result: dict[str, Any]) -> str:
    rows = result["rankedCandidates"]
    lines = [
        "# 历史官方候选深度相似度", "",
        "本报告只保存指纹和相似度，不保存历史官方源码或可直接应用的补丁。", "",
        "| 排名 | 官方版本 | 归档时间 | 综合分 | token | 语义字符串 | 官方块覆盖 | 修改版块覆盖 | 字段 | SAL | 大小 |",
        "|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for index, item in enumerate(rows, 1):
        metric = item["deepSimilarity"]
        lines.append(
            f"| {index} | `{item['officialVersion']}` | {item['timestamp']} | {metric['score']:.5f} | "
            f"{metric['tokenShingleJaccard']:.7f} | {metric['semanticLiteralJaccard']:.7f} | "
            f"{metric['candidateBlockCoverage']:.7f} | {metric['modifiedBlockCoverage']:.7f} | "
            f"{metric['fieldCosine']:.7f} | {metric['salJaccard']:.7f} | {metric['sizeRatio']:.7f} |"
        )
    lines += ["", "## 结论", ""]
    if rows:
        best = rows[0]
        metric = best["deepSimilarity"]
        lines.append(
            f"深度指纹最接近的是官方版本 `{best['officialVersion']}`（归档时间 {best['timestamp']}，综合分 {metric['score']:.5f}）。"
        )
        if metric["tokenShingleJaccard"] >= 0.75 and metric["semanticLiteralJaccard"] >= 0.75:
            lines.append("该候选具有较强同代代码结构证据，适合作为优先人工参考基线。")
        else:
            lines.append("该候选只是相对最接近，尚不足以证明它是修改版直接母版。")
        lines.append("只有来源链、同日期文件或高比例可解释的共享代码块，才能进一步提高母版判断置信度。")
    else:
        lines.append("前五个历史候选均未能重新读取，无法生成深度排名。")
    lines += [
        "", "## 指标解释", "",
        "- token：忽略普通变量名和数字后的规范化语法片段相似度。",
        "- 语义字符串：用户、商城、存档、媒体、网络和安全相关字符串集合。",
        "- 块覆盖：4 KiB 滑动块在两份文件中的精确复用比例。",
        "- 字段：重点字段出现密度的余弦相似度。",
        "- SAL：平台接口集合相似度。",
        "- 得分仅用于候选排序，不是同源证明。",
    ]
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root", default=".")
    parser.add_argument("--input", default="docs/js-maintenance/historical-search/historical-search.json")
    parser.add_argument("--output-dir", default="docs/js-maintenance/historical-search")
    args = parser.parse_args()
    root = Path(args.repo_root).resolve()
    source_report = json.loads((root / args.input).read_text(encoding="utf-8"))
    output = (root / args.output_dir).resolve()
    manifest = json.loads((root / "game-engine/release/manifest.json").read_text(encoding="utf-8"))
    modified_path = root / "game-engine/release" / manifest["file"]
    modified = prepare(modified_path.read_bytes())

    top = source_report.get("rankedCandidates", [])[:TOP_CANDIDATES]
    fetched: dict[str, tuple[bytes, str]] = {}
    with ThreadPoolExecutor(max_workers=5) as pool:
        future_map = {
            pool.submit(fetch_wayback, item["timestamp"], item["source"]): item
            for item in top
        }
        for future in as_completed(future_map):
            item = future_map[future]
            try:
                fetched[item["officialVersion"]] = future.result()
            except Exception as error:
                fetched[item["officialVersion"]] = (b"", str(error))

    ranked = []
    errors = []
    for item in top:
        body, error = fetched.get(item["officialVersion"], (b"", "missing result"))
        if not body:
            errors.append({"officialVersion": item["officialVersion"], "timestamp": item["timestamp"], "error": error})
            continue
        expected_hash = item.get("sha256", "")
        actual_hash = sha256(body)
        if expected_hash and actual_hash != expected_hash:
            errors.append({
                "officialVersion": item["officialVersion"],
                "timestamp": item["timestamp"],
                "error": "archive body hash changed",
                "expectedSha256": expected_hash,
                "actualSha256": actual_hash,
            })
            continue
        prepared = prepare(body)
        ranked.append({
            "officialVersion": item["officialVersion"],
            "timestamp": item["timestamp"],
            "sourceSha256": actual_hash,
            "summary": public_summary(prepared),
            "deepSimilarity": compare(prepared, modified),
        })

    ranked.sort(key=lambda item: item["deepSimilarity"]["score"], reverse=True)
    result = {
        "schemaVersion": 1,
        "warning": "Candidate ranking is not proof of source lineage.",
        "method": {
            "topCandidates": TOP_CANDIDATES,
            "blockSize": BLOCK_SIZE,
            "blockStride": BLOCK_STRIDE,
            "tokenShingleWidth": SHINGLE_WIDTH,
            "tokenShingleStride": SHINGLE_STRIDE,
        },
        "modifiedBaseline": public_summary(modified),
        "rankedCandidates": ranked,
        "errors": errors,
    }
    output.mkdir(parents=True, exist_ok=True)
    (output / "historical-deep-comparison.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    (output / "historical-deep-comparison.md").write_text(render(result) + "\n", encoding="utf-8")
    print(json.dumps({
        "candidateCount": len(ranked),
        "bestCandidate": ranked[0]["officialVersion"] if ranked else "",
        "bestScore": ranked[0]["deepSimilarity"]["score"] if ranked else 0,
        "errors": len(errors),
        "output": str(output),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
