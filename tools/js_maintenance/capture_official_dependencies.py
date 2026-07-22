#!/usr/bin/env python3
"""Capture the current official H5 page resource graph for maintenance.

The tool downloads public runtime resources into a temporary directory, records only
metadata and small structural anchors, and never commits third-party source files.
"""

from __future__ import annotations

import argparse
import hashlib
import html.parser
import json
import re
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any

USER_AGENT = (
    "Mozilla/5.0 (Linux; Android 13; Pixel 7 Build/TQ3A.230805.001) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36"
)
MAX_PAGE_BYTES = 5 * 1024 * 1024
MAX_SCRIPT_BYTES = 32 * 1024 * 1024
TARGET_MODULES = (36728, 6886, 75640)
SAL_RE = re.compile(rb"\bSAL_[A-Za-z0-9_]+\b")
SCRIPT_SRC_RE = re.compile(r"<script\b[^>]*\bsrc\s*=\s*(['\"])(.*?)\1", re.I | re.S)
ABS_JS_RE = re.compile(r"https?://[^\s'\"<>]+?\.js(?:\?[^\s'\"<>]*)?", re.I)
MODULE_DEF_PATTERNS = {
    module_id: [
        re.compile(rb"(?<![A-Za-z0-9_$])" + str(module_id).encode() + rb"\s*:\s*(?:function\s*\(|\([^)]{0,240}\)\s*=>)"),
        re.compile(rb"(?<![A-Za-z0-9_$])" + str(module_id).encode() + rb"\s*:\s*[A-Za-z_$][A-Za-z0-9_$]*\s*=>"),
    ]
    for module_id in TARGET_MODULES
}
MODULE_USE_PATTERNS = {
    module_id: re.compile(rb"(?<![A-Za-z0-9_$])(?:[A-Za-z_$][A-Za-z0-9_$]*)\(\s*" + str(module_id).encode() + rb"\s*\)")
    for module_id in TARGET_MODULES
}


@dataclass
class FetchResult:
    requested_url: str
    final_url: str
    status: int
    headers: dict[str, str]
    body: bytes
    error: str = ""


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def fetch(url: str, maximum_bytes: int) -> FetchResult:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/javascript,text/javascript,*/*;q=0.8",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.6",
            "Cache-Control": "no-cache",
            "Pragma": "no-cache",
        },
    )
    context = ssl.create_default_context()
    try:
        with urllib.request.urlopen(request, timeout=35, context=context) as response:
            status = int(getattr(response, "status", response.getcode()))
            chunks: list[bytes] = []
            total = 0
            while True:
                chunk = response.read(65536)
                if not chunk:
                    break
                total += len(chunk)
                if total > maximum_bytes:
                    raise ValueError(f"response exceeds {maximum_bytes} bytes")
                chunks.append(chunk)
            return FetchResult(
                requested_url=url,
                final_url=response.geturl(),
                status=status,
                headers={k.lower(): v for k, v in response.headers.items()},
                body=b"".join(chunks),
            )
    except urllib.error.HTTPError as error:
        try:
            body = error.read(maximum_bytes + 1)
            if len(body) > maximum_bytes:
                body = body[:maximum_bytes]
        except Exception:
            body = b""
        return FetchResult(
            requested_url=url,
            final_url=error.geturl() or url,
            status=int(error.code),
            headers={k.lower(): v for k, v in error.headers.items()} if error.headers else {},
            body=body,
            error=f"HTTP {error.code}",
        )
    except Exception as error:
        return FetchResult(url, url, 0, {}, b"", f"{type(error).__name__}: {error}")


def resource_record(result: FetchResult) -> dict[str, Any]:
    return {
        "requestedUrl": result.requested_url,
        "finalUrl": result.final_url,
        "status": result.status,
        "size": len(result.body),
        "sha256": sha256(result.body) if result.body else "",
        "contentType": result.headers.get("content-type", ""),
        "etag": result.headers.get("etag", ""),
        "lastModified": result.headers.get("last-modified", ""),
        "cacheControl": result.headers.get("cache-control", ""),
        "error": result.error,
    }


def decode_text(data: bytes) -> str:
    for encoding in ("utf-8", "gb18030", "latin-1"):
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            pass
    return data.decode("utf-8", errors="replace")


def script_urls_from_page(page_url: str, body: bytes) -> list[str]:
    text = decode_text(body)
    urls: set[str] = set()
    for match in SCRIPT_SRC_RE.finditer(text):
        raw = match.group(2).strip()
        if raw:
            urls.add(urllib.parse.urljoin(page_url, raw))
    for match in ABS_JS_RE.finditer(text):
        urls.add(match.group(0))
    return sorted(urls)


def module_evidence(data: bytes, module_id: int) -> dict[str, Any]:
    definitions: list[int] = []
    for pattern in MODULE_DEF_PATTERNS[module_id]:
        definitions.extend(match.start() for match in pattern.finditer(data))
    uses = [match.start() for match in MODULE_USE_PATTERNS[module_id].finditer(data)]
    definitions = sorted(set(definitions))
    return {
        "defined": bool(definitions),
        "definitionCount": len(definitions),
        "definitionOffsets": definitions[:12],
        "used": bool(uses),
        "useCount": len(uses),
        "useOffsets": uses[:12],
    }


def classify_resource(url: str, data: bytes) -> list[str]:
    lower = url.lower()
    roles: list[str] = []
    if "salinterface" in lower or b"SAL_getUserData" in data:
        roles.append("SAL interface/runtime bridge")
    if "webgllib" in lower or b"WebGLRenderingContext" in data:
        roles.append("WebGL/rendering support")
    if "gameinfodata" in lower:
        roles.append("game metadata/configuration")
    if re.search(rb"webpackChunk|webpackJsonp", data):
        roles.append("Webpack bundle/chunk")
    if b"requestAnimationFrame" in data:
        roles.append("render/update loop support")
    if b"AudioContext" in data or b"HTMLAudioElement" in data:
        roles.append("audio support")
    return roles


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_text(path: Path, value: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(value.rstrip() + "\n", encoding="utf-8")


def render_readme(snapshot: dict[str, Any]) -> str:
    page = snapshot["page"]
    resources = snapshot["resources"]
    mapping = snapshot["targetModuleMap"]
    lines = [
        "# 当前官方页面与公共依赖基线",
        "",
        "本目录只保存公共资源元数据和模块归属，不保存第三方完整 JavaScript 源码。",
        "",
        "## 页面抓取",
        "",
        f"- 页面：`{page['requestedUrl']}`",
        f"- HTTP：`{page['status']}`",
        f"- 最终地址：`{page['finalUrl']}`",
        f"- 页面大小：`{page['size']}` 字节",
        f"- 页面 SHA-256：`{page['sha256'] or '未获取'}`",
        f"- 脚本资源数：`{len(resources)}`",
        "",
        "## 目标 Webpack 模块归属",
        "",
        "| 模块 | 定义资源 | 引用资源 | 结论 |",
        "|---:|---|---|---|",
    ]
    for module_id in TARGET_MODULES:
        item = mapping[str(module_id)]
        definitions = "<br>".join(f"`{x}`" for x in item["definedIn"]) or "未找到"
        uses = "<br>".join(f"`{x}`" for x in item["usedIn"]) or "未找到"
        conclusion = item["conclusion"]
        lines.append(f"| {module_id} | {definitions} | {uses} | {conclusion} |")
    lines += [
        "",
        "## 维护判断",
        "",
        "- 模块定义资源变化：优先判断公共依赖或打包结构变化。",
        "- 只有 game.js 哈希变化：优先判断引擎业务或生成版本变化。",
        "- SALInterface.js 变化：优先复测登录、用户数据、存档、媒体、触摸和平台桥接。",
        "- webGLLib.js 变化：优先复测白屏、Canvas/WebGL、纹理、视频和资源释放。",
        "- 页面脚本清单变化：优先检查加载顺序和全局对象创建时机。",
        "",
        "## 文件",
        "",
        "- `snapshot.json`：完整机器可读快照。",
        "- `resource-inventory.json`：每个脚本的 URL、HTTP、大小、哈希和角色。",
        "- `dependency-module-map.json`：三个目标模块的定义与引用归属。",
    ]
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root", default=".")
    parser.add_argument("--output-dir", default="docs/js-maintenance/official-current")
    args = parser.parse_args()

    root = Path(args.repo_root).resolve()
    output = (root / args.output_dir).resolve()
    upstream_path = root / "game-engine/upstream-baseline.json"
    upstream = json.loads(upstream_path.read_text(encoding="utf-8"))
    page_url = upstream["pageUrl"]

    page_result = fetch(page_url, MAX_PAGE_BYTES)
    page_record = resource_record(page_result)
    discovered = script_urls_from_page(page_result.final_url or page_url, page_result.body)

    known_urls = {
        value["url"]
        for value in upstream.get("resources", {}).values()
        if isinstance(value, dict) and value.get("url")
    }
    resource_urls = sorted(set(discovered) | known_urls)

    resource_records: list[dict[str, Any]] = []
    module_map: dict[str, dict[str, Any]] = {
        str(module_id): {"definedIn": [], "usedIn": [], "conclusion": ""}
        for module_id in TARGET_MODULES
    }

    for url in resource_urls:
        result = fetch(url, MAX_SCRIPT_BYTES)
        record = resource_record(result)
        record["roles"] = classify_resource(result.final_url or url, result.body)
        record["salIdentifierCount"] = len(set(SAL_RE.findall(result.body)))
        record["targetModules"] = {}
        for module_id in TARGET_MODULES:
            evidence = module_evidence(result.body, module_id)
            record["targetModules"][str(module_id)] = evidence
            if evidence["defined"]:
                module_map[str(module_id)]["definedIn"].append(record["finalUrl"])
            if evidence["used"]:
                module_map[str(module_id)]["usedIn"].append(record["finalUrl"])
        resource_records.append(record)

    for module_id in TARGET_MODULES:
        item = module_map[str(module_id)]
        if item["definedIn"]:
            item["conclusion"] = "已定位定义资源"
        elif item["usedIn"]:
            item["conclusion"] = "只找到引用；定义可能在未加载的公共 chunk 或运行时注入资源中"
        else:
            item["conclusion"] = "当前页面资源未出现；可能属于修改版历史公共依赖"

    snapshot = {
        "schemaVersion": 1,
        "sourceBaseline": upstream,
        "page": page_record,
        "discoveredScriptUrls": discovered,
        "resources": resource_records,
        "targetModuleMap": module_map,
    }
    write_json(output / "snapshot.json", snapshot)
    write_json(output / "resource-inventory.json", resource_records)
    write_json(output / "dependency-module-map.json", module_map)
    write_text(output / "README.md", render_readme(snapshot))

    print(json.dumps({
        "pageStatus": page_record["status"],
        "pageSha256": page_record["sha256"],
        "resourceCount": len(resource_records),
        "targetModuleMap": module_map,
        "output": str(output),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
