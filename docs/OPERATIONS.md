# 构建与交付

## 本地 JS 测试 APK（独立于正式版）

- 任务分支：`feat/gg-local-js-test-20261110`，从 `main` 创建，不合并前不影响正式版。
- 工作流：`.github/workflows/gg-local-js-test-apk.yml`；推送该分支后自动构建、校验并创建 GitHub **预发布版**。
- 构建命令：在 `v2/android` 运行 `gradle :client:lintLocalTest :client:assembleLocalTest`。
- 产物：`GG-local-js-1.1.4-game-1.0.6.apk`；包名 `com.jinli.quickweb.localtest`；使用 Android 测试签名，与正式版 `com.jinli.quickweb` 并存。
- 资源：仓库提交 `v2/android/client/localtest-payload/noname.js.gz` 和 `game.js.gz.part-00` 至 `part-09`（无损 gzip 分片，避免新增约 15 MB 的文本，也便于仓库上传）。构建时按序拼合解压为 `src/localTest/assets/noname.js` 和 `game.js`，对应上传的 `noname-1.1.4(4).js` 与 `game-1.0.6.js`；工作流校验 SHA-256，并校验 APK 内最终资源字节。
- 注入仍使用 V2 WebView 的 `DOCUMENT_START_SCRIPT` / `evaluateJavascript` 回退、`shouldInterceptRequest` 引擎替换逻辑；不重写网页脚本。
- `localTest` 变体绕过 GG 激活码、设备绑定、在线 License API 和强制更新流程。**仅 JS 已本地化**，打开 `https://m.66rpg.com/h5/` 和网页自身的请求仍需联网。
- `debug` 和 `release` 两种已有构建类型维持原有授权流程；测试版不使用正式签名、不发布到正式更新渠道。

验收：GitHub Actions 构建、lint、脚本哈希、包名、签名及内置资源校验通过后，下载安装测试；游戏交互功能必须在 Android 实机上最终确认。
