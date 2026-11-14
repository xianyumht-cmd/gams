# 临时发布进度：紧凑悬浮面板

更新时间：2026-08-07 10:18 +08:00

状态：**已完成并发布临时版本**

## 本次只处理

- 修复悬浮面板内容显示不全。
- 面板启用稳定的纵向触摸滚动。
- 功能项改为两列紧凑小卡片。
- 功能按钮缩小到约 28px 高度。
- 同步缩小标题、说明、图标、间距和底部说明。
- 保留原悬浮球、原面板节点和原点击事件。
- 不在 APK 运行时重建 UI，不增加全局 DOM 观察器。

## 已发布版本

- 包名：`com.jinli.quickweb`
- versionName：`2.0.24-compact-panel-temp`
- versionCode：`104`
- APK 文件：`GG-2.0.24-compact-panel-temp-code104.apk`
- APK 大小：`96198` 字节
- APK SHA-256：`195650700d8bd44406c984ddf7f25e54164011e5e8203cfead3f27f56fa6d1c9`
- GitHub Actions 运行编号：`31140656760`
- GitHub Actions 产物编号：`8979695614`

## 已发布运行包

- 运行包版本：`2.0.11-compact-panel-v6`
- `noname.js` 大小：`349285` 字节
- `noname.js` SHA-256：`ad687df5d2af684131e3fa093e1bd37c8ffbbe299c83512a174c545d37e765be`
- `game.js` 大小：`11590659` 字节
- `game.js` SHA-256：`57765fbb8d9a0529ed1463623f1bed9c05052e76396a6aaa89fdd2ecc673bc72`
- 加密运行包大小：`3908072` 字节
- 加密运行包 SHA-256：`250b9d89c60d134ac5418dac7b66b59cd337e47715c2c5329e147cf33f9e9408`
- 源文件：`remote-script/src/noname.js`

## 明确未解决

商城购买相关问题仍未解决。

当前判断：问题根源不在 APK，而在 `noname.js` 与 `game-engine/release/game-1.0.5.js` 的业务执行配合、请求回调或页面状态链中。此次临时版本没有继续修改购买逻辑，后续应单独分析和修复这两个 JS 文件。

## 发布口径

本版本仅作为“悬浮面板布局和滚动修复”的临时可用版本发布，不得标记为商城购买问题已修复。
