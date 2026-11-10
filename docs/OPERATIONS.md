# 构建与交付

## 本地 JS 测试 APK（独立于正式版）

### 最新上传版：noname 1.4.1 + game 1.0.41

- 来源：用户 `4646.zip` 原始脚本，`noname-1.4.1.js`（36,414 字节、SHA-256 `456f7765c290665d9a4e233206e4768474b04ca1aa464ae32a228fd7ce129f7d`）和 `game-1.0.41.js`（15,059,308 字节、SHA-256 `6794d40288e202ab54e81bc51c1df4f05d9acf805514d8cbcf76b2928b178e2e`）。
- 构建：`gg-local-js-test-apk.yml` 还原仓库 `v2/android/client/localtest-payload` 的无损 gzip 资产（引擎分为 9 个有序分片），执行 `python3 scripts/test_local_js_variant.py 1.4.1 1.0.41` 和 Android lint/assemble、APK 签名/文件字节验证。可在 `v2/android` 手动运行 `gradle :client:lintLocalTest :client:assembleLocalTest -PggLocalNonameVersion=1.4.1`，前提是已还原 `src/localTest/assets`。
- APK：`GG-local-noname-1.4.1-game-1.0.41.apk`，`com.jinli.quickweb.localtest141`，图标名称「GG测试1.4.1」，与正式版及旧三个测试版可并存。
- 首页：`https://m.66rpg.com/`，首次启动、点击「首页」及重置数据后均返回该站点首页，由使用者自己选择游戏，**不自动跳至 `/h5/1695336` 或其他单个作品**；保留单 WebView、自动播放、Cookie 和 document-start 注入。非 `66rpg.com`/`cgyouxi.com` 的主窗口 HTTP(S) 导航交给系统浏览器。
- **与旧版路径不同**：新 noname 不再引用 `stable.js`。仅此 1.4.1 变体按原始官方 `/bin/official/game.js` 请求返回 APK 内 **真实引擎字节**；HTML 里官方 `<script>` 的 integrity 和内联对比常量一起替换为 `sha384-KoqnKYX/Agwvncta87t5MVOkU1dM791aaGlf5kvWRzJbmJsLejeRz59MGAEE6JlJ`，等于这份引擎的实际 SHA-384。绝不能再给此变体返回旧版空占位脚本。
- 保留用户脚本的原始字节，不将脚本正文插入 HTML；使用现有 `WebViewCompat.addDocumentStartJavaScript` 在解析开始前注入，避免 HTML CSP 阻止内联脚本。若网页的官方脚本或 SRI 结构发生变化，清晰显示错误而不是宣称加载成功。
- 只绕过 GG 自身授权，游戏网页请求仍联网；Actions 可验证 APK 内容但无法代替 Android 实机确认首页导航、用户手动选择游戏后不跳 `about:blank`、右下角 G 按钮和游戏启动。

### 历史仓库版：三个已发布对照包

- 任务分支：`feat/gg-local-js-test-20261110`，从 `main` 创建，不合并前不影响正式版。
- 工作流：历史三个对照包由 `.github/workflows/gg-local-js-test-apk.yml` 先前成功构建并通过 GitHub **预发布版** `gg-local-js-test-08598c3` 保存；当前同名工作流构建上面的最新上传版。
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
