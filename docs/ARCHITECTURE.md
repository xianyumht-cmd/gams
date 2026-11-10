# Android 客户端架构

## 独立 localTest APK

`v2/android/client` 的 `localTest` 构建类型使用独立包名与测试签名。它从 APK assets 读取仓库历史发布的 `noname.js` 和对应 `game.js`（测试配对：1.1.4+1.0.5、1.1.3+1.0.5、1.1.2+1.0.4），不启动 GG License API。构建时通过 `-PggLocalNonameVersion` 给三个包设置各自包名、显示名及版本，并依次放入对应的原始发布脚本。

新增上传版 `1.4.1+1.0.41` 使用同一 `localTest` 构建类型、document-start 注入及包名隔离（`com.jinli.quickweb.localtest141`），但通过 `isDirectEngineLocalTest()` 使用独立加载分支：脚本保持原貌、不再重写远端 `stable.js`；真实的官方 `.../official/game.js` 请求由 `shouldInterceptRequest` 直接返回 `game-1.0.41.js`；只有主文档、GET、`Accept: text/html` 和指定站点满足时才执行 HTML 兼容改写（移除 `about:blank` 跳转、清空 SRI、`<head>` 首位内联原始脚本），其它资源由 WebView 直接加载。首页仍是 `https://m.66rpg.com/`，用户自己选择游戏。旧三个 APK 的虚拟 `game.js` + 官方占位响应逻辑仍保留。不更改 `debug` / `release` 授权路径。

此变体的 `LocalHtmlRewriter.RewriteResult` 同时返回 HTML 和三类命中数量，`MainActivity` 以 `GG-Local` 输出带有限片段的缺失警报；HTTP 获取日志与 `onPageFinished` 的最终 URL / 自有错误页标记一起用于区分站点守卫跳空白页、未命中改写以及兼容层提前失败。此诊断逻辑不进入旧正式授权路径。

1. 启动时注册 `WebViewCompat.addDocumentStartJavaScript`；设备不支持则停止并提示更新系统 WebView，避免脚本晚于页面 `Common.js` / `ssologin.js`。
2. 注入的 `noname.js` **内存副本**将远端 `stable.js` URL 换成 `https://ggv2.local/runtime/game.js`，保留原始 assets SHA-256；`shouldInterceptRequest` 对此 URL 返回本地引擎字节。
3. 对指定 HTTPS 游戏 HTML 页面（含 iframe）在解析前获取源文档，`LocalHtmlRewriter` 同时替换官方 `game.js` 的 SRI 属性及内联常量。SRI 取自官方脚本拦截时返回的轻量占位 JS 的实际 SHA-384，保证浏览器校验一致；否则展示明确错误。
4. 对官方引擎脚本仍返回轻量占位，避免与独立加载的本地引擎重复运行。目标网页其他资源保持正常联网。

原有 `debug` / `release` 构建类型保持在线授权与运行时注入路径，不启用 HTML 改写及 localTest 的启动流程。
