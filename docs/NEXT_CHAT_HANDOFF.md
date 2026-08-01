# GAMS 下一对话交接

## 当前状态

任务由用户主动暂停。用户尚未准备继续。

- 分支：`codex/fix-all-audited-bugs-20260801`
- PR：`#25`
- PR 状态：Open、Draft
- 合并：禁止
- 生产部署：禁止
- 当前代码修改：保留

## 已完成

1. 按实际可复现结果重新复核 Bug，不再把风险、维护事项和测试缺口当作 Bug。
2. 修复 Runtime 新旧密钥不兼容。
3. 修复运行包发布到错误分支并部署旧 Worker 的发布链。
4. 新运行包改用独立 32 字节 `RUNTIME_MASTER_KEY`。
5. 旧 `2.0.2-r1` 保留旧密码兼容解密通道。
6. 修复现有 Secret 迁移阻断部署：
   - `ADMIN_LOGIN_SECRET` 缺少时读取 `LICENSE_ADMIN_PASSWORD`。
   - `LEGACY_RUNTIME_PASSWORD` 缺少时读取 `LICENSE_ADMIN_PASSWORD`。
   - `RELEASE_SIGNING_PASSWORD` 缺少时读取 `LICENSE_ADMIN_PASSWORD`。
7. 已通过新旧密钥兼容测试、Source security regression、D1 本地迁移、两个 Worker dry-run、Android lint/build、正式客户端构建和控制中心测试。

## 已确认的现有 Repository secrets

只确认名称，不掌握也不需要掌握明文：

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `LICENSE_ADMIN_PASSWORD`

以上三项必须保留，不修改，不删除，不重新哈希。

## 尚未完成

- GitHub 尚无 `production` Environment。
- 尚未新增 `TOKEN_SIGNING_SECRET`。
- 尚未新增 `RUNTIME_MASTER_KEY`。
- 最新文档提交后的 PR 检查尚未作为恢复任务重新核对。
- PR 尚未退出 Draft。
- PR 尚未合并。
- 生产完整生命周期验收尚未执行。

## 用户继续时只做这些

### 第一步：确认用户已准备继续

未得到用户明确指令前停止，不自动推进。

### 第二步：指导用户完成 GitHub 配置

创建 Environment：

```text
production
```

在 Repository secrets 新增：

```text
TOKEN_SIGNING_SECRET
RUNTIME_MASTER_KEY
```

要求：

- `TOKEN_SIGNING_SECRET`：独立随机值，至少 32 个字符，推荐 64 位十六进制。
- `RUNTIME_MASTER_KEY`：独立随机 32 字节，使用 64 位十六进制或 Base64。
- 两个值不得相同。
- 不让用户把值发送到聊天。
- 只通过截图核对 Secret 名称。

不需要新增：

```text
ADMIN_LOGIN_SECRET
LEGACY_RUNTIME_PASSWORD
RELEASE_SIGNING_PASSWORD
```

迁移阶段三者会读取现有 `LICENSE_ADMIN_PASSWORD`。

### 第三步：重新验证

1. 获取 PR #25 最新 head。
2. 检查所有 PR workflow runs。
3. 若失败，读取失败 job 日志并修复实际错误。
4. 所有检查通过前保持 Draft。

### 第四步：生产发布

只有用户确认继续并且配置完成后：

1. 将 PR #25 标记为 Ready for review。
2. 合并到 `main`。
3. 观察 License API 和 Runtime Worker 部署。
4. 不要在生产失败时盲目重跑；先读完整日志。

### 第五步：完整验收

必须完成：

```text
激活
→ runtime challenge/access
→ RSA 内容密钥解包
→ bundle 下载
→ AES-GCM 解密
→ ZIP 读取
→ noname.js/game.js 大小与 SHA-256 校验
```

完成上述生产验收后，才能将任务状态改为完成。

## 安全边界

- 不查看、不请求、不输出 Secret 明文。
- 不把 Secret 写进仓库文件、PR、Issue、Actions 日志或聊天。
- 不修改现有 `LICENSE_ADMIN_PASSWORD`。
- 不使用哈希值替代原始 Secret。
- 不在用户暂停状态下合并或部署。

## 新对话启动语

> 继续 GAMS Bug 修复任务，按 `docs/CURRENT_TASK_STATE.json`、`docs/NEXT_CHAT_HANDOFF.md` 和 `docs/BUG_FIXES_2026-08-01.md` 继续。先确认我已经准备继续，再核对 production Environment 和 Repository secret 名称；禁止读取、输出或重置任何 Secret 明文。
