# 失效诊断手册

| 现象 | 层级 | 首查 |
|---|---|---|
| V2 无法启动运行包 | Android/Worker | 鉴权、网络、清单签名、密钥和 AES-GCM |
| G 按钮不显示 | noname 注入 | document-start、来源白名单和脚本异常 |
| 菜单显示但开关无效 | 页面适配 | 对象时机、Getter/Setter、XHR/JSONP |
| 白屏或一直加载 | game 引擎 | 引擎版本、入口模块、依赖和资源 |
| 登录状态异常 | SAL/用户数据 | SAL_Login、SAL_getUserData、userData |
| 商城为空或打不开 | 商城数据 | 商品接口、mallViewData、响应结构 |
| 刷新后设置丢失 | 存储 | localStorage、WebStorage 和存档结构 |
| 仅部分作品失败 | 播放器差异 | 页面版本、作品资源、URL 和初始化时机 |

排查顺序：运行包 → noname 注入 → game 执行 → SAL → 全局对象 → 请求结构 → 单项字段。
