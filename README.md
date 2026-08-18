# GAMS / GG

GAMS 是 GG Android 客户端、管理端、运行时脚本、在线授权服务以及自动构建/交付流程的统一仓库。

> 本 README 记录仓库 **当前主线状态**。实验候选、历史构建编号和当前用户侧版本会明确分开，避免只按“数字最大”判断当前版本。

## 当前版本状态

截至 **2026-08-19**，当前主线应按下面的口径理解：

| 模块 | 当前状态 | 说明 |
| --- | --- | --- |
| GG 用户侧交付线 | `2.0.14-page5-stability` / code `25` | 当前 `GG 2.0.14 APK` 工作流与状态文件使用的交付标识；包名 `com.jinli.quickweb` |
| GG 2.0.14 自动构建 | 当前最新记录为 `failed` | 见 `docs/GG_2_0_14_APK_STATUS.json`；失败状态不能当作“已有可发布 APK” |
| V2 Android 客户端基线 | `2.0.3-stable` / code `16` | 位于 `v2/android/client/`，用于稳定基线与兼容性工作 |
| V2 管理端 | `2.0.3` / code `4` | 位于 `v2/android/manager/` |
| 根目录 Android 壳工程 | `1.0.0` | `client/` 的 Gradle 基线，不等同于 GG 对外显示版本 |
| 在线 License API | 已部署生产 | 当前入口为 `license-api/src/license-lifecycle.js`，D1 负责授权数据与生命周期 |

### 已知版本元数据漂移

当前仓库仍存在一处需要特别注意的版本标识不一致：

- `.github/workflows/build-js-runtime-stability-apk-v2.yml` 当前名称和状态输出是 **GG 2.0.14 APK**。
- `scripts/build-js-runtime-stability-apk-final.sh` 内部仍写有 **`2.0.22-mobile-sheet-action-fix` / code `102`** 的构建标识。
- 历史上还存在 2.0.20、2.0.22、2.0.23、2.0.24 等构建/候选流程；它们不能仅因为版本数字更大就被当成当前稳定发布版。

因此，在构建链彻底统一前，README 将 **2.0.14-page5-stability** 记为当前用户侧交付线，同时把 2.0.22 构建脚本标识作为已知漂移记录，而不是悄悄混成同一个版本。

## 当前授权规则

在线授权服务已经切换为“**首次真实激活后才开始计时**”的生命周期：

- 激活码生成后不开始倒计时。
- 未激活的时效码可以一直保留，实际 `expires_at` 为空。
- 第一次真实激活时，才按购买时长生成到期时间。
- 后续校验、重新打开 App 或重复激活不会重置计时。
- 永久码保持永久。
- 旧规则下因为“从生成时间开始计时”而误过期、但从未激活的码，会按迁移逻辑恢复为未激活库存状态并保留原购买时长。
- 这次授权生命周期调整没有改变客户端协议，现有 App 不需要因为该规则单独更新 APK。

对应实现：

- `license-api/src/license-lifecycle.js`
- `license-api/migrations/0005_activation_relative_expiry.sql`
- `license-api/wrangler.template.jsonc`

## 仓库结构

```text
.
├─ client/                     # 根目录 Android / WebView 壳工程基线
├─ v2/android/client/          # V2 Android 客户端稳定基线
├─ v2/android/manager/         # V2 管理端
├─ game-engine/                # game.js 等游戏运行时/引擎资源
├─ remote-script/              # 远程运行时脚本来源
├─ license-api/                # Cloudflare Worker + D1 在线授权服务
├─ keygen/                     # 授权码/控制端相关工具
├─ client_*_patch/             # 客户端各阶段补丁与兼容层
├─ hardening_*_parts/          # 加固/控制中心组装源
├─ scripts/                    # 构建、验证、打包脚本
├─ docs/                       # 构建状态、诊断和任务记录
└─ .github/workflows/          # CI、APK 构建、交付和 License API 部署
```

## 版本判断规则

以后判断“当前版本”按下面顺序，不再只看某一个 `versionName`：

1. **用户侧版本**：先看当前明确启用的 GG 构建/交付工作流。
2. **构建是否真的成功**：再看对应 `docs/*_STATUS.json` / `docs/*_DELIVERY_STATUS.json`，必须是 `ok: true` 才能认定该次产物成功。
3. **APK 真实身份**：以构建后的包名、`versionName`、`versionCode` 和签名校验结果为最终依据。
4. **Gradle 中的版本号**：只能代表对应源码基线；例如根 `client/` 当前仍是 `1.0.0`，不能直接拿来代表 GG 对外版本。
5. **实验候选版本**：2.0.20+、2.0.23、2.0.24 等历史/候选工作流只有在被明确提升为当前交付线并成功产出后，才能替代当前版本。

## 构建与发布

### Android

Android 构建主要由 GitHub Actions 和 `scripts/` 下的脚本完成。自动生成的状态 JSON 是构建事实记录，不应手工把失败状态改成成功。

当前 2.0.14 自动构建链会从专用实现分支取源码并生成状态记录；如果需要发布 APK，应同时确认：

- 工作流和构建脚本的版本元数据一致；
- Build 成功；
- Artifact 上传成功；
- APK 包名、版本号和签名验证成功；
- 状态 JSON 中 `ok` 为 `true`。

### License API

`license-api/` 是独立的在线授权服务。当前生产入口：

```text
license-api/src/license-lifecycle.js
```

数据库迁移位于：

```text
license-api/migrations/
```

License API 的生产变更必须经过测试和部署工作流验证，不能因为只改了客户端版本号就绕过服务端检查。

## 当前重点

当前仓库维护重点是：

- 保持 GG 客户端页面与运行时稳定，尤其是重复操作、WebView 生命周期和 JS 注入场景；
- 保持 `game.js` / `noname.js` 等运行时逻辑与 Android 壳层兼容；
- 统一不同历史构建链的版本元数据，减少“工作流名称、脚本版本、APK 实际版本”不一致；
- 保证在线授权、设备绑定、管理端和控制中心不因为客户端迭代发生回归；
- 新授权码严格遵循“未激活不计时，首次激活开始计时”。

## 开发约定

- `main` 是主分支。
- 功能和文档修改使用短生命周期任务分支 + PR。
- 不直接对生产服务做未经验证的部署。
- 不在仓库中提交密钥、Token、签名密码或其他敏感信息。
- 任务执行约定以根目录 `AGENTS.md` 为准。

---

如果 README 与实际代码/工作流再次出现冲突，应优先修正冲突本身，并同步更新本文件，而不是继续叠加新的“临时版本解释”。
