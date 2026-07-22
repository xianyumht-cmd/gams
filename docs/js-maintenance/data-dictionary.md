# 运行数据字典

本字典按维护价值整理字段。字段含义来自当前 `noname.js 1.1.1`、`game.js 1.0.2` 的静态重组结果和已确认运行行为。

## 用户与身份

| 字段 | 推定类型 | 维护含义 | 风险点 |
|---|---|---|---|
| `uid` | string/number | 用户唯一标识 | 字符串与数字互转、空值、游客值 |
| `guid` | string | 引擎/会话相关标识 | 可能与作品或页面实例绑定 |
| `pver` | string/number | 播放器/协议版本 | 版本变化可能切换兼容分支 |
| `isLogin` | boolean/number | 登录状态 | `true/false`、`0/1`、字符串值差异 |
| `userData` | object | 用户状态主对象 | 初始化时机、Getter/Setter、对象替换 |
| `userGameSettingInfo` | object/string | 用户作品设置 | JSON 字符串与对象差异 |
| `token` | string | 会话或请求凭据 | 失效、空值和刷新流程 |

## 鲜花与数值

| 字段 | 推定类型 | 维护含义 | 风险点 |
|---|---|---|---|
| `totalFlower` | number | 总鲜花/累计数值 | 与其他字段是否重复计算 |
| `freshFlower` | number | 新鲜花数量 | 默认值和负数处理 |
| `wildFlower` | number | 野花数量 | 类型变化和显示刷新 |
| `tempFlower` | number | 本地临时值 | localStorage 与运行对象同步 |
| `realFlower` | number | 实际/真实花数 | 服务端值与页面值冲突 |
| `haveFlower` | number/boolean | 是否拥有或可用数量 | 布尔/数量双重语义 |
| `flowerCount` | number | noname 内部统一值 | 自定义输入、默认值和持久化 |

## 商城与商品

| 字段 | 推定类型 | 维护含义 | 风险点 |
|---|---|---|---|
| `mallViewData` | object | 商城视图和商品状态主对象 | 初始化变异、对象整体替换 |
| `goods` | array/object | 商品集合或单项商品 | 数组与对象结构变化 |
| `goods_id` | string/number | 商品 ID | 字符串/数字、字段改名 |
| `itemPrice` | number | 单项价格 | 加密/编码值、显示值与提交值不同 |
| `ownedProps` | array/object | 已拥有道具 | 空列表、数量字段和缓存 |
| `countAvailable` | boolean/number | 可购买数量状态 | 布尔与数值双重语义 |
| `gaveFlowers` | number | 已赠送鲜花 | 作品/用户维度差异 |

## 订单

| 字段 | 推定类型 | 维护含义 | 风险点 |
|---|---|---|---|
| `order_id` | string/number | 订单唯一标识 | 空订单、重复订单和类型变化 |
| `orderToken` | string | 订单相关令牌 | 过期、一次性和绑定参数 |
| `buy_num` | number | 购买数量 | 上限、默认值和单次限制 |
| `goods_name` | string | 商品名称 | 只用于显示还是参与请求 |
| `createBuyOrder` | action | 创建订单动作 | 请求方法、参数和响应结构 |

## 存档与设置

| 字段/对象 | 推定类型 | 维护含义 | 风险点 |
|---|---|---|---|
| `saveData` / `SaveData` | object/string | 当前存档数据 | 压缩、编码和版本迁移 |
| `SaveFileList` | array | 存档列表 | 索引和时间排序 |
| `SaveFileIndex` | number/string | 当前存档位置 | 本地与云端索引差异 |
| `SaveFileIndexLocal` | number/string | 本地存档索引 | 清理缓存后的重建 |
| `SysSave` | object | 系统自动存档 | 自动覆盖和版本兼容 |
| `last_save_time` | timestamp | 最近存档时间 | 秒/毫秒、时区 |
| `showLocal` | boolean/function | 本地显示/本地分支 | 对象属性和方法同名风险 |
| `localStorage` | storage | 本地设置与存档 | 清理垃圾、重置和容量限制 |
| `sessionStorage` | storage | 页面会话状态 | 刷新和进程退出后丢失 |

## 媒体与资源

| 字段/锚点 | 维护含义 | 风险点 |
|---|---|---|
| `Audio/BGM/` | 背景音乐资源 | 路径、预加载和缓存 |
| `Audio/Voice/` | 语音资源 | 播放顺序和释放 |
| `Audio/se/` | 音效资源 | 并发播放和音量 |
| `Graphics/Video/` | 视频资源 | 解码、全屏和循环 |
| `SAL_preload` | 通用预加载 | 返回码、完成回调 |
| `SAL_getResourceSize` | 资源尺寸 | 新旧接口兼容 |
| `SAL_getTextureList` | 纹理目录 | WebGL/Canvas 资源生命周期 |

## 字段变更的判断标准

每次官方更新后，对重点字段执行：

```text
是否仍存在
→ 出现次数是否突变
→ 所属对象是否变化
→ 类型是否变化
→ 默认值是否变化
→ 创建时机是否变化
→ 写入后是否立即被覆盖
→ 是否新增服务端校验
```

只看字段名称仍然存在是不够的。最常见的兼容问题是字段仍同名，但对象层级、类型或初始化时机已经变化。
