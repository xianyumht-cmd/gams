# 网络与数据字典

## 字段锚点

| 分组 | 字段/标记 | noname.js | game.js |
|---|---|---|---|
| 身份与登录 | uid | 2 | 35 |
| 身份与登录 | isLogin | 1 | 0 |
| 身份与登录 | token | 1 | 37 |
| 身份与登录 | device_id | 0 | 4 |
| 鲜花与数值 | tempFlower | 1 | 0 |
| 鲜花与数值 | itemPrice | 1 | 0 |
| 商城与订单 | goods | 8 | 3 |
| 商城与订单 | goods_id | 2 | 1 |
| 商城与订单 | order_id | 1 | 3 |
| 商城与订单 | get_goods_list | 1 | 0 |
| 存档与设置 | saveData | 0 | 3 |
| 存档与设置 | localStorage | 6 | 7 |
| 存档与设置 | sessionStorage | 0 | 1 |
| 存档与设置 | showLocal | 1 | 0 |
| 渲染与运行 | Canvas | 0 | 4 |
| 渲染与运行 | Audio | 0 | 56 |
| 渲染与运行 | Video | 0 | 24 |
| 渲染与运行 | requestAnimationFrame | 5 | 1034 |
| 渲染与运行 | XMLHttpRequest | 2 | 3 |
| 渲染与运行 | JSONP | 0 | 2 |

## 存储键候选

- `config`
- `flower`
- `save`
- `tempFlower`

## URL 索引

- `https://gams-script-edge.2320006072.workers.dev/engine/stable.js`
- `https://m.66rpg.com/h5/*`
- `https://pic.cgyouxi.com/orange/upload/202407/25322333_e0c7c8fe42024bcd1e55911dfe25cff4.png`
- `https://pre`
- `https://www.66rpg.com/*/*`
- `https://www.66rpg.com/PropShop/engine/v5/Game/get_goods_list`
- `https://www.66rpg.com/PropShop/engine/v5/user/getUserHaveAllP`

## 维护规则

- 同时记录方法、路径、参数、响应和失败分支。
- 优先用登录、用户数据、商品列表、订单创建等行为锚点定位。
- 官方更新后先比较字段和路径，再调整 Hook 时机。
