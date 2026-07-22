#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
from collections import defaultdict
from pathlib import Path
from typing import Any

SAL_RE = re.compile(r"\bSAL_[A-Za-z0-9_]+\b")
URL_RE = re.compile(r"https?://[^\s\"'`<>\\)]+", re.I)
LITERAL_RE = re.compile(r"['\"]([^'\"\n]{1,180})['\"]")

KNOWN_NONAME = {
    "STy4gr": "PC/H5 入口适配",
    "MInyap": "运行环境初始化",
    "DjkL_Q": "game.js 识别与替换",
    "zjEv2f": "页面数据和请求适配",
    "PwDi7Ry": "用户状态适配",
    "pXBC4W": "G 菜单与交互界面",
}

FIELDS = [
    "uid", "guid", "pver", "isLogin", "userData", "userGameSettingInfo",
    "totalFlower", "freshFlower", "wildFlower", "tempFlower", "realFlower",
    "haveFlower", "mallViewData", "itemPrice", "goods", "goods_id",
    "order_id", "saveData", "showLocal", "localStorage", "sessionStorage",
    "XMLHttpRequest", "JSONP", "createBuyOrder", "get_goods_list",
]

KEYWORDS = (
    "login", "user", "goods", "order", "save", "mall", "flower", "storage",
    "audio", "video", "canvas", "webgl", "http", "api", "sal_", "debug",
)

PAIR_PATTERNS = [
    re.compile(r"'([^'\\\n]{0,160})'\s*\+\s*'([^'\\\n]{0,160})'"),
    re.compile(r'"([^"\\\n]{0,160})"\s*\+\s*"([^"\\\n]{0,160})"'),
    re.compile(r"'([^'\\\n]{0,160})'\s*\+\s*\"([^\"\\\n]{0,160})\""),
    re.compile(r'"([^"\\\n]{0,160})"\s*\+\s*\'([^\'\\\n]{0,160})\''),
]


def join_simple_literals(text: str, rounds: int = 16) -> tuple[str, int]:
    total = 0
    current = text
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
        if changed == 0:
            break
    return current, total


def safe_urls(text: str) -> list[str]:
    result = set()
    for value in URL_RE.findall(text):
        value = value.rstrip(".,;:]}")
        if len(value) >= 12 and "." in value:
            result.add(value)
    return sorted(result)


def useful_literals(text: str) -> list[str]:
    result = set()
    for value in LITERAL_RE.findall(text):
        low = value.lower()
        if len(value) <= 180 and any(word in low for word in KEYWORDS):
            result.add(value)
    return sorted(result)


def sal_category(name: str) -> str:
    low = name.lower()
    if any(x in low for x in ("touch", "click", "mouse", "input", "wheel")):
        return "输入与交互"
    if any(x in low for x in ("element", "canvas", "text", "position", "rotate", "mask", "visible", "opacity", "scale", "animation", "action")):
        return "元素与渲染"
    if "audio" in low:
        return "音频"
    if "video" in low or "recorder" in low or "capture" in low:
        return "视频与采集"
    if any(x in low for x in ("storage", "userdata", "userinfo", "gameinfo", "session", "login", "sign", "currency")):
        return "用户、存储与平台"
    if any(x in low for x in ("pay", "recharge", "share", "advideo")):
        return "支付、广告与分享"
    if any(x in low for x in ("request", "http", "upload", "sendmessage", "collect")):
        return "网络与上报"
    if any(x in low for x in ("timeout", "interval", "log", "gc", "debug", "exit", "tool")):
        return "运行时工具"
    return "其他"


def symbol_relationships(text: str) -> dict[str, Any]:
    positions: dict[str, list[int]] = {}
    for name in KNOWN_NONAME:
        positions[name] = [m.start() for m in re.finditer(re.escape(name), text)]
    relations: dict[str, dict[str, int]] = {}
    for name, offsets in positions.items():
        nearby: dict[str, int] = defaultdict(int)
        for offset in offsets:
            window = text[max(0, offset - 800): offset + 800]
            for other in KNOWN_NONAME:
                if other != name and other in window:
                    nearby[other] += 1
        relations[name] = dict(sorted(nearby.items(), key=lambda item: (-item[1], item[0])))
    return {
        name: {
            "description": KNOWN_NONAME[name],
            "count": len(positions[name]),
            "firstOffset": positions[name][0] if positions[name] else None,
            "lastOffset": positions[name][-1] if positions[name] else None,
            "nearbySymbols": relations[name],
        }
        for name in KNOWN_NONAME
    }


def write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text.rstrip() + "\n", encoding="utf-8")


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def make_sal_catalog(sal: list[str]) -> str:
    groups: dict[str, list[str]] = defaultdict(list)
    for name in sal:
        groups[sal_category(name)].append(name)
    lines = ["# SAL 接口分类目录", "", f"重组后共识别 `{len(sal)}` 个 SAL 标识符。", ""]
    for category in sorted(groups):
        lines += [f"## {category}", ""]
        lines += [f"- `{name}`" for name in groups[category]]
        lines.append("")
    lines += [
        "## 维护说明", "",
        "- SAL 名称是比混淆变量更稳定的行为锚点。",
        "- 新版出现新增或删除时，先判断平台接口变化，再检查上层功能。",
        "- 接口存在不代表当前作品一定调用，需要结合真实运行日志确认。",
    ]
    return "\n".join(lines)


def make_architecture(refined: dict[str, Any]) -> str:
    rel = refined["noname"]["symbolRelationships"]
    rows = []
    for name, info in rel.items():
        nearby = ", ".join(f"{k}({v})" for k, v in list(info["nearbySymbols"].items())[:4]) or "-"
        rows.append(f"| `{name}` | {info['description']} | {info['count']} | {nearby} |")
    return """# 运行架构与调用关系笔记

## noname.js 职责链

```text
入口与页面判断
→ 运行时初始化
→ 官方 game.js 识别/替换
→ G 菜单与状态
→ 用户、商城、存储、XHR/JSONP 页面适配
```

| 符号 | 维护含义 | 出现次数 | 邻近符号 |
|---|---|---:|---|
""" + "\n".join(rows) + """

邻近关系仅表示静态文本上接近，用来辅助定位，不等价于确定的函数调用边。

## game.js 职责链

```text
Webpack 入口 71269
├─ 依赖 36728
├─ 依赖 6886
└─ 依赖 75640
    ↓
SAL 平台接口
    ↓
用户/存储/商城/媒体/渲染/场景
```

当前版本文件只携带入口模块 `71269`，其余三个依赖由页面现有运行环境提供。因此更新时不仅要比较当前 `game.js`，也要同步保存页面加载的公共依赖脚本。

## 已确认的 V2 运行顺序

```text
授权和设备签名
→ 下载 AES-256-GCM 密文包
→ 原生内存解密 ZIP
→ document-start 注入 noname.js
→ WebView 请求 game.js
→ Android 原生层从内存返回 game.js
→ WebView 执行引擎
```
"""


def make_quality_note(refined: dict[str, Any]) -> str:
    return f"""# 静态分析覆盖说明

## 已覆盖

- 文件大小、SHA-256、版本和文件边界。
- Webpack 入口及直接依赖。
- 明文和简单字符串拼接后的 SAL 标识符。
- URL、重点字段、已知控制层符号和邻近关系。
- 更新诊断和回滚流程。

## 当前统计

- noname.js 简单字符串拼接：`{refined['noname']['joinedLiteralPairs']}` 处。
- game.js 简单字符串拼接：`{refined['game']['joinedLiteralPairs']}` 处。
- game.js 直接 SAL：`{refined['game']['directSalCount']}` 个。
- game.js 重组后 SAL：`{refined['game']['reconstructedSalCount']}` 个。

## 尚未覆盖

- RC4/数组索引等运行时字符串解码器产生的全部字符串。
- 动态属性名在具体运行分支中的真实值。
- Webpack 外部依赖模块 36728、6886、75640 的完整源码职责。
- 每个作品在真实页面中的实际调用频率。

因此知识库用于维护定位和版本比较，不声称已经完全还原全部源码。下一层分析应优先抓取对应官方历史基线和三个外部依赖，再做模块级动态观测。
"""


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root", default=".")
    parser.add_argument("--output-dir", default="docs/js-maintenance/generated")
    args = parser.parse_args()
    root = Path(args.repo_root).resolve()
    out = Path(args.output_dir).resolve()

    noname_raw = (root / "remote-script/src/noname.js").read_text(encoding="utf-8", errors="replace")
    manifest = json.loads((root / "game-engine/release/manifest.json").read_text(encoding="utf-8"))
    game_raw = (root / "game-engine/release" / manifest["file"]).read_text(encoding="utf-8", errors="replace")

    noname_joined, noname_pairs = join_simple_literals(noname_raw)
    game_joined, game_pairs = join_simple_literals(game_raw)
    direct_sal = sorted(set(SAL_RE.findall(game_raw)))
    reconstructed_sal = sorted(set(SAL_RE.findall(game_joined)))

    refined = {
        "schemaVersion": 1,
        "noname": {
            "joinedLiteralPairs": noname_pairs,
            "directUrls": safe_urls(noname_raw),
            "reconstructedUrls": safe_urls(noname_joined),
            "fieldCountsDirect": {field: noname_raw.count(field) for field in FIELDS},
            "fieldCountsReconstructed": {field: noname_joined.count(field) for field in FIELDS},
            "symbolRelationships": symbol_relationships(noname_raw),
            "keywordLiterals": useful_literals(noname_joined)[:1500],
        },
        "game": {
            "joinedLiteralPairs": game_pairs,
            "directSalCount": len(direct_sal),
            "reconstructedSalCount": len(reconstructed_sal),
            "directSal": direct_sal,
            "reconstructedSal": reconstructed_sal,
            "directUrls": safe_urls(game_raw),
            "reconstructedUrls": safe_urls(game_joined),
            "fieldCountsDirect": {field: game_raw.count(field) for field in FIELDS},
            "fieldCountsReconstructed": {field: game_joined.count(field) for field in FIELDS},
            "keywordLiterals": useful_literals(game_joined)[:3000],
        },
    }

    write_json(out / "reconstructed-anchors.json", refined)
    write(out / "sal-catalog.md", make_sal_catalog(reconstructed_sal))
    write(out / "architecture-notes.md", make_architecture(refined))
    write(out / "analysis-coverage.md", make_quality_note(refined))
    print(json.dumps({
        "nonameJoinedPairs": noname_pairs,
        "gameJoinedPairs": game_pairs,
        "directSalCount": len(direct_sal),
        "reconstructedSalCount": len(reconstructed_sal),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
