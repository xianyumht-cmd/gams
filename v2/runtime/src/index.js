import { decryptRuntimeContentKey } from "./runtime-key.js";

const MIN_V2_APP_VERSION = 11;
const CHALLENGE_SECONDS = 90;
const MAX_BODY_BYTES = 96 * 1024;
const MAX_MANIFEST_BYTES = 128 * 1024;
const RELEASE_BASE =
  "https://raw.githubusercontent.com/xianyumht-cmd/gams/main/v2/runtime/release/";
const CANDIDATE_APP_VERSION = 19;
const CANDIDATE_RUNTIME_VERSION = "2.0.5-script-repeat-c1";
const CANDIDATE_RELEASE_BASE =
  "https://raw.githubusercontent.com/xianyumht-cmd/gams/candidate-script-repeat-20260804/candidate-runtime/release/";
const REMOTE_ENGINE_AB_APP_VERSION = 20;
const REMOTE_ENGINE_AB_RUNTIME_VERSION = "2.0.6-remote-engine-ab-c1";
const REMOTE_ENGINE_AB_RELEASE_BASE =
  "https://raw.githubusercontent.com/xianyumht-cmd/gams/candidate-remote-engine-ab-20260804/candidate-runtime-remote-engine/release/";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const releaseCache = new Map();

export default {
  async fetch(request, env) {
    try {
      assertConfigured(env);
      if (request.method === "OPTIONS") {
        return noStore(new Response(null, { status: 204 }));
      }
      const url = new URL(request.url);
      if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
        let candidateRuntimeVersion = null;
        let remoteEngineAbRuntimeVersion = null;
        const candidateQuery = url.searchParams.get("candidate");
        if (candidateQuery === "1") {
          const candidateManifest = await loadReleaseManifest(CANDIDATE_RELEASE_BASE);
          candidateRuntimeVersion = candidateManifest.versionName;
        }
        if (candidateQuery === "20") {
          const remoteEngineAbManifest = await loadReleaseManifest(REMOTE_ENGINE_AB_RELEASE_BASE);
          remoteEngineAbRuntimeVersion = remoteEngineAbManifest.versionName;
        }
        return json({
          ok: true,
          service: "gams-runtime-v2",
          version: 3,
          keyWrap: "RSA-OAEP-SHA1",
          minAppVersion: MIN_V2_APP_VERSION,
          encryptedRuntime: true,
          splitSecrets: true,
          legacyReleaseCompatible: true,
          candidateChannel: true,
          candidateAppVersion: CANDIDATE_APP_VERSION,
          candidateRuntimeVersion,
          remoteEngineAbAppVersion: REMOTE_ENGINE_AB_APP_VERSION,
          remoteEngineAbRuntimeVersion,
        });
      }
      if (request.method === "POST" && url.pathname === "/v2/runtime/challenge") {
        return await issueChallenge(request, env);
      }
      if (request.method === "POST" && url.pathname === "/v2/runtime/access") {
        return await runtimeAccess(request, env);
      }
      if (request.method === "GET" && url.pathname === "/v2/runtime/bundle") {
        return await runtimeBundle(request, env);
      }
      return json({ ok: false, code: "not_found", message: "接口不存在" }, 404);
    } catch (error) {
      if (error instanceof HttpError) {
        return json({ ok: false, code: error.code, message: error.message }, error.status);
      }
      console.error("runtime-v2 error", error);
      return json({ ok: false, code: "server_error", message: "服务暂时不可用" }, 500);
    }
  },
};

function assertConfigured(env) {
  if (!env.TOKEN_SIGNING_SECRET || !env.RUNTIME_MASTER_KEY) {
    throw new HttpError(503, "server_misconfigured", "服务配置不完整");
  }
}

async function issueChallenge(request, env) {
  const body = await readJson(request);
  const appVersion = appVersionOf(body);
  if (appVersion < MIN_V2_APP_VERSION) {
    throw new HttpError(426, "upgrade_required", "客户端版本过低");
  }
  const deviceHash = normalizeHex64(body.deviceId);
  const purpose = text(body.purpose, 24);
  if (!deviceHash || purpose !== "runtime") {
    throw new HttpError(400, "bad_request", "设备验证信息无效");
  }
  const rateKey = `v2-challenge:${deviceHash.slice(0, 20)}:${await requestIpHash(request)}`;
  if (!(await allowRate(env, rateKey, 60, 60))) {
    throw new HttpError(429, "too_many_requests", "操作过于频繁");
  }
  const now = nowSeconds();
  const nonce = base64Url(crypto.getRandomValues(new Uint8Array(24)));
  await env.DB.batch([
    env.DB.prepare("DELETE FROM challenges WHERE expires_at<? OR used_at IS NOT NULL")
      .bind(now - 300),
    env.DB.prepare(
      "INSERT INTO challenges(nonce,device_hash,purpose,created_at,expires_at) VALUES(?,?,?,?,?)"
    ).bind(nonce, deviceHash, purpose, now, now + CHALLENGE_SECONDS),
  ]);
  return json({
    ok: true,
    purpose,
    nonce,
    serverTime: now,
    expiresAt: now + CHALLENGE_SECONDS,
  });
}

async function runtimeAccess(request, env) {
  await requireRuntimeEnabled(env);
  const body = await readJson(request);
  const appVersion = appVersionOf(body);
  if (appVersion < MIN_V2_APP_VERSION) {
    throw new HttpError(426, "upgrade_required", "客户端版本过低");
  }

  const tokenText = text(body.token, 4096);
  const deviceHash = normalizeHex64(body.deviceId);
  const session = await verifyToken(tokenText, env, "session");
  if (!session || session.dev !== deviceHash) {
    throw new HttpError(401, "bad_session", "授权会话无效");
  }

  const { license, device } = await requireActiveDevice(env, session, deviceHash);
  const runtimePublicKey = text(body.runtimePublicKey, 8192);
  const runtimeFingerprint = normalizeHex64(body.runtimeKeyFingerprint);
  if (!runtimePublicKey || !runtimeFingerprint) {
    throw new HttpError(400, "bad_runtime_key", "运行密钥无效");
  }

  const runtimePublicBytes = base64Decode(runtimePublicKey);
  const actualRuntimeFingerprint = await sha256HexBytes(runtimePublicBytes);
  if (!(await constantTimeTextEqual(actualRuntimeFingerprint, runtimeFingerprint))) {
    throw new HttpError(401, "runtime_key_mismatch", "运行密钥校验失败");
  }

  const expectedPayloadHash = await sha256Hex(`${tokenText}|${runtimeFingerprint}`);
  await verifySignedRequest(
    env,
    body,
    "runtime",
    device.public_key,
    expectedPayloadHash,
    device
  );

  const rateKey = `v2-access:${license.id}:${device.id}`;
  if (!(await allowRate(env, rateKey, 12, 60))) {
    throw new HttpError(429, "too_many_requests", "启动过于频繁");
  }

  const releaseBase = releaseBaseForAppVersion(appVersion);
  const manifest = await loadReleaseManifest(releaseBase);
  const contentKey = await decryptContentKey(manifest, env);
  let wrappedKey;
  try {
    let runtimeKey;
    try {
      runtimeKey = await crypto.subtle.importKey(
        "spki",
        runtimePublicBytes,
        { name: "RSA-OAEP", hash: "SHA-1" },
        false,
        ["encrypt"]
      );
    } catch {
      throw new HttpError(400, "bad_runtime_key", "运行密钥无效");
    }
    wrappedKey = new Uint8Array(
      await crypto.subtle.encrypt({ name: "RSA-OAEP" }, runtimeKey, contentKey)
    );
  } finally {
    contentKey.fill(0);
  }

  await touch(env, license.id, device.id);
  await audit(env, "v2_runtime_access", license.id, deviceHash, JSON.stringify({
    version: manifest.versionName,
    runtimeKey: runtimeFingerprint.slice(0, 16),
  }));

  return json({
    ok: true,
    manifest,
    wrappedKey: base64Standard(wrappedKey),
    bundlePath: `/v2/runtime/bundle?version=${encodeURIComponent(manifest.versionName)}`,
    serverTime: nowSeconds(),
    expiresAt: Math.min(Number(session.exp || 0), nowSeconds() + 600),
  });
}


async function runtimeBundle(request, env) {
  await requireRuntimeEnabled(env);
  const authorization = request.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) {
    throw new HttpError(401, "unauthorized", "登录状态已失效");
  }
  const tokenText = authorization.slice(7);
  const session = await verifyToken(tokenText, env, "session");
  if (!session) throw new HttpError(401, "bad_session", "授权会话无效");
  const deviceHash = normalizeHex64(session.dev);
  const { license, device } = await requireActiveDevice(env, session, deviceHash);

  const requestedVersion = new URL(request.url).searchParams.get("version") || "";
  const release = await releaseForRequestedVersion(requestedVersion);
  const manifest = release.manifest;

  const rateKey = `v2-bundle:${license.id}:${device.id}`;
  if (!(await allowRate(env, rateKey, 20, 60))) {
    throw new HttpError(429, "too_many_requests", "请求过于频繁，请稍后重试");
  }

  const upstream = await githubFetch(`${release.releaseBase}${manifest.file}`);
  if (!upstream.ok) {
    throw new HttpError(503, "runtime_unavailable", "服务资源暂时不可用");
  }
  const bytes = new Uint8Array(await upstream.arrayBuffer());
  if (bytes.byteLength !== Number(manifest.size)) {
    throw new HttpError(503, "runtime_invalid", "服务资源校验失败");
  }
  const digest = await sha256HexBytes(bytes);
  if (!(await constantTimeTextEqual(digest, String(manifest.sha256).toLowerCase()))) {
    throw new HttpError(503, "runtime_invalid", "服务资源校验失败");
  }

  await touch(env, license.id, device.id);
  const headers = new Headers({
    "content-type": "application/octet-stream",
    "content-length": String(bytes.byteLength),
    "cache-control": "no-store, no-cache, max-age=0",
    "pragma": "no-cache",
    "x-content-type-options": "nosniff",
    "x-runtime-version": manifest.versionName,
  });
  return new Response(bytes, { status: 200, headers });
}


async function requireRuntimeEnabled(env) {
  try {
    const row = await env.DB.prepare(
      "SELECT settings_json FROM system_settings WHERE id=1"
    ).first();
    if (!row) return;
    const settings = JSON.parse(row.settings_json || "{}");
    if (settings.scriptDeliveryEnabled === false) {
      throw new HttpError(503, "runtime_paused", "服务维护中，请稍后再试");
    }
  } catch (error) {
    if (error instanceof HttpError) throw error;
    console.warn("runtime settings fallback", error);
  }
}

async function requireActiveDevice(env, session, deviceHash) {
  const license = await env.DB.prepare("SELECT * FROM licenses WHERE id=?")
    .bind(session.lic).first();
  if (!license) throw new HttpError(404, "license_not_found", "授权不存在");
  const now = nowSeconds();
  if (license.status === "disabled") {
    throw new HttpError(403, "license_disabled", "服务已暂停");
  }
  if (license.status === "expired"
      || (license.expires_at && Number(license.expires_at) <= now)) {
    throw new HttpError(403, "license_expired", "服务已到期");
  }

  const device = await env.DB.prepare(
    "SELECT * FROM devices WHERE license_id=? AND device_hash=? AND revoked_at IS NULL"
  ).bind(license.id, deviceHash).first();
  if (!device || !device.public_key || !device.key_fingerprint) {
    throw new HttpError(401, "device_unbound", "当前设备未完成授权");
  }
  if (session.kid !== device.key_fingerprint
      || Number(session.sv) !== Number(device.session_version)) {
    throw new HttpError(401, "bad_session", "设备会话已更新，请重新启动");
  }
  return { license, device };
}

async function verifySignedRequest(
  env,
  body,
  expectedPurpose,
  publicKeyBase64,
  expectedPayloadHash,
  storedDevice
) {
  const deviceHash = normalizeHex64(body.deviceId);
  const purpose = text(body.purpose, 24);
  const nonce = text(body.nonce, 128);
  const timestamp = Number(body.timestamp);
  const keyFingerprint = normalizeHex64(body.keyFingerprint);
  const certificateDigest = normalizeHex64(body.certificateDigest);
  const payloadHash = normalizeHex64(body.payloadHash);
  const signature = text(body.signature, 2048);
  if (!deviceHash || purpose !== expectedPurpose || !nonce || !Number.isFinite(timestamp)
      || !keyFingerprint || !certificateDigest || !payloadHash || !signature) {
    throw new HttpError(400, "bad_signature_request", "设备验证信息无效");
  }
  if (Math.abs(nowSeconds() - timestamp) > 120) {
    throw new HttpError(401, "stale_request", "验证请求已过期");
  }
  if (!(await constantTimeTextEqual(payloadHash, expectedPayloadHash))) {
    throw new HttpError(401, "payload_mismatch", "设备验证失败");
  }
  if (storedDevice.key_fingerprint !== keyFingerprint) {
    throw new HttpError(401, "key_mismatch", "设备密钥不匹配");
  }
  if (storedDevice.certificate_digest
      && storedDevice.certificate_digest !== certificateDigest) {
    throw new HttpError(401, "certificate_changed", "客户端校验失败");
  }

  const publicBytes = base64Decode(publicKeyBase64);
  const actualFingerprint = await sha256HexBytes(publicBytes);
  if (!(await constantTimeTextEqual(actualFingerprint, keyFingerprint))) {
    throw new HttpError(401, "key_mismatch", "设备公钥校验失败");
  }
  const canonical = [
    purpose,
    nonce,
    String(timestamp),
    deviceHash,
    keyFingerprint,
    String(appVersionOf(body)),
    certificateDigest,
    payloadHash,
  ].join("\n");
  let publicKey;
  try {
    publicKey = await crypto.subtle.importKey(
      "spki",
      publicBytes,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"]
    );
  } catch {
    throw new HttpError(400, "bad_public_key", "设备公钥无效");
  }
  let verified = false;
  try {
    verified = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      publicKey,
      base64Decode(signature),
      encoder.encode(canonical)
    );
  } catch {
    verified = false;
  }
  if (!verified) throw new HttpError(401, "bad_signature", "设备验证失败");

  const consumed = await env.DB.prepare(
    "UPDATE challenges SET used_at=? WHERE nonce=? AND device_hash=? AND purpose=? " +
    "AND used_at IS NULL AND expires_at>=?"
  ).bind(nowSeconds(), nonce, deviceHash, purpose, nowSeconds()).run();
  if (changesOf(consumed) !== 1) {
    throw new HttpError(401, "bad_nonce", "验证请求已失效");
  }
}

function releaseBaseForAppVersion(appVersion) {
  if (appVersion === REMOTE_ENGINE_AB_APP_VERSION) return REMOTE_ENGINE_AB_RELEASE_BASE;
  if (appVersion === CANDIDATE_APP_VERSION) return CANDIDATE_RELEASE_BASE;
  return RELEASE_BASE;
}

async function releaseForRequestedVersion(requestedVersion) {
  const productionManifest = await loadReleaseManifest(RELEASE_BASE);
  if (requestedVersion === productionManifest.versionName) {
    return { manifest: productionManifest, releaseBase: RELEASE_BASE };
  }
  if (requestedVersion === CANDIDATE_RUNTIME_VERSION) {
    const candidateManifest = await loadReleaseManifest(CANDIDATE_RELEASE_BASE);
    if (candidateManifest.versionName === requestedVersion) {
      return { manifest: candidateManifest, releaseBase: CANDIDATE_RELEASE_BASE };
    }
  }
  if (requestedVersion === REMOTE_ENGINE_AB_RUNTIME_VERSION) {
    const remoteEngineAbManifest = await loadReleaseManifest(REMOTE_ENGINE_AB_RELEASE_BASE);
    if (remoteEngineAbManifest.versionName === requestedVersion) {
      return { manifest: remoteEngineAbManifest, releaseBase: REMOTE_ENGINE_AB_RELEASE_BASE };
    }
  }
  throw new HttpError(409, "runtime_version_changed", "服务已更新，请重新启动");
}

async function loadReleaseManifest(releaseBase = RELEASE_BASE) {
  const now = Date.now();
  const cached = releaseCache.get(releaseBase);
  if (cached && cached.expiresAt > now) return cached.manifest;
  const response = await githubFetch(`${releaseBase}manifest.json`);
  if (!response.ok) {
    throw new HttpError(503, "runtime_unavailable", "服务配置暂时不可用");
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_MANIFEST_BYTES) {
    throw new HttpError(503, "runtime_invalid", "服务配置异常");
  }
  let manifest;
  try {
    manifest = JSON.parse(decoder.decode(bytes));
  } catch {
    throw new HttpError(503, "runtime_invalid", "服务配置异常");
  }
  if (manifest.schemaVersion !== 2
      || !/^[A-Za-z0-9._-]+\.bin$/.test(String(manifest.file || ""))
      || !/^[0-9a-f]{64}$/.test(String(manifest.sha256 || ""))
      || Number(manifest.size || 0) <= 0
      || Number(manifest.size || 0) > 18 * 1024 * 1024) {
    throw new HttpError(503, "runtime_invalid", "服务配置异常");
  }
  releaseCache.set(releaseBase, { manifest, expiresAt: now + 30_000 });
  return manifest;
}

async function decryptContentKey(manifest, env) {
  try {
    return await decryptRuntimeContentKey(manifest, {
      runtimeMasterKey: env.RUNTIME_MASTER_KEY,
      legacyRuntimePassword: env.ADMIN_PASSWORD || env.LEGACY_RUNTIME_PASSWORD || "",
    });
  } catch {
    throw new HttpError(503, "runtime_invalid", "运行密钥无效");
  }
}

async function verifyToken(token, env, expectedType) {
  try {
    const parts = String(token || "").split(".");
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
    const expected = await hmac(parts[0], env.TOKEN_SIGNING_SECRET);
    const supplied = base64UrlDecode(parts[1]);
    if (!constantTimeBytes(expected, supplied)) return null;
    const payload = JSON.parse(decoder.decode(base64UrlDecode(parts[0])));
    if (payload.typ !== expectedType || !Number.isFinite(payload.exp)
        || payload.exp <= nowSeconds()) return null;
    return payload;
  } catch {
    return null;
  }
}

async function hmac(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(String(secret)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

async function allowRate(env, key, limit, windowSeconds) {
  const now = nowSeconds();
  const row = await env.DB.prepare(
    `INSERT INTO rate_limits(key,window_start,count) VALUES(?,?,1)
     ON CONFLICT(key) DO UPDATE SET
       count=CASE WHEN ?-window_start>=? THEN 1 ELSE count+1 END,
       window_start=CASE WHEN ?-window_start>=? THEN ? ELSE window_start END
     RETURNING count`
  ).bind(key, now, now, windowSeconds, now, windowSeconds, now).first();
  return Number(row?.count || 0) <= limit;
}

async function touch(env, licenseId, deviceId) {
  const now = nowSeconds();
  await env.DB.batch([
    env.DB.prepare("UPDATE devices SET last_seen_at=? WHERE id=?").bind(now, deviceId),
    env.DB.prepare("UPDATE licenses SET last_seen_at=? WHERE id=?").bind(now, licenseId),
  ]);
}

async function audit(env, event, licenseId, deviceHash, detail) {
  try {
    await env.DB.prepare(
      "INSERT INTO audit_log(id,event,license_id,device_hash,detail,created_at) " +
      "VALUES(?,?,?,?,?,?)"
    ).bind(
      crypto.randomUUID(), event, licenseId, deviceHash, detail || "", nowSeconds()
    ).run();
  } catch (error) {
    console.warn("audit failed", error);
  }
}

async function readJson(request) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw new HttpError(413, "body_too_large", "请求内容过大");
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > MAX_BODY_BYTES) {
    throw new HttpError(413, "body_too_large", "请求内容过大");
  }
  try {
    return bytes.byteLength ? JSON.parse(decoder.decode(bytes)) : {};
  } catch {
    throw new HttpError(400, "bad_json", "请求格式错误");
  }
}

function githubFetch(url) {
  return fetch(url, {
    headers: {
      "Accept": "application/vnd.github.raw",
      "User-Agent": "GG-Runtime-V2/3",
    },
    cf: { cacheEverything: true, cacheTtl: 30 },
  });
}

async function requestIpHash(request) {
  return sha256Hex(request.headers.get("cf-connecting-ip") || "unknown");
}

async function sha256Hex(value) {
  return sha256HexBytes(encoder.encode(String(value)));
}

async function sha256HexBytes(bytes) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...digest].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function constantTimeTextEqual(leftValue, rightValue) {
  const [left, right] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(String(leftValue))),
    crypto.subtle.digest("SHA-256", encoder.encode(String(rightValue))),
  ]);
  return constantTimeBytes(new Uint8Array(left), new Uint8Array(right));
}

function constantTimeBytes(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

function appVersionOf(body) {
  const value = Number.parseInt(body.appVersion, 10);
  return Number.isFinite(value) ? Math.max(0, Math.min(1_000_000, value)) : 0;
}

function normalizeHex64(value) {
  const result = String(value || "").trim().toLowerCase();
  return /^[0-9a-f]{64}$/.test(result) ? result : "";
}

function text(value, maximum) {
  return String(value == null ? "" : value).trim().slice(0, maximum);
}

function changesOf(result) {
  return Number(result?.meta?.changes ?? result?.changes ?? 0);
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function base64Standard(bytes) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function base64Decode(value) {
  try {
    const binary = atob(String(value || ""));
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    throw new HttpError(400, "bad_base64", "编码数据无效");
  }
}

function base64Url(bytes) {
  return base64Standard(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  return base64Decode(normalized + "=".repeat((4 - normalized.length % 4) % 4));
}

function noStore(response) {
  const headers = new Headers(response.headers);
  headers.set("cache-control", "no-store, no-cache, max-age=0");
  headers.set("pragma", "no-cache");
  headers.set("x-content-type-options", "nosniff");
  return new Response(response.body, { status: response.status, headers });
}

function json(data, status = 200) {
  return noStore(new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  }));
}

class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
