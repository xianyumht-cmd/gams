# GG Android 签名交接

## 当前正式签名身份

- JKS alias：`gg-release`
- 证书 SHA-256：`70:60:83:47:EE:8C:C3:CD:72:E7:DC:70:C5:04:01:3E:26:1C:9A:2F:EE:98:50:53:92:19:CD:A5:19:C8:7F:34`
- Repository Secret：`GG_RELEASE_KEYSTORE_BASE64`
- Repository Secret：`GG_RELEASE_KEYSTORE_PASSWORD`

JKS 和密码不得提交到 Git、PR、Issue、Actions 日志或文档。GitHub Secret 只能供工作流使用，无法反向下载；手工签名必须使用安全保存的本地 JKS。

## 签名谱系变更

历史 GG 2.0.2 记录的证书 SHA-256：

`F2:20:C5:D4:75:13:C7:44:CB:9B:5F:17:C0:F8:F3:9B:0C:10:9F:8F:7D:C8:92:98:97:13:EE:F3:3F:DB:E0:C4`

当前新证书无法覆盖升级历史证书安装的 `com.jinli.quickweb`。发布前必须明确采用新安装/迁移方案，不能把签名不匹配误判为 APK 构建失败。

## 手工签名边界

远端工作流只生成客户端和管理端的未签名 Release APK。完成加固后，再使用同一 JKS 分别签名两个 APK。

签名时应启用 APK Signature Scheme v1、v2、v3，关闭单独的 v4 文件输出，并在完成后核对证书 SHA-256 与本页一致。

示意命令：

```powershell
$env:GG_RELEASE_KEYSTORE_PASSWORD = "<从本地受保护凭据取得>"

java -jar .\tools\apksigner.jar sign `
  --ks .\GG-release.jks `
  --ks-key-alias gg-release `
  --ks-pass env:GG_RELEASE_KEYSTORE_PASSWORD `
  --key-pass env:GG_RELEASE_KEYSTORE_PASSWORD `
  --v1-signing-enabled true `
  --v2-signing-enabled true `
  --v3-signing-enabled true `
  --v4-signing-enabled false `
  --out .\signed.apk `
  .\unsigned.apk

java -jar .\tools\apksigner.jar verify --verbose --print-certs .\signed.apk
```

签名完成后清除终端环境变量：

```powershell
Remove-Item Env:GG_RELEASE_KEYSTORE_PASSWORD
```
