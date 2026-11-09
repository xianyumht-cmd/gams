# 构建与开发陷阱

## Android 测试变体覆盖主清单属性

- 发现：2026-11-10，`GG Local JS Test APK` 首轮 Actions 在 `:client:processLocalTestMainManifest` 失败；测试变体的 `android:label="GG 本地测试"` 与主清单的 `android:label="GG"` 冲突。
- 原因：`src/localTest/AndroidManifest.xml` 不是替换整个主清单，覆盖已有 `application` 属性时需要明确的 Manifest Merger 规则。
- 防止：在变体清单中声明 `xmlns:tools` 并为目标属性使用 `tools:replace="android:label"`；保留 `scripts/test_local_js_variant.py` 的静态检查和 Actions 真正的 `assembleLocalTest` 验证。

## WebView 引擎 URL、SRI 与页面内联检查是联动条件

- 发现：2026-11-10，新的游戏页在 HTML 中为官方 `game.js` 设置 SHA-384 SRI，同时内联 JS 将 `tempName.indexOf("game.js")` 与 `el.integrity` 的固定值一起用于决定是否跳转 `about:blank`。
- 原因：仅将 JS 内容拦截为本地文件并不足够；`stable.js` 名称不满足路径判定，拦截到的脚本内容不匹配 HTML SRI 也会被浏览器拒绝。曾引用的 `sha384-ZLB...` 与本次实际上传的 `game-1.0.6.js` 字节不一致。
- 防止：内存改写自托管引擎 URL 至现有 `/runtime/game.js`，确保 document-start；针对实际官方脚本拦截响应，先计算 SHA-384，再在 HTML 解析前同步替换属性与内联常量；失败时给出可见提示。不要硬编码未经字节校验的哈希。
