# 运行维护依赖矩阵

这张表用于从用户反馈的现象直接定位到 `noname.js`、`game.js` 和官方公共依赖层。

## 1. 启动与页面

| 现象 | 首查控制层 | 首查引擎/依赖层 | 关键锚点 | 最小验证 |
|---|---|---|---|---|
| 客户端鉴权成功但页面未打开 | Android V2 页面入口、`STy4gr` | 官方H5页面 | 页面URL、主框架HTTP状态 | 浏览器主页面是否200、是否发生跳转 |
| 页面打开但G按钮不出现 | `pXBC4W.init`、`zCSo6J.waitForBody` | 页面DOM | `document.body`、按钮ID、菜单ID | DOM中是否只存在一个按钮和菜单 |
| G按钮出现但菜单空白 | `pXBC4W.createPanel`、样式注入 | 页面CSS/视口 | 配置项、菜单容器、层级 | 菜单DOM是否完整、文字是否可见 |
| 页面白屏 | `MInyap`、`DjkL_Q` | `game.js`、`SALInterface.js`、`webGLLib.js` | 引擎请求、控制台首个异常 | 引擎是否仅执行一次、SAL是否已存在 |
| 页面反复刷新或跳转 | `STy4gr.init` | 页面路由/登录公共脚本 | URL判断、提前返回 | PC/H5分支是否误判 |
| 进入后台后恢复异常 | 生命周期调度、小屏增强 | 引擎帧循环、WebView生命周期 | `visibilitychange`、`requestAnimationFrame` | 前后台5分钟、页面重建、状态恢复 |

## 2. 引擎加载

| 现象 | 首查控制层 | 首查引擎/依赖层 | 关键锚点 | 最小验证 |
|---|---|---|---|---|
| 仍请求旧引擎地址 | `DjkL_Q`、后置地址兼容IIFE | Android V2内存拦截 | script `src`、`setAttribute`、节点插入 | 网络中是否真正发出旧地址请求 |
| 引擎加载两次 | `DjkL_Q.patchNode`、幂等标记 | 页面脚本启动器 | script节点数量、全局chunk | 只出现一次入口模块和初始化提示 |
| 引擎请求成功但不执行 | 脚本响应MIME、注入时机 | CSP、WebView、公共依赖 | `application/javascript`、执行异常 | 响应200不等于执行成功，检查首个JS错误 |
| 更新引擎后立刻白屏 | 运行环境顺序 | 入口71269、外部副作用依赖 | `36728→6886→75640` | 比较入口结构与SAL集合 |
| 部分作品正常、部分失败 | 页面适配通常不是首因 | 作品二进制、共享资源、作品版本 | 作品ID、资源哈希 | 同客户端交叉测试至少3个作品 |

## 3. 用户与状态

| 现象 | 首查控制层 | 首查引擎/依赖层 | 关键锚点 | 最小验证 |
|---|---|---|---|---|
| 用户状态始终为空 | `PwDi7Ry.hookCurrentUserData` | `SAL_getUserData`、登录公共脚本 | `userData`创建时机 | 登录前、登录后、页面刷新分别观测对象 |
| 状态第一次正常，切换后失效 | `PwDi7Ry.applyUserDataAccessors` | 用户对象被整体替换 | 对象引用、描述符 | 观察对象身份是否变化并重新挂接 |
| 数值显示与页面不一致 | `zCSo6J.getFlowerCount`、用户快照 | 用户字段结构 | 鲜花字段、类型、默认值 | 对比原对象、快照和界面三个值 |
| 部分字段有效，部分无效 | `getUserDataValue` | 官方字段改名/嵌套变化 | 字段类型与层级 | 生成字段存在性与类型报告 |
| 刷新后状态丢失 | `PwdGxxY`、本地状态 | SAL Storage、本地Storage | 配置键、存档键 | 刷新前后分别导出非敏感键列表 |

## 4. 商城与页面数据

| 现象 | 首查控制层 | 首查引擎/依赖层 | 关键锚点 | 最小验证 |
|---|---|---|---|---|
| 商城入口打不开 | `zjEv2f`初始化 | 页面商城模块、公共接口 | `mallViewData`是否出现 | 不修改数据时先确认官方商城本身可打开 |
| 商品列表为空 | 页面对象适配 | `get_goods_list`响应结构 | `data/count/goods`层级 | 保存脱敏后的字段结构，不保存用户凭据 |
| 商品价格字段不生效 | `patchMallViewData` | `itemPrice`类型/加密规则 | 对象描述符、数值类型 | 检查字段是否可写、是否被后续覆盖 |
| 页面动作没有回调 | XHR/JSONP兼容层 | 官方传输方式变化 | XHR、JSONP、Fetch | 确认实际使用哪种网络机制 |
| 只有新版网页失效 | `initXhrHook`、`initJsonpHook` | 接口路径或回调约定变化 | URL路径、参数名、响应字段 | 旧版与新版请求结构并排比较 |

## 5. 存档与配置

| 现象 | 首查控制层 | 首查引擎/依赖层 | 关键锚点 | 最小验证 |
|---|---|---|---|---|
| 自动存档不显示 | 存储适配、用户状态 | `SaveData`、`SaveFileList`、SAL Storage | 存档索引与显示字段 | 新建存档、刷新、重进三步验证 |
| 本地/云端列表不一致 | `showLocal`与访问器 | 云端接口和本地索引 | 本地分支、云端分支 | 分别记录两条分支的数量和时间戳 |
| 点击重置后仍残留 | Android WebView清理、`PwdGxxY` | IndexedDB/Cache/Storage | Cookie、WebStorage、本地键 | 重置后重新启动并检查数据目录 |
| 更新后旧设置导致异常 | `PwdGxxY.load` | 配置结构版本 | schema/version字段 | 空配置启动与旧配置迁移各测一次 |

## 6. 界面与设备适配

| 现象 | 首查控制层 | 首查系统层 | 关键锚点 | 最小验证 |
|---|---|---|---|---|
| 菜单超出屏幕 | 小屏滚动适配IIFE | WebView视口、安全区 | `100vh/100dvh`、safe-area | 竖屏、横屏、分屏、小屏各测一次 |
| 拖动后按钮消失 | `bindDrag`、布局边界 | 系统缩放、刘海区域 | viewport尺寸、clamp | 改变方向后检查位置重新限制 |
| 全屏按钮无效 | `toggleFullscreen` | WebView/系统全屏策略 | fullscreen API | 进入、退出、返回键、旋转 |
| 页面点击被悬浮窗拦截 | `pXBC4W`事件处理 | WebView触摸分发 | pointer/touch/click | 点击菜单外区域和页面关键区域 |
| UI重复渲染或卡顿 | 两个MutationObserver增强层 | 页面DOM高频变化 | observer、RAF去抖 | 统计每秒重绘次数而不是只看现象 |

## 7. 网络与V2运行包

| 现象 | 首查Android层 | 首查服务端层 | 关键锚点 | 最小验证 |
|---|---|---|---|---|
| 未连接VPN无法启动 | RuntimeTransport容灾链 | Worker、自定义域名、DNS/WAF | 自定义域名→Worker→IP直连TLS | 三条通道逐项记录失败原因 |
| 连接VPN后正常，直连失败 | DNS/SNI容灾 | Cloudflare挑战或运营商网络 | TLS证书、SNI、HTTP状态 | 不关闭证书校验，确认直连TLS |
| 解密失败 | RuntimeKeyManager、AES-GCM | 运行清单、内容密钥 | OAEP算法、IV、AAD、哈希 | 校验算法协商和包版本 |
| 引擎内存响应503 | RuntimePayload生命周期 | 运行包获取 | payload是否已释放 | 页面创建前后检查内存载荷状态 |
| 退出后仍能读取旧运行数据 | releaseRuntime/wipe | - | 字节数组清零、WebView销毁 | 退出、后台超时、Activity销毁分别测试 |

## 8. 更新前后的统一证据

每次出现问题，至少保存以下非敏感证据：

```text
客户端版本
Android版本和WebView版本
是否VPN
页面URL去除敏感参数后的结构
官方页面HTML哈希
官方game.js哈希
SALInterface/webGLLib哈希
修改版运行包版本和哈希
首个控制台异常
脚本请求顺序
关键对象是否存在及字段类型
```

不要保存：

```text
激活码明文
会话token
请求签名
nonce
设备私钥
完整用户数据
未脱敏的查询参数
```

## 9. 判断原则

```text
界面正常 ≠ 业务层正常
HTTP 200 ≠ 脚本已经执行
字段存在 ≠ 类型和语义未变化
接口名称相同 ≠ 参数和回调兼容
某个历史版本最相似 ≠ 已证明是直接母版
```
