#!/usr/bin/env python3
"""Fast bounded public-archive search for historical official game.js baselines.

Every network operation has a short timeout. Only archive metadata and structural
fingerprints are committed; retrieved third-party bytes remain transient.
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import re
import ssl
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any

USER_AGENT = "Mozilla/5.0 (compatible; GG-Maintenance-History-Finder/1.1)"
TIMEOUT = 12
MAX_PAGE = 6 * 1024 * 1024
MAX_SCRIPT = 32 * 1024 * 1024
SAL_RE = re.compile(r"\bSAL_[A-Za-z0-9_]+\b")
VERSION_RE = re.compile(r"^/\*\s*([^*]{1,80})\s*\*/")
LOGIC_RE = re.compile(r"logic\s+version\s*[:=]\s*([0-9A-Za-z_.-]{1,40})", re.I)
GAME_URL_RE = re.compile(r"https?://(?:c1|c2)\.cgyouxi\.com/website/hfplayer/v3/bin/official/game\.js(?:\?[^\s'\"<>]*)?", re.I)
PAIR_RE = re.compile(r"(['\"])([^'\"\\\n]{0,180})\1\s*\+\s*(['\"])([^'\"\\\n]{0,180})\3")


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def get(url: str, maximum: int, headers: dict[str, str] | None = None) -> tuple[int, bytes, str]:
    merged = {"User-Agent": USER_AGENT, "Accept": "*/*"}
    if headers:
        merged.update(headers)
    try:
        request = urllib.request.Request(url, headers=merged)
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


def wayback_body(record: dict[str, Any], maximum: int) -> tuple[bytes, str]:
    url = f"https://web.archive.org/web/{record.get('timestamp', '')}id_/{record.get('original', '')}"
    status, body, error = get(url, maximum)
    return (body, "") if status == 200 and body else (b"", error or f"HTTP {status}")


def join_literals(text: str, rounds: int = 8) -> tuple[str, int]:
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


def fingerprint(data: bytes, archive: str, timestamp: str, source: str) -> dict[str, Any]:
    raw = data.decode("utf-8", errors="replace")
    joined, joins = join_literals(raw)
    version = VERSION_RE.search(raw[:300])
    return {
        "archive": archive,
        "timestamp": timestamp,
        "source": source,
        "size": len(data),
        "sha256": sha256(data),
        "versionHeader": version.group(1).strip() if version else "",
        "logicVersions": sorted(set(LOGIC_RE.findall(joined))),
        "directSalCount": len(set(SAL_RE.findall(raw))),
        "reconstructedSalCount": len(set(SAL_RE.findall(joined))),
        "joinedLiteralPairs": joins,
        "chunkGlobals": sorted(set(re.findall(r"webpackChunk[A-Za-z0-9_$]+", joined))),
        "chunkNames": sorted(set(re.findall(r"\.push\(\[\s*\[\s*['\"]([^'\"]{1,100})['\"]", joined))),
        "entry71269Present": bool(re.search(r"(?<!\d)71269\s*:", joined)),
    }


def unique(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen = set()
    result = []
    for item in records:
        key = item.get("digest") or (item.get("timestamp"), item.get("original") or item.get("url"))
        if key in seen:
            continue
        seen.add(key)
        result.append(item)
    return result


def commoncrawl_indexes() -> tuple[list[dict[str, Any]], str]:
    payload, error = json_get("https://index.commoncrawl.org/collinfo.json", 3 * 1024 * 1024)
    if not isinstance(payload, list):
        return [], error
    selected = []
    years = set()
    for item in payload:
        match = re.search(r"CC-MAIN-(20\d{2})", str(item.get("id", "")))
        if not match:
            continue
        year = int(match.group(1))
        if year < 2021 or year > 2026 or year in years:
            continue
        selected.append(item)
        years.add(year)
        if len(selected) >= 6:
            break
    return selected, ""


def cc_records(index: dict[str, Any], original: str) -> tuple[list[dict[str, Any]], str]:
    endpoint = index.get("cdx-api")
    if not endpoint:
        return [], "missing cdx-api"
    params = urllib.parse.urlencode({"url": original, "output": "json", "filter": "status:200", "collapse": "digest"})
    status, body, error = get(endpoint + "?" + params, 5 * 1024 * 1024)
    if status != 200 or not body:
        return [], error or f"HTTP {status}"
    rows = []
    for line in body.decode("utf-8", errors="replace").splitlines():
        try:
            row = json.loads(line)
            row["indexId"] = index.get("id", "")
            rows.append(row)
        except Exception:
            pass
    return rows, ""


def cc_body(record: dict[str, Any]) -> tuple[bytes, str]:
    try:
        start = int(record["offset"])
        length = int(record["length"])
        filename = record["filename"]
    except Exception:
        return b"", "missing WARC location"
    if length > MAX_SCRIPT + 2 * 1024 * 1024:
        return b"", "WARC record too large"
    status, compressed, error = get(
        "https://data.commoncrawl.org/" + filename,
        length + 1024,
        {"Range": f"bytes={start}-{start + length - 1}"},
    )
    if status not in (200, 206) or not compressed:
        return b"", error or f"HTTP {status}"
    try:
        decoded = gzip.decompress(compressed)
    except Exception as exc:
        return b"", f"gzip: {exc}"
    marker = decoded.find(b"\r\n\r\nHTTP/")
    http = decoded[marker + 4:] if marker >= 0 else decoded
    split = http.find(b"\r\n\r\n")
    if split < 0:
        return b"", "HTTP body missing"
    body = http[split + 4:]
    if len(body) > MAX_SCRIPT:
        return b"", "payload too large"
    return body, ""


def render(result: dict[str, Any]) -> str:
    candidates = result["candidates"]
    exact = [x for x in candidates if x["versionHeader"] == "1.0.2" or "1.0.2" in x["logicVersions"]]
    lines = [
        "# 历史官方基线快速检索", "",
        "检索范围：Wayback Machine 与每年一个 Common Crawl 索引。所有请求均有短超时。", "",
        f"- Wayback 页面记录：`{len(result['wayback']['pageRecords'])}`",
        f"- Wayback 脚本记录：`{len(result['wayback']['scriptRecords'])}`",
        f"- Common Crawl 记录：`{len(result['commonCrawl']['records'])}`",
        f"- 可读取的唯一脚本候选：`{len(candidates)}`",
        f"- 明确标记 1.0.2 的候选：`{len(exact)}`", "",
        "| 归档 | 时间 | 版本头 | logic version | 大小 | SHA-256 | SAL |",
        "|---|---|---|---|---:|---|---:|",
    ]
    for item in candidates:
        lines.append(
            f"| {item['archive']} | {item['timestamp']} | `{item['versionHeader'] or '-'}` | "
            f"`{', '.join(item['logicVersions']) or '-'}` | {item['size']} | `{item['sha256']}` | {item['reconstructedSalCount']} |"
        )
    if not candidates:
        lines.append("| - | - | - | - | - | - | - |")
    lines += ["", "## 结论", ""]
    if exact:
        lines.append("已找到明确的 1.0.2 历史候选，下一步应进行同版本完整性确认和差异分析。")
    elif candidates:
        lines.append("存在历史候选，但没有候选明确标记为 1.0.2；不能将其当作同版本官方基线。")
    else:
        lines.append("本轮公共归档没有提供可读取的历史官方 game.js；同版本官方基线仍缺失。")
    lines.append("归档无结果不等于文件从未存在。下一优先来源是旧设备缓存、旧 APK 数据备份和开发者本地下载目录。")
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root", default=".")
    parser.add_argument("--output-dir", default="docs/js-maintenance/historical-search")
    args = parser.parse_args()
    root = Path(args.repo_root).resolve()
    out = (root / args.output_dir).resolve()
    upstream = json.loads((root / "game-engine/upstream-baseline.json").read_text(encoding="utf-8"))
    official = upstream["resources"]["officialGame"]["url"].split("?", 1)[0]
    page = upstream["pageUrl"].split("?", 1)[0]
    script_urls = sorted({official, official.replace("https://c2.", "https://c1.")})

    page_records, page_error = cdx(page + "*")
    script_record_groups: list[dict[str, Any]] = []
    wayback_errors = {}
    with ThreadPoolExecutor(max_workers=3) as pool:
        future_map = {pool.submit(cdx, url + "*"): url for url in script_urls}
        for future in as_completed(future_map):
            url = future_map[future]
            try:
                rows, error = future.result()
            except Exception as exc:
                rows, error = [], str(exc)
            script_record_groups.extend(rows)
            if error:
                wayback_errors[url] = error

    discovered = set(script_urls)
    page_fingerprints = []
    for record in unique(page_records)[:3]:
        body, error = wayback_body(record, MAX_PAGE)
        urls = sorted(set(GAME_URL_RE.findall(body.decode("utf-8", errors="replace")))) if body else []
        discovered.update(value.split("?", 1)[0] for value in urls)
        page_fingerprints.append({"record": record, "size": len(body), "sha256": sha256(body) if body else "", "gameUrls": urls, "error": error})

    candidates = []
    candidate_errors = []
    wayback_records = unique(script_record_groups)
    with ThreadPoolExecutor(max_workers=4) as pool:
        future_map = {pool.submit(wayback_body, record, MAX_SCRIPT): record for record in wayback_records[:8]}
        for future in as_completed(future_map):
            record = future_map[future]
            body, error = future.result()
            if body:
                candidates.append(fingerprint(body, "wayback", record.get("timestamp", ""), record.get("original", "")))
            else:
                candidate_errors.append({"archive": "wayback", "timestamp": record.get("timestamp"), "error": error})

    indexes, index_error = commoncrawl_indexes()
    cc_all = []
    cc_errors = {}
    with ThreadPoolExecutor(max_workers=6) as pool:
        future_map = {pool.submit(cc_records, index, official): index for index in indexes}
        for future in as_completed(future_map):
            index = future_map[future]
            try:
                rows, error = future.result()
            except Exception as exc:
                rows, error = [], str(exc)
            cc_all.extend(rows)
            if error:
                cc_errors[index.get("id", "")] = error
    cc_unique = unique(cc_all)
    with ThreadPoolExecutor(max_workers=4) as pool:
        future_map = {pool.submit(cc_body, record): record for record in cc_unique[:8]}
        for future in as_completed(future_map):
            record = future_map[future]
            body, error = future.result()
            if body:
                candidates.append(fingerprint(body, "commoncrawl", record.get("timestamp", ""), record.get("url", "")))
            else:
                candidate_errors.append({"archive": "commoncrawl", "timestamp": record.get("timestamp"), "error": error})

    unique_candidates = []
    hashes = set()
    for item in sorted(candidates, key=lambda value: (value["timestamp"], value["sha256"])):
        if item["sha256"] in hashes:
            continue
        hashes.add(item["sha256"])
        unique_candidates.append(item)

    result = {
        "schemaVersion": 2,
        "boundedSearch": {"timeoutSeconds": TIMEOUT, "commonCrawlIndexes": len(indexes), "maxWaybackBodies": 8, "maxCommonCrawlBodies": 8},
        "searchedUrls": sorted(discovered),
        "wayback": {"pageRecords": page_records, "pageFingerprints": page_fingerprints, "pageError": page_error, "scriptRecords": wayback_records, "errors": wayback_errors},
        "commonCrawl": {"indexes": [{"id": x.get("id"), "name": x.get("name")} for x in indexes], "indexError": index_error, "records": cc_unique, "errors": cc_errors},
        "candidates": unique_candidates,
        "candidateErrors": candidate_errors,
    }
    out.mkdir(parents=True, exist_ok=True)
    (out / "historical-search.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (out / "README.md").write_text(render(result) + "\n", encoding="utf-8")
    exact = [x for x in unique_candidates if x["versionHeader"] == "1.0.2" or "1.0.2" in x["logicVersions"]]
    print(json.dumps({"waybackPageRecords": len(page_records), "waybackScriptRecords": len(wayback_records), "commonCrawlRecords": len(cc_unique), "candidates": len(unique_candidates), "exact102Candidates": len(exact), "output": str(out)}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
