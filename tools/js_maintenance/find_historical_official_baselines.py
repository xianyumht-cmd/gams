#!/usr/bin/env python3
"""Search public web archives for historical official H5 game baselines.

Only archive metadata and small structural fingerprints are committed. Retrieved third-party
page/script bytes remain transient in the Actions runner and are never written to the repo.
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import re
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from pathlib import Path
from typing import Any, Iterable

USER_AGENT = "Mozilla/5.0 (compatible; GG-Maintenance-Baseline-Finder/1.0)"
MAX_PAGE_BYTES = 6 * 1024 * 1024
MAX_SCRIPT_BYTES = 32 * 1024 * 1024
SAL_RE = re.compile(r"\bSAL_[A-Za-z0-9_]+\b")
VERSION_HEADER_RE = re.compile(r"^/\*\s*([^*]{1,80})\s*\*/")
LOGIC_VERSION_RE = re.compile(r"logic\s+version\s*[:=]\s*([0-9A-Za-z_.-]{1,40})", re.I)
GAME_URL_RE = re.compile(
    r"https?://(?:c1|c2)\.cgyouxi\.com/website/hfplayer/v3/bin/official/game\.js(?:\?[^\s'\"<>]*)?",
    re.I,
)
SCRIPT_PATH_RE = re.compile(r"/website/hfplayer/v3/bin/official/game\.js(?:\?[^\s'\"<>]*)?", re.I)
PAIR_PATTERNS = [
    re.compile(r"'([^'\\\n]{0,160})'\s*\+\s*'([^'\\\n]{0,160})'"),
    re.compile(r'"([^"\\\n]{0,160})"\s*\+\s*"([^"\\\n]{0,160})"'),
    re.compile(r"'([^'\\\n]{0,160})'\s*\+\s*\"([^\"\\\n]{0,160})\""),
    re.compile(r'"([^"\\\n]{0,160})"\s*\+\s*\'([^\'\\\n]{0,160})\''),
]


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def request_bytes(url: str, maximum: int, headers: dict[str, str] | None = None, retries: int = 3) -> tuple[int, str, dict[str, str], bytes, str]:
    merged = {"User-Agent": USER_AGENT, "Accept": "*/*"}
    if headers:
        merged.update(headers)
    error_text = ""
    for attempt in range(retries):
        request = urllib.request.Request(url, headers=merged)
        try:
            with urllib.request.urlopen(request, timeout=45, context=ssl.create_default_context()) as response:
                chunks: list[bytes] = []
                total = 0
                while True:
                    chunk = response.read(65536)
                    if not chunk:
                        break
                    total += len(chunk)
                    if total > maximum:
                        raise ValueError(f"response exceeds {maximum} bytes")
                    chunks.append(chunk)
                return (
                    int(getattr(response, "status", response.getcode())),
                    response.geturl(),
                    {k.lower(): v for k, v in response.headers.items()},
                    b"".join(chunks),
                    "",
                )
        except urllib.error.HTTPError as error:
            error_text = f"HTTP {error.code}"
            if error.code not in (429, 500, 502, 503, 504):
                return int(error.code), error.geturl() or url, {}, b"", error_text
        except Exception as error:
            error_text = f"{type(error).__name__}: {error}"
        if attempt + 1 < retries:
            time.sleep(1.5 * (attempt + 1))
    return 0, url, {}, b"", error_text


def request_json(url: str, maximum: int = 5 * 1024 * 1024) -> tuple[Any, str]:
    status, _, _, body, error = request_bytes(url, maximum)
    if status != 200 or not body:
        return None, error or f"HTTP {status}"
    try:
        return json.loads(body.decode("utf-8", errors="replace")), ""
    except Exception as exc:
        return None, f"JSON decode: {exc}"


def join_simple_literals(text: str, rounds: int = 12) -> tuple[str, int]:
    current = text
    total = 0
    for _ in range(rounds):
        changed = 0
        for index, pattern in enumerate(PAIR_PATTERNS):
            quote = "'" if index in (0, 2, 3) else '"'
            def replace(match: re.Match[str]) -> str:
                nonlocal changed
                changed += 1
                return quote + match.group(1) + match.group(2) + quote
            current = pattern.sub(replace, current)
        total += changed
        if not changed:
            break
    return current, total


def fingerprint_script(data: bytes, source: str, timestamp: str, archive: str) -> dict[str, Any]:
    text = data.decode("utf-8", errors="replace")
    joined, joins = join_simple_literals(text)
    header = VERSION_HEADER_RE.search(text[:300])
    logic_versions = sorted(set(LOGIC_VERSION_RE.findall(joined)))
    chunk_globals = sorted(set(re.findall(r"webpackChunk[A-Za-z0-9_$]+", joined)))
    chunk_names = sorted(set(re.findall(r"\.push\(\[\s*\[\s*['\"]([^'\"]{1,100})['\"]", joined)))
    return {
        "archive": archive,
        "timestamp": timestamp,
        "source": source,
        "size": len(data),
        "sha256": sha256(data),
        "versionHeader": header.group(1).strip() if header else "",
        "logicVersions": logic_versions,
        "directSalCount": len(set(SAL_RE.findall(text))),
        "reconstructedSalCount": len(set(SAL_RE.findall(joined))),
        "joinedLiteralPairs": joins,
        "chunkGlobals": chunk_globals,
        "chunkNames": chunk_names,
        "entry71269Present": bool(re.search(r"(?<!\d)71269\s*:", joined)),
        "targetDependencyOrderPresent": all(joined.find(str(value)) >= 0 for value in (36728, 6886, 75640)),
    }


def extract_game_urls(page_data: bytes, base_url: str) -> list[str]:
    text = page_data.decode("utf-8", errors="replace")
    values = set(GAME_URL_RE.findall(text))
    for path in SCRIPT_PATH_RE.findall(text):
        values.add(urllib.parse.urljoin(base_url, path))
    return sorted(values)


def wayback_cdx(original: str, from_year: int = 2020, to_year: int = 2026) -> tuple[list[dict[str, Any]], str]:
    params = {
        "url": original,
        "output": "json",
        "fl": "timestamp,original,statuscode,mimetype,digest,length",
        "filter": "statuscode:200",
        "collapse": "digest",
        "from": str(from_year),
        "to": str(to_year),
    }
    url = "https://web.archive.org/cdx/search/cdx?" + urllib.parse.urlencode(params)
    payload, error = request_json(url)
    if not isinstance(payload, list) or not payload:
        return [], error
    header = payload[0]
    rows = []
    for values in payload[1:]:
        if len(values) != len(header):
            continue
        rows.append(dict(zip(header, values)))
    return rows, ""


def fetch_wayback_record(record: dict[str, Any], maximum: int) -> tuple[bytes, str]:
    timestamp = record.get("timestamp", "")
    original = record.get("original", "")
    url = f"https://web.archive.org/web/{timestamp}id_/{original}"
    status, _, _, body, error = request_bytes(url, maximum)
    if status != 200:
        return b"", error or f"HTTP {status}"
    return body, ""


def commoncrawl_indexes() -> tuple[list[dict[str, Any]], str]:
    payload, error = request_json("https://index.commoncrawl.org/collinfo.json", 3 * 1024 * 1024)
    if not isinstance(payload, list):
        return [], error
    selected = []
    years_seen: dict[str, int] = defaultdict(int)
    for item in payload:
        identifier = str(item.get("id", ""))
        match = re.search(r"CC-MAIN-(20\d{2})", identifier)
        if not match:
            continue
        year = match.group(1)
        if int(year) < 2021 or int(year) > 2026:
            continue
        if years_seen[year] >= 3:
            continue
        selected.append(item)
        years_seen[year] += 1
        if len(selected) >= 15:
            break
    return selected, ""


def commoncrawl_records(index: dict[str, Any], original: str) -> tuple[list[dict[str, Any]], str]:
    endpoint = index.get("cdx-api") or index.get("url")
    if not endpoint:
        return [], "missing index endpoint"
    params = {"url": original, "output": "json", "filter": "status:200", "collapse": "digest"}
    url = endpoint + ("&" if "?" in endpoint else "?") + urllib.parse.urlencode(params)
    status, _, _, body, error = request_bytes(url, 8 * 1024 * 1024)
    if status != 200 or not body:
        return [], error or f"HTTP {status}"
    rows = []
    for line in body.decode("utf-8", errors="replace").splitlines():
        try:
            rows.append(json.loads(line))
        except Exception:
            continue
    return rows, ""


def fetch_commoncrawl_record(record: dict[str, Any], maximum: int) -> tuple[bytes, str]:
    filename = record.get("filename")
    offset = record.get("offset")
    length = record.get("length")
    if not filename or offset is None or length is None:
        return b"", "missing WARC location"
    try:
        start = int(offset)
        size = int(length)
    except Exception:
        return b"", "invalid WARC location"
    if size > maximum + 2 * 1024 * 1024:
        return b"", "WARC record too large"
    url = "https://data.commoncrawl.org/" + filename
    status, _, _, compressed, error = request_bytes(
        url,
        size + 1024,
        headers={"Range": f"bytes={start}-{start + size - 1}"},
    )
    if status not in (200, 206) or not compressed:
        return b"", error or f"HTTP {status}"
    try:
        warc = gzip.decompress(compressed)
    except Exception as exc:
        return b"", f"gzip: {exc}"
    marker = b"\r\n\r\nHTTP/"
    pos = warc.find(marker)
    if pos >= 0:
        http = warc[pos + 4:]
    else:
        http = warc
    header_end = http.find(b"\r\n\r\n")
    if header_end < 0:
        return b"", "HTTP payload not found"
    body = http[header_end + 4:]
    if len(body) > maximum:
        return b"", "payload too large"
    return body, ""


def unique_records(records: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    seen = set()
    result = []
    for record in records:
        key = record.get("digest") or (record.get("timestamp"), record.get("original") or record.get("url"))
        if key in seen:
            continue
        seen.add(key)
        result.append(record)
    return result


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def render(result: dict[str, Any]) -> str:
    candidates = result["scriptCandidates"]
    exact = [item for item in candidates if item.get("versionHeader") == "1.0.2" or "1.0.2" in item.get("logicVersions", [])]
    lines = [
        "# 历史官方基线检索结果", "",
        "本报告查询 Wayback Machine 与 Common Crawl，只保存历史记录元数据和结构指纹。", "",
        f"- Wayback 页面记录：`{len(result['wayback']['pageRecords'])}`",
        f"- Wayback game.js 记录：`{len(result['wayback']['scriptRecords'])}`",
        f"- Common Crawl 索引数：`{len(result['commonCrawl']['indexes'])}`",
        f"- 历史脚本候选指纹：`{len(candidates)}`",
        f"- 明确标记为 1.0.2 的官方候选：`{len(exact)}`", "",
        "## 候选", "",
        "| 归档 | 时间 | 版本头 | logic version | 大小 | SHA-256 | SAL |",
        "|---|---|---|---|---:|---|---:|",
    ]
    for item in candidates[:60]:
        lines.append(
            f"| {item['archive']} | {item['timestamp']} | `{item['versionHeader'] or '-'}` | "
            f"`{', '.join(item['logicVersions']) or '-'}` | {item['size']} | `{item['sha256']}` | "
            f"{item['reconstructedSalCount']} |"
        )
    if not candidates:
        lines.append("| - | - | - | - | - | - | - |")
    lines += ["", "## 结论", ""]
    if exact:
        lines.append("找到了带明确 `1.0.2` 标记的历史官方候选，下一步应单独校验其完整性并与修改版做同版本差异。")
    elif candidates:
        lines.append("找到了历史候选，但没有候选明确标记为 `1.0.2`。不能把它们直接当作修改版的同版本官方基线。")
    else:
        lines.append("两个公共归档均未提供可读取的历史官方 `game.js` 候选。同版本官方基线仍然缺失。")
    lines += [
        "", "归档缺失不代表历史文件从未存在，只代表本轮使用的公共索引没有可用记录。",
        "后续可继续从旧设备 WebView 缓存、旧安装包备份、开发者本地下载目录或其他用户保存的历史文件中寻找。",
    ]
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root", default=".")
    parser.add_argument("--output-dir", default="docs/js-maintenance/historical-search")
    args = parser.parse_args()
    root = Path(args.repo_root).resolve()
    output = (root / args.output_dir).resolve()
    upstream = json.loads((root / "game-engine/upstream-baseline.json").read_text(encoding="utf-8"))
    current_url = upstream["resources"]["officialGame"]["url"].split("?", 1)[0]
    page_url = upstream["pageUrl"].split("?", 1)[0]
    script_urls = sorted({
        current_url,
        current_url.replace("https://c2.", "https://c1."),
        current_url.replace("https://", "http://"),
        current_url.replace("https://c2.", "http://c1."),
    })

    wayback_page_records, wayback_page_error = wayback_cdx(page_url + "*")
    wayback_script_records: list[dict[str, Any]] = []
    wayback_errors: dict[str, str] = {}
    for url in script_urls:
        rows, error = wayback_cdx(url + "*")
        wayback_script_records.extend(rows)
        if error:
            wayback_errors[url] = error

    discovered_urls: set[str] = set(script_urls)
    page_fingerprints = []
    for record in unique_records(wayback_page_records)[:20]:
        body, error = fetch_wayback_record(record, MAX_PAGE_BYTES)
        item = {"record": record, "error": error, "size": len(body), "sha256": sha256(body) if body else "", "gameUrls": []}
        if body:
            item["gameUrls"] = extract_game_urls(body, record.get("original", page_url))
            discovered_urls.update(value.split("?", 1)[0] for value in item["gameUrls"])
        page_fingerprints.append(item)

    for url in sorted(discovered_urls):
        rows, error = wayback_cdx(url + "*")
        wayback_script_records.extend(rows)
        if error and url not in wayback_errors:
            wayback_errors[url] = error

    candidates: list[dict[str, Any]] = []
    candidate_errors = []
    for record in unique_records(wayback_script_records)[:40]:
        body, error = fetch_wayback_record(record, MAX_SCRIPT_BYTES)
        if body:
            candidates.append(fingerprint_script(body, record.get("original", ""), record.get("timestamp", ""), "wayback"))
        else:
            candidate_errors.append({"archive": "wayback", "record": record, "error": error})

    indexes, index_error = commoncrawl_indexes()
    common_records: list[dict[str, Any]] = []
    common_errors: dict[str, str] = {}
    for index in indexes:
        for url in sorted(discovered_urls):
            rows, error = commoncrawl_records(index, url)
            for row in rows:
                row["indexId"] = index.get("id", "")
            common_records.extend(rows)
            if error:
                common_errors[f"{index.get('id', '')}:{url}"] = error

    for record in unique_records(common_records)[:30]:
        body, error = fetch_commoncrawl_record(record, MAX_SCRIPT_BYTES)
        if body:
            candidates.append(fingerprint_script(body, record.get("url", ""), record.get("timestamp", ""), "commoncrawl"))
        else:
            candidate_errors.append({"archive": "commoncrawl", "record": {k: record.get(k) for k in ("url", "timestamp", "digest", "indexId")}, "error": error})

    unique_candidates = []
    seen_hashes = set()
    for item in sorted(candidates, key=lambda value: (value.get("timestamp", ""), value["sha256"])):
        if item["sha256"] in seen_hashes:
            continue
        seen_hashes.add(item["sha256"])
        unique_candidates.append(item)

    result = {
        "schemaVersion": 1,
        "searchedOfficialUrls": sorted(discovered_urls),
        "wayback": {
            "pageRecords": wayback_page_records,
            "pageFingerprints": page_fingerprints,
            "pageError": wayback_page_error,
            "scriptRecords": unique_records(wayback_script_records),
            "errors": wayback_errors,
        },
        "commonCrawl": {
            "indexes": [{"id": item.get("id"), "name": item.get("name"), "cdx-api": item.get("cdx-api")} for item in indexes],
            "indexError": index_error,
            "records": unique_records(common_records),
            "errors": common_errors,
        },
        "scriptCandidates": unique_candidates,
        "candidateErrors": candidate_errors,
    }
    output.mkdir(parents=True, exist_ok=True)
    write_json(output / "historical-search.json", result)
    (output / "README.md").write_text(render(result) + "\n", encoding="utf-8")
    exact = [item for item in unique_candidates if item.get("versionHeader") == "1.0.2" or "1.0.2" in item.get("logicVersions", [])]
    print(json.dumps({
        "waybackPageRecords": len(wayback_page_records),
        "waybackScriptRecords": len(unique_records(wayback_script_records)),
        "commonCrawlRecords": len(unique_records(common_records)),
        "scriptCandidates": len(unique_candidates),
        "exact102Candidates": len(exact),
        "output": str(output),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
