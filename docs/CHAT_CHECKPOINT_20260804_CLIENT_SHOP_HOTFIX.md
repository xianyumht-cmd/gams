# GAMS 客户端商城与外部浏览器问题检查点

更新时间：2026-08-04 04:25（UTC+8）  
任务编号：`GAMS-CLIENT-SHOP-HOTFIX-20260804`

## 一、用户实机反馈

当前使用的 `GG 2.0.3-stable`（versionCode 16）具备两个重要正向结果：

1. APK 启动时间已恢复正常，不再长时间等待。
2. 本轮测试未出现此前的业务页面白屏。

仍存在两个待解决问题：

1. GG 客户端能正常加载脚本并进入业务游戏，但模拟器会额外调用系统浏览器打开空白页。用户此前在 Android 11 真机测试时没有观察到这一现象。
2. 商城第一次购买成功后，无论继续购买第二件商品，还是退出商城回剧情再进入商城，都会跳到业务游戏的账号登录界面，表现为每次运行期间只能购买一次。

## 二、代码审查结论

### 2.1 外部浏览器空白页

当前稳定客户端的 `MainActivity` 对导航协议的分类过宽：所有非 `http/https` URI 都通过 `Intent.ACTION_VIEW` 交给安卓系统。

这会错误处理以下 WebView 内部或过渡 URI：

- `intent:`
- `about:blank`
- `javascript:`
- `data:`
- `blob:`

模拟器和不同 Android System WebView 版本可能以不同方式触发新旧 `shouldOverrideUrlLoading` 回调，因此 Android 11 真机没有复现，并不能排除当前代码缺陷。

候选修复采用协议白名单：

- `http/https`：仍在 GG WebView 内加载。
- `about/javascript/data/blob`：留给 WebView 内部处理。
- `intent`：明确拦截，不调起系统浏览器。
- 未知协议：明确拦截。
- `tel/mailto/sms/smsto`：作为真实系统功能保留外部调用。
- 同时实现新旧两种 `shouldOverrideUrlLoading` 回调。

### 2.2 商城只能购买一次

脚本 `remote-script/src/noname.js` 当前版本为 `1.1.4`，其中已经具备一次性购买回调和原始回调恢复逻辑：

- `__ggOneShotCallback`
- `__ggOriginalCallback`

Runtime 发布包仍为 `2.0.5`，包含该脚本修复。

问题在于恢复 `2.0.3-stable` Android 客户端时，页面完成后的控制脚本补注入和延迟重试一起被回退。商城页面切换或重新进入后，控制脚本可能没有重新建立完整状态，于是第二次购买落回官方登录流程。

候选修复恢复：

- 目标页面完成后的 `ensureControlScriptInjected`。
- 250 ms、1200 ms、3000 ms 延迟重试。
- `__GG_V2_CONTROL_LOADING__` 并发加载保护。
- 保留脚本 1.1.4 的一次性回调恢复。

## 三、白屏回归隔离原则

本轮没有恢复此前高风险的多窗口方案：

- `setSupportMultipleWindows(false)` 保持不变。
- 不实现 `onCreateWindow`。
- 不创建临时 popup WebView。
- 只使用当前主 WebView。

因此，本轮候选版不是简单恢复 2.0.5/2.0.6，而是把“导航协议处理”和“脚本补注入”从曾导致白屏的多窗口代码中拆出来。

## 四、候选 APK 构建结果

候选版本：

- versionName：`2.0.7-stable`
- versionCode：`17`
- packageName：`com.jinli.quickweb`
- protocolAppVersion：`12`
- APK SHA-256：`799124ed7b2b0347ebd387daec309a6982a4e62b8fa0a0a9042419a33e12972b`

GitHub Actions：

- workflow run ID：`30849473086`
- artifact ID：`8870025435`
- artifact 名：`GG-2.0.7-stable-client-shop-hotfix-candidate`
- artifact ZIP SHA-256：`54d19995c751402a474081f595f640c5785acd4ce001d8002a2a7795c07b1a5b`
- 预计过期：`2026-09-02T20:17:41Z`

已通过：

- 确定性补丁检查
- Android Release 编译
- Android Lint
- R8
- 正式 JKS 签名
- APK 签名验证
- 包名、versionCode、versionName 校验
- artifact 上传

## 五、重要未完成事项

### 5.1 尚未完成模拟器验收

必须按顺序验证：

1. 启动速度仍正常，且不重新白屏。
2. 不再调起系统浏览器空白页。
3. 商城内连续购买两个不同商品。
4. 返回剧情后重新进入商城，再购买第三个商品。

### 5.2 候选源码尚未提交到测试分支

测试分支：

`hotfix/client-shop-repeat-no-external-browser-20260804`

确定性补丁脚本已保存在分支，修正脚本提交：

`64d0fcb81227be14dc51cbbdcb10e8d163b4ff7e`

构建流程在 runner 中成功应用补丁并生成 APK，但最后推送时同时包含 `.github/workflows/v2-build-apks.yml`，GitHub App 因缺少 workflows 权限拒绝该推送。

因此必须准确区分：

- 候选 APK：已经成功构建并签名。
- 候选产品源码：尚未写回测试分支。
- 正式 main：尚未切换到 2.0.7。
- 2.0.7：尚未正式发布。

下一步通过后，应只把产品源码和状态文档写入测试分支，不要在同一次 Actions 推送中修改 workflow 文件。

## 六、下一步分支决策

### 四项全部通过

1. 用确定性补丁脚本重新生成产品源码。
2. 将 `MainActivity.java`、客户端 Gradle 版本和必要断言写回测试分支；workflow 修改由 GitHub contents API 单独处理，或不随产品提交。
3. 审查精确 diff，确保没有多窗口代码。
4. 合并或提升到 main。
5. 构建正式 APK 并发布。
6. 清理一次性 dispatcher、触发脚本和临时状态文件。

### 外部浏览器问题仍存在

先确认实际触发的 URI。只有代码和现有构建资源无法确定时，再生成一键日志捕获脚本，日志范围限制为：

- 新旧 WebView 导航回调
- URI scheme、host、是否主框架
- 是否调用 Android Intent
- 当前 WebView URL

不要先扩大拦截范围或重新引入 popup WebView。

### 重复购买仍失败

只记录：

- `__ggOneShotCallback` 安装与恢复
- `__ggOriginalCallback` 类型
- `__GG_V2_CONTROL_LOADED__`
- `__GG_V2_CONTROL_LOADING__`
- 页面 URL 和商城进入/退出时序

不要修改 License Worker、Runtime Worker、加密包或密钥。

### 候选版重新白屏

立即停止发布，覆盖安装回 `2.0.3-stable` code16，然后将导航修复与脚本补注入拆成两个独立候选，优先验证导航修复。

## 七、禁止误操作

本任务期间不要：

- 修改或轮换 `TOKEN_SIGNING_SECRET`。
- 修改或轮换 `RUNTIME_MASTER_KEY`。
- 修改 `LICENSE_ADMIN_PASSWORD`。
- 重新发布 Runtime 加密包。
- 修改 Cloudflare 域名或挑战规则。
- 恢复 `setSupportMultipleWindows(true)`。
- 恢复 `onCreateWindow` 或临时 popup WebView。
- 在模拟器验收前把 2.0.7 描述为正式版本。
