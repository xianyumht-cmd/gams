# 构建与开发陷阱

## Android 测试变体覆盖主清单属性

- 发现：2026-11-10，`GG Local JS Test APK` 首轮 Actions 在 `:client:processLocalTestMainManifest` 失败；测试变体的 `android:label="GG 本地测试"` 与主清单的 `android:label="GG"` 冲突。
- 原因：`src/localTest/AndroidManifest.xml` 不是替换整个主清单，覆盖已有 `application` 属性时需要明确的 Manifest Merger 规则。
- 防止：在变体清单中声明 `xmlns:tools` 并为目标属性使用 `tools:replace="android:label"`；保留 `scripts/test_local_js_variant.py` 的静态检查和 Actions 真正的 `assembleLocalTest` 验证。

## WebView 引擎 URL、SRI 与页面内联检查是联动条件

- 发现：2026-11-10，新的游戏页在 HTML 中为官方 `game.js` 设置 SHA-384 SRI，同时内联 JS 将 `tempName.indexOf("game.js")` 与 `el.integrity` 的固定值一起用于决定是否跳转 `about:blank`。
- 原因：仅将 JS 内容拦截为本地文件并不足够；`stable.js` 名称不满足路径判定，拦截到的脚本内容不匹配 HTML SRI 也会被浏览器拒绝。曾引用的 `sha384-ZLB...` 与本次实际上传的 `game-1.0.6.js` 字节不一致。
- 防止：内存改写自托管引擎 URL 至现有 `/runtime/game.js`，确保 document-start；针对实际官方脚本拦截响应，先计算 SHA-384，再在 HTML 解析前同步替换属性与内联常量；失败时给出可见提示。不要硬编码未经字节校验的哈希。
- 版本差异（2026-11-10）：上传的 `noname 1.4.1` 已移除旧 `stable.js` 替换逻辑。此版本不应使用旧版官方引擎占位响应，必须在原始 `.../official/game.js` URL 直接回传 `game 1.0.41`，并用其实际 SHA-384 `KoqnKYX/Agwvncta87t5MVOkU1dM791aaGlf5kvWRzJbmJsLejeRz59MGAEE6JlJ` 改写两个位置。哈希在构建时与资产字节比较，禁止未经验证的硬编码。
- 本地测试新版策略（2026-11-10）：用户改为明确要求取消网页引擎完整性守卫。仅 `1.4.1` 测试变体改用 `rewriteGuardFree`，不再依赖目标网页的 SHA-384 常量；只对主框架的 HTML 导航响应改写，并保留 document-start 注入兜底。先前 SHA-384 匹配说明是历史路径，不能再被误认为新版验收门槛。禁止把测试变体的守卫移除逻辑应用到正式 `debug` / `release`。
- 诊断补充：HTML 正文与真实引擎加载可能发生在不同资源/框架中；`Accept` 不包含 `text/html` 时新的主框架改写会被跳过。查看 `GG-Local` 的拦截入口头、HTTP 状态/编码/长度、三类替换计数和 `onPageFinished`。0 命中需要结合实际页面路径判断（站点首页本来没有守卫）。自有 503 错误页的 URL 可能仍显示原 URL，需根据 `PAGE_COMPAT_ERROR` 标记识别，而不是误认为网页加载成功。
