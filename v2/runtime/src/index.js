const MIN_V2_APP_VERSION = 9;
const CHALLENGE_SECONDS = 90;
const MAX_BODY_BYTES = 96 * 1024;
const RELEASE_BASE =
  "https://raw.githubusercontent.com/xianyumht-cmd/gams/v2-server-authoritative/v2/runtime/release/";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
let releaseCache = null;

export default {
  async fetch(request, env) {
    try {
      if (request.method === "OPTIONS") {
        return noStore(new Response(null, { status: 204 }));
      }
      const url = new URL(request.url);
      if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
        return json({
          ok: true,
          service: "gams-runtime-v2",
          version: 1,
          minAppVersion: MIN_V2_APP_VERSION,
          encryptedRuntime: true,
        });
      }
      if (request.method === "POST" && url.pathname === "/v2/runtime/challenge") {
        return issueChallenge(request, env);
      }
      if (request.method === "POST" && url.pathname === "/v2/runtime/access") {
        return runtimeAccess(request, env);
      }
      if (request.method === "GET" && url.pathname === "/v2/runtime/bundle") {
        return runtimeBundle(request, env);
      }
      return json({ ok: false, code: "not_found", message: "接口不存在" }, 404);
    } catch (error) {
      if (error instanceof HttpError) {
        return json({ ok: false, code: error.code, message: error.message }, error.status);
      }
      console.error("runtime-v2 error", error);
      return json({ ok: false, code: "server_error", message: "V2运行服务暂时不可用" }, 500);
    }
  },
};

async function issueChallenge(request, env) {
  const body = await readJson(request);
  const appVersion = appVersionOf(body);
  if (appVersion < MIN_V2_APP_VERSION) {
    throw new HttpError(426, "upgrade_required", "V2客户端版本过低");
  }
  const deviceHash = normalizeHex64(body.deviceId);
  const purpose = text(body.purpose, 24);
  if (!deviceHash || purpose !== "runtime") {
    throw new HttpError(400, "bad_request", "V2设备验证信息无效");
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
  const body = await readJson(request);
  const appVersion = appVersionOf(body);
  if (appVersion < MIN_V2_APP_VERSION) {
    throw new HttpError(426, "upgrade_required", "V2客户端版本过低");
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
    throw new HttpError(400, "bad_runtime_key", "V2运行密钥无效");
  }

  const runtimePublicBytes = base64Decode(runtimePublicKey);
  const actualRuntimeFingerprint = await sha256HexBytes(runtimePublicBytes);
  if (!(await constantTimeTextEqual(actualRuntimeFingerprint, runtimeFingerprint))) {
    throw new HttpError(401, "runtime_key_mismatch", "V2运行密钥校验失败");
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
    throw new HttpError(429, "too_many_requests", "V2初始化过于频繁");
  }

  const manifest = await loadReleaseManifest();
  const contentKey = await decryptContentKey(manifest, env);
  let wrappedKey;
  try {
    const runtimeKey = await crypto.subtle.importKey(
      "spki",
      runtimePublicBytes,
      { name: "RSA-OAEP", hash: "SHA-256" },
      false,
      ["encrypt"]
    );
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
  const authorization = request.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) {
    throw new HttpError(401, "unauthorized", "缺少V2授权会话");
  }
  const tokenText = authorization.slice(7);
  const session = await verifyToken(tokenText, env, "session");
  if (!session) throw new HttpError(401, "bad_session", "授权会话无效");
  const deviceHash = normalizeHex64(session.dev);
  const { license, device } = await requireActiveDevice(env, session, deviceHash);

  const manifest = await loadReleaseManifest();
  const requestedVersion = new URL(request.url).searchParams.get("version") || "";
  if (requestedVersion !== manifest.versionName) {
    throw new HttpError(409, "runtime_version_changed", "V2运行版本已更新，请重新初始化");
  }

  const rateKey = `v2-bundle:${license.id}:${device.id}`;
  if (!(await allowRate(env, rateKey, 20, 60))) {
    throw new HttpError(429, "too_many_requests", "V2运行包请求过于频繁");
  }

  const upstream = await githubFetch(`${RELEASE_BASE}${manifest.file}`);
  if (!upstream.ok) {
    throw new HttpError(503, "runtime_unavailable", "V2加密运行包暂时不可用");
  }
  const bytes = new Uint8Array(await upstream.arrayBuffer());
  if (bytes.length !== Number(manifest.size)) {
    throw new HttpError(503, "runtime_invalid", "V2加密运行包大小校验失败");
  }
  const digest = await sha256HexBytes(bytes);
  if (!(await constantTimeTextEqual(digest, String(manifest.sha256).toLowerCase()))) {
    throw new HttpError(503, "runtime_invalid", "V2加密运行包完整性校验失败");
  }

  await touch(env, license.id, device.id);
  const headers = new Headers({
    "content-type": "application/octet-stream",
    "content-length": String(bytes.length),
    "cache-control": "no-store, no-cache, max-age=0",
    "pragma": "no-cache",
    "x-content-type-options": "nosniff",
    "x-runtime-version": manifest.versionName,
  });
  return new Response(bytes, { status: 200, headers });
}

async function requireActiveDevice(env, session, deviceHash) {
  const license = await env.DB.prepare("SELECT * FROM licenses WHERE id=?")
    .bind(session.lic).first();
  if (!license) throw new HttpError(404, "license_not_found", "授权不存在");
  const now = nowSeconds();
  if (license.status === "disabled") {
    throw new HttpError(403, "license_disabled", "服务已暂停");
  }
  if (license.status === "expired" ||
      (license.expires_at && Number(license.expires_at) <= now)) {
    throw new HttpError(403, "license_expired", "服务已到期");
  }

  const device = await env.DB.prepare(
    "SELECT * FROM devices WHERE license_id=? AND device_hash=? AND revoked_at IS NULL"
  ).bind(license.id, deviceHash).first();
  if (!device || !device.public_key || !device.key_fingerprint) {
    throw new HttpError(401, "device_unbound", "当前设备未绑定V2安全身份");
  }
  if (session.kid !== device.key_fingerprint ||
      Number(session.sv) !== Number(device.session_version)) {
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
  const signature = text(body.signature, 1024);
  if (!deviceHash || purpose !== expectedPurpose || !nonce || !Number.isFinite(timestamp)) {
    throw new HttpError(400, "bad_signature_request", "V2签名请求无效");
  }
  if (Math.abs(nowSeconds() - timestamp) > 120) {
    throw new HttpError(401, "stale_request", "V2请求已过期");
  }
  if (!(await constantTimeTextEqual(payloadHash, expectedPayloadHash))) {
    throw new HttpError(401, "payload_mismatch", "V2请求摘要不匹配");
  }
  if (storedDevice.key_fingerprint !== keyFingerprint) {
    throw new HttpError(401, "key_mismatch", "设备密钥不匹配");
  }
  if (storedDevice.certificate_digest &&
      storedDevice.certificate_digest !== certificateDigest) {
    throw new HttpError(401, "certificate_changed", "V2客户端签名发生变化");
  }

  const consumed = await env.DB.prepare(
    "UPDATE challenges SET used_at=? WHERE nonce=? AND device_hash=? AND purpose=? " +
    "AND used_at IS NULL AND expires_at>=?"
  ).bind(nowSeconds(), nonce, deviceHash, purpose, nowSeconds()).run();
  if (Number(consumed.meta?.changes || 0) !== 1) {
    throw new HttpError(401, "bad_nonce", "V2验证请求已失效");
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
  const publicKey = await crypto.subtle.importKey(
    "spki",
    publicBytes,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"]
  );
  const ok = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    publicKey,
    base64Decode(signature),
    encoder.encode(canonical)
  );
  if (!ok) throw new HttpError(401, "bad_signature", "V2设备签名校验失败");
}

async function loadReleaseManifest() {
  const now = Date.now();
  if (releaseCache && releaseCache.expiresAt > now) return releaseCache.manifest;
  const response = await githubFetch(`${RELEASE_BASE}manifest.json`);
  if (!response.ok) {
    throw new HttpError(503, "runtime_unavailable", "V2运行清单暂时不可用");
  }
  const textBody = await response.text();
  if (textBody.length > 128 * 1024) {
    throw new HttpError(503, "runtime_invalid", "V2运行清单异常");
  }
  let manifest;
  try {
    manifest = JSON.parse(textBody);
  } catch {
    throw new HttpError(503, "runtime_invalid", "V2运行清单格式无效");
  }
  if (manifest.schemaVersion !== 2 ||
      !/^[A-Za-z0-9._-]+\.bin$/.test(String(manifest.file || "")) ||
      !/^[0-9a-f]{64}$/.test(String(manifest.sha256 || "")) ||
      Number(manifest.size || 0) <= 0 ||
      Number(manifest.size || 0) > 18 * 1024 * 1024) {
    throw new HttpError(503, "runtime_invalid", "V2运行清单内容无效");
  }
  releaseCache = { manifest, expiresAt: now + 30_000 };
  return manifest;
}

async function decryptContentKey(manifest, env) {
  const masterBytes = new Uint8Array(await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(`gg-v2-runtime-master:${env.ADMIN_PASSWORD || ""}`)
  ));
  const masterKey = await crypto.subtle.importKey(
    "raw",
    masterBytes,
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );
  try {
    const plain = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: base64Decode(manifest.keyIv),
        additionalData: encoder.encode(`gg-v2-key|${manifest.versionName}`),
        tagLength: 128,
      },
      masterKey,
      base64Decode(manifest.keyCipher)
    );
    const bytes = new Uint8Array(plain);
    if (bytes.length !== 32) {
      bytes.fill(0);
      throw new HttpError(503, "runtime_invalid", "V2运行密钥无效");
    }
    return bytes;
  } finally {
    masterBytes.fill(0);
  }
}

async function verifyToken(token, env, expectedType) {
  try {
    const [payloadPart, signaturePart] = String(token || "").split(".");
    if (!payloadPart || !signaturePart) return null;
    const expected = await hmac(payloadPart, env.ADMIN_PASSWORD || "");
    const supplied = base64UrlDecode(signaturePart);
    if (!constantTimeBytes(expected, supplied)) return null;
    const payload = JSON.parse(decoder.decode(base64UrlDecode(payloadPart)));
    if (payload.typ !== expectedType ||
        !Number.isFinite(payload.exp) ||
        payload.exp <= nowSeconds()) return null;
    return payload;
  } catch {
    return null;
  }
}

async function hmac(textValue, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(`gams-license-v1:${secret}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(textValue))
  );
}

async function allowRate(env, key, limit, windowSeconds) {
  const now = nowSeconds();
  const row = await env.DB.prepare(
    "SELECT window_start,count FROM rate_limits WHERE key=?"
  ).bind(key).first();
  if (!row || now - Number(row.window_start) >= windowSeconds) {
    await env.DB.prepare(
      "INSERT INTO rate_limits(key,window_start,count) VALUES(?,?,1) " +
      "ON CONFLICT(key) DO UPDATE SET window_start=excluded.window_start,count=1"
    ).bind(key, now).run();
    return true;
  }
  if (Number(row.count) >= limit) return false;
  await env.DB.prepare("UPDATE rate_limits SET count=count+1 WHERE key=?")
    .bind(key).run();
  return true;
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
      crypto.randomUUID(),
      event,
      licenseId,
      deviceHash,
      detail || "",
      nowSeconds()
    ).run();
  } catch (error) {
    console.warn("audit failed", error);
  }
}

async function readJson(request) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > MAX_BODY_BYTES) {
    throw new HttpError(413, "body_too_large", "请求内容过大");
  }
  const body = await request.text();
  if (body.length > MAX_BODY_BYTES) {
    throw new HttpError(413, "body_too_large", "请求内容过大");
  }
  try {
    return body ? JSON.parse(body) : {};
  } catch {
    throw new HttpError(400, "bad_json", "请求格式错误");
  }
}

function githubFetch(url) {
  return fetch(url, {
    headers: {
      "Accept": "application/vnd.github.raw",
      "User-Agent": "GG-Runtime-V2/1",
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

async function constantTimeTextEqual(a, b) {
  const [left, right] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(String(a))),
    crypto.subtle.digest("SHA-256", encoder.encode(String(b))),
  ]);
  return constantTimeBytes(new Uint8Array(left), new Uint8Array(right));
}

function constantTimeBytes(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a[index] ^ b[index];
  return diff === 0;
}

function appVersionOf(body) {
  const value = Number.parseInt(body.appVersion, 10);
  return Number.isFinite(value) ? Math.max(0, Math.min(1000000, value)) : 0;
}

function normalizeHex64(value) {
  const result = String(value || "").trim().toLowerCase();
  return /^[0-9a-f]{64}$/.test(result) ? result : "";
}

function text(value, maximum) {
  return String(value == null ? "" : value).trim().slice(0, maximum);
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
  const binary = atob(String(value || ""));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
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
