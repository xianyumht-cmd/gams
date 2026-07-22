# noname.js 函数级行为图

本报告由 AST 静态分析生成，只记录函数边界、调用关系和行为标签，不复制函数全文。

## 基线

- 文件：`remote-script/src/noname.js`
- 字节：`331550`
- SHA-256：`5898ad5db1a3f66dfceb51b36addaf49d49b26596acdb58162caa1a3c6876917`
- 行数：`10269`
- 函数节点：`446`
- 调用图边：`907`
- 顶层调用：`1057`

## 已知核心函数

| 函数 | 职责 | 行范围 |
|---|---|---|
| `STy4gr` | PC/H5入口适配 | 6250-6317<br>8094-8119<br>8972-9079 |
| `MInyap` | 运行环境初始化 | 6318-6353<br>8120-8128 |
| `DjkL_Q` | game.js识别与替换 | 6354-6379<br>8129-8137 |
| `zjEv2f` | 页面数据和请求适配 | 6400-6407<br>8157-8160 |
| `PwDi7Ry` | 用户状态适配 | 6380-6388<br>8138-8148 |
| `pXBC4W` | G菜单与交互界面 | 6389-6399<br>8149-8156 |
| `applyUserDataAccessors` | 用户数据访问器 | 未定义 |
| `createUserDataSnapshot` | 用户数据快照 | 未定义 |
| `hookCurrentUserData` | 当前用户对象挂接 | 未定义 |
| `patchMallViewData` | 商城视图数据适配 | 9718-9732 |
| `buildCreateOrderResponse` | 订单响应结构构造 | 未定义 |
| `initStorageHook` | 存储适配初始化 | 未定义 |
| `getFlowerCount` | 鲜花数值读取 | 未定义 |
| `getUserId` | 用户标识读取 | 未定义 |

## 顶层初始化根

| 函数 | 行 | 说明 |
|---|---|---|
| `RKzKwGi` | 1313 | - |
| `nLH36v` | 1933 | - |
| `XBbHBMQ` | 3238 | - |
| `hwyqahb` | 4267 | - |
| `hwyqahb` | 4266 | - |
| `XBbHBMQ` | 4437 | - |
| `XBbHBMQ` | 5566 | - |
| `XBbHBMQ` | 6152 | - |
| `XBbHBMQ` | 6292 | - |
| `XBbHBMQ` | 6893 | - |
| `XBbHBMQ` | 7896 | - |
| `XBbHBMQ` | 7839 | - |

## 分类索引

### ui

| 函数 | 起始行 | 得分 | 说明 |
|---|---|---|---|
| `callback:call@415` | 4270 | 132 | - |
| `callback:call@427` | 9908 | 78 | - |
| `callback:call@437` | 10090 | 55 | - |
| `anonymous@387` | 9577 | 37 | - |
| `injectStyle` | 9916 | 36 | - |
| `renderReadablePanel` | 10012 | 29 | - |
| `anonymous@382` | 9535 | 22 | - |
| `injectViewportStyle` | 10097 | 22 | - |
| `createSwitchItem` | 9146 | 12 | - |
| `start` | 10208 | 12 | - |
| `anonymous@375` | 9303 | 10 | - |
| `callback:zCSo6J@392` | 9680 | 10 | - |
| `init` | 9679 | 10 | - |
| `anonymous@350` | 9088 | 7 | - |
| `applyViewportLimit` | 10178 | 7 | - |

### engineLoading

| 函数 | 起始行 | 得分 | 说明 |
|---|---|---|---|
| `callback:call@445` | 10231 | 38 | - |
| `callback:call@415` | 4270 | 9 | - |
| `document` | 9830 | 5 | - |
| `anonymous@412` | 9828 | 5 | - |
| `rewriteScriptNode` | 10246 | 4 | - |
| `set` | 10257 | 4 | - |
| `callback:call@427` | 9908 | 3 | - |
| `set` | 9841 | 2 | - |
| `injectStyle` | 9916 | 2 | - |
| `isLegacyEngineUrl` | 10236 | 2 | - |
| `Element.prototype.setAttribute` | 10261 | 2 | - |
| `Node.prototype.appendChild` | 10266 | 2 | - |
| `Node.prototype.insertBefore` | 10268 | 2 | - |
| `get` | 9873 | 1 | - |
| `callback:forEach@421` | 10046 | 1 | - |

### userState

| 函数 | 起始行 | 得分 | 说明 |
|---|---|---|---|
| `callback:call@415` | 4270 | 5 | - |
| `callback:RKzKwGi@245` | 7302 | 1 | - |
| `anonymous@246` | 7261 | 1 | - |
| `anonymous@404` | 9766 | 1 | - |

### mallOrder

| 函数 | 起始行 | 得分 | 说明 |
|---|---|---|---|
| `callback:call@415` | 4270 | 17 | - |
| `anonymous@394` | 9696 | 6 | - |
| `patchMallViewData` | 9718 | 5 | 商城视图数据适配 |
| `anonymous@403` | 9751 | 4 | - |
| `callback:vUYe8N.0.goods@397` | 9726 | 2 | - |
| `set` | 9841 | 2 | - |
| `document` | 9830 | 2 | - |
| `anonymous@412` | 9828 | 2 | - |
| `window.Epe456s` | 9854 | 1 | - |

### storage

| 函数 | 起始行 | 得分 | 说明 |
|---|---|---|---|
| `callback:call@415` | 4270 | 12 | - |
| `OFlPNa` | 3404 | 4 | - |
| `PwdGxxY` | 3370 | 4 | - |
| `l3DSDc` | 3366 | 4 | - |
| `pw0zF4` | 7104 | 4 | - |
| `pw0zF4` | 7100 | 4 | - |
| `callback:RKzKwGi@229` | 7095 | 4 | - |
| `callback:RKzKwGi@230` | 7049 | 4 | - |
| `init` | 6904 | 4 | - |
| `load` | 4340 | 2 | - |
| `save` | 4469 | 2 | - |
| `getNumberStorage` | 4844 | 2 | - |
| `callback:this@385` | 9630 | 2 | - |
| `callback:this.createActionItem@386` | 9626 | 2 | - |
| `anonymous@387` | 9577 | 2 | - |

### network

| 函数 | 起始行 | 得分 | 说明 |
|---|---|---|---|
| `callback:call@415` | 4270 | 8 | - |
| `anonymous@407` | 9782 | 4 | - |
| `anonymous@309` | 8456 | 2 | - |
| `anonymous@323` | 8580 | 1 | - |
| `anonymous@387` | 9577 | 1 | - |

### lifecycle

| 函数 | 起始行 | 得分 | 说明 |
|---|---|---|---|
| `callback:call@415` | 4270 | 12 | - |
| `callback:call@437` | 10090 | 9 | - |
| `reinforceAfterInteraction` | 10201 | 5 | - |
| `callback:call@427` | 9908 | 4 | - |
| `start` | 10208 | 4 | - |
| `anonymous@360` | 9289 | 3 | - |
| `anonymous@375` | 9303 | 3 | - |
| `waitForBody` | 5277 | 2 | - |
| `pw0zF4` | 8435 | 2 | - |
| `init` | 8433 | 2 | - |
| `STy4gr` | 8972 | 2 | PC/H5入口适配 |
| `callback:vUYe8N.0@346` | 8851 | 2 | - |
| `anonymous@347` | 8847 | 2 | - |
| `callback:setTimeout@359` | 9294 | 2 | - |
| `l3DSDc` | 9428 | 2 | - |

### compatibility

| 函数 | 起始行 | 得分 | 说明 |
|---|---|---|---|
| `callback:call@445` | 10231 | 24 | - |
| `callback:call@415` | 4270 | 6 | - |
| `_compress` | 1616 | 5 | - |
| `callback:call@25` | 1323 | 5 | - |
| `RKzKwGi` | 1313 | 4 | - |
| `callback:forEach@401` | 9734 | 4 | - |
| `anonymous@402` | 9733 | 4 | - |
| `Element.prototype.setAttribute` | 10261 | 2 | - |
| `Node.prototype.appendChild` | 10266 | 2 | - |
| `Node.prototype.insertBefore` | 10268 | 2 | - |
| `anonymous@94` | 4756 | 1 | - |
| `anonymous@407` | 9782 | 1 | - |
| `isLegacyEngineUrl` | 10236 | 1 | - |

## 使用方法

1. 功能失效时先根据分类索引定位候选函数。
2. 查看 JSON 中该函数的 `internalCalls`、`platformCalls`、`stableStrings` 和 `assignedMembers`。
3. 更新后重新生成报告，比较函数边界、调用边和行为标签变化。
4. 混淆函数名可能变化；稳定字符串、平台 API 和数据字段比名称更可靠。
5. AST 图说明代码依赖，不代表某个分支一定在真实页面中执行。
