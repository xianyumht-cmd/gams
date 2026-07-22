# 修改版与当前官方版维护差异

> 重要：两份文件不是同一官方构建日期。本报告只能说明当前观察到的差异，不能把所有差异认定为自定义修改。

## 基线

| 项目 | 修改版 1.0.2 | 当前官方版 |
|---|---:|---:|
| 大小 | 11589175 | 15372213 |
| 简单字符串重组 | 759280 | 775294 |
| 直接 SAL | 122 | 148 |
| 重组后 SAL | 150 | 150 |

## SAL 差异

- 修改版独有：`0` 个。
- 当前官方独有：`0` 个。
- 共有：`150` 个。

### 修改版独有 SAL

无

### 当前官方独有 SAL

无

## 分类字段变化

### identityAndLogin

| 字段 | 修改版 | 当前官方 | 差值 |
|---|---:|---:|---:|
| `uid` | 160 | 156 | +4 |
| `guid` | 18 | 13 | +5 |
| `pver` | 4 | 2 | +2 |
| `isLogin` | 27 | 34 | -7 |
| `userData` | 261 | 201 | +60 |
| `token` | 126 | 119 | +7 |
| `open_id` | 1 | 2 | -1 |

### flowerAndValue

| 字段 | 修改版 | 当前官方 | 差值 |
|---|---:|---:|---:|
| `totalFlower` | 9 | 0 | +9 |
| `freshFlower` | 7 | 3 | +4 |
| `wildFlower` | 5 | 0 | +5 |
| `tempFlower` | 8 | 0 | +8 |
| `realFlower` | 18 | 0 | +18 |
| `haveFlower` | 3 | 3 | +0 |
| `flowerCount` | 12 | 12 | +0 |

### mallAndOrder

| 字段 | 修改版 | 当前官方 | 差值 |
|---|---:|---:|---:|
| `mallViewData` | 104 | 107 | -3 |
| `itemPrice` | 151 | 148 | +3 |
| `goods` | 95 | 100 | -5 |
| `goods_id` | 19 | 23 | -4 |
| `order_id` | 7 | 5 | +2 |
| `buy_num` | 9 | 10 | -1 |
| `createBuyOrder` | 6 | 4 | +2 |
| `get_goods_list` | 6 | 4 | +2 |

### saveAndSettings

| 字段 | 修改版 | 当前官方 | 差值 |
|---|---:|---:|---:|
| `saveData` | 118 | 112 | +6 |
| `SaveData` | 144 | 136 | +8 |
| `SaveFileList` | 25 | 23 | +2 |
| `SaveFileIndex` | 9 | 10 | -1 |
| `SysSave` | 10 | 10 | +0 |
| `showLocal` | 24 | 16 | +8 |
| `localStorage` | 11 | 13 | -2 |
| `sessionStorage` | 5 | 5 | +0 |

### renderAndMedia

| 字段 | 修改版 | 当前官方 | 差值 |
|---|---:|---:|---:|
| `Canvas` | 44 | 48 | -4 |
| `WebGL` | 0 | 0 | +0 |
| `requestAnimationFrame` | 1048 | 331 | +717 |
| `Audio` | 516 | 530 | -14 |
| `Video` | 111 | 116 | -5 |
| `SAL_preload` | 54 | 55 | -1 |
| `SAL_getTextureList` | 6 | 5 | +1 |

### networkAndPlatform

| 字段 | 修改版 | 当前官方 | 差值 |
|---|---:|---:|---:|
| `XMLHttpRequest` | 3 | 5 | -2 |
| `JSONP` | 24 | 20 | +4 |
| `SAL_request` | 13 | 13 | +0 |
| `SAL_Login` | 9 | 9 | +0 |
| `SAL_getUserData` | 4 | 4 | +0 |
| `SAL_getStorage` | 25 | 25 | +0 |
| `SAL_setStorage` | 21 | 21 | +0 |

### securityAndDiagnostics

| 字段 | 修改版 | 当前官方 | 差值 |
|---|---:|---:|---:|
| `disable-devtool` | 3 | 2 | +1 |
| `crack_user` | 35 | 41 | -6 |
| `openDebugger` | 4 | 4 | +0 |
| `DEVTOOL` | 3 | 2 | +1 |
| `debugger` | 2 | 0 | +2 |
| `console.clear` | 0 | 0 | +0 |

## 地址和路径

- 修改版独有规范化 URL：`0`。
- 当前官方独有规范化 URL：`2`。
- 修改版独有接口路径锚点：`2`。
- 当前官方独有接口路径锚点：`3`。

详细列表保存在同目录的 JSON 中，避免文档被大量混淆字符串淹没。

## 维护解释

1. `noname.js` 明确依赖的用户、商城和存储字段，应优先与这份差异表交叉检查。
2. 修改版独有字段不一定是自定义新增，也可能来自较旧官方版本。
3. 当前官方独有 SAL 通常代表平台能力扩展，应评估修改版是否缺少兼容分支。
4. 出现次数突变比单纯存在/不存在更值得关注，它可能表示对象层级或初始化流程重写。
5. 在找到对应历史官方文件前，不生成自动补丁，也不把差异直接应用到稳定版本。
