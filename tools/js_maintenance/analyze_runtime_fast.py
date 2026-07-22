#!/usr/bin/env python3
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import re
from pathlib import Path
from typing import Any, Iterable

URL_RE = re.compile(r"https?://[^\s\"'`<>\\)]+", re.I)
SAL_RE = re.compile(r"\bSAL_[A-Za-z0-9_]+\b")
MODULE_RE = re.compile(r"(?<![A-Za-z0-9_$])(\d{2,8})\s*:\s*(?:\([^)]{0,160}\)\s*=>|function\s*\()")
REQUIRE_RE = re.compile(r"(?<![A-Za-z0-9_$])(?:t|n|r)\((\d{2,8})\)")
FUNCTION_RE = re.compile(r"\bfunction\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(")
OBJECT_RE = re.compile(r"\b(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*\{")
PATH_RE = re.compile(r"['\"](/(?:[A-Za-z0-9_.~!$&()*+,;=:@%-]+/?){1,12})['\"]")
STORAGE_RE = re.compile(r"(?:localStorage|sessionStorage)\.(?:getItem|setItem|removeItem)\(\s*['\"]([^'\"]{1,120})['\"]")

KNOWN_NONAME = {
    "STy4gr": "PC/H5 入口适配",
    "MInyap": "运行环境初始化",
    "DjkL_Q": "game.js 识别与替换",
    "zjEv2f": "页面数据和请求适配",
    "PwDi7Ry": "用户状态适配",
    "pXBC4W": "G 菜单与交互界面",
}

FIELD_GROUPS = {
    "身份与登录": ["uid", "userId", "isLogin", "token", "deviceId", "device_id"],
    "鲜花与数值": ["totalFlower", "freshFlower", "wildFlower", "tempFlower", "realFlower", "haveFlower", "itemPrice"],
    "商城与订单": ["mallViewData", "goods", "goodsId", "goods_id", "orderId", "order_id", "createBuyOrder", "get_goods_list", "ownedProps"],
    "存档与设置": ["userData", "userGameSettingInfo", "saveData", "localStorage", "sessionStorage", "IndexedDB", "showLocal"],
    "渲染与运行": ["Canvas", "WebGL", "Audio", "Video", "requestAnimationFrame", "XMLHttpRequest", "fetch", "JSONP"],
}

ANCHORS = [
    "/website/hfplayer/", "/official/game.js", "space-z.ai/game.js",
    "gams-script-edge.2320006072.workers.dev/engine/stable.js",
    "orange_feature_switch", "SAL_Login", "SAL_getUserData", "mallViewData",
    "userData", "createBuyOrder", "get_goods_list", "itemPrice", "showLocal",
]

NETWORK_MARKERS = [
    "XMLHttpRequest.prototype.open", "XMLHttpRequest.prototype.send", "window.fetch",
    "fetch(", "JSONP", "createBuyOrder", "get_goods_list", "SAL_Login", "SAL_getUserData",
]


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def unique(items: Iterable[str]) -> list[str]:
    return sorted({x for x in items if x})


def metadata(path: Path, data: bytes, text: str) -> dict[str, Any]:
    return {
        "path": path.as_posix(),
        "size": len(data),
        "sha256": sha256(data),
        "lineCount": text.count("\n") + 1,
        "startsWith": text[:160],
        "endsWith": text[-160:],
    }


def header(text: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for key, value in re.findall(r"^//\s*@([A-Za-z0-9_-]+)\s+(.+?)\s*$", text[:5000], re.M):
        out[key] = out.get(key, "") + ((" | " if key in out else "") + value)
    return out


def counts(text: str, values: Iterable[str]) -> dict[str, int]:
    return {value: text.count(value) for value in values}


def storage_keys(text: str) -> list[str]:
    result = set(STORAGE_RE.findall(text))
    for candidate in re.findall(r"['\"]([A-Za-z0-9_.:-]{3,100})['\"]", text):
        low = candidate.lower()
        if any(word in low for word in ("feature", "setting", "config", "save", "flower", "user")):
            result.add(candidate)
    return sorted(result)


def analyze_noname(path: Path) -> dict[str, Any]:
    data = path.read_bytes()
    text = data.decode("utf-8", errors="replace")
    known = {}
    for name, description in KNOWN_NONAME.items():
        first = text.find(name)
        known[name] = {
            "description": description,
            "count": text.count(name),
            "firstLine": text.count("\n", 0, first) + 1 if first >= 0 else None,
        }
    return {
        "file": metadata(path, data, text),
        "userscriptHeader": header(text),
        "knownSymbols": known,
        "namedFunctions": unique(FUNCTION_RE.findall(text))[:500],
        "namedObjects": unique(OBJECT_RE.findall(text))[:500],
        "urls": unique(URL_RE.findall(text)),
        "paths": unique(PATH_RE.findall(text)),
        "storageKeys": storage_keys(text),
        "salIdentifiers": unique(SAL_RE.findall(text)),
        "fieldCounts": {group: counts(text, values) for group, values in FIELD_GROUPS.items()},
        "networkMarkerCounts": counts(text, NETWORK_MARKERS),
        "compatibilityAnchorCounts": counts(text, ANCHORS),
    }


def analyze_game(path: Path) -> dict[str, Any]:
    data = path.read_bytes()
    text = data.decode("utf-8", errors="replace")
    modules = sorted({int(v) for v in MODULE_RE.findall(text)})
    required = sorted({int(v) for v in REQUIRE_RE.findall(text)})
    sal = unique(SAL_RE.findall(text))
    return {
        "file": metadata(path, data, text),
        "webpack": {"moduleIds": modules, "moduleCount": len(modules), "requiredModuleIds": required},
        "salIdentifiers": sal,
        "salCount": len(sal),
        "urls": unique(URL_RE.findall(text)),
        "paths": unique(PATH_RE.findall(text)),
        "storageKeys": storage_keys(text),
        "fieldCounts": {group: counts(text, values) for group, values in FIELD_GROUPS.items()},
        "networkMarkerCounts": counts(text, NETWORK_MARKERS),
        "compatibilityAnchorCounts": counts(text, ANCHORS),
    }


def table(headers: list[str], rows: list[list[str]]) -> str:
    lines = ["| " + " | ".join(headers) + " |", "|" + "|".join(["---"] * len(headers)) + "|"]
    for row in rows:
        lines.append("| " + " | ".join(str(x).replace("|", "\\|") for x in row) + " |")
    return "\n".join(lines)


def write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text.rstrip() + "\n", encoding="utf-8")


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def overview(base: dict[str, Any]) -> str:
    n, g = base["noname"], base["game"]
    rows = [
        ["noname.js", n["userscriptHeader"].get("version", "unknown"), n["file"]["size"], n["file"]["sha256"]],
        ["game.js", base["releaseManifest"].get("versionName", "unknown"), g["file"]["size"], g["file"]["sha256"]],
    ]
    return f"""# JavaScript 维护知识库

{table(["文件", "版本", "字节数", "SHA-256"], rows)}

## 架构

```text
Android V2：鉴权、加密交付、内存解密
  → noname.js：控制、界面、加载协调、页面适配
  → game.js：完整引擎、SAL、场景、数据、媒体、网络和存档
  → 目标页面 DOM / Canvas / WebGL / 存储
```

V2 只改变核心脚本的交付和缓存方式；两份脚本最终仍由 WebView 执行。

## 维护原则

1. 先运行基线比较，再修改。
2. 以 SAL、接口路径、字段、资源地址和加载时机作为稳定锚点。
3. 混淆变量名仅作辅助定位。
4. 新版先 canary，真实安卓测试后再 stable。
5. 历史版本和签名清单保持不可变，随时可回滚。

## 文件

- `baseline.json`：完整机器基线。
- `noname-map.md`：控制层地图。
- `game-map.md`：引擎层地图。
- `network-and-data.md`：字段、存储和 URL 索引。
- `compatibility-anchors.json`：自动比较锚点。
- `failure-diagnosis.md`：故障定位手册。
- `update-runbook.md`：固定更新流程。
"""


def noname_doc(n: dict[str, Any]) -> str:
    rows = [[name, info["description"], info["count"], info["firstLine"] or "-"] for name, info in n["knownSymbols"].items()]
    keys = "\n".join(f"- `{x}`" for x in n["storageKeys"][:150]) or "- 未自动识别"
    return f"""# noname.js 控制层地图

## 定位

`noname.js` 负责 G 菜单、入口适配、运行环境初始化、game.js 加载协调、页面对象适配、请求拦截和本地设置。

{table(["符号", "含义", "次数", "首次行号"], rows)}

## 初始化顺序

```text
读取本地设置
→ 判断 PC/H5 页面
→ 初始化运行环境
→ 识别并替换官方 game.js
→ 创建 G 菜单
→ 安装用户、商城、XHR/JSONP 等页面适配
```

## 易失效点

- 官方 game.js 的 URL、script 节点和加载时机。
- `userData`、`mallViewData` 等对象的出现时机。
- XHR/JSONP 路径、参数和响应字段。
- localStorage 键名和存档格式。
- WebView document-start 注入能力。

## 存储键候选

{keys}
"""


def game_doc(g: dict[str, Any]) -> str:
    sal = "\n".join(f"- `{x}`" for x in g["salIdentifiers"]) or "- 未识别"
    rows = [
        ["文件大小", g["file"]["size"]], ["SHA-256", g["file"]["sha256"]],
        ["Webpack 模块数", g["webpack"]["moduleCount"]], ["SAL 数量", g["salCount"]],
        ["绝对 URL 数", len(g["urls"])], ["相对路径数", len(g["paths"])],
    ]
    return f"""# game.js 引擎层地图

`game.js` 是完整 Webpack 网页引擎，不是小补丁。

{table(["项目", "值"], rows)}

## 维护分区

1. Webpack 启动和模块装配。
2. SAL 平台适配。
3. 用户与登录。
4. 商城、商品和订单。
5. 存档、设置和状态同步。
6. Canvas/WebGL、场景和交互。
7. 音视频与资源加载。
8. 网络、错误处理和统计。
9. 完整性和调试环境检查。

## 更新时优先比较

- 入口模块和直接依赖。
- SAL 的新增、删除和改名。
- 用户、商城、订单、存档字段次数突变。
- URL、相对路径和关键错误字符串。
- 文件末尾启动逻辑。

## SAL 索引

{sal}
"""


def network_doc(base: dict[str, Any]) -> str:
    n, g = base["noname"], base["game"]
    rows: list[list[str]] = []
    for group, fields in g["fieldCounts"].items():
        for field, gc in fields.items():
            nc = n["fieldCounts"].get(group, {}).get(field, 0)
            if nc or gc:
                rows.append([group, field, nc, gc])
    keys = unique(n["storageKeys"] + g["storageKeys"])
    urls = unique(n["urls"] + g["urls"])
    return f"""# 网络与数据字典

## 字段锚点

{table(["分组", "字段/标记", "noname.js", "game.js"], rows)}

## 存储键候选

{chr(10).join(f'- `{x}`' for x in keys[:250]) or '- 未识别'}

## URL 索引

{chr(10).join(f'- `{x}`' for x in urls[:350]) or '- 未识别'}

## 维护规则

- 同时记录方法、路径、参数、响应和失败分支。
- 优先用登录、用户数据、商品列表、订单创建等行为锚点定位。
- 官方更新后先比较字段和路径，再调整 Hook 时机。
"""


FAILURE_DOC = """# 失效诊断手册

| 现象 | 层级 | 首查 |
|---|---|---|
| V2 无法启动运行包 | Android/Worker | 鉴权、网络、清单签名、密钥和 AES-GCM |
| G 按钮不显示 | noname 注入 | document-start、来源白名单和脚本异常 |
| 菜单显示但开关无效 | 页面适配 | 对象时机、Getter/Setter、XHR/JSONP |
| 白屏或一直加载 | game 引擎 | 引擎版本、入口模块、依赖和资源 |
| 登录状态异常 | SAL/用户数据 | SAL_Login、SAL_getUserData、userData |
| 商城为空或打不开 | 商城数据 | 商品接口、mallViewData、响应结构 |
| 刷新后设置丢失 | 存储 | localStorage、WebStorage 和存档结构 |
| 仅部分作品失败 | 播放器差异 | 页面版本、作品资源、URL 和初始化时机 |

排查顺序：运行包 → noname 注入 → game 执行 → SAL → 全局对象 → 请求结构 → 单项字段。
"""

RUNBOOK_DOC = """# JavaScript 更新维护流程

1. 保存页面 HTML 和脚本列表。
2. 保存官方 game.js、SALInterface.js、webGLLib.js、GameInfoData.js。
3. 记录 URL、大小、SHA-256 和时间。
4. 生成新基线并与稳定基线比较。
5. 先看 Webpack、SAL、URL、路径和字段变化。
6. 在 canary 中适配，stable 不动。
7. 做受控页面测试和真实安卓测试。
8. 检查 APK、网络和缓存无核心明文。
9. 成功后切换 stable，失败立即回滚。

必测：无 VPN/VPN、首次激活、已有会话、解绑、刷新、返回、后台恢复、G 菜单、全屏、开关、登录、商城、存档、重置、超时和网络切换。
"""


def anchors(base: dict[str, Any]) -> dict[str, Any]:
    return {
        "generatedAt": base["generatedAt"],
        "anchors": {x: {
            "nonameCount": base["noname"]["compatibilityAnchorCounts"].get(x, 0),
            "gameCount": base["game"]["compatibilityAnchorCounts"].get(x, 0),
        } for x in ANCHORS},
        "knownNonameSymbols": base["noname"]["knownSymbols"],
        "salIdentifiers": base["game"]["salIdentifiers"],
        "webpackModuleIds": base["game"]["webpack"]["moduleIds"],
    }


def compare(old: dict[str, Any], new: dict[str, Any]) -> str:
    lines = ["# JavaScript 基线差异", ""]
    for key, label in (("noname", "noname.js"), ("game", "game.js")):
        a, b = old[key]["file"], new[key]["file"]
        lines += [f"## {label}", "", table(["项目", "旧值", "新值"], [
            ["大小", a["size"], b["size"]], ["SHA-256", a["sha256"], b["sha256"]],
        ]), ""]
    old_sal, new_sal = set(old["game"]["salIdentifiers"]), set(new["game"]["salIdentifiers"])
    old_mod, new_mod = set(old["game"]["webpack"]["moduleIds"]), set(new["game"]["webpack"]["moduleIds"])
    lines += [
        "## SAL", "", "新增：" + (", ".join(sorted(new_sal-old_sal)) or "无"), "",
        "删除：" + (", ".join(sorted(old_sal-new_sal)) or "无"), "",
        "## Webpack 模块", "", "新增：" + (", ".join(map(str, sorted(new_mod-old_mod))) or "无"), "",
        "删除：" + (", ".join(map(str, sorted(old_mod-new_mod))) or "无"), "",
    ]
    return "\n".join(lines)


def run_analyze(root: Path, out: Path) -> None:
    manifest_path = root / "game-engine/release/manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    base = {
        "schemaVersion": 1,
        "generatedAt": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat(),
        "releaseManifest": manifest,
        "noname": analyze_noname(root / "remote-script/src/noname.js"),
        "game": analyze_game(manifest_path.parent / manifest["file"]),
    }
    write_json(out / "baseline.json", base)
    write_json(out / "compatibility-anchors.json", anchors(base))
    write(out / "README.md", overview(base))
    write(out / "noname-map.md", noname_doc(base["noname"]))
    write(out / "game-map.md", game_doc(base["game"]))
    write(out / "network-and-data.md", network_doc(base))
    write(out / "failure-diagnosis.md", FAILURE_DOC)
    write(out / "update-runbook.md", RUNBOOK_DOC)
    write(out / "sal-identifiers.txt", "\n".join(base["game"]["salIdentifiers"]))
    write(out / "webpack-module-ids.txt", "\n".join(map(str, base["game"]["webpack"]["moduleIds"])))
    write(out / "urls.txt", "\n".join(unique(base["noname"]["urls"] + base["game"]["urls"])))
    print(json.dumps({
        "nonameSha256": base["noname"]["file"]["sha256"],
        "gameSha256": base["game"]["file"]["sha256"],
        "salCount": base["game"]["salCount"],
        "webpackModuleCount": base["game"]["webpack"]["moduleCount"],
        "output": str(out),
    }, ensure_ascii=False, indent=2))


def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    p = sub.add_parser("analyze")
    p.add_argument("--repo-root", default=".")
    p.add_argument("--output-dir", default="docs/js-maintenance/generated")
    c = sub.add_parser("compare")
    c.add_argument("--old", required=True)
    c.add_argument("--new", required=True)
    c.add_argument("--output")
    args = parser.parse_args()
    if args.command == "analyze":
        run_analyze(Path(args.repo_root).resolve(), Path(args.output_dir).resolve())
    else:
        report = compare(json.loads(Path(args.old).read_text()), json.loads(Path(args.new).read_text()))
        if args.output:
            write(Path(args.output), report)
        else:
            print(report)


if __name__ == "__main__":
    main()
