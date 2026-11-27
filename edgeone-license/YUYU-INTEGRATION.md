
# GG × Yuyu 闲鱼 API 卡密发货

## 状态

本功能的 EdgeOne 源码已提交 PR #48 分支。尚未重新部署 GG EdgeOne 生产环境，也未使用真实闲鱼订单验收。原有 GG Android APK、管理员页面、激活/检查/运行时接口没有改动。

## 1. EdgeOne 环境变量

在 GG Makers 项目 gg-license-api 新增：

- GG_PARTNER_ISSUE_TOKEN：独立的随机 32–256 字符机密；不得等于 GG_TOKEN_SECRET，也不得与后台管理员密码或 TOTP 秘钥共用。不要提交到 GitHub 或截图。
- GG_PARTNER_ALLOWED_DAYS：可选；默认 0,7,30,365；0 表示永久。仅允许整数 1–3650 天或 0。
- 保留 GG_TOKEN_SECRET、GG_ADMIN_PASSWORD 和现有私有 gg-private Blob。

可在 PowerShell 生成 32 字节随机值并十六进制编码：
~~~powershell
$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
[BitConverter]::ToString($bytes).Replace('-','')
~~~

部署代码分支 feat/gg-edgeone-license-remote-js-20261111，项目根目录 edgeone-license；新增变量后必须实际重新部署。
生产入口 WAF 应针对 POST /api/partner/issue 限速。接口 Token 泄露时只旋转 GG_PARTNER_ISSUE_TOKEN；不要为了关闭接口旋转 GG_TOKEN_SECRET，以免损坏旧单据的幂等行为。

## 2. Yuyu API 卡密组设置

在卡密库存中新建“API 接口”类型，按如下参数配置：

| 参数 | 值 |
|---|---|
| URL | https://gg-api.dijiav.top/api/partner/issue |
| Method | POST |
| Content-Type | application/json |
| Timeout | 10 秒 |
| Headers | {"Authorization":"Bearer <独立 Token>","Content-Type":"application/json"} |
| Params | {} |
| Body | {"order_id":"{order_id}","idempotency_key":"{idempotency_key}","days":30} |
| Response Path | data.card.code |
| Retry Enabled | 开启 |

不要把实际 Token 写进 GitHub 源码、命令行记录或聊天。Body 中 days 为 JSON 数字，30 不能写成字符串。
7 天、30 天、永久分别建立卡密组并绑定各自 SKU 的付款发货规则。每购买一个单位，Yuyu 会调用一次 API，并自动提供不同的幂等键。

成功响应示意（code 只是示意占位符）：
~~~json
{"ok":true,"reused":false,"data":{"card":{"code":"EXAMPLE-NOT-A-REAL-CODE"}}}
~~~

Yuyu 从 data.card.code 提取真正卡密，再完成聊天发送、订单核对、自动确认发货。GG API 本身不操作闲鱼平台，也不判断买家付款或退款。

## 3. 不发真实卡的接口测试

Yuyu 内置 API 测试使用固定订单 test-order 和幂等键 test-idempotency-key；GG 识别这组测试输入后返回 GG-TEST-ONLY，**不会创建可用卡密**。
请勿将 GG-TEST-ONLY 当作可用卡密发给客户。请随后使用少量真实、自有订单验收所有支付/取消/退款和重复消息分支。

## 4. 约束与容错

- 未配置 Token 返回 503，令牌错误返回 401；仅接受 JSON POST，且每请求仅签发一张卡。
- 同一幂等键重复调用，返回原先卡密；不会覆写已绑定设备、到期时间或撤销状态。
- 同一幂等键配不同订单 ID 或有效期时返回 409，不会再生成新卡。存储失败返回 503，用同一幂等键重试。
- GG 在私有 Blob 中存哈希索引及许可元数据，不存明文卡密、明文订单 ID 或原始幂等键。
- 响应 no-store，不允许客户端或 CDN 缓存。不要将 Token 放在 URL 查询参数中。
- Blob 的强一致读取加写入并非事务式 compare-and-swap；并发请求共享同一确定性卡密，但订单级操作互斥仍以 Yuyu 的执行协调器为准。不要宣称严格跨进程事务保证。

## 5. 测试、部署和回退

在 edgeone-license 目录运行 npm test。重点覆盖 partner-issue.test.mjs 的鉴权、输入验证、幂等重试、设备绑定保留、测试不发卡、存储错误。
源码测试通过不等于 EdgeOne 已部署成功；部署后还需确认原 /api/health 与管理端登录，及使用真实闲鱼订单完成端到端验收。

如需暂停第三方发卡，可在 EdgeOne 移除 GG_PARTNER_ISSUE_TOKEN 并重新部署，停止新发卡。不删 Blob 数据，不旋转 GG_TOKEN_SECRET，旧授权继续有效。
