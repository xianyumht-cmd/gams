# noname.js 计算属性与对象方法解析

本报告对 AST 第一版中的计算属性名进行静态字符串求值，将可解析的匿名方法还原为 `对象.方法`。

## 摘要

- 函数节点：`446`
- 已解析对象方法：`94`
- 名称映射改进：`72`
- 解析后调用边：`1065`
- 对象拥有者：`33`
- 有维护意义的函数：`65`

## 主要对象

| 对象 | 方法数 | 部分方法 |
|---|---|---|
| `pXBC4W` | 20 | `togglePanel`, `isPrimaryPointer`, `clamp`, `getDragThreshold`, `getViewportSize`, `initPosition`, `getPanelHeight`, `updateFloatingLayout`, `bindDrag`, `ensureStyle`, `createSwitchItem`, `showCustomToast` |
| `zjEv2f` | 10 | `getRuntimeHookScript`, `syncRuntimeState`, `encryptValue`, `patchMallViewData`, `initStorageHook`, `buildCreateOrderResponse`, `patchGameFlowUrl`, `initXhrHook`, `initJsonpHook`, `init` |
| `zCSo6J` | 8 | `isH5Page`, `getPcGameId`, `getNumberStorage`, `padZero`, `generateTimestamp`, `getUserId`, `getFlowerCount`, `waitForBody` |
| `PwDi7Ry` | 5 | `createUserDataSnapshot`, `getUserDataValue`, `applyUserDataAccessors`, `hookCurrentUserData`, `init` |
| `nLH36v.a` | 4 | `compressToBase64`, `decompressFromBase64`, `decompressFromUint8Array`, `_compress` |
| `DjkL_Q` | 4 | `isOfficialGameScript`, `patchScript`, `patchNode`, `init` |
| `callback:this` | 4 | `createActionItem@384`, `createActionItem@386`, `showCustomPrompt@385`, `addEventListener@405` |
| `OzmI2P` | 3 | `_CZGtyi`, `pHmbzs`, `XMZhud` |
| `PwdGxxY` | 3 | `load`, `save`, `set` |
| `callback:vUYe8N` | 3 | `sort@91`, `sort@236`, `addEventListener@346` |
| `MInyap` | 3 | `buildCidian`, `createWclState`, `init` |
| `vUYe8N.zh1cKO` | 2 | `sgVvUPz`, `p9eqkvZ` |
| `vUYe8N.r4ly3O0` | 2 | `hzgps6`, `ovQncE_` |
| `a6eGvWL` | 2 | `BemeWF9`, `wXlSnTk` |
| `Oftxw5` | 2 | `onmouseover`, `onmouseout` |
| `Node.prototype` | 2 | `appendChild`, `insertBefore` |
| `callback:nLH36v.a` | 1 | `_decompress@10` |
| `callback:mBjRt_` | 1 | `forEach@13` |
| `thm0Ww` | 1 | `SOC1Js` |
| `module` | 1 | `exports` |
| `STy4gr` | 1 | `init` |
| `vUYe8N` | 1 | `a` |
| `callback:this.featureKeys` | 1 | `forEach@383` |
| `callback:pw0zF4` | 1 | `addEventListener@388` |
| `callback:window` | 1 | `addEventListener@390` |
| `callback:zCSo6J` | 1 | `waitForBody@392` |
| `callback:vUYe8N.goodList.goods` | 1 | `forEach@397` |
| `XMLHttpRequest.prototype` | 1 | `open` |
| `window` | 1 | `Epe456s` |
| `document` | 1 | `createElement` |

## 重点方法

| 方法 | 行范围 | 分类 | 副作用 |
|---|---|---|---|
| `zCSo6J.getUserId` | 5015-5228 | - | - |
| `zCSo6J.getFlowerCount` | 5229-5276 | - | - |
| `STy4gr.init` | 5333-5882 | - | - |
| `MInyap.init` | 6029-6632 | - | - |
| `DjkL_Q.init` | 6904-7258 | ui, storage | readsOrWritesStorage |
| `PwDi7Ry.createUserDataSnapshot` | 7261-7398 | userState | - |
| `PwDi7Ry.applyUserDataAccessors` | 7480-7725 | - | - |
| `PwDi7Ry.hookCurrentUserData` | 7726-8432 | - | - |
| `PwDi7Ry.init` | 8433-8440 | lifecycle | schedulesWork |
| `pXBC4W.toggleFullscreen` | 9464-9534 | ui | - |
| `pXBC4W.createPanel` | 9577-9640 | ui, storage, network | modifiesDom, readsOrWritesStorage |
| `pXBC4W.createButton` | 9641-9659 | ui | - |
| `pXBC4W.setupFloatingWindow` | 9660-9678 | ui | - |
| `pXBC4W.init` | 9679-9692 | ui | modifiesDom |
| `zjEv2f.getRuntimeHookScript` | 9696-9701 | mallOrder | - |
| `zjEv2f.syncRuntimeState` | 9702-9714 | - | - |
| `zjEv2f.patchMallViewData` | 9718-9732 | mallOrder | - |
| `zjEv2f.initStorageHook` | 9733-9750 | compatibility | modifiesPrototype |
| `zjEv2f.buildCreateOrderResponse` | 9751-9765 | mallOrder | - |
| `zjEv2f.patchGameFlowUrl` | 9766-9781 | userState | - |
| `zjEv2f.initXhrHook` | 9782-9827 | network, compatibility | interceptsNetwork, modifiesPrototype |
| `zjEv2f.initJsonpHook` | 9828-9881 | engineLoading, ui, mallOrder | - |
| `zjEv2f.init` | 9882-9887 | - | - |
| `vLsxqxg.init` | 9890-9902 | lifecycle | - |
| `start` | 10074-10078 | ui | - |
| `start` | 10208-10225 | ui, lifecycle | schedulesWork |
| `isLegacyEngineUrl` | 10236-10244 | engineLoading, compatibility | touchesNavigation |
| `rewriteScriptNode` | 10246-10250 | engineLoading | redirectsScript |

## 维护相关方法索引

| 方法 | 行范围 | 分类 |
|---|---|---|
| `callback:call@25` | 1323-1916 | compatibility |
| `callback:call@415` | 4270-9905 | ui, mallOrder, storage, lifecycle |
| `PwdGxxY.load` | 4340-4468 | ui, storage |
| `PwdGxxY.save` | 4469-4570 | storage |
| `zCSo6J.getNumberStorage` | 4844-4918 | ui, storage |
| `zCSo6J.getUserId` | 5015-5228 | - |
| `zCSo6J.getFlowerCount` | 5229-5276 | - |
| `zCSo6J.waitForBody` | 5277-5330 | lifecycle, ui |
| `STy4gr.init` | 5333-5882 | - |
| `MInyap.createWclState` | 5967-6028 | - |
| `MInyap.init` | 6029-6632 | - |
| `DjkL_Q.isOfficialGameScript` | 6635-6680 | - |
| `DjkL_Q.patchScript` | 6681-6733 | - |
| `DjkL_Q.patchNode` | 6734-6903 | ui |
| `DjkL_Q.init` | 6904-7258 | ui, storage |
| `PwDi7Ry.createUserDataSnapshot` | 7261-7398 | userState |
| `PwDi7Ry.getUserDataValue` | 7399-7479 | - |
| `PwDi7Ry.applyUserDataAccessors` | 7480-7725 | - |
| `PwDi7Ry.hookCurrentUserData` | 7726-8432 | - |
| `PwDi7Ry.init` | 8433-8440 | lifecycle |
| `pXBC4W.togglePanel` | 8456-8458 | network |
| `pXBC4W.getViewportSize` | 8473-8521 | ui |
| `pXBC4W.initPosition` | 8522-8579 | - |
| `pXBC4W.getPanelHeight` | 8580-8686 | ui, network |
| `pXBC4W.ensureStyle` | 9088-9145 | ui |
| `pXBC4W.createSwitchItem` | 9146-9288 | ui |
| `pXBC4W.showCustomToast` | 9289-9302 | ui, lifecycle |
| `pXBC4W.getFullscreenElement` | 9461-9463 | ui |
| `pXBC4W.toggleFullscreen` | 9464-9534 | ui |
| `pXBC4W.createActionItem` | 9535-9576 | ui |
| `pXBC4W.createPanel` | 9577-9640 | ui, storage, network |
| `callback:this.createActionItem@384` | 9619-9621 | - |
| `callback:this.createActionItem@386` | 9626-9635 | storage |
| `pXBC4W.createButton` | 9641-9659 | ui |
| `pXBC4W.setupFloatingWindow` | 9660-9678 | ui |
| `pXBC4W.init` | 9679-9692 | ui |
| `callback:zCSo6J.waitForBody@392` | 9680-9691 | ui |
| `zjEv2f.getRuntimeHookScript` | 9696-9701 | mallOrder |
| `zjEv2f.syncRuntimeState` | 9702-9714 | - |
| `zjEv2f.patchMallViewData` | 9718-9732 | mallOrder |
| `callback:vUYe8N.goodList.goods.forEach@397` | 9726-9730 | mallOrder |
| `zjEv2f.initStorageHook` | 9733-9750 | compatibility |
| `zjEv2f.buildCreateOrderResponse` | 9751-9765 | mallOrder |
| `zjEv2f.patchGameFlowUrl` | 9766-9781 | userState |
| `zjEv2f.initXhrHook` | 9782-9827 | network, compatibility |
| `XMLHttpRequest.prototype.open` | 9785-9826 | - |
| `callback:this.addEventListener@405` | 9799-9825 | - |
| `zjEv2f.initJsonpHook` | 9828-9881 | engineLoading, ui, mallOrder |
| `document.createElement` | 9830-9880 | engineLoading, mallOrder |
| `zjEv2f.init` | 9882-9887 | - |
| `vLsxqxg.init` | 9890-9902 | lifecycle |
| `callback:call@427` | 9908-10085 | ui, lifecycle, engineLoading |
| `injectStyle` | 9916-9989 | ui, engineLoading |
| `renderReadablePanel` | 10012-10062 | ui, engineLoading |
| `scheduleRender` | 10065-10072 | lifecycle |
| `start` | 10074-10078 | ui |
| `callback:call@437` | 10090-10228 | ui, lifecycle |
| `injectViewportStyle` | 10097-10153 | ui |
| `findMenuPanel` | 10165-10176 | ui |
| `applyViewportLimit` | 10178-10190 | ui |
| `start` | 10208-10225 | ui, lifecycle |
| `callback:call@445` | 10231-10269 | engineLoading, compatibility, ui |
| `isLegacyEngineUrl` | 10236-10244 | engineLoading, compatibility |
| `rewriteEngineUrl` | 10245-10245 | - |
| `rewriteScriptNode` | 10246-10250 | engineLoading |

## 注意

- 这里只解析纯字符串拼接属性，例如 `"initSt" + "orageHook"`。
- 数组索引、RC4 解码或运行时计算属性仍不会被静态还原。
- 对象方法名称比第一版匿名编号更适合维护，但版本升级后仍应以字段、接口和平台 API 为最终锚点。
- 报告用于兼容定位，不代表某项分支在所有页面和作品中都会执行。
