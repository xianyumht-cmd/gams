# GG 2.0.2 正式版

当前正式客户端基线：

- 应用名称：`GG`
- 包名：`com.jinli.quickweb`
- 版本名称：`2.0.2`
- 版本代码：`11`
- 最低 Android：API 24

## 安全架构

客户端使用签名设备协议完成激活、检查和自助解绑。运行包通过独立运行密钥加密，客户端只在授权成功后于内存中解密。特权 WebView 仅允许受信任站点，外部网页不共享运行包资源。

生产环境必须分别配置以下 Secret，禁止复用：

- `ADMIN_LOGIN_SECRET`：仅用于管理端登录验证。
- `TOKEN_SIGNING_SECRET`：仅用于管理令牌和用户会话令牌签名，至少 32 个随机字符。
- `RUNTIME_MASTER_KEY`：32 字节高熵随机密钥，使用 64 位十六进制或 Base64 编码。

旧的 `LICENSE_ADMIN_PASSWORD` 不再作为令牌签名或运行包主密钥。合并本版本前必须完成 Secret 轮换，轮换后旧会话会立即失效。

## 发布流程

1. Pull Request 运行 Worker 语法、D1 本地迁移、Wrangler dry-run、Android lint/build 和安全回归测试。
2. 合并到受保护的 `main` 后，授权 Worker 和运行包 Worker分别部署到 production Environment。
3. 部署完成后执行真实 V2 生命周期验收：创建测试卡密、签名激活、检查、运行包访问、并发设备限制、解绑和旧令牌失效。
4. 正式 APK 构建保持未签名，后续必须使用固定生产证书签名。
5. 当前正式证书 SHA-256：`70:60:83:47:EE:8C:C3:CD:72:E7:DC:70:C5:04:01:3E:26:1C:9A:2F:EE:98:50:53:92:19:CD:A5:19:C8:7F:34`。
6. JKS alias 固定为 `gg-release`；仓库只保存 Actions Secret `GG_RELEASE_KEYSTORE_BASE64` 和 `GG_RELEASE_KEYSTORE_PASSWORD`，禁止提交 JKS 或密码明文。
7. 历史 GG 2.0.2 构建曾使用证书 `F2:20:C5:D4:75:13:C7:44:CB:9B:5F:17:C0:F8:F3:9B:0C:10:9F:8F:7D:C8:92:98:97:13:EE:F3:3F:DB:E0:C4`。新旧证书不兼容，采用当前证书的安装包不能直接覆盖升级旧证书版本。

## 管理端

管理器包名保持为 `com.jinli.ggsecure.manager`，只供管理人员使用，不属于用户发布物。
