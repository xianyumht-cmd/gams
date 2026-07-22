# JavaScript 维护知识库

| 文件 | 版本 | 字节数 | SHA-256 |
|---|---|---|---|
| noname.js | 1.1.1 | 331550 | 5898ad5db1a3f66dfceb51b36addaf49d49b26596acdb58162caa1a3c6876917 |
| game.js | 1.0.2 | 11589175 | 51ae52887d0c0475870e4c985edf747a14672f0908221779826934f37b73db43 |

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
