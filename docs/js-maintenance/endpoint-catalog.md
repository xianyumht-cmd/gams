# 运行接口维护目录

本目录记录静态分析中确认的接口动作和路径。它用于兼容性检查、故障定位和版本比较，不代表所有接口在每个作品中都会被调用。

## 商城与订单

| 动作 | 路径/锚点 | 重点观察 |
|---|---|---|
| 商品列表 | `PropShop/engine/v5/Game/get_goods_list` | 商品数组、价格字段、拥有状态、分页和错误结构 |
| 创建订单 | `PropShop/engine/v2/PropOrder/createBuyOrder` | 商品 ID、数量、订单 ID、token、成功与失败分支 |
| 用户拥有道具 | `PropShop/engine/v5/user/getUserHaveAllPropNum` | 道具 ID、数量、空列表和未登录结果 |
| 查询拥有状态 | `PropShop/engine/v5/user/getMyIsHave` | 布尔值/数字类型变化、用户状态依赖 |
| 查询账户数值 | `PropShop/engine/v5/user/getMyAccountMoney` | 数值类型、货币单位和未登录返回 |
| 用户鲜花数据 | `PropShop/engine/v5/user/game_flower_by_me` | fresh/wild/real/total 等字段映射 |
| 排名索引 | `PropShop/engine/v5/game/get_user_rank_index` | 用户 ID、作品 ID、排名缺失情况 |

## 用户配置与签到

| 动作 | 路径/锚点 | 重点观察 |
|---|---|---|
| 获取全局配置 | `PropShop/engine/v5/user/get_global_cfg` | 配置键、默认值、JSON 字符串与对象差异 |
| 设置全局配置 | `PropShop/engine/v5/user/set_global_cfg` | 写入结果、失败重试和登录状态 |
| 旧版获取配置 | `PropShop/v3/user_engine/get_global_cfg` | 旧播放器兼容分支 |
| 旧版设置配置 | `PropShop/v3/user_engine/set_global_cfg` | 旧播放器兼容分支 |
| 获取签到天数 | `PropShop/engine/v5/user/get_sign_in_days` | 日期、时区和连续签到字段 |
| 记录签到 | `PropShop/engine/v5/user/record_sign_in_days` | 重复提交和错误码 |

## 存档、日志和平台映射

| 动作 | 路径/锚点 | 重点观察 |
|---|---|---|
| 用户数据上报 | `/ajax/report/report_user_data` | 上报频率、字段大小和失败是否影响主流程 |
| Web 日志 | `/api/oweb_log.php` | 错误级别、页面版本和请求失败行为 |
| 平台映射 | `/api/v3/oapi_map.php` | 平台参数、返回结构和备用路径 |
| 本地/自动存档 | `SaveData`、`SaveFileList`、`SaveFileIndex`、`SysSave` | 存档 ID、时间戳、列表结构和本地/云端分支 |

## 统计、完整性和调试相关地址

静态重组识别到：

- `http://fx.it.66rpg.com:8106/sa`
- `http://fx.it.66rpg.com:8107/`
- `https://fx-it.66rpg.com:8206/sa`
- `https://fx-it.66rpg.com:8207`
- `https://www.66rpg.com/crackUser/crack_user`
- `https://cloudver-test-www.66rpg.com/crackUser/crack_user`
- `https://theajack.github.io/disable-devtool/404.html?h=`

这些地址应作为独立的运行环境层记录。出现开发者工具、代理、特定网络或调试环境下异常时，先检查它们是否被调用，不要直接修改商城或用户逻辑。

## 每次更新必须记录的请求信息

```text
请求动作
请求方法
完整路径
关键请求头
参数名称与类型
成功响应示例结构
失败响应示例结构
未登录响应
空数据响应
超时行为
是否被 noname.js 适配
对应页面/播放器版本
```

## 兼容性警报条件

以下任意变化都应阻止直接切换 stable：

- 路径删除、改名或版本号变化；
- `goods_id`、`order_id`、`uid` 等字段类型变化；
- 成功状态从数字变为字符串或布尔值；
- 数据从对象变为数组，或反向变化；
- 错误响应不再包含原有状态字段；
- 接口从 JSONP 改为 XHR/fetch，或反向变化；
- 登录状态从全局对象迁移到异步接口；
- 请求必须新增签名、时间戳或一次性参数。
