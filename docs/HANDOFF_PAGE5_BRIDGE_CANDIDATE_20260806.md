# 第五页兼容修复与独立测试包交接（2026-08-06）

## 当前结论

第二文件的两处最小兼容修改已落在干净实现分支：

- 分支：`fix/page5-missing-constructor-mobile-bridge-20260806`
- 目标文件：`game-engine/release/game-1.0.5.js`
- 修改数量：2 处
- 修改后大小：`11590615` 字节
- 修改后 SHA-256：`9a5f9573077eaedada060ed4aeb3ea4307222ca29d4f10fd05fdb922d52d8fca`

生产默认分支、生产默认运行通道和 Android 客户端主体均未修改。

## 浏览器证据

### 五页回归

状态文件：`docs/FIVE_PAGE_MISSING_CONSTRUCTOR_MATRIX_STATUS.json`

- 10 个 current/candidate 案例完成
- 前四页 candidate 保持通过
- 第五页 candidate 产生目标列表请求
- candidate 页面错误：0
- 写请求：0

### 重复与重新进入

状态文件：`docs/PAGE5_REPEAT_REENTRY_MATRIX_STATUS.json`

- 第一次打开目标列表：通过
- 返回后第二次打开目标列表：通过
- 完整重新进入页面后的第三次打开：通过
- 两次返回后入口均恢复可见、可点击
- 页面错误：0
- 写请求：0
- 外部导航：0

两份浏览器报告的 candidate 文件 SHA-256 均为：

`9a5f9573077eaedada060ed4aeb3ea4307222ca29d4f10fd05fdb922d52d8fca`

与实现分支实际落盘文件完全一致。

## 独立测试包

- APK：`GG-2.0.13-page5-bridge-code24.apk`
- versionCode：`24`
- APK SHA-256：`a55a479298ca498443838afdb6904fce21f8113cb24a446edc5d1a1dc1a9e85a`
- 独立运行版本：`2.0.9-page5-bridge-c1`
- 独立运行分支：`candidate-page5-bridge-20260806`
- 构建状态：`docs/PAGE5_BRIDGE_CANDIDATE_STATUS.json`

构建、运行包校验、独立通道校验、客户端隔离、APK 签名与 APK 校验全部通过。

## 隔离保证

- Android `MainActivity` 未修改
- 客户端网络主机配置未修改
- 生产默认通道未修改
- 未完成任何支付
- 未提交任何订单写请求
- 未合并到 `main`

## 下一步验收

必须在用户此前复现问题的同一设备上安装 code24 测试包并完成：

1. 打开第五页目标列表；
2. 返回后再次打开；
3. 完整退出该页面并重新进入后第三次打开；
4. 同时抽查前四页入口；
5. 确认没有白屏、跳出客户端或重复打开失效。

只有同设备验收通过后，才可把重复缺陷标记为已修复，并进入清理测试脚手架、正式分支复验和合并评估。
