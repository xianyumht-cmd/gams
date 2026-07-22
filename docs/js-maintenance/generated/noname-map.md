# noname.js 控制层地图

## 定位

`noname.js` 负责 G 菜单、入口适配、运行环境初始化、game.js 加载协调、页面对象适配、请求拦截和本地设置。

| 符号 | 含义 | 次数 | 首次行号 |
|---|---|---|---|
| STy4gr | PC/H5 入口适配 | 36 | 5330 |
| MInyap | 运行环境初始化 | 21 | 5882 |
| DjkL_Q | game.js 识别与替换 | 21 | 6117 |
| zjEv2f | 页面数据和请求适配 | 38 | 4624 |
| PwDi7Ry | 用户状态适配 | 13 | 6116 |
| pXBC4W | G 菜单与交互界面 | 18 | 6115 |

## 初始化顺序

```text
读取本地设置
→ 判断 PC/H5 页面
→ 初始化运行环境
→ 识别并替换官方 game.js
→ 创建 G 菜单
→ 安装用户、商城、XHR/JSONP 等页面适配
```

## 易失效点

- 官方 game.js 的 URL、script 节点和加载时机。
- `userData`、`mallViewData` 等对象的出现时机。
- XHR/JSONP 路径、参数和响应字段。
- localStorage 键名和存档格式。
- WebView document-start 注入能力。

## 存储键候选

- `config`
- `flower`
- `save`
- `tempFlower`
