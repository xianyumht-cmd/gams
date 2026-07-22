# 当前官方页面与公共依赖基线

本目录只保存公共资源元数据和模块归属，不保存第三方完整 JavaScript 源码。

## 页面抓取

- 页面：`https://m.66rpg.com/h5/1690283?ohp=v3&quality=32`
- HTTP：`200`
- 最终地址：`https://m.66rpg.com/h5/1690283?ohp=v3&quality=32`
- 页面大小：`17377` 字节
- 页面 SHA-256：`4fc63140795c7eab5c17be37d465ba7f42c8858bd4dc94ca6d9f2bca382eb6e5`
- 脚本资源数：`12`

## 目标 Webpack 模块归属

| 模块 | 定义资源 | 引用资源 | 结论 |
|---:|---|---|---|
| 36728 | 未找到 | `https://c2.cgyouxi.com/website/hfplayer/v3/bin/official/game.js?v=202607090001` | 只找到引用；定义可能在未加载的公共 chunk 或运行时注入资源中 |
| 6886 | 未找到 | `https://c2.cgyouxi.com/website/hfplayer/v3/bin/official/game.js?v=202607090001` | 只找到引用；定义可能在未加载的公共 chunk 或运行时注入资源中 |
| 75640 | 未找到 | `https://c2.cgyouxi.com/website/hfplayer/v3/bin/official/game.js?v=202607090001` | 只找到引用；定义可能在未加载的公共 chunk 或运行时注入资源中 |

## 维护判断

- 模块定义资源变化：优先判断公共依赖或打包结构变化。
- 只有 game.js 哈希变化：优先判断引擎业务或生成版本变化。
- SALInterface.js 变化：优先复测登录、用户数据、存档、媒体、触摸和平台桥接。
- webGLLib.js 变化：优先复测白屏、Canvas/WebGL、纹理、视频和资源释放。
- 页面脚本清单变化：优先检查加载顺序和全局对象创建时机。

## 文件

- `snapshot.json`：完整机器可读快照。
- `resource-inventory.json`：每个脚本的 URL、HTTP、大小、哈希和角色。
- `dependency-module-map.json`：三个目标模块的定义与引用归属。
