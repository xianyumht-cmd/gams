# 构建与交付

## 本地 JS 测试 APK（独立于正式版）

- 任务分支：`feat/gg-local-js-test-20261110`，从 `main` 创建，不合并前不影响正式版。
- 工作流：`.github/workflows/gg-local-js-test-apk.yml`；推送该分支后自动构建、校验并创建 GitHub **预发布版**。
- 构建命令：工作流依次把仓库历史发布 JS 复制至 `src/localTest/assets`，在 `v2/android` 运行 `gradle :client:lintLocalTest :client:assembleLocalTest -PggLocalNonameVersion=1.1.4`（然后依次替换为 `1.1.3`、`1.1.2`）。
- 产物：`GG-local-noname-1.1.4-game-1.0.5.apk`、`GG-local-noname-1.1.3-game-1.0.5.apk`、`GG-local-noname-1.1.2-game-1.0.4.apk`。
- 包名分别为 `com.jinli.quickweb.localtest114`、`com.jinli.quickweb.localtest113`、`com.jinli.quickweb.localtest112`，名称分别为「GG测试1.1.4」「GG测试1.1.3」「GG测试1.1.2」。三个包使用 Android 测试签名，能相互并存，也不会覆盖正式版 `com.jinli.quickweb`。
- 资源直接来自仓库 `remote-script/release/noname-*.js` 与 `game-engine/release/game-*.js`，不引入外部上传版本或修改原始脚本；工作流逐个校验固定 SHA-256、原始源码语法、APK 内最终字节与签名。
- 注入仍使用 V2 WebView 的 `DOCUMENT_START_SCRIPT` / `shouldInterceptRequest` 引擎替换逻辑；测试版 **要求** 系统 WebView 支持 document-start，否则展示明确提示，不采用过晚的 `onPageFinished` 回退。仓库原始 `noname.js` 保持原样；仅在内存里把其中的 `.../stable.js` 地址转换成已有的 `https://ggv2.local/runtime/game.js`，由 WebView 返回 APK 内的游戏引擎。
- 测试版在 HTML 解析前拦截 `m.66rpg.com` / `www.66rpg.com` 的游戏页，识别官方 `game.js` 脚本的 SRI，将 HTML 属性与内联比较常量一起改为 **实际拦截响应** 的 SHA-384。官方脚本请求仍用原有的轻量占位响应，避免重复执行引擎；真正的引擎由虚拟 `game.js` URL 加载。若网页结构变化，显示可读错误而非悄然白屏。
- 注意：仓库原版 `game-1.0.5.js` 的 SHA-384 是 `sha384-JyVFsfJiCPxZvdOvOcvy7PYuCnYLsmMzYqwwKSPunMQjvAGnAs/thDonKb3l7urO`。官方脚本占位响应的 SHA-384 为 `sha384-CDD31tTvMcJAZcvYeIX7R0xofGOa/XWElGrm0PEIAJtsaWDbG5qY1ClL4R1HIpFM`。不能使用与响应字节不匹配的固定 SRI。
- `localTest` 变体绕过 GG 激活码、设备绑定、在线 License API 和强制更新流程。**仅 JS 已本地化**，打开 `https://m.66rpg.com/h5/` 和网页自身的请求仍需联网。
- `debug` 和 `release` 两种已有构建类型维持原有授权流程；测试版不使用正式签名、不发布到正式更新渠道。

验收：GitHub Actions 构建、lint、脚本哈希、包名、签名及内置资源校验通过后，下载安装测试；游戏交互功能必须在 Android 实机上最终确认。
