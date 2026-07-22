#!/usr/bin/env python3
"""Resolve dynamically referenced official JavaScript chunks and inline bootstrap code.

Only metadata, module evidence, parent relationships and short sanitized anchor snippets
are written. Downloaded third-party source is kept in memory and never committed.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import ssl
import urllib.error
import urllib.parse
import urllib.request
from collections import deque
from pathlib import Path
from typing import Any

USER_AGENT = (
    "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36"
)
ALLOWED_HOSTS = {"c2.cgyouxi.com", "m.66rpg.com", "www.66rpg.com"}
TARGET_MODULES = (36728, 6886, 75640)
MAX_BYTES = 32 * 1024 * 1024
MAX_RESOURCES = 80
MAX_DEPTH = 3
SCRIPT_TAG_RE = re.compile(r"<script\b(?P<attrs>[^>]*)>(?P<body>.*?)</script\s*>", re.I | re.S)
SRC_RE = re.compile(r"\bsrc\s*=\s*(['\"])(.*?)\1", re.I | re.S)
QUOTED_JS_RE = re.compile(r"(['\"])([^'\"\r\n]{1,420}?\.js(?:\?[^'\"\r\n]{0,260})?)\1", re.I)
ABS_JS_RE = re.compile(r"(?:(?:https?:)?//)[^\s'\"<>]+?\.js(?:\?[^\s'\"<>]*)?", re.I)
LITERAL_JOIN_RE = re.compile(r"(['\"])([^'\"\r\n]{0,220})\1\s*\+\s*(['\"])([^'\"\r\n]{0,220})\3")
MODULE_DEF = {
    mid: re.compile(
        rb"(?<![A-Za-z0-9_$])" + str(mid).encode() +
        rb"\s*:\s*(?:function\s*\(|\([^)]{0,260}\)\s*=>|[A-Za-z_$][A-Za-z0-9_$]*\s*=>)"
    )
    for mid in TARGET_MODULES
}
MODULE_USE = {
    mid: re.compile(
        rb"(?<![A-Za-z0-9_$])[A-Za-z_$][A-Za-z0-9_$]*\(\s*" + str(mid).encode() + rb"\s*\)"
    )
    for mid in TARGET_MODULES
}
ANCHOR_TERMS = (
    "webpackChunk_lodash_modules", "webpackJsonp", "__webpack_require__", ".u=", ".p=",
    "36728", "6886", "75640", "SALInterface", "webGLLib", "GameInfoData",
)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def fetch(url: str) -> tuple[int, str, dict[str, str], bytes, str]:
    request = urllib.request.Request(url, headers={
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/javascript,text/javascript,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9",
        "Cache-Control": "no-cache",
    })
    try:
        with urllib.request.urlopen(request, timeout=35, context=ssl.create_default_context()) as response:
            chunks: list[bytes] = []
            total = 0
            while True:
                chunk = response.read(65536)
                if not chunk:
                    break
                total += len(chunk)
                if total > MAX_BYTES:
                    raise ValueError("response too large")
                chunks.append(chunk)
            return (
                int(getattr(response, "status", response.getcode())),
                response.geturl(),
                {k.lower(): v for k, v in response.headers.items()},
                b"".join(chunks),
                "",
            )
    except urllib.error.HTTPError as error:
        return int(error.code), error.geturl() or url, {}, b"", f"HTTP {error.code}"
    except Exception as error:
        return 0, url, {}, b"", f"{type(error).__name__}: {error}"


def decode(data: bytes) -> str:
    for encoding in ("utf-8", "gb18030", "latin-1"):
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            pass
    return data.decode("utf-8", errors="replace")


def join_simple_literals(text: str, rounds: int = 4) -> str:
    current = text
    for _ in range(rounds):
        changed = False
        def repl(match: re.Match[str]) -> str:
            nonlocal changed
            changed = True
            quote = match.group(1)
            value = match.group(2) + match.group(4)
            return quote + value.replace(quote, "\\" + quote) + quote
        updated = LITERAL_JOIN_RE.sub(repl, current)
        current = updated
        if not changed:
            break
    return current


def allowed_url(base_url: str, raw: str) -> str | None:
    raw = raw.strip().replace("\\/", "/")
    if raw.startswith("javascript:") or raw.startswith("data:"):
        return None
    if raw.startswith("//"):
        raw = "https:" + raw
    absolute = urllib.parse.urljoin(base_url, raw)
    parsed = urllib.parse.urlparse(absolute)
    if parsed.scheme not in ("http", "https") or parsed.hostname not in ALLOWED_HOSTS:
        return None
    if not parsed.path.lower().endswith(".js"):
        return None
    return absolute


def discover_js(base_url: str, data: bytes) -> list[str]:
    text = join_simple_literals(decode(data))
    found: set[str] = set()
    for match in ABS_JS_RE.finditer(text):
        candidate = allowed_url(base_url, match.group(0))
        if candidate:
            found.add(candidate)
    for match in QUOTED_JS_RE.finditer(text):
        candidate = allowed_url(base_url, match.group(2))
        if candidate:
            found.add(candidate)
    return sorted(found)


def module_evidence(data: bytes) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for mid in TARGET_MODULES:
        definitions = [m.start() for m in MODULE_DEF[mid].finditer(data)]
        uses = [m.start() for m in MODULE_USE[mid].finditer(data)]
        result[str(mid)] = {
            "defined": bool(definitions),
            "definitionCount": len(definitions),
            "definitionOffsets": definitions[:20],
            "used": bool(uses),
            "useCount": len(uses),
            "useOffsets": uses[:20],
        }
    return result


def snippets(text: str) -> list[dict[str, Any]]:
    values: list[dict[str, Any]] = []
    seen: set[tuple[str, int]] = set()
    for term in ANCHOR_TERMS:
        start = 0
        count = 0
        while count < 4:
            offset = text.find(term, start)
            if offset < 0:
                break
            key = (term, offset)
            if key not in seen:
                left = max(0, offset - 90)
                right = min(len(text), offset + len(term) + 90)
                excerpt = re.sub(r"\s+", " ", text[left:right]).strip()
                values.append({"term": term, "offset": offset, "snippet": excerpt})
                seen.add(key)
            start = offset + len(term)
            count += 1
    return values


def inline_scripts(page_url: str, page: bytes) -> list[dict[str, Any]]:
    text = decode(page)
    items: list[dict[str, Any]] = []
    for index, match in enumerate(SCRIPT_TAG_RE.finditer(text)):
        attrs = match.group("attrs") or ""
        if SRC_RE.search(attrs):
            continue
        body = (match.group("body") or "").encode("utf-8", errors="replace")
        if not body.strip():
            continue
        items.append({
            "index": index,
            "size": len(body),
            "sha256": sha256(body),
            "targetModules": module_evidence(body),
            "discoveredJs": discover_js(page_url, body),
            "anchorSnippets": snippets(decode(body)),
        })
    return items


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def render_report(result: dict[str, Any]) -> str:
    module_map = result["targetModuleMap"]
    lines = [
        "# 动态公共 chunk 解析结果", "",
        "本报告递归扫描官方页面、内联启动脚本和允许域名内的 JavaScript 引用。完整源码不会写入仓库。", "",
        f"- 抓取资源：`{len(result['resources'])}` 个",
        f"- 内联脚本：`{len(result['inlineScripts'])}` 个",
        f"- 新发现脚本 URL：`{len(result['allDiscoveredUrls'])}` 个", "",
        "## 三个目标模块", "",
        "| 模块 | 外部定义位置 | 内联定义位置 | 引用位置 | 判断 |",
        "|---:|---|---|---|---|",
    ]
    for mid in TARGET_MODULES:
        item = module_map[str(mid)]
        ext = "<br>".join(f"`{x}`" for x in item["externalDefinitions"]) or "未找到"
        inline = ", ".join(map(str, item["inlineDefinitions"])) or "未找到"
        uses = "<br>".join(f"`{x}`" for x in item["externalUses"]) or "未找到"
        lines.append(f"| {mid} | {ext} | {inline} | {uses} | {item['conclusion']} |")
    lines += ["", "## 维护结论", ""]
    lines += [f"- {line}" for line in result["maintenanceConclusions"]]
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root", default=".")
    parser.add_argument("--output-dir", default="docs/js-maintenance/official-current")
    args = parser.parse_args()
    root = Path(args.repo_root).resolve()
    out = (root / args.output_dir).resolve()
    upstream = json.loads((root / "game-engine/upstream-baseline.json").read_text(encoding="utf-8"))
    page_url = upstream["pageUrl"]
    page_status, page_final, page_headers, page_body, page_error = fetch(page_url)

    inline = inline_scripts(page_final or page_url, page_body)
    initial = set(discover_js(page_final or page_url, page_body))
    initial.update(
        value["url"] for value in upstream.get("resources", {}).values()
        if isinstance(value, dict) and value.get("url")
    )
    for item in inline:
        initial.update(item["discoveredJs"])

    queue: deque[tuple[str, int, str]] = deque((url, 0, page_url) for url in sorted(initial))
    seen: set[str] = set()
    resources: list[dict[str, Any]] = []
    all_discovered: set[str] = set(initial)

    while queue and len(seen) < MAX_RESOURCES:
        url, depth, parent = queue.popleft()
        if url in seen:
            continue
        seen.add(url)
        status, final_url, headers, body, error = fetch(url)
        evidence = module_evidence(body)
        children = discover_js(final_url or url, body) if body and depth < MAX_DEPTH else []
        all_discovered.update(children)
        for child in children:
            if child not in seen:
                queue.append((child, depth + 1, final_url or url))
        resources.append({
            "requestedUrl": url,
            "finalUrl": final_url,
            "parentUrl": parent,
            "depth": depth,
            "status": status,
            "size": len(body),
            "sha256": sha256(body) if body else "",
            "contentType": headers.get("content-type", ""),
            "etag": headers.get("etag", ""),
            "lastModified": headers.get("last-modified", ""),
            "error": error,
            "targetModules": evidence,
            "discoveredJs": children,
            "anchorSnippets": snippets(decode(body)) if body else [],
        })

    module_map: dict[str, Any] = {}
    for mid in TARGET_MODULES:
        external_definitions = [
            item["finalUrl"] for item in resources
            if item["targetModules"][str(mid)]["defined"]
        ]
        external_uses = [
            item["finalUrl"] for item in resources
            if item["targetModules"][str(mid)]["used"]
        ]
        inline_definitions = [
            item["index"] for item in inline
            if item["targetModules"][str(mid)]["defined"]
        ]
        inline_uses = [
            item["index"] for item in inline
            if item["targetModules"][str(mid)]["used"]
        ]
        if external_definitions or inline_definitions:
            conclusion = "定义已定位"
        elif external_uses or inline_uses:
            conclusion = "仍只有引用；定义不在当前可见资源图中"
        else:
            conclusion = "当前页面未出现"
        module_map[str(mid)] = {
            "externalDefinitions": external_definitions,
            "externalUses": external_uses,
            "inlineDefinitions": inline_definitions,
            "inlineUses": inline_uses,
            "conclusion": conclusion,
        }

    unresolved = all(
        not module_map[str(mid)]["externalDefinitions"] and
        not module_map[str(mid)]["inlineDefinitions"]
        for mid in TARGET_MODULES
    )
    conclusions = [
        "当前官方 game.js 与修改版 game.js 都引用相同的三个模块，说明它们属于播放器公共构建依赖，而非 V2 新增逻辑。",
        "页面显式脚本、内联脚本和递归发现资源应分别保存哈希，后续更新时可快速定位变化层。",
    ]
    if unresolved:
        conclusions.append(
            "递归扫描后仍未找到模块定义；高度可能由 Webpack 运行时预置、浏览器缓存的公共基础包、或按运行条件动态注入的未公开 chunk 提供。"
        )
        conclusions.append(
            "下一步应在真实浏览器中记录 performance.getEntriesByType('resource') 与 webpack 模块注册表，而不是继续猜文件名。"
        )

    result = {
        "schemaVersion": 1,
        "page": {
            "requestedUrl": page_url,
            "finalUrl": page_final,
            "status": page_status,
            "size": len(page_body),
            "sha256": sha256(page_body) if page_body else "",
            "error": page_error,
        },
        "inlineScripts": inline,
        "resources": resources,
        "allDiscoveredUrls": sorted(all_discovered),
        "targetModuleMap": module_map,
        "maintenanceConclusions": conclusions,
    }
    write_json(out / "dynamic-chunks.json", result)
    write_json(out / "inline-page-anchors.json", inline)
    (out / "dynamic-chunks.md").write_text(render_report(result) + "\n", encoding="utf-8")
    print(json.dumps({
        "pageStatus": page_status,
        "resourceCount": len(resources),
        "inlineScriptCount": len(inline),
        "targetModuleMap": module_map,
        "output": str(out),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
