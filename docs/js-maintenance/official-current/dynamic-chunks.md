# 动态公共 chunk 解析结果

本报告递归扫描官方页面、内联启动脚本和允许域名内的 JavaScript 引用。完整源码不会写入仓库。

- 抓取资源：`22` 个
- 内联脚本：`4` 个
- 新发现脚本 URL：`22` 个

## 三个目标模块

| 模块 | 外部定义位置 | 内联定义位置 | 引用位置 | 判断 |
|---:|---|---|---|---|
| 36728 | 未找到 | 未找到 | `https://c2.cgyouxi.com/website/hfplayer/v3/bin/official/game.js?v=202607090001` | 仍只有引用；定义不在当前可见资源图中 |
| 6886 | 未找到 | 未找到 | `https://c2.cgyouxi.com/website/hfplayer/v3/bin/official/game.js?v=202607090001` | 仍只有引用；定义不在当前可见资源图中 |
| 75640 | 未找到 | 未找到 | `https://c2.cgyouxi.com/website/hfplayer/v3/bin/official/game.js?v=202607090001` | 仍只有引用；定义不在当前可见资源图中 |

## 维护结论

- 当前官方 game.js 与修改版 game.js 都引用相同的三个模块，说明它们属于播放器公共构建依赖，而非 V2 新增逻辑。
- 页面显式脚本、内联脚本和递归发现资源应分别保存哈希，后续更新时可快速定位变化层。
- 递归扫描后仍未找到模块定义；高度可能由 Webpack 运行时预置、浏览器缓存的公共基础包、或按运行条件动态注入的未公开 chunk 提供。
- 下一步应在真实浏览器中记录 performance.getEntriesByType('resource') 与 webpack 模块注册表，而不是继续猜文件名。
