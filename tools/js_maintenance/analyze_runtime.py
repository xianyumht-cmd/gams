#!/usr/bin/env python3
"""Generate a maintenance-oriented baseline for the GG runtime JavaScript.

The analyzer intentionally records structure, identifiers, compatibility anchors and
observable interfaces. It does not attempt to execute the scripts or reproduce any
third-party service behavior.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import re
from collections import Counter
from pathlib import Path
from typing import Any, Iterable

ABS_URL_RE = re.compile(r"https?://[^\s\"'`<>\\)]+", re.I)
SAL_RE = re.compile(r"\bSAL_[A-Za-z0-9_]+\b")
WEBPACK_MODULE_RE = re.compile(r"(?<![A-Za-z0-9_$])(\d{2,8})\s*:\s*(?:\([^)]{0,180}\)\s*=>|function\s*\()")
WEBPACK_REQUIRE_RE = re.compile(r"(?<![A-Za-z0-9_$])(?:t|n|r)\((\d{2,8})\)")
FUNCTION_RE = re.compile(r"\bfunction\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(")
OBJECT_RE = re.compile(r"\b(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*\{")
QUOTED_RE = re.compile(r"(?P<q>['\"])(?P<s>(?:\\.|(?!\1).){1,240})(?P=q)")
PATH_RE = re.compile(r"(?P<q>['\"])(?P<s>/(?:[A-Za-z0-9_.~!$&'()*+,;=:@%-]+/?){1,12})(?P=q)")

KNOWN_NONAME_SYMBOLS = {
    "STy4gr": "PC 页面跳转/入口适配",
    "MInyap": "运行环境与全局对象初始化",
    "DjkL_Q": "官方 game.js 识别与替换",
    "zjEv2f": "页面数据和请求适配层",
    "PwDi7Ry": "用户状态适配层",
    "pXBC4W": "G 菜单、开关、拖动和提示界面",
}

FIELD_GROUPS: dict[str, list[str]] = {
    "identity_and_login": [
        "uid", "userId", "isLogin", "token", "deviceId", "device_id",
        "keyFingerprint", "certificateDigest",
    ],
    "flower_and_value": [
        "totalFlower", "freshFlower", "wildFlower", "tempFlower",
        "realFlower", "haveFlower", "itemPrice", "buyNum", "buy_num",
    ],
    "mall_and_order": [
        "mallViewData", "goods", "goodsId", "goods_id", "orderId",
        "order_id", "createBuyOrder", "get_goods_list", "ownedProps",
    ],
    "save_and_settings": [
        "userData", "userGameSettingInfo", "saveData", "localStorage",
        "sessionStorage", "IndexedDB", "showLocal",
    ],
    "runtime_and_rendering": [
        "Canvas", "WebGL", "Audio", "Video", "requestAnimationFrame",
        "XMLHttpRequest", "fetch", "JSONP",
    ],
}

NETWORK_MARKERS = [
    "XMLHttpRequest.prototype.open",
    "XMLHttpRequest.prototype.send",
    "window.fetch",
    "fetch(",
    "JSONP",
    "createBuyOrder",
    "get_goods_list",
    "SAL_Login",
    "SAL_getUserData",
]

COMPATIBILITY_ANCHORS = [
    "/website/hfplayer/",
    "/official/game.js",
    "space-z.ai/game.js",
    "gams-script-edge.2320006072.workers.dev/engine/stable.js",
    "orange_feature_switch",
    "SAL_Login",
    "SAL_getUserData",
    "mallViewData",
    "userData",
    "createBuyOrder",
    "get_goods_list",
    "itemPrice",
    "showLocal",
]


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_bytes(path: Path) -> bytes:
    if not path.is_file():
        raise FileNotFoundError(path)
    return path.read_bytes()


def decode_js(data: bytes) -> str:
    return data.decode("utf-8", errors="replace")


def line_number(text: str, offset: int) -> int:
    return text.count("\n", 0, offset) + 1


def unique_sorted(items: Iterable[str]) -> list[str]:
    return sorted({item for item in items if item})


def count_markers(text: str, markers: Iterable[str]) -> dict[str, int]:
    return {marker: text.count(marker) for marker in markers}


def extract_userscript_header(text: str) -> dict[str, str]:
    result: dict[str, str] = {}
    header = text[:5000]
    for match in re.finditer(r"^//\s*@([A-Za-z0-9_-]+)\s+(.+?)\s*$", header, re.M):
        key, value = match.group(1), match.group(2)
        if key in result:
            result[key] = result[key] + " | " + value
        else:
            result[key] = value
    return result


def extract_storage_keys(text: str) -> list[str]:
    keys: set[str] = set()
    patterns = [
        r"(?:localStorage|sessionStorage)\.(?:getItem|setItem|removeItem)\(\s*['\"]([^'\"]{1,120})['\"]",
        r"(?:localStorage|sessionStorage)\[['\"]([^'\"]{1,120})['\"]\]",
    ]
    for pattern in patterns:
        keys.update(re.findall(pattern, text))
    for candidate in re.findall(r"['\"]([A-Za-z0-9_.:-]{3,100})['\"]", text):
        if any(word in candidate.lower() for word in ("feature", "setting", "config", "save", "flower", "user")):
            if candidate.count(".") <= 6:
                keys.add(candidate)
    return sorted(keys)


def extract_paths(text: str) -> list[str]:
    paths = []
    for match in PATH_RE.finditer(text):
        value = match.group("s")
        if len(value) <= 180 and not value.startswith("//"):
            paths.append(value)
    return unique_sorted(paths)


def locate_symbols(text: str, names: Iterable[str]) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for name in names:
        offsets = [m.start() for m in re.finditer(re.escape(name), text)]
        result[name] = {
            "count": len(offsets),
            "firstLine": line_number(text, offsets[0]) if offsets else None,
            "description": KNOWN_NONAME_SYMBOLS.get(name, ""),
        }
    return result


def build_file_metadata(path: Path, data: bytes, text: str) -> dict[str, Any]:
    return {
        "path": path.as_posix(),
        "size": len(data),
        "sha256": sha256_bytes(data),
        "lineCount": text.count("\n") + 1,
        "startsWith": text[:160],
        "endsWith": text[-160:],
    }


def analyze_noname(path: Path) -> dict[str, Any]:
    data = read_bytes(path)
    text = decode_js(data)
    functions = Counter(FUNCTION_RE.findall(text))
    objects = Counter(OBJECT_RE.findall(text))
    return {
        "file": build_file_metadata(path, data, text),
        "userscriptHeader": extract_userscript_header(text),
        "knownSymbols": locate_symbols(text, KNOWN_NONAME_SYMBOLS),
        "namedFunctions": [name for name, _ in functions.most_common(250)],
        "namedObjects": [name for name, _ in objects.most_common(250)],
        "urls": unique_sorted(ABS_URL_RE.findall(text)),
        "paths": extract_paths(text),
        "storageKeys": extract_storage_keys(text),
        "salIdentifiers": unique_sorted(SAL_RE.findall(text)),
        "fieldCounts": {group: count_markers(text, values) for group, values in FIELD_GROUPS.items()},
        "networkMarkerCounts": count_markers(text, NETWORK_MARKERS),
        "compatibilityAnchorCounts": count_markers(text, COMPATIBILITY_ANCHORS),
    }


def analyze_game(path: Path) -> dict[str, Any]:
    data = read_bytes(path)
    text = decode_js(data)
    sal = unique_sorted(SAL_RE.findall(text))
    module_ids = sorted({int(value) for value in WEBPACK_MODULE_RE.findall(text)})
    requires = sorted({int(value) for value in WEBPACK_REQUIRE_RE.findall(text)})
    urls = unique_sorted(ABS_URL_RE.findall(text))
    paths = extract_paths(text)
    quoted = [m.group("s") for m in QUOTED_RE.finditer(text)]
    keyword_strings = sorted({
        value for value in quoted
        if len(value) <= 160 and any(
            term in value.lower()
            for term in ("login", "user", "goods", "order", "save", "mall", "flower", "sal_", "http", "api")
        )
    })[:3000]
    return {
        "file": build_file_metadata(path, data, text),
        "webpack": {
            "moduleIds": module_ids,
            "moduleCount": len(module_ids),
            "requiredModuleIds": requires,
        },
        "salIdentifiers": sal,
        "salCount": len(sal),
        "urls": urls,
        "paths": paths,
        "storageKeys": extract_storage_keys(text),
        "fieldCounts": {group: count_markers(text, values) for group, values in FIELD_GROUPS.items()},
        "networkMarkerCounts": count_markers(text, NETWORK_MARKERS),
        "compatibilityAnchorCounts": count_markers(text, COMPATIBILITY_ANCHORS),
        "keywordStrings": keyword_strings,
    }


def markdown_table(rows: list[list[str]], headers: list[str]) -> str:
    out = ["| " + " | ".join(headers) + " |", "|" + "|".join(["---"] * len(headers)) + "|"]
    for row in rows:
        out.append("| " + " | ".join(cell.replace("|", "\\|") for cell in row) + " |")
    return "\n".join(out)


def write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content.rstrip() + "\n", encoding="utf-8")


def write_json(path: Path, obj: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def render_overview(baseline: dict[str, Any]) -> str:
    noname = baseline["noname"]
    game = baseline["game"]
    return f"""# JavaScript 维护知识库

本目录由 `tools/js_maintenance/analyze_runtime.py` 生成，目标是让后续更新维护依赖稳定行为锚点，而不是依赖临时混淆变量名。

## 当前基线

{markdown_table([
    ["noname.js", str(noname['file']['size']), noname['file']['sha256'], noname['userscriptHeader'].get('version', 'unknown')],
    ["game.js", str(game['file']['size']), game['file']['sha256'], baseline['releaseManifest'].get('versionName', 'unknown')],
], ["文件", "字节数", "SHA-256", "版本"])}

## 架构结论

```text
Android V2 鉴权与加密交付
        ↓
noname.js：控制、界面、加载协调和页面适配
        ↓
game.js：完整网页引擎、SAL、数据、媒体、场景和业务运行
        ↓
目标页面 DOM / Canvas / WebGL / 网络与存储
```

V2 改变的是两份 JavaScript 的交付和缓存方式，不改变它们最终仍在 WebView 中执行这一事实。

## 维护原则

1. 先比较基线，再改代码。
2. 优先使用 SAL 名称、接口路径、数据字段和资源地址作为行为锚点。
3. 不把混淆函数名视为长期稳定接口。
4. 新版本先进入 canary，真实安卓验证后再切换 stable。
5. 保留旧版不可变文件和清单，任何时候都能回滚。

## 本目录内容

- `baseline.json`：机器可读完整基线。
- `noname-map.md`：控制层职责、初始化顺序和敏感点。
- `game-map.md`：引擎层模块、SAL 和重点业务区域。
- `network-and-data.md`：网络锚点、存储键和数据字段。
- `compatibility-anchors.json`：后续自动比较的稳定锚点。
- `failure-diagnosis.md`：按现象定位故障层。
- `update-runbook.md`：官方更新后的固定维护流程。
- `sal-identifiers.txt`、`webpack-module-ids.txt`、`urls.txt`：原始索引。
"""


def render_noname(noname: dict[str, Any]) -> str:
    symbol_rows = []
    for name, info in noname["knownSymbols"].items():
        symbol_rows.append([name, info["description"], str(info["count"]), str(info["firstLine"] or "-")])
    storage = "\n".join(f"- `{value}`" for value in noname["storageKeys"][:120]) or "- 未自动识别"
    return f"""# noname.js 控制层地图

## 定位

`noname.js` 是控制与适配层，不是完整引擎。它负责用户面板、加载顺序、脚本替换、页面对象适配、请求拦截和本地设置。

## 已知主要对象

{markdown_table(symbol_rows, ["符号", "维护含义", "出现次数", "首次行号"])}

混淆符号名可能在重新构建后变化。维护时应同时使用其行为锚点验证，不能只搜索名称。

## 初始化顺序

```text
读取本地设置
→ 判断 PC/H5 入口和页面地址
→ 建立运行时全局环境
→ 识别并替换官方 game.js
→ 创建 G 菜单和功能状态
→ 安装页面对象、XHR、JSONP 和用户数据适配
```

## 主要职责

1. **入口适配**：检查当前 URL 和播放器路径，必要时切换到 H5 页面。
2. **引擎协调**：识别官方 `game.js` 请求，并将它切换到受控引擎地址。
3. **页面适配**：等待全局对象出现后安装 Getter、Setter 或请求层适配。
4. **界面**：创建 G 按钮、菜单、拖动、全屏、提示和自定义输入。
5. **状态保存**：把界面开关和本地配置保存到浏览器存储。
6. **兼容处理**：页面刷新、小屏幕、全屏和重复初始化保护。

## 版本敏感点

- 官方脚本节点的 `src`、加载时机和父节点。
- 播放器路径 `/website/hfplayer/`、`/official/game.js`。
- `userData`、`mallViewData` 等全局对象出现时机。
- XHR/JSONP 的请求路径、响应结构和字段命名。
- Android WebView 的 document-start 注入能力。
- localStorage 键名和存档结构。

## 自动识别的存储键

{storage}

## 故障优先级

- G 按钮完全不出现：先查注入和脚本语法。
- 菜单出现但全部开关无效：先查初始化顺序和全局对象。
- 只有单个功能失效：查对应字段、接口或响应结构。
- 白屏：查 game.js 兼容性、加载顺序和资源依赖。
"""


def render_game(game: dict[str, Any]) -> str:
    sal_preview = "\n".join(f"- `{name}`" for name in game["salIdentifiers"][:220])
    return f"""# game.js 引擎层地图

## 定位

`game.js` 是完整的 Webpack 网页引擎包，不是一个小型补丁。它承担播放器启动、SAL 适配、资源加载、场景、数据、存档、媒体和网络调用。

## 结构基线

{markdown_table([
    ["文件大小", str(game['file']['size'])],
    ["SHA-256", game['file']['sha256']],
    ["Webpack 模块数", str(game['webpack']['moduleCount'])],
    ["SAL 标识符数", str(game['salCount'])],
    ["绝对 URL 数", str(len(game['urls']))],
    ["路径字符串数", str(len(game['paths']))],
], ["项目", "值"])}

## 维护分区

1. **启动和模块装配**：Webpack chunk 注册、入口模块和依赖模块。
2. **SAL 适配层**：登录、用户数据、存档、支付、分享、设备和平台接口。
3. **用户与登录**：用户身份、会话、用户对象和状态同步。
4. **商城与订单**：商品列表、价格、拥有状态、订单创建和结果处理。
5. **存档与设置**：本地数据、云端数据、用户设置和作品状态。
6. **渲染与场景**：Canvas、WebGL、文本、图片、动画、触摸和场景切换。
7. **音视频与资源**：音频、视频、字体、图片、骨骼动画和资源加载。
8. **网络与平台**：XHR、JSONP、接口封装、错误处理和统计。
9. **完整性与调试检测**：运行环境检查和异常处理。

## 更新时优先比较

- Webpack 入口模块及其直接依赖是否变化。
- SAL 名称的新增、删除和改名。
- 用户、商城、订单、存档字段出现次数是否突变。
- 接口 URL、相对路径和关键错误字符串是否变化。
- 文件尾部启动逻辑和完整性代码是否变化。

## SAL 索引

{sal_preview or '- 未识别'}
"""


def render_network_data(baseline: dict[str, Any]) -> str:
    noname, game = baseline["noname"], baseline["game"]
    urls = unique_sorted(noname["urls"] + game["urls"])
    url_lines = "\n".join(f"- `{url}`" for url in urls[:300]) or "- 未识别"
    field_rows: list[list[str]] = []
    for group, fields in game["fieldCounts"].items():
        for field, game_count in fields.items():
            noname_count = noname["fieldCounts"].get(group, {}).get(field, 0)
            if game_count or noname_count:
                field_rows.append([group, field, str(noname_count), str(game_count)])
    storage = unique_sorted(noname["storageKeys"] + game["storageKeys"])
    storage_lines = "\n".join(f"- `{value}`" for value in storage[:220]) or "- 未识别"
    return f"""# 网络与数据字典

## 使用方法

这里记录的是维护锚点。字段出现不等于字段一定由当前功能直接修改；更新时需要结合运行日志和页面对象确认。

## 重点字段

{markdown_table(field_rows, ["分组", "字段/标记", "noname.js 次数", "game.js 次数"])}

## 存储键候选

{storage_lines}

## URL 索引

{url_lines}

## 网络维护规则

1. 记录请求方法、路径、参数和响应结构，不只记录完整 URL。
2. 优先识别稳定业务动作，如登录、读取用户数据、商品列表和订单创建。
3. 官方更新后先比较路径和字段，再检查 Hook 时机。
4. 失败响应、空响应和超时必须单独记录，不能只测试成功路径。
"""


def render_failure_diagnosis() -> str:
    return """# 失效诊断手册

| 现象 | 最可能层级 | 首要检查 |
|---|---|---|
| 客户端无法启动运行包 | Android/Worker | 鉴权、网络、运行清单、密钥封装和 AES-GCM |
| G 按钮不出现 | noname 注入层 | document-start、目标来源、脚本语法和重复保护 |
| G 菜单出现但开关无效 | noname 适配层 | 全局对象出现时机、Getter/Setter、XHR/JSONP |
| 页面白屏或卡在加载 | game 引擎层 | 引擎版本、官方依赖、入口模块、资源和脚本顺序 |
| 登录状态异常 | SAL/用户数据层 | SAL_Login、SAL_getUserData、userData 结构 |
| 商城打不开或列表为空 | 商城数据层 | 商品接口、mallViewData、响应结构和错误分支 |
| 操作后页面显示异常 | 页面状态同步 | 字段类型、刷新流程、存档回写和场景更新 |
| 刷新后设置丢失 | 存储层 | localStorage 键、WebStorage 清理和存档格式 |
| 仅部分作品失效 | 播放器/作品差异 | 播放器版本、作品资源、目标 URL 和初始化时机 |
| 只在特定 Android 版本失败 | WebView/Keystore | WebView 功能、document-start、加密算法兼容 |

## 排查顺序

```text
客户端与运行包是否就绪
→ noname 是否成功注入
→ game.js 是否被正确提供并执行
→ SAL 是否存在
→ 目标全局对象是否出现
→ 请求路径和响应结构是否变化
→ 单个功能字段是否变化
```

禁止一开始就改多处代码。每次只验证一个层级，并保留失败日志和页面版本。
"""


def render_update_runbook() -> str:
    return """# JavaScript 更新维护流程

## 发现官方更新后

1. 保存目标页面 HTML 和脚本列表。
2. 保存官方 `game.js`、`SALInterface.js`、`webGLLib.js`、`GameInfoData.js`。
3. 记录 URL、大小、SHA-256 和抓取时间。
4. 运行本分析器生成新基线。
5. 用 `compare` 子命令比较旧、新基线。
6. 先看 Webpack、SAL、URL、路径和字段变化。
7. 在 canary 通道更新兼容逻辑，stable 保持不动。
8. 运行受控页面测试和真实安卓测试。
9. 核对 APK、网络和缓存中没有核心明文。
10. 成功后切换 stable；失败立即回滚旧清单。

## 必测项目

- 无 VPN 与 VPN 启动。
- 首次激活、已有会话、解绑和重新绑定。
- 页面首次打开、刷新、返回、后台五分钟后恢复。
- G 菜单显示、拖动、全屏、开关和自定义输入。
- 登录状态、商城列表、单项操作、存档和重置。
- 失败响应、超时、网络切换和运行包校验失败。

## 发布纪律

- 不覆盖历史版本文件。
- 不手工修改自动生成的 release 文件。
- 清单必须签名并校验大小与 SHA-256。
- 新版先 canary，真实设备验证后再 stable。
- 每次发布记录兼容页面版本和已知限制。
"""


def build_anchors(baseline: dict[str, Any]) -> dict[str, Any]:
    return {
        "generatedAt": baseline["generatedAt"],
        "anchors": {
            anchor: {
                "nonameCount": baseline["noname"]["compatibilityAnchorCounts"].get(anchor, 0),
                "gameCount": baseline["game"]["compatibilityAnchorCounts"].get(anchor, 0),
            }
            for anchor in COMPATIBILITY_ANCHORS
        },
        "knownNonameSymbols": baseline["noname"]["knownSymbols"],
        "salIdentifiers": baseline["game"]["salIdentifiers"],
        "webpackModuleIds": baseline["game"]["webpack"]["moduleIds"],
    }


def compare_baselines(old: dict[str, Any], new: dict[str, Any]) -> str:
    lines = ["# JavaScript 基线差异", ""]
    for key, label in (("noname", "noname.js"), ("game", "game.js")):
        old_file, new_file = old[key]["file"], new[key]["file"]
        lines.extend([
            f"## {label}", "",
            markdown_table([
                ["大小", str(old_file["size"]), str(new_file["size"]), str(new_file["size"] - old_file["size"])],
                ["SHA-256", old_file["sha256"], new_file["sha256"], "changed" if old_file["sha256"] != new_file["sha256"] else "same"],
            ], ["项目", "旧值", "新值", "变化"]), "",
        ])
    old_sal, new_sal = set(old["game"]["salIdentifiers"]), set(new["game"]["salIdentifiers"])
    old_mod, new_mod = set(old["game"]["webpack"]["moduleIds"]), set(new["game"]["webpack"]["moduleIds"])
    lines.extend([
        "## SAL 变化", "",
        "新增：" + (", ".join(f"`{x}`" for x in sorted(new_sal - old_sal)) or "无"), "",
        "删除：" + (", ".join(f"`{x}`" for x in sorted(old_sal - new_sal)) or "无"), "",
        "## Webpack 模块变化", "",
        "新增：" + (", ".join(map(str, sorted(new_mod - old_mod))) or "无"), "",
        "删除：" + (", ".join(map(str, sorted(old_mod - new_mod))) or "无"), "",
    ])
    old_urls = set(old["noname"]["urls"] + old["game"]["urls"])
    new_urls = set(new["noname"]["urls"] + new["game"]["urls"])
    lines.extend([
        "## URL 变化", "",
        "新增：" + (", ".join(f"`{x}`" for x in sorted(new_urls - old_urls)) or "无"), "",
        "删除：" + (", ".join(f"`{x}`" for x in sorted(old_urls - new_urls)) or "无"), "",
    ])
    return "\n".join(lines)


def load_release_manifest(root: Path) -> tuple[dict[str, Any], Path]:
    manifest_path = root / "game-engine/release/manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    game_path = manifest_path.parent / manifest["file"]
    return manifest, game_path


def command_analyze(args: argparse.Namespace) -> None:
    root = Path(args.repo_root).resolve()
    output = Path(args.output_dir).resolve()
    manifest, game_path = load_release_manifest(root)
    noname_path = root / "remote-script/src/noname.js"
    baseline = {
        "schemaVersion": 1,
        "generatedAt": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat(),
        "releaseManifest": manifest,
        "noname": analyze_noname(noname_path),
        "game": analyze_game(game_path),
    }
    write_json(output / "baseline.json", baseline)
    write_json(output / "compatibility-anchors.json", build_anchors(baseline))
    write_text(output / "README.md", render_overview(baseline))
    write_text(output / "noname-map.md", render_noname(baseline["noname"]))
    write_text(output / "game-map.md", render_game(baseline["game"]))
    write_text(output / "network-and-data.md", render_network_data(baseline))
    write_text(output / "failure-diagnosis.md", render_failure_diagnosis())
    write_text(output / "update-runbook.md", render_update_runbook())
    write_text(output / "sal-identifiers.txt", "\n".join(baseline["game"]["salIdentifiers"]))
    write_text(output / "webpack-module-ids.txt", "\n".join(map(str, baseline["game"]["webpack"]["moduleIds"])))
    all_urls = unique_sorted(baseline["noname"]["urls"] + baseline["game"]["urls"])
    write_text(output / "urls.txt", "\n".join(all_urls))
    print(json.dumps({
        "output": str(output),
        "nonameSha256": baseline["noname"]["file"]["sha256"],
        "gameSha256": baseline["game"]["file"]["sha256"],
        "salCount": baseline["game"]["salCount"],
        "webpackModuleCount": baseline["game"]["webpack"]["moduleCount"],
    }, ensure_ascii=False, indent=2))


def command_compare(args: argparse.Namespace) -> None:
    old = json.loads(Path(args.old).read_text(encoding="utf-8"))
    new = json.loads(Path(args.new).read_text(encoding="utf-8"))
    report = compare_baselines(old, new)
    if args.output:
        write_text(Path(args.output), report)
    else:
        print(report)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    analyze = sub.add_parser("analyze")
    analyze.add_argument("--repo-root", default=".")
    analyze.add_argument("--output-dir", default="docs/js-maintenance/generated")
    analyze.set_defaults(func=command_analyze)
    compare = sub.add_parser("compare")
    compare.add_argument("--old", required=True)
    compare.add_argument("--new", required=True)
    compare.add_argument("--output")
    compare.set_defaults(func=command_compare)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
