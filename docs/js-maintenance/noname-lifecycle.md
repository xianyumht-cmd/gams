# `noname.js` 运行生命周期

## 1. 总体顺序

当前 `noname.js 1.1.1` 的运行顺序可以稳定概括为：

```text
用户界面配置常量
        ↓
核心 IIFE
        ↓
读取本地配置：PwdGxxY.load
        ↓
入口判断：STy4gr.init
        ├─ PC/入口适配完成并要求停止 → 提前返回
        └─ 继续
             ↓
        H5 页面判断：zCSo6J.isH5Page
             ├─ 是 → MInyap.init
             │       DjkL_Q.init
             │       pXBC4W.init
             └─ 否 → 跳过这三个 H5 初始化
        ↓
页面适配：zjEv2f.init
        ↓
用户状态适配：PwDi7Ry.init
        ↓
可读说明布局增强 IIFE
        ↓
小屏菜单滚动适配 IIFE
        ↓
自托管引擎地址兼容 IIFE
```

核心调度对象是：

```text
vLsxqxg.init
```

它不是业务模块，而是启动编排器。

## 2. 各对象职责

### `PwdGxxY`：配置持久化

负责：

- 读取本地功能配置；
- 保存开关状态；
- 向其他对象提供当前配置；
- 在核心初始化之前恢复状态。

维护风险：

- 存储键变化；
- JSON结构变化；
- 清理缓存后状态丢失；
- 旧版本配置无法迁移。

### `zCSo6J`：公共工具与页面数据读取

已解析方法包括：

```text
isH5Page
getPcGameId
getNumberStorage
padZero
generateTimestamp
getUserId
getFlowerCount
waitForBody
```

它被入口、界面、用户和页面适配对象共同依赖，是控制层的公共工具对象。

维护风险：

- 页面URL结构变化；
- 用户标识来源变化；
- 数值字段或本地存储来源变化；
- `document.body` 出现时机变化。

### `STy4gr`：页面入口适配

执行位置早于其他核心模块。

作用：

- 判断当前入口形态；
- 处理 PC/H5 页面差异；
- 决定是否提前结束后续 H5 初始化。

维护风险：

- 官方入口URL调整；
- 页面跳转参数变化；
- 页面由跳转改为SPA内部切换；
- 提前返回条件误判。

### `MInyap`：运行环境初始化

已解析方法：

```text
buildCidian
createWclState
init
```

作用：

- 准备脚本运行依赖的全局状态；
- 建立后续引擎和页面适配需要的运行对象；
- 为修改版引擎提供预期环境。

维护风险：

- 全局变量命名变化；
- 初始化顺序变化；
- 页面公共脚本改为异步加载；
- 运行对象在 `game.js` 执行后才出现。

### `DjkL_Q`：引擎脚本识别与替换

已解析方法：

```text
isOfficialGameScript
patchScript
patchNode
init
```

作用：

- 识别页面中的引擎脚本；
- 调整脚本加载目标；
- 处理已经存在和后续动态插入的脚本节点。

维护风险：

- 官方 `game.js` 路径改变；
- 脚本改为模块、Blob或Worker加载；
- `<script>` 插入方式改变；
- 页面加载顺序早于 `document-start` 注入。

### `PwDi7Ry`：用户状态适配

已解析方法：

```text
createUserDataSnapshot
getUserDataValue
applyUserDataAccessors
hookCurrentUserData
init
```

作用：

- 建立用户数据快照；
- 从当前对象读取用户状态；
- 安装字段访问器；
- 在用户对象出现或替换后重新挂接；
- 通过调度等待目标对象就绪。

维护风险：

- `userData` 对象层级变化；
- 用户字段改名或类型变化；
- Getter/Setter 被官方重新定义；
- 登录完成后的对象替换时机变化；
- 同名字段由数值改为字符串或加密值。

### `pXBC4W`：G菜单与用户交互

共解析出20个对象方法，包括：

```text
togglePanel
initPosition
updateFloatingLayout
bindDrag
ensureStyle
createSwitchItem
showCustomToast
toggleFullscreen
createPanel
createButton
setupFloatingWindow
init
```

作用：

- 生成悬浮按钮和菜单；
- 读取与保存开关状态；
- 处理拖动、全屏、弹窗和小屏布局；
- 把用户操作同步给其他控制对象。

维护风险：

- DOM容器、层级或CSS隔离方式变化；
- 页面使用Shadow DOM；
- 全屏API差异；
- WebView安全区域和视口变化；
- 页面自身手势与悬浮窗冲突。

### `zjEv2f`：页面对象、存储和请求适配

共解析出10个方法：

```text
getRuntimeHookScript
syncRuntimeState
encryptValue
patchMallViewData
initStorageHook
buildCreateOrderResponse
patchGameFlowUrl
initXhrHook
initJsonpHook
init
```

它的初始化内部顺序是：

```text
syncRuntimeState
→ initStorageHook
→ initXhrHook
→ initJsonpHook
```

维护上应把它视为四个独立子层：

1. 运行状态同步；
2. 页面对象和存储访问器；
3. XHR兼容；
4. JSONP/动态脚本兼容。

维护风险：

- 页面由XHR/JSONP迁移到Fetch；
- 响应结构变化；
- 对象属性改为不可配置；
- CSP或Trusted Types限制动态脚本；
- URL路径、参数名和回调约定变化。

### `vLsxqxg`：启动编排器

初始化源码确认：

```text
PwdGxxY.load
→ STy4gr.init
→ H5时：MInyap.init、DjkL_Q.init、pXBC4W.init
→ zjEv2f.init
→ PwDi7Ry.init
```

任何启动顺序调整都应先修改编排器，而不是在各模块中随意增加延迟。

## 3. 三个后置增强层

核心 IIFE 完成后，还有三个独立层。

### 可读说明布局

特点：

- 等待DOM；
- 通过 `MutationObserver` 反复寻找菜单；
- 使用 `requestAnimationFrame` 合并渲染；
- 只改善说明布局，不参与核心状态计算。

### 小屏菜单滚动适配

特点：

- 注入视口样式；
- 查找菜单容器；
- 监听触摸、点击、尺寸和方向变化；
- 重复强化滚动和安全区域适配。

### 自托管引擎地址兼容

特点：

- 有独立幂等标记；
- 识别旧引擎地址；
- 覆盖脚本 `src`、`setAttribute`、`appendChild` 和 `insertBefore`；
- V2中最终还会被Android原生WebView请求拦截层接管。

维护时需要区分：

```text
noname.js 地址兼容层
≠
Android V2 原生内存拦截层
```

两层都存在是为了兼容V1和V2，不应误删其中一层后直接假设另一层覆盖所有环境。

## 4. 关键时序约束

### 约束一：配置必须先加载

```text
PwdGxxY.load
```

必须早于菜单、用户和页面适配初始化，否则首次状态与界面状态可能不一致。

### 约束二：运行环境必须早于引擎

```text
MInyap.init
→ DjkL_Q.init
```

如果顺序反转，修改版引擎可能在预期全局对象不存在时启动。

### 约束三：用户对象适配允许延迟

```text
PwDi7Ry.init
```

位于页面适配之后，并通过调度等待用户对象出现。这比在脚本启动时立即假设用户对象存在更稳妥。

### 约束四：界面不是业务状态源

菜单开关只是入口，真实状态同步仍由配置、运行状态和页面适配对象完成。界面显示正常不代表页面适配一定成功。

## 5. 版本更新后的最小验证

每次更新 `noname.js` 或官方页面后，至少验证：

```text
1. 配置能恢复
2. PC/H5入口判断正确
3. 运行环境在引擎前建立
4. 引擎脚本只加载一次
5. G按钮和菜单只创建一次
6. 用户对象出现后能被识别
7. 页面对象访问器能安装
8. XHR和动态脚本路径不会导致页面异常
9. 刷新、返回和重新进入不会重复Hook
10. 小屏、横屏和后台恢复正常
```

## 6. 稳定锚点优先级

从稳定到不稳定：

```text
平台API与对象行为
> 页面字段和接口路径
> 对象方法职责
> 计算后的方法名称
> 混淆变量名
> 代码行号
```

行号和方法名用于快速定位，但不能作为跨版本唯一依据。
