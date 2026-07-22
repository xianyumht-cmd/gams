# 运行架构与调用关系笔记

## noname.js 职责链

```text
入口与页面判断
→ 运行时初始化
→ 官方 game.js 识别/替换
→ G 菜单与状态
→ 用户、商城、存储、XHR/JSONP 页面适配
```

| 符号 | 维护含义 | 出现次数 | 邻近符号 |
|---|---|---:|---|
| `STy4gr` | PC/H5 入口适配 | 36 | MInyap(21), pXBC4W(18), PwDi7Ry(14), DjkL_Q(12) |
| `MInyap` | 运行环境初始化 | 21 | STy4gr(18), DjkL_Q(13), pXBC4W(12), zjEv2f(12) |
| `DjkL_Q` | game.js 识别与替换 | 21 | MInyap(19), STy4gr(18), pXBC4W(18), zjEv2f(18) |
| `zjEv2f` | 页面数据和请求适配 | 38 | pXBC4W(20), DjkL_Q(17), MInyap(17), STy4gr(17) |
| `PwDi7Ry` | 用户状态适配 | 13 | pXBC4W(12), STy4gr(9), DjkL_Q(8), MInyap(7) |
| `pXBC4W` | G 菜单与交互界面 | 18 | zjEv2f(15), PwDi7Ry(13), STy4gr(13), DjkL_Q(12) |

邻近关系仅表示静态文本上接近，用来辅助定位，不等价于确定的函数调用边。

## game.js 职责链

```text
Webpack 入口 71269
├─ 依赖 36728
├─ 依赖 6886
└─ 依赖 75640
    ↓
SAL 平台接口
    ↓
用户/存储/商城/媒体/渲染/场景
```

当前版本文件只携带入口模块 `71269`，其余三个依赖由页面现有运行环境提供。因此更新时不仅要比较当前 `game.js`，也要同步保存页面加载的公共依赖脚本。

## 已确认的 V2 运行顺序

```text
授权和设备签名
→ 下载 AES-256-GCM 密文包
→ 原生内存解密 ZIP
→ document-start 注入 noname.js
→ WebView 请求 game.js
→ Android 原生层从内存返回 game.js
→ WebView 执行引擎
```
