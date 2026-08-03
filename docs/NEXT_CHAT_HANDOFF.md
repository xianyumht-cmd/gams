# 下一对话交接：GAMS 客户端外部浏览器空白页与商城重复购买

先读取：

1. `docs/CURRENT_TASK_STATE.json`
2. `docs/CHAT_CHECKPOINT_20260804_CLIENT_SHOP_HOTFIX.md`
3. `docs/CLIENT_SHOP_REPEAT_HOTFIX_DISPATCH_STATUS.json`
4. `scripts/apply_client_shop_repeat_hotfix.py`，位于分支 `hotfix/client-shop-repeat-no-external-browser-20260804`

## 当前结论

用户当前稳定客户端是 `2.0.3-stable` code16：启动正常且本轮不白屏，但模拟器会打开系统浏览器空白页，商城只能成功购买一次。

已构建签名候选：`2.0.7-stable` code17。

候选 APK 已通过编译、Lint、R8、正式签名、签名校验和包信息校验。GitHub Actions run ID 为 `30849473086`，artifact ID 为 `8870025435`，APK SHA-256 为：

`799124ed7b2b0347ebd387daec309a6982a4e62b8fa0a0a9042419a33e12972b`

## 必须先问或读取的内容

用户进入新对话时，优先读取其候选版实机结果，不要重新从 Cloudflare、密钥或 Runtime 开始排查。

需要四项结果：

1. 启动是否仍然快速，是否重新白屏。
2. 是否还会打开模拟器系统浏览器空白页。
3. 商城内能否连续购买两件商品。
4. 回剧情再进入商城后能否购买第三件商品。

用户如果只说“通过”或“还是有问题”，应确认具体是哪一项，不要直接大范围修改。

## 状态边界

- `2.0.7-stable` 尚未正式发布。
- 正式 main 尚未提升到 2.0.7。
- 候选 APK artifact 已存在。
- 候选源码补丁在 runner 中编译成功，但最终源码提交未推送到测试分支。
- 推送失败原因不是产品代码，而是 GitHub App 不允许 Actions token 修改 `.github/workflows/v2-build-apks.yml`。
- 测试分支上保留了可重复生成候选源码的确定性脚本，提交为 `64d0fcb81227be14dc51cbbdcb10e8d163b4ff7e`。

## 用户四项全部通过时

直接继续完成以下工作，不让用户抓日志：

1. 从测试分支读取并执行确定性补丁逻辑。
2. 将产品源码修改单独写回测试分支：
   - `v2/android/client/src/main/java/com/jinli/ggsecure/MainActivity.java`
   - `v2/android/client/build.gradle.kts`
   - 必要状态文档
3. 不要在同一个 Actions 推送中修改 `.github/workflows/v2-build-apks.yml`；需要修改时用 GitHub contents API 单独提交。
4. 审查差异，断言：
   - `setSupportMultipleWindows(false)`
   - 不存在 `onCreateWindow`
   - 不存在临时 popup WebView
   - 存在新旧两种 `shouldOverrideUrlLoading`
   - 存在 `handleNavigationInsideGg`
   - 存在 `ensureControlScriptInjected`
   - 存在 `__GG_V2_CONTROL_LOADING__`
5. 开 PR 或按用户明确指令合并。
6. 正式构建和发布后，再清理一次性工作流与触发文件。

## 仍打开外部浏览器时

不要恢复多窗口方案。先通过代码和 WebView 行为分析确定 URI；只有无法确定时，给用户一键脚本捕获：

- Android logcat 中 GG 包的 Activity/Intent 日志
- 新旧 `shouldOverrideUrlLoading` 的 URL、scheme、host
- `onPageStarted/onPageFinished`
- 是否为主框架
- 是否执行 `startActivity`

日志不得包含激活码、令牌、密码或 Runtime 明文。

## 商城仍只能购买一次时

只加诊断，不先改 Worker：

- 记录控制脚本加载/加载中标志
- 记录一次性回调安装、调用、恢复
- 记录原始回调是否为函数
- 记录商城页面 URL 变化
- 记录第二次点击时 callback 名称和值

不得更改 License Worker、Runtime Worker、`TOKEN_SIGNING_SECRET`、`RUNTIME_MASTER_KEY` 或 `LICENSE_ADMIN_PASSWORD`。

## 重新白屏时

停止提升 2.0.7，保留 2.0.3-stable 为回退版本。下一候选应把两个修复拆开：

1. 只修复外部浏览器协议处理。
2. 再单独增加脚本补注入。

禁止恢复：

- `setSupportMultipleWindows(true)`
- `onCreateWindow`
- 临时 popup WebView

## 清理事项

待正式版本验证后再处理，不要现在删除：

- `.github/workflows/dispatch-client-shop-repeat-hotfix.yml`
- 测试分支中的一次性候选构建 workflow
- `docs/CLIENT_SHOP_REPEAT_HOTFIX_DISPATCH_STATUS.json`
- 候选补丁脚本和临时状态文件

清理前必须保留可追溯的最终状态文档和正式 APK SHA-256。
