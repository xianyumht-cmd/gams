const SESSION_SECONDS = 12 * 60 * 60;
const ADMIN_SECONDS = 12 * 60 * 60;
const OFFLINE_GRACE_SECONDS = 24 * 60 * 60;
const CHALLENGE_SECONDS = 90;
const MAX_BODY_BYTES = 96 * 1024;
const MIN_SIGNED_APP_VERSION = 11;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export default {
  async fetch(request, env) {
    try {
      assertConfigured(env);
      if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }));
      const url = new URL(request.url);

      if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
        return reply({
          ok: true,
          service: "gams-license-api",
          version: 2,
          signedProtocol: true,
          minSignedAppVersion: MIN_SIGNED_APP_VERSION,
        });
      }
      if (request.method === "POST" && url.pathname === "/v1/admin/login") {
        return adminLogin(request, env);
      }
      if (request.method === "POST" && url.pathname === "/v1/admin/licenses/create") {
        return adminCreateLicenses(request, env);
      }
      if (request.method === "GET" && url.pathname === "/v1/admin/licenses") {
        return adminListLicenses(request, env);
      }
      if (request.method === "POST" && url.pathname === "/v1/admin/licenses/action") {
        return adminLicenseAction(request, env);
      }
      if (request.method === "POST" && url.pathname === "/v1/challenge") {
        return issueChallenge(request, env);
      }
      if (request.method === "POST" && url.pathname === "/v1/activate") {
        return activate(request, env);
      }
      if (request.method === "POST" && url.pathname === "/v1/check") {
        return check(request, env);
      }
      if (request.method === "POST" && url.pathname === "/v1/device/unbind") {
        return selfUnbind(request, env);
      }
      return reply({ ok: false, code: "not_found", message: "接口不存在" }, 404);
    } catch (error) {
      if (error instanceof HttpError) {
        return reply({ ok: false, code: error.code, message: error.message }, error.status);
      }
      console.error("license-api error", error);
      return reply({ ok: false, code: "server_error", message: "服务器暂时不可用" }, 500);
    }
  },
};

function assertConfigured(env) {
  if (!env.ADMIN_LOGIN_SECRET || !env.TOKEN_SIGNING_SECRET) {
    throw new HttpError(503, "server_misconfigured", "服务配置不完整");
  }
}

async function adminLogin(request, env) {
  const rateKey = await requestRateKey(request, "admin-login");
  if (!(await allowRate(env, rateKey, 5, 600))) {
    throw new HttpError(429, "too_many_requests", "尝试次数过多，请稍后再试");
  }
  const body = await readJson(request);
  const password = text(body.password, 256);
  if (!password || !(await constantTimeTextEqual(password, env.ADMIN_LOGIN_SECRET))) {
    await audit(env, "admin_login_failed", null, null, "");
    throw new HttpError(401, "bad_password", "管理密码错误");
  }
  const now = nowSeconds();
  const token = await signToken({
    typ: "admin",
    iat: now,
    exp: now + ADMIN_SECONDS,
    jti: crypto.randomUUID(),
  }, env);
  await audit(env, "admin_login_ok", null, null, "");
  return reply({ ok: true, token, expiresAt: now + ADMIN_SECONDS });
}

async function adminCreateLicenses(request, env) {
  await requireAdmin(request, env);
  const body = await readJson(request);
  const count = clampInteger(body.count, 1, 50, 1);
  const durationDays = body.durationDays === -1
    ? -1
    : clampInteger(body.durationDays, 1, 3650, 30);
  const maxDevices = clampInteger(body.maxDevices, 1, 10, 1);
  const note = text(body.note, 200);
  const now = nowSeconds();
  const expiresAt = durationDays === -1 ? null : now + durationDays * 86400;
  const created = [];
  const statements = [];

  for (let index = 0; index < count; index += 1) {
    const key = randomKey();
    const id = crypto.randomUUID();
    const keyHash = await sha256Hex(key);
    const preview = `${key.slice(0, 4)}…${key.slice(-4)}`;
    statements.push(env.DB.prepare(
      `INSERT INTO licenses
       (id,key_hash,key_preview,status,created_at,expires_at,max_devices,note)
       VALUES (?,?,?,'active',?,?,?,?)`
    ).bind(id, keyHash, preview, now, expiresAt, maxDevices, note));
    created.push({ id, key, preview, expiresAt, maxDevices });
  }
  await env.DB.batch(statements);
  await audit(env, "licenses_created", null, null,
    JSON.stringify({ count, durationDays, maxDevices }));
  return reply({ ok: true, licenses: created });
}

async function adminListLicenses(request, env) {
  await requireAdmin(request, env);
  const url = new URL(request.url);
  const limit = clampInteger(url.searchParams.get("limit"), 1, 100, 50);
  const rows = await env.DB.prepare(
    `SELECT l.id,l.key_preview,l.status,l.created_at,l.activated_at,l.expires_at,
            l.max_devices,l.note,l.last_seen_at,
            SUM(CASE WHEN d.id IS NOT NULL AND d.revoked_at IS NULL THEN 1 ELSE 0 END)
              AS active_devices
       FROM licenses l
       LEFT JOIN devices d ON d.license_id=l.id
      GROUP BY l.id
      ORDER BY l.created_at DESC
      LIMIT ?`
  ).bind(limit).all();
  return reply({ ok: true, licenses: rows.results || [] });
}

async function adminLicenseAction(request, env) {
  await requireAdmin(request, env);
  const body = await readJson(request);
  const action = text(body.action, 32);
  const license = await findLicenseForAdmin(env, body);
  if (!license) throw new HttpError(404, "license_not_found", "未找到卡密");
  const now = nowSeconds();

  if (action === "disable") {
    await env.DB.prepare("UPDATE licenses SET status='disabled' WHERE id=?")
      .bind(license.id).run();
  } else if (action === "enable") {
    const status = license.expires_at && Number(license.expires_at) <= now
      ? "expired" : "active";
    await env.DB.prepare("UPDATE licenses SET status=? WHERE id=?")
      .bind(status, license.id).run();
  } else if (action === "extend") {
    const days = clampInteger(body.days, 1, 3650, 30);
    const base = license.expires_at && Number(license.expires_at) > now
      ? Number(license.expires_at) : now;
    await env.DB.prepare("UPDATE licenses SET expires_at=?,status='active' WHERE id=?")
      .bind(base + days * 86400, license.id).run();
  } else if (action === "permanent") {
    await env.DB.prepare("UPDATE licenses SET expires_at=NULL,status='active' WHERE id=?")
      .bind(license.id).run();
  } else if (action === "unbind") {
    await env.DB.prepare(
      "UPDATE devices SET revoked_at=?,session_version=session_version+1 " +
      "WHERE license_id=? AND revoked_at IS NULL"
    ).bind(now, license.id).run();
  } else {
    throw new HttpError(400, "bad_action", "不支持的管理操作");
  }

  await audit(env, `license_${action}`, license.id, null,
    JSON.stringify({ days: body.days || null }));
  const updated = await env.DB.prepare(
    `SELECT id,key_preview,status,created_at,activated_at,expires_at,
            max_devices,note,last_seen_at
       FROM licenses WHERE id=?`
  ).bind(license.id).first();
  return reply({ ok: true, license: updated });
}

async function issueChallenge(request, env) {
  const body = await readJson(request);
  const appVersion = appVersionOf(body);
  if (appVersion < MIN_SIGNED_APP_VERSION) {
    throw new HttpError(426, "upgrade_required", "客户端版本过低");
  }
  const deviceHash = normalizeHex64(body.deviceId);
  const purpose = text(body.purpose, 24);
  if (!deviceHash || !["activate", "check", "unbind"].includes(purpose)) {
    throw new HttpError(400, "bad_request", "设备验证信息无效");
  }
  const rateKey = `license-challenge:${deviceHash.slice(0, 20)}:${await requestIpHash(request)}`;
  if (!(await allowRate(env, rateKey, 60, 60))) {
    throw new HttpError(429, "too_many_requests", "操作过于频繁");
  }
  const now = nowSeconds();
  const nonce = base64Url(crypto.getRandomValues(new Uint8Array(24)));
  await env.DB.batch([
    env.DB.prepare("DELETE FROM challenges WHERE expires_at<? OR used_at IS NOT NULL")
      .bind(now - 300),
    env.DB.prepare(
      "INSERT INTO challenges(nonce,device_hash,purpose,created_at,expires_at) " +
      "VALUES(?,?,?,?,?)"
    ).bind(nonce, deviceHash, purpose, now, now + CHALLENGE_SECONDS),
  ]);
  return reply({
    ok: true,
    purpose,
    nonce,
    serverTime: now,
    expiresAt: now + CHALLENGE_SECONDS,
  });
}

async function activate(request, env) {
  const rateKey = await requestRateKey(request, "activate");
  if (!(await allowRate(env, rateKey, 30, 60))) {
    throw new HttpError(429, "too_many_requests", "验证过于频繁，请稍后再试");
  }
  const body = await readJson(request);
  requireSignedVersion(body);
  const key = normalizeKey(body.licenseKey);
  const deviceHash = normalizeHex64(body.deviceId);
  const label = text(body.deviceLabel, 100);
  const publicKeyBase64 = text(body.publicKey, 8192);
  const keyFingerprint = normalizeHex64(body.keyFingerprint);
  const certificateDigest = normalizeHex64(body.certificateDigest);
  if (key.length !== 32) throw new HttpError(400, "bad_key", "卡密必须是 32 位");
  if (!deviceHash || !publicKeyBase64 || !keyFingerprint || !certificateDigest) {
    throw new HttpError(400, "bad_device", "设备标识无效");
  }

  const keyHash = await sha256Hex(key);
  const license = await env.DB.prepare("SELECT * FROM licenses WHERE key_hash=?")
    .bind(keyHash).first();
  if (!license) throw new HttpError(404, "license_not_found", "卡密无效");
  await requireActiveLicense(env, license);

  const publicBytes = base64Decode(publicKeyBase64);
  const actualFingerprint = await sha256HexBytes(publicBytes);
  if (!(await constantTimeTextEqual(actualFingerprint, keyFingerprint))) {
    throw new HttpError(401, "key_mismatch", "设备公钥校验失败");
  }
  const expectedPayloadHash = await sha256Hex(`${key}|${publicKeyBase64}|${label}`);
  await verifySignedRequest(env, body, "activate", publicBytes, expectedPayloadHash, null);

  const now = nowSeconds();
  let device = await env.DB.prepare(
    "SELECT * FROM devices WHERE license_id=? AND device_hash=?"
  ).bind(license.id, deviceHash).first();

  if (device && device.revoked_at == null) {
    if (device.key_fingerprint && device.key_fingerprint !== keyFingerprint) {
      throw new HttpError(401, "key_mismatch", "设备密钥不匹配");
    }
    if (device.certificate_digest && device.certificate_digest !== certificateDigest) {
      throw new HttpError(401, "certificate_changed", "客户端校验失败");
    }
    await env.DB.prepare(
      `UPDATE devices
          SET label=?,last_seen_at=?,public_key=?,key_fingerprint=?,certificate_digest=?
        WHERE id=?`
    ).bind(label, now, publicKeyBase64, keyFingerprint, certificateDigest, device.id).run();
  } else if (device) {
    const reactivated = await env.DB.prepare(
      `UPDATE devices
          SET label=?,last_seen_at=?,revoked_at=NULL,public_key=?,key_fingerprint=?,
              certificate_digest=?,session_version=session_version+1
        WHERE id=? AND revoked_at IS NOT NULL
          AND (SELECT COUNT(*) FROM devices
                WHERE license_id=? AND revoked_at IS NULL)
              < (SELECT max_devices FROM licenses WHERE id=?)`
    ).bind(
      label, now, publicKeyBase64, keyFingerprint, certificateDigest,
      device.id, license.id, license.id
    ).run();
    if (changesOf(reactivated) !== 1) {
      throw new HttpError(409, "device_limit", "该卡密已绑定其他设备，请先解绑");
    }
  } else {
    const deviceId = crypto.randomUUID();
    const inserted = await env.DB.prepare(
      `INSERT INTO devices
       (id,license_id,device_hash,label,created_at,last_seen_at,revoked_at,
        public_key,key_fingerprint,certificate_digest,session_version)
       SELECT ?,?,?,?,?,?,NULL,?,?,?,1
        WHERE (SELECT COUNT(*) FROM devices
                WHERE license_id=? AND revoked_at IS NULL)
              < (SELECT max_devices FROM licenses WHERE id=?)`
    ).bind(
      deviceId, license.id, deviceHash, label, now, now,
      publicKeyBase64, keyFingerprint, certificateDigest,
      license.id, license.id
    ).run();
    if (changesOf(inserted) !== 1) {
      throw new HttpError(409, "device_limit", "该卡密已绑定其他设备，请先解绑");
    }
    await audit(env, "device_bound", license.id, deviceHash, label);
  }

  device = await env.DB.prepare(
    "SELECT * FROM devices WHERE license_id=? AND device_hash=? AND revoked_at IS NULL"
  ).bind(license.id, deviceHash).first();
  if (!device) throw new HttpError(500, "server_error", "设备绑定失败");

  await env.DB.prepare(
    "UPDATE licenses SET activated_at=COALESCE(activated_at,?),last_seen_at=? WHERE id=?"
  ).bind(now, now, license.id).run();
  return licenseSuccess(env, license, device, now);
}

async function check(request, env) {
  const rateKey = await requestRateKey(request, "check");
  if (!(await allowRate(env, rateKey, 120, 60))) {
    throw new HttpError(429, "too_many_requests", "验证过于频繁");
  }
  const body = await readJson(request);
  requireSignedVersion(body);
  const deviceHash = normalizeHex64(body.deviceId);
  const tokenText = text(body.token, 4096);
  const session = await verifyToken(tokenText, env, "session");
  if (!session || session.dev !== deviceHash) {
    throw new HttpError(401, "bad_session", "授权会话无效，请重新输入卡密");
  }
  const { license, device } = await requireActiveDevice(env, session, deviceHash);
  const expectedPayloadHash = await sha256Hex(tokenText);
  await verifySignedRequest(
    env,
    body,
    "check",
    base64Decode(device.public_key),
    expectedPayloadHash,
    device
  );
  const now = nowSeconds();
  await touch(env, license.id, device.id, now);
  return licenseSuccess(env, license, device, now);
}

async function selfUnbind(request, env) {
  const rateKey = await requestRateKey(request, "unbind");
  if (!(await allowRate(env, rateKey, 12, 60))) {
    throw new HttpError(429, "too_many_requests", "操作过于频繁");
  }
  const body = await readJson(request);
  requireSignedVersion(body);
  const deviceHash = normalizeHex64(body.deviceId);
  const tokenText = text(body.token, 4096);
  const session = await verifyToken(tokenText, env, "session");
  if (!session || session.dev !== deviceHash) {
    throw new HttpError(401, "bad_session", "授权会话无效");
  }
  const { license, device } = await requireActiveDevice(env, session, deviceHash);
  const expectedPayloadHash = await sha256Hex(`${tokenText}|unbind`);
  await verifySignedRequest(
    env,
    body,
    "unbind",
    base64Decode(device.public_key),
    expectedPayloadHash,
    device
  );
  const now = nowSeconds();
  const result = await env.DB.prepare(
    "UPDATE devices SET revoked_at=?,session_version=session_version+1 " +
    "WHERE id=? AND revoked_at IS NULL"
  ).bind(now, device.id).run();
  if (changesOf(result) !== 1) {
    throw new HttpError(409, "device_unbound", "设备已解除绑定");
  }
  await audit(env, "device_self_unbound", license.id, deviceHash, "");
  return reply({ ok: true, message: "当前设备已解除绑定" });
}

async function verifySignedRequest(
  env,
  body,
  expectedPurpose,
  publicBytes,
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
  const actualFingerprint = await sha256HexBytes(publicBytes);
  if (!(await constantTimeTextEqual(actualFingerprint, keyFingerprint))) {
    throw new HttpError(401, "key_mismatch", "设备公钥校验失败");
  }
  if (storedDevice) {
    if (storedDevice.key_fingerprint !== keyFingerprint) {
      throw new HttpError(401, "key_mismatch", "设备密钥不匹配");
    }
    if (storedDevice.certificate_digest
        && storedDevice.certificate_digest !== certificateDigest) {
      throw new HttpError(401, "certificate_changed", "客户端校验失败");
    }
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

async function requireActiveDevice(env, session, deviceHash) {
  const license = await env.DB.prepare("SELECT * FROM licenses WHERE id=?")
    .bind(session.lic).first();
  if (!license) throw new HttpError(404, "license_not_found", "授权不存在");
  await requireActiveLicense(env, license);
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

async function requireActiveLicense(env, license) {
  const now = nowSeconds();
  if (license.status === "disabled") {
    throw new HttpError(403, "license_disabled", "卡密已被停用");
  }
  if (license.status === "expired"
      || (license.expires_at && Number(license.expires_at) <= now)) {
    if (license.status !== "expired") {
      await env.DB.prepare("UPDATE licenses SET status='expired' WHERE id=?")
        .bind(license.id).run();
    }
    throw new HttpError(403, "license_expired", "卡密已到期");
  }
}

async function licenseSuccess(env, license, device, now) {
  const token = await signToken({
    typ: "session",
    lic: license.id,
    dev: device.device_hash,
    kid: device.key_fingerprint,
    sv: Number(device.session_version),
    iat: now,
    exp: now + SESSION_SECONDS,
    jti: crypto.randomUUID(),
  }, env);
  const latestAppVersion = clampInteger(env.LATEST_APP_VERSION, 1, 1_000_000,
    MIN_SIGNED_APP_VERSION);
  const forceUpdate = String(env.FORCE_UPDATE || "").toLowerCase() === "true";
  return reply({
    ok: true,
    token,
    tokenExpiresAt: now + SESSION_SECONDS,
    licenseExpiresAt: license.expires_at || null,
    permanent: license.expires_at == null,
    offlineGraceSeconds: OFFLINE_GRACE_SECONDS,
    serverTime: now,
    latestAppVersion,
    forceUpdate,
    updateUrl: text(env.UPDATE_URL, 2048),
    updateMessage: text(env.UPDATE_MESSAGE, 1000),
  });
}

async function requireAdmin(request, env) {
  const authorization = request.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) {
    throw new HttpError(401, "unauthorized", "请先登录管理端");
  }
  const payload = await verifyToken(authorization.slice(7), env, "admin");
  if (!payload) throw new HttpError(401, "unauthorized", "管理登录已失效");
  return payload;
}

async function findLicenseForAdmin(env, body) {
  const id = text(body.id, 64);
  if (id) return env.DB.prepare("SELECT * FROM licenses WHERE id=?").bind(id).first();
  const key = normalizeKey(body.licenseKey);
  if (key.length !== 32) return null;
  return env.DB.prepare("SELECT * FROM licenses WHERE key_hash=?")
    .bind(await sha256Hex(key)).first();
}

async function signToken(payload, env) {
  const encoded = base64Url(encoder.encode(JSON.stringify(payload)));
  const signature = await hmac(encoded, env.TOKEN_SIGNING_SECRET);
  return `${encoded}.${base64Url(signature)}`;
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

async function touch(env, licenseId, deviceId, now = nowSeconds()) {
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

function requireSignedVersion(body) {
  if (appVersionOf(body) < MIN_SIGNED_APP_VERSION) {
    throw new HttpError(426, "upgrade_required", "客户端版本过低");
  }
}

function appVersionOf(body) {
  const value = Number.parseInt(body.appVersion, 10);
  return Number.isFinite(value) ? Math.max(0, Math.min(1_000_000, value)) : 0;
}

function normalizeKey(value) {
  return String(value || "").replace(/[^0-9a-f]/gi, "").toUpperCase();
}

function normalizeHex64(value) {
  const result = String(value || "").trim().toLowerCase();
  return /^[0-9a-f]{64}$/.test(result) ? result : "";
}

function randomKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((value) => value.toString(16).padStart(2, "0"))
    .join("").toUpperCase();
}

async function requestRateKey(request, prefix) {
  return `${prefix}:${await requestIpHash(request)}`;
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

async function constantTimeTextEqual(left, right) {
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(String(left))),
    crypto.subtle.digest("SHA-256", encoder.encode(String(right))),
  ]);
  return constantTimeBytes(new Uint8Array(leftHash), new Uint8Array(rightHash));
}

function constantTimeBytes(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

function base64Url(bytes) {
  return base64Standard(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
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

function base64UrlDecode(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  return base64Decode(normalized + "=".repeat((4 - normalized.length % 4) % 4));
}

function text(value, maximum) {
  return String(value == null ? "" : value).trim().slice(0, maximum);
}

function clampInteger(value, minimum, maximum, fallback) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number)
    ? Math.min(maximum, Math.max(minimum, number))
    : fallback;
}

function changesOf(result) {
  return Number(result?.meta?.changes ?? result?.changes ?? 0);
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function cors(response) {
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-allow-methods", "GET,POST,OPTIONS");
  headers.set("access-control-allow-headers", "content-type,authorization");
  headers.set("cache-control", "no-store, no-cache, max-age=0");
  headers.set("pragma", "no-cache");
  headers.set("x-content-type-options", "nosniff");
  return new Response(response.body, { status: response.status, headers });
}

function reply(data, status = 200) {
  return cors(new Response(JSON.stringify(data), {
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
