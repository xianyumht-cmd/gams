#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path: str, old: str, new: str) -> None:
    target = ROOT / path
    text = target.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one exact match, found {count}")
    target.write_text(text.replace(old, new), encoding="utf-8", newline="\n")


def regex_replace_once(path: str, pattern: str, replacement: str) -> None:
    target = ROOT / path
    text = target.read_text(encoding="utf-8")
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"{path}: expected one regex match, found {count}")
    target.write_text(updated, encoding="utf-8", newline="\n")

runtime_path = ROOT / "v2/runtime/src/index.js"
runtime = runtime_path.read_text(encoding="utf-8")
if not runtime.startswith('import { decryptRuntimeContentKey } from "./runtime-key.js";'):
    runtime = 'import { decryptRuntimeContentKey } from "./runtime-key.js";\n\n' + runtime
runtime = runtime.replace(
    "          splitSecrets: true,\n",
    "          splitSecrets: true,\n          legacyReleaseCompatible: true,\n",
    1,
)
pattern = r"async function decryptContentKey\(manifest, env\) \{.*?\n\}\n\nasync function verifyToken"
replacement = '''async function decryptContentKey(manifest, env) {
  try {
    return await decryptRuntimeContentKey(manifest, {
      runtimeMasterKey: env.RUNTIME_MASTER_KEY,
      legacyRuntimePassword: env.LEGACY_RUNTIME_PASSWORD || "",
    });
  } catch {
    throw new HttpError(503, "runtime_invalid", "运行密钥无效");
  }
}

async function verifyToken'''
runtime, count = re.subn(pattern, replacement, runtime, count=1, flags=re.S)
if count != 1:
    raise SystemExit(f"v2/runtime/src/index.js: decryptContentKey replacement count={count}")
runtime_path.write_text(runtime, encoding="utf-8", newline="\n")

(ROOT / "v2/runtime/src/runtime-key.js").write_text(r'''const encoder = new TextEncoder();

export function decodeRuntimeMasterKey(value) {
  const text = String(value || "").trim();
  let bytes;
  if (/^[0-9a-fA-F]{64}$/.test(text)) {
    bytes = new Uint8Array(32);
    for (let index = 0; index < 32; index += 1) {
      bytes[index] = Number.parseInt(text.slice(index * 2, index * 2 + 2), 16);
    }
  } else {
    const normalized = text.replace(/-/g, "+").replace(/_/g, "/");
    bytes = decodeBase64(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  }
  if (bytes.byteLength !== 32) {
    bytes.fill(0);
    throw new Error("RUNTIME_MASTER_KEY must decode to exactly 32 bytes");
  }
  return bytes;
}

export async function deriveLegacyRuntimeMasterKey(password) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(`gg-v2-runtime-master:${String(password || "")}`)
  );
  return new Uint8Array(digest);
}

export async function decryptRuntimeContentKey(
  manifest,
  { runtimeMasterKey, legacyRuntimePassword = "" }
) {
  const primary = decodeRuntimeMasterKey(runtimeMasterKey);
  try {
    return await decryptWithMasterKey(manifest, primary);
  } catch (primaryError) {
    if (!legacyRuntimePassword) throw primaryError;
    const legacy = await deriveLegacyRuntimeMasterKey(legacyRuntimePassword);
    try {
      return await decryptWithMasterKey(manifest, legacy);
    } finally {
      legacy.fill(0);
    }
  } finally {
    primary.fill(0);
  }
}

async function decryptWithMasterKey(manifest, masterBytes) {
  const key = await crypto.subtle.importKey(
    "raw",
    masterBytes,
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );
  const iv = decodeBase64(manifest.keyIv);
  const cipher = decodeBase64(manifest.keyCipher);
  try {
    const plain = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv,
        additionalData: encoder.encode(`gg-v2-key|${manifest.versionName}`),
        tagLength: 128,
      },
      key,
      cipher
    );
    const bytes = new Uint8Array(plain);
    if (bytes.byteLength !== 32) {
      bytes.fill(0);
      throw new Error("runtime content key must contain exactly 32 bytes");
    }
    return bytes;
  } finally {
    iv.fill(0);
    cipher.fill(0);
  }
}

function decodeBase64(value) {
  const binary = atob(String(value || ""));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
''', encoding="utf-8", newline="\n")

(ROOT / "v2/runtime/tools/build_release.py").write_text(r'''#!/usr/bin/env python3
import base64
import binascii
import hashlib
import json
import re
import secrets
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

if len(sys.argv) != 6:
    raise SystemExit(
        "usage: build_release.py <noname.js> <game.js> <version> "
        "<runtime-master-key> <output-dir>"
    )


def decode_runtime_master_key(value: str) -> bytearray:
    text = value.strip()
    if re.fullmatch(r"[0-9a-fA-F]{64}", text):
        decoded = bytes.fromhex(text)
    else:
        normalized = text.replace("-", "+").replace("_", "/")
        normalized += "=" * ((4 - len(normalized) % 4) % 4)
        try:
            decoded = base64.b64decode(normalized, validate=True)
        except (binascii.Error, ValueError) as error:
            raise SystemExit("runtime master key is not valid hex or base64") from error
    if len(decoded) != 32:
        raise SystemExit("runtime master key must decode to exactly 32 bytes")
    return bytearray(decoded)


noname_path = Path(sys.argv[1])
game_path = Path(sys.argv[2])
version = sys.argv[3].strip()
master_key = decode_runtime_master_key(sys.argv[4])
output = Path(sys.argv[5])
if not version:
    raise SystemExit("version is required")

noname = noname_path.read_bytes()
game = game_path.read_bytes()
virtual_url = b"https://ggv2.local/runtime/game.js"
old_urls = [
    b"https://gams-script-edge.2320006072.workers.dev/engine/stable.js",
    b"https://preview-chat-1b176371-f9ab-4760-b15c-b9d70ed59d23.space-z.ai/game.js",
]
patched = noname
for old in old_urls:
    patched = patched.replace(old, virtual_url)
if virtual_url not in patched:
    raise SystemExit("noname.js engine URL was not rewritten to the V2 virtual route")
for old in old_urls:
    if old in patched:
        raise SystemExit(f"legacy engine URL remains in patched noname.js: {old!r}")

output.mkdir(parents=True, exist_ok=True)
plain_zip = output / ".runtime.zip"
with zipfile.ZipFile(plain_zip, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    archive.writestr("noname.js", patched)
    archive.writestr("game.js", game)

plain = bytearray(plain_zip.read_bytes())
plain_zip.unlink()
content_key = bytearray(secrets.token_bytes(32))
bundle_iv = secrets.token_bytes(12)
bundle_aad = f"gg-v2-runtime|{version}".encode()
encrypted_bundle = AESGCM(bytes(content_key)).encrypt(bundle_iv, bytes(plain), bundle_aad)

key_iv = secrets.token_bytes(12)
key_aad = f"gg-v2-key|{version}".encode()
key_cipher = AESGCM(bytes(master_key)).encrypt(key_iv, bytes(content_key), key_aad)

filename = f"bundle-{version}.bin"
bundle_path = output / filename
bundle_path.write_bytes(encrypted_bundle)

published_at = (
    datetime.now(timezone.utc)
    .replace(microsecond=0)
    .isoformat()
    .replace("+00:00", "Z")
)
manifest = {
    "schemaVersion": 2,
    "versionName": version,
    "file": filename,
    "size": len(encrypted_bundle),
    "sha256": hashlib.sha256(encrypted_bundle).hexdigest(),
    "iv": base64.b64encode(bundle_iv).decode(),
    "nonameSize": len(patched),
    "nonameSha256": hashlib.sha256(patched).hexdigest(),
    "gameSize": len(game),
    "gameSha256": hashlib.sha256(game).hexdigest(),
    "keyIv": base64.b64encode(key_iv).decode(),
    "keyCipher": base64.b64encode(key_cipher).decode(),
    "publishedAt": published_at,
}
keys = (
    "schemaVersion", "versionName", "file", "size", "sha256", "iv",
    "nonameSize", "nonameSha256", "gameSize", "gameSha256",
    "keyIv", "keyCipher", "publishedAt",
)
canonical = "".join(f"{key}={manifest[key]}\n" for key in keys)
Path("/tmp/v2-runtime-canonical.txt").write_text(
    canonical, encoding="utf-8", newline="\n"
)
Path("/tmp/v2-runtime-unsigned.json").write_text(
    json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8",
)
for buffer in (content_key, plain, master_key):
    for index in range(len(buffer)):
        buffer[index] = 0
print(json.dumps({
    "version": version,
    "file": filename,
    "size": manifest["size"],
    "sha256": manifest["sha256"],
    "nonameSize": manifest["nonameSize"],
    "gameSize": manifest["gameSize"],
}))
''', encoding="utf-8", newline="\n")

(ROOT / "tests/runtime-key-compat.test.mjs").write_text(r'''import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { webcrypto } from "node:crypto";

if (!globalThis.crypto) globalThis.crypto = webcrypto;
const { decryptRuntimeContentKey, deriveLegacyRuntimeMasterKey } = await import(
  "../v2/runtime/src/runtime-key.js"
);
const encoder = new TextEncoder();
const work = mkdtempSync(join(tmpdir(), "gams-runtime-key-"));
const noname = join(work, "noname.js");
const game = join(work, "game.js");
const release = join(work, "release");
const rawMasterHex = "11".repeat(32);
writeFileSync(
  noname,
  "const u='https://gams-script-edge.2320006072.workers.dev/engine/stable.js';\n"
);
writeFileSync(game, "window.__GG_TEST_GAME__=true;\n");
const built = spawnSync("python3", [
  "v2/runtime/tools/build_release.py",
  noname,
  game,
  "9.9.9-test",
  rawMasterHex,
  release,
], { encoding: "utf8" });
assert.equal(built.status, 0, built.stderr || built.stdout);
const manifest = JSON.parse(readFileSync("/tmp/v2-runtime-unsigned.json", "utf8"));
const rawContentKey = await decryptRuntimeContentKey(manifest, {
  runtimeMasterKey: rawMasterHex,
});
assert.equal(rawContentKey.byteLength, 32);
rawContentKey.fill(0);

const legacyPassword = "legacy-release-password";
const legacyMaster = await deriveLegacyRuntimeMasterKey(legacyPassword);
const expectedContentKey = new Uint8Array(32).fill(0x5a);
const legacyIv = webcrypto.getRandomValues(new Uint8Array(12));
const legacyKey = await webcrypto.subtle.importKey(
  "raw", legacyMaster, { name: "AES-GCM" }, false, ["encrypt"]
);
const legacyCipher = new Uint8Array(await webcrypto.subtle.encrypt({
  name: "AES-GCM",
  iv: legacyIv,
  additionalData: encoder.encode("gg-v2-key|2.0.2-r1"),
  tagLength: 128,
}, legacyKey, expectedContentKey));
const legacyManifest = {
  versionName: "2.0.2-r1",
  keyIv: Buffer.from(legacyIv).toString("base64"),
  keyCipher: Buffer.from(legacyCipher).toString("base64"),
};
const migrated = await decryptRuntimeContentKey(legacyManifest, {
  runtimeMasterKey: rawMasterHex,
  legacyRuntimePassword: legacyPassword,
});
assert.deepEqual(migrated, expectedContentKey);
await assert.rejects(
  decryptRuntimeContentKey(legacyManifest, { runtimeMasterKey: rawMasterHex })
);
for (const bytes of [legacyMaster, expectedContentKey, legacyIv, legacyCipher, migrated]) {
  bytes.fill(0);
}
console.log("Runtime raw-key publication and legacy-release migration tests passed");
''', encoding="utf-8", newline="\n")

source_test = ROOT / "tests/source-security.test.mjs"
text = source_test.read_text(encoding="utf-8")
text = text.replace(
    'const licenseWorkflow = read(".github/workflows/deploy-license-api.yml");\n',
    'const licenseWorkflow = read(".github/workflows/deploy-license-api.yml");\n'
    'const runtimeKey = read("v2/runtime/src/runtime-key.js");\n'
    'const runtimeBuilder = read("v2/runtime/tools/build_release.py");\n'
    'const runtimePublisher = read(".github/workflows/v2-publish-encrypted-runtime.yml");\n',
    1,
)
text = text.replace(
    'assert(!runtime.includes("env.ADMIN_PASSWORD"), "runtime worker still derives keys from admin password");\n',
    'assert(!runtime.includes("env.ADMIN_PASSWORD"), "runtime worker still derives keys from admin password");\n'
    'assert(runtime.includes("decryptRuntimeContentKey"), "runtime worker lacks release-key migration logic");\n'
    'assert(runtimeKey.includes("legacyRuntimePassword"), "legacy release migration is missing");\n'
    'assert(!runtimeBuilder.includes("gg-v2-runtime-master:"), "release builder still derives a master key from a password");\n'
    'assert(runtimeBuilder.includes("exactly 32 bytes"), "release builder does not enforce a raw 32-byte master key");\n'
    'assert(runtimePublisher.includes("RUNTIME_MASTER_KEY"), "runtime publisher does not use the independent master key");\n'
    'assert(!runtimePublisher.includes("TARGET_BRANCH"), "runtime publisher still targets an obsolete branch");\n'
    'assert(!runtimePublisher.includes("secret put ADMIN_PASSWORD"), "runtime publisher still deploys the obsolete Worker secret");\n'
    'assert(runtimePublisher.includes("git push origin HEAD:main"), "runtime release is not published to main");\n',
    1,
)
source_test.write_text(text, encoding="utf-8", newline="\n")

(ROOT / "docs/BUG_FIXES_2026-08-01.md").write_text(r'''# GAMS Bug 修复与复核记录

- 复核日期：2026-08-01
- 原始报告：`docs/BUG_AUDIT_2026-08-01.md`
- 修复分支：`codex/fix-all-audited-bugs-20260801`
- PR：`#25`

## 统计规则

只把代码中确定存在、触发条件明确、结果能够稳定复现的问题计为 Bug。安全建议、维护事项和没有完成动态验证的风险不计入实际 Bug 数量。

## 已确认并修复的实际 Bug

### Runtime 密钥迁移与发布链不兼容

修复前：

- 现有 `2.0.2-r1` 的内容密钥使用旧的管理员密码派生密钥加密。
- 新 Runtime Worker 只接受独立的原始 32 字节 `RUNTIME_MASTER_KEY`。
- 永久发布工具仍用旧密码派生算法生成运行包。
- 永久发布工作流把 release 提交到 `v2-server-authoritative`，线上 Worker 从 `main` 读取 release。
- 发布工作流还会使用旧的 `ADMIN_PASSWORD` 重新部署旧分支 Worker。

修复后：

- Runtime Worker 优先使用独立 `RUNTIME_MASTER_KEY` 解密新 release。
- 当前 `2.0.2-r1` 通过只读的 `LEGACY_RUNTIME_PASSWORD` 迁移通道继续工作；该值只用于解密旧 release，不参与管理登录和令牌签名。
- `build_release.py` 只接受 64 位十六进制或 Base64 编码的原始 32 字节主密钥，不再从密码派生。
- 永久发布工作流直接在 `main` 构建、签名并提交 release。
- release 提交到 `main` 后，由主分支 Runtime 部署工作流发布，不再部署旧分支代码。
- 自动测试同时覆盖新 raw-key release 和旧 `2.0.2-r1` 密钥迁移路径。

## 其他已完成修复

- V2 客户端与授权 API 的 challenge、签名激活、检查和解绑协议统一。
- WebView 脚本拦截限定固定 scheme、host 和 path，删除通配 CORS。
- 外部网页不在特权 WebView 中运行。
- 混合内容和第三方 Cookie 关闭。
- 强制更新在运行包下载前执行。
- 设备上限和接口限流改为原子数据库写入。
- 请求体按实际字节数限制。
- WebView 状态恢复失败后重新加载首页。
- 文件选择回调在 WebView 销毁时取消。
- Android 构建目录和依赖目录从 Git 索引删除，CI 禁止再次提交。
- Pull Request 不触发生产 Worker 部署。

## 合并前验收

1. `tests/runtime-key-compat.test.mjs` 通过。
2. `Security and compatibility regression` 全部通过。
3. Android release lint/build 通过。
4. Worker 本地迁移和 Wrangler dry-run 通过。
5. PR 保持 Draft，直到所有检查完成。

## 生产 Secret

`production` Environment 使用：

- `ADMIN_LOGIN_SECRET`
- `TOKEN_SIGNING_SECRET`
- `RUNTIME_MASTER_KEY`
- `LEGACY_RUNTIME_PASSWORD`，迁移期可回退读取现有 `LICENSE_ADMIN_PASSWORD`
- `RELEASE_SIGNING_PASSWORD`，迁移期可回退读取现有 `LICENSE_ADMIN_PASSWORD`

`RUNTIME_MASTER_KEY` 必须是独立随机 32 字节，以 64 位十六进制或 Base64 保存。
''', encoding="utf-8", newline="\n")

print("runtime release chain source repairs applied")
