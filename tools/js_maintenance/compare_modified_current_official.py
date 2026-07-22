#!/usr/bin/env python3
"""Generate a maintenance-focused delta between modified and current official game bundles.

The comparison uses the same limited static reconstruction for both bundles. Results are
classified as observations, not as proof that a difference was introduced by customization,
because the matching historical official bundle is unavailable.
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

USER_AGENT = "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36"
MAX_BYTES = 32 * 1024 * 1024
SAL_RE = re.compile(r"\bSAL_[A-Za-z0-9_]+\b")
URL_RE = re.compile(r"https?://[^\s\"'`<>\\\)]+", re.I)
PATH_RE = re.compile(r"(?:PropShop|ajax|api|collect|cloud|crackUser|investigate)/[A-Za-z0-9_./-]{3,180}", re.I)
LITERAL_RE = re.compile(r"['\"]([^'\"\n]{1,220})['\"]")
PAIR_PATTERNS = [
    re.compile(r"'([^'\\\n]{0,180})'\s*\+\s*'([^'\\\n]{0,180})'"),
    re.compile(r'"([^"\\\n]{0,180})"\s*\+\s*"([^"\\\n]{0,180})"'),
    re.compile(r"'([^'\\\n]{0,180})'\s*\+\s*\"([^\"\\\n]{0,180})\""),
    re.compile(r'"([^"\\\n]{0,180})"\s*\+\s*\'([^\'\\\n]{0,180})\''),
]

FIELD_GROUPS: dict[str, list[str]] = {
    "identityAndLogin": ["uid", "guid", "pver", "isLogin", "userData", "token", "open_id"],
    "flowerAndValue": ["totalFlower", "freshFlower", "wildFlower", "tempFlower", "realFlower", "haveFlower", "flowerCount"],
    "mallAndOrder": ["mallViewData", "itemPrice", "goods", "goods_id", "order_id", "buy_num", "createBuyOrder", "get_goods_list"],
    "saveAndSettings": ["saveData", "SaveData", "SaveFileList", "SaveFileIndex", "SysSave", "showLocal", "localStorage", "sessionStorage"],
    "renderAndMedia": ["Canvas", "WebGL", "requestAnimationFrame", "Audio", "Video", "SAL_preload", "SAL_getTextureList"],
    "networkAndPlatform": ["XMLHttpRequest", "JSONP", "SAL_request", "SAL_Login", "SAL_getUserData", "SAL_getStorage", "SAL_setStorage"],
    "securityAndDiagnostics": ["disable-devtool", "crack_user", "openDebugger", "DEVTOOL", "debugger", "console.clear"],
}

CATEGORY_TERMS: dict[str, tuple[str, ...]] = {
    "identityAndLogin": ("login", "userdata", "userinfo", "uid", "token", "session"),
    "flowerAndValue": ("flower", "currency", "accountmoney"),
    "mallAndOrder": ("mall", "goods", "order", "buy", "prop"),
    "saveAndSettings": ("save", "storage", "global_cfg", "setting"),
    "renderAndMedia": ("canvas", "webgl", "audio", "video", "texture", "preload"),
    "networkAndPlatform": ("http", "request", "api", "collect", "report", "upload"),
    "securityAndDiagnostics": ("debug", "crack", "devtool", "console", "verify"),
}


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


def join_simple_literals(text: str, rounds: int = 16) -> tuple[str, int]:
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


def normalize_url(value: str) -> str:
    value = value.rstrip(".,;:]}\"")
    try:
        from urllib.parse import urlsplit, urlunsplit
        parts = urlsplit(value)
        return urlunsplit((parts.scheme, parts.netloc, parts.path, "", ""))
    except Exception:
        return value.split("?", 1)[0]


def extract_urls(text: str) -> list[str]:
    return sorted({normalize_url(value) for value in URL_RE.findall(text) if "." in value})


def extract_paths(text: str) -> list[str]:
    values = set()
    for match in PATH_RE.finditer(text):
        value = match.group(0).strip("/.,;:]}\"")
        if 4 <= len(value) <= 200:
            values.add(value)
    return sorted(values)


def relevant_literals(text: str) -> dict[str, list[str]]:
    groups: dict[str, set[str]] = {name: set() for name in CATEGORY_TERMS}
    for value in LITERAL_RE.findall(text):
        if len(value) > 200:
            continue
        low = value.lower()
        for category, terms in CATEGORY_TERMS.items():
            if any(term in low for term in terms):
                groups[category].add(value)
    return {name: sorted(values)[:600] for name, values in groups.items()}


def analyze(label: str, source: str, data: bytes) -> dict[str, Any]:
    raw = data.decode("utf-8", errors="replace")
    joined, pair_count = join_simple_literals(raw)
    direct_sal = sorted(set(SAL_RE.findall(raw)))
    reconstructed_sal = sorted(set(SAL_RE.findall(joined)))
    return {
        "label": label,
        "source": source,
        "size": len(data),
        "sha256": sha256(data),
        "joinedLiteralPairs": pair_count,
        "directSal": direct_sal,
        "reconstructedSal": reconstructed_sal,
        "directSalCount": len(direct_sal),
        "reconstructedSalCount": len(reconstructed_sal),
        "urls": extract_urls(joined),
        "paths": extract_paths(joined),
        "fieldCounts": {
            group: {field: joined.count(field) for field in fields}
            for group, fields in FIELD_GROUPS.items()
        },
        "categoryLiterals": relevant_literals(joined),
    }


def set_delta(left: list[str], right: list[str]) -> dict[str, list[str]]:
    a, b = set(left), set(right)
    return {"modifiedOnly": sorted(a - b), "officialOnly": sorted(b - a), "shared": sorted(a & b)}


def count_delta(modified: dict[str, Any], official: dict[str, Any]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for group, fields in FIELD_GROUPS.items():
        result[group] = {}
        for field in fields:
            left = modified["fieldCounts"][group][field]
            right = official["fieldCounts"][group][field]
            result[group][field] = {
                "modified": left,
                "official": right,
                "difference": left - right,
            }
    return result


def render(result: dict[str, Any]) -> str:
    modified = result["modified"]
    official = result["official"]
    deltas = result["deltas"]
    lines = [
        "# 修改版与当前官方版维护差异", "",
        "> 重要：两份文件不是同一官方构建日期。本报告只能说明当前观察到的差异，不能把所有差异认定为自定义修改。", "",
        "## 基线", "",
        "| 项目 | 修改版 1.0.2 | 当前官方版 |",
        "|---|---:|---:|",
        f"| 大小 | {modified['size']} | {official['size']} |",
        f"| 简单字符串重组 | {modified['joinedLiteralPairs']} | {official['joinedLiteralPairs']} |",
        f"| 直接 SAL | {modified['directSalCount']} | {official['directSalCount']} |",
        f"| 重组后 SAL | {modified['reconstructedSalCount']} | {official['reconstructedSalCount']} |",
        "", "## SAL 差异", "",
        f"- 修改版独有：`{len(deltas['sal']['modifiedOnly'])}` 个。",
        f"- 当前官方独有：`{len(deltas['sal']['officialOnly'])}` 个。",
        f"- 共有：`{len(deltas['sal']['shared'])}` 个。", "",
        "### 修改版独有 SAL", "",
        (", ".join(f"`{x}`" for x in deltas['sal']['modifiedOnly']) or "无"), "",
        "### 当前官方独有 SAL", "",
        (", ".join(f"`{x}`" for x in deltas['sal']['officialOnly']) or "无"), "",
        "## 分类字段变化", "",
    ]
    for group, values in deltas["fieldCounts"].items():
        lines += [f"### {group}", "", "| 字段 | 修改版 | 当前官方 | 差值 |", "|---|---:|---:|---:|"]
        for field, info in values.items():
            lines.append(f"| `{field}` | {info['modified']} | {info['official']} | {info['difference']:+d} |")
        lines.append("")
    lines += [
        "## 地址和路径", "",
        f"- 修改版独有规范化 URL：`{len(deltas['urls']['modifiedOnly'])}`。",
        f"- 当前官方独有规范化 URL：`{len(deltas['urls']['officialOnly'])}`。",
        f"- 修改版独有接口路径锚点：`{len(deltas['paths']['modifiedOnly'])}`。",
        f"- 当前官方独有接口路径锚点：`{len(deltas['paths']['officialOnly'])}`。", "",
        "详细列表保存在同目录的 JSON 中，避免文档被大量混淆字符串淹没。", "",
        "## 维护解释", "",
        "1. `noname.js` 明确依赖的用户、商城和存储字段，应优先与这份差异表交叉检查。",
        "2. 修改版独有字段不一定是自定义新增，也可能来自较旧官方版本。",
        "3. 当前官方独有 SAL 通常代表平台能力扩展，应评估修改版是否缺少兼容分支。",
        "4. 出现次数突变比单纯存在/不存在更值得关注，它可能表示对象层级或初始化流程重写。",
        "5. 在找到对应历史官方文件前，不生成自动补丁，也不把差异直接应用到稳定版本。",
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
    deltas = {
        "sal": set_delta(modified["reconstructedSal"], official["reconstructedSal"]),
        "urls": set_delta(modified["urls"], official["urls"]),
        "paths": set_delta(modified["paths"], official["paths"]),
        "fieldCounts": count_delta(modified, official),
        "categoryLiterals": {
            category: set_delta(modified["categoryLiterals"][category], official["categoryLiterals"][category])
            for category in CATEGORY_TERMS
        },
    }
    result = {"schemaVersion": 1, "warning": "Different official build dates; deltas are observational only.", "modified": modified, "official": official, "deltas": deltas}
    output.mkdir(parents=True, exist_ok=True)
    (output / "modified-vs-current-official.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (output / "modified-vs-current-official.md").write_text(render(result) + "\n", encoding="utf-8")
    print(json.dumps({
        "modifiedSha256": modified["sha256"],
        "officialSha256": official["sha256"],
        "modifiedSalCount": modified["reconstructedSalCount"],
        "officialSalCount": official["reconstructedSalCount"],
        "salModifiedOnly": len(deltas["sal"]["modifiedOnly"]),
        "salOfficialOnly": len(deltas["sal"]["officialOnly"]),
        "output": str(output),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
