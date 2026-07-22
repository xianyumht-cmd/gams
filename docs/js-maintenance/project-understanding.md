# GG JavaScript 项目理解总览

## 1. 当前系统不是一个单独脚本

当前可运行系统由四层组成：

```text
Android V2
├─ 激活码、设备身份、APK 证书和请求签名
├─ 下载 AES-256-GCM 加密运行包
├─ 仅在内存中解密 noname.js 和 game.js
└─ 向 WebView 注入/提供脚本
        ↓
noname.js 1.1.1
├─ G 菜单和用户交互
├─ 页面入口与加载顺序
├─ game.js 请求替换
├─ 用户、商城和存储对象适配
└─ XHR/JSONP 页面请求适配
        ↓
game.js 1.0.2
├─ Webpack 入口模块 71269
├─ 外部依赖 36728、6886、75640
├─ 150 个 SAL 平台接口
├─ 场景、渲染、音视频和资源
├─ 用户、商城、订单和存档
└─ 网络、统计、完整性和调试检测
        ↓
目标网页及其公共依赖
```

Android V2 解决的是交付安全和缓存泄露问题；业务运行方式仍然是 WebView 执行两份 JavaScript。

## 2. noname.js 的真实职责

### 2.1 入口与加载协调

已识别的主要控制对象：

| 符号 | 维护含义 |
|---|---|
| `STy4gr` | PC/H5 页面入口适配 |
| `MInyap` | 运行环境和全局对象初始化 |
| `DjkL_Q` | 官方 game.js 识别、替换和加载协调 |
| `pXBC4W` | G 菜单、拖动、全屏、提示和功能开关 |
| `zjEv2f` | 页面数据、商城和请求适配 |
| `PwDi7Ry` | 用户状态和用户数据适配 |

这些混淆符号可用于当前版本定位，但后续更新必须同时依赖行为锚点，不能只依赖名称。

### 2.2 已确认的内部行为锚点

简单字符串重组后识别出以下可读名称：

- `applyUserDataAccessors`
- `createUserDataSnapshot`
- `hookCurrentUserData`
- `getUserDataValue`
- `getUserId`
- `patchMallViewData`
- `buildCreateOrderResponse`
- `getFlowerCount`
- `getNumberStorage`
- `initStorageHook`
- `createBuyOrder`
- `get_goods_list`

它们说明 noname.js 并非只负责显示菜单，而是承担了页面对象适配、状态快照、商城数据适配、订单响应处理和本地设置等职责。

### 2.3 初始化顺序

```text
读取本地设置
→ 判断页面入口和播放器路径
→ 初始化运行环境
→ 识别并替换 game.js
→ 创建 G 菜单
→ 安装用户数据适配
→ 安装商城/订单适配
→ 安装 XHR、JSONP 和存储适配
```

后续若菜单存在但功能不生效，优先检查“目标对象出现时机”，而不是先怀疑菜单代码。

## 3. game.js 的真实职责

### 3.1 文件结构

- 版本：`1.0.2`
- 大小：`11,589,175` 字节
- SHA-256：`51ae52887d0c0475870e4c985edf747a14672f0908221779826934f37b73db43`
- Webpack 文件内入口模块：`71269`
- 直接依赖：`36728`、`6886`、`75640`
- 简单字符串拼接重组：约 `759,280` 处
- SAL 标识符：直接识别 122 个，重组后 150 个

当前文件并不包含所有依赖模块；三个依赖由页面公共运行环境提供。因此只保存 game.js 还不够，官方更新时必须同步保存页面公共脚本和依赖版本。

### 3.2 SAL 平台层

150 个 SAL 接口覆盖：

- 触摸、点击、鼠标和输入；
- 元素创建、位置、尺寸、透明度、裁剪和动画；
- Canvas、纹理、截图和资源尺寸；
- 音频、视频、录制和预加载；
- Storage、用户数据、登录、签名和系统信息；
- 网络请求、上传、消息和统计；
- 支付、充值、广告和分享；
- 定时器、日志、调试、退出和垃圾回收。

这意味着 game.js 是完整播放器/运行引擎，不适合整体迁到普通后端执行。

### 3.3 核心业务区域

字符串重组后，以下字段在 game.js 中大量出现：

| 字段 | 重组后出现次数 | 说明 |
|---|---:|---|
| `userData` | 261 | 用户状态主对象 |
| `uid` | 160 | 用户身份字段 |
| `mallViewData` | 104 | 商城视图和商品状态 |
| `itemPrice` | 151 | 商品价格和显示逻辑 |
| `saveData` | 118 | 存档和状态保存 |
| `goods` | 95 | 商品数据 |
| `JSONP` | 24 | 旧式跨域请求路径 |
| `createBuyOrder` | 6 | 订单创建动作 |
| `get_goods_list` | 6 | 商品列表动作 |

这些字段是后续版本差异中最重要的行为锚点。

## 4. 网络与平台接口

重组后确认的重点路径包括：

- `PropShop/engine/v2/PropOrder/createBuyOrder`
- `PropShop/engine/v5/Game/get_goods_list`
- `PropShop/engine/v5/user/getUserHaveAllPropNum`
- `PropShop/engine/v5/user/getMyAccountMoney`
- `PropShop/engine/v5/user/getMyIsHave`
- `PropShop/engine/v5/user/game_flower_by_me`
- `PropShop/engine/v5/game/get_user_rank_index`
- `PropShop/engine/v5/user/get_global_cfg`
- `PropShop/engine/v5/user/set_global_cfg`
- `PropShop/engine/v5/user/get_sign_in_days`
- `PropShop/engine/v5/user/record_sign_in_days`
- `/ajax/report/report_user_data`
- `/api/oweb_log.php`
- `/api/v3/oapi_map.php`

维护时应记录方法、参数和响应结构，不能只记录路径。

## 5. 完整性、调试与统计

重组后发现：

- `SAL_openDebugger`
- `DebugLib`、`Debugger`、`DEBUG`
- `disable-devtool` 相关页面地址
- `crack_user` 相关地址
- 多个统计和用户数据上报路径

因此出现“仅调试环境白屏”“开发者工具打开后跳转”“部分设备被异常识别”时，应把完整性/调试检测作为独立故障层检查，而不是混入业务功能排查。

## 6. 当前最容易失效的六个位置

1. **页面入口和播放器 URL**：H5 路径、官方 game.js 地址和脚本节点结构。
2. **Webpack 外部依赖**：36728、6886、75640 或页面公共库版本变化。
3. **SAL 接口**：名称、参数或实现发生变化。
4. **用户与商城对象**：`userData`、`mallViewData`、`itemPrice` 等结构变化。
5. **接口响应**：商品、订单、用户拥有状态和存档返回格式变化。
6. **加载时机**：对象从同步创建变为异步创建，导致 Hook 安装过早或过晚。

## 7. 正确的维护判断方式

```text
V2 是否取得并解密运行包
→ noname.js 是否 document-start 注入
→ game.js 请求是否被内存拦截
→ Webpack 入口是否正常执行
→ SAL 是否完整存在
→ userData/mallViewData 是否出现
→ 网络路径和响应结构是否变化
→ 单个字段或功能是否变化
```

不要在一个版本中同时修改多个层级，否则无法判断真正原因。

## 8. 当前分析的边界

已完成：

- 精确版本、大小、哈希和文件边界；
- 入口模块和外部依赖；
- 150 个 SAL 接口；
- 简单字符串拼接还原；
- 主要用户、商城、订单、存档和媒体锚点；
- noname.js 控制对象和邻近关系；
- 网络路径、反调试和统计入口；
- 故障诊断与更新流程。

尚未完成：

- RC4/数组索引字符串解码器的全部运行时字符串；
- 外部依赖模块 36728、6886、75640 的完整源码地图；
- 修改版 1.0.2 对应的同版本官方历史原文件；
- 每个功能在真实页面中的调用顺序和实际参数结构；
- 所有作品版本之间的差异。

因此当前已经足够支持快速定位大多数更新故障，但还不能声称完整还原了全部源码。
