const SESSION_SECONDS = 12 * 60 * 60;
const ADMIN_SECONDS = 12 * 60 * 60;
const OFFLINE_GRACE_SECONDS = 24 * 60 * 60;
const CHALLENGE_SECONDS = 90;
const MAX_BODY_BYTES = 96 * 1024;
const MIN_SIGNED_APP_VERSION = 11;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const DEFAULT_SETTINGS = Object.freeze({
  minAppVersion: 11,
  secureAppVersion: 11,
  latestAppVersion: 12,
  forceUpdate: false,
  updateUrl: "",
  updateMessage: "",
  sessionSeconds: 43200,
  adminSessionSeconds: 43200,
  foregroundRecheckSeconds: 1800,
  offlineGraceSeconds: 86400,
  legacyOfflineGraceSeconds: 86400,
  scriptLeaseSeconds: 600,
  challengeSeconds: 90,
  globalForceOnline: false,
  riskForceOnlineThreshold: 2,
  selfUnbindEnabled: true,
  unbindPenaltySeconds: 21600,
  unbindCooldownSeconds: 86400,
  unbindWindowSeconds: 2592000,
  unbindWindowLimit: 5,
  sessionGeneration: 1,
  scriptDeliveryEnabled: true,
  activeScriptVersion: "",
  configCacheSeconds: 30,
});
let memorySettingsCache = null;
const RUNTIME_RELEASE_BASE =
  "https://raw.githubusercontent.com/xianyumht-cmd/gams/main/v2/runtime/release/";

export default {
  async fetch(request, env) {
    try {
      assertConfigured(env);
      if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }));
      const url = new URL(request.url);
      if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
        const settings = await loadSettings(env);
        return reply({
          ok: true,
          service: "gams-license-api",
          version: 2,
          signedProtocol: true,
          completeControlCenter: true,
          minSignedAppVersion: MIN_SIGNED_APP_VERSION,
          configVersion: settings.configVersion,
          latestAppVersion: settings.latestAppVersion,
        });
      }
      if (request.method === "POST" && url.pathname === "/v1/admin/login") return await adminLogin(request, env);
      if (request.method === "GET" && url.pathname === "/v1/admin/dashboard") return await adminDashboard(request, env);
      if (request.method === "GET" && url.pathname === "/v1/admin/settings") return await adminGetSettings(request, env);
      if (request.method === "POST" && url.pathname === "/v1/admin/settings/update") return await adminUpdateSettings(request, env);
      if (request.method === "GET" && url.pathname === "/v1/admin/settings/history") return await adminSettingsHistory(request, env);
      if (request.method === "POST" && url.pathname === "/v1/admin/settings/rollback") return await adminRollbackSettings(request, env);
      if (request.method === "POST" && url.pathname === "/v1/admin/licenses/create") return await adminCreateLicenses(request, env);
      if (request.method === "GET" && url.pathname === "/v1/admin/licenses") return await adminListLicenses(request, env);
      if (request.method === "GET" && url.pathname === "/v1/admin/licenses/detail") return await adminLicenseDetail(request, env);
      if (request.method === "POST" && url.pathname === "/v1/admin/licenses/action") return await adminLicenseAction(request, env);
      if (request.method === "POST" && url.pathname === "/v1/admin/licenses/update") return await adminLicenseUpdate(request, env);
      if (request.method === "POST" && url.pathname === "/v1/admin/licenses/batch-action") return await adminLicenseBatchAction(request, env);
      if (request.method === "GET" && url.pathname === "/v1/admin/devices") return await adminListDevices(request, env);
      if (request.method === "GET" && url.pathname === "/v1/admin/devices/detail") return await adminDeviceDetail(request, env);
      if (request.method === "POST" && url.pathname === "/v1/admin/devices/revoke") return await adminRevokeDevice(request, env);
      if (request.method === "POST" && url.pathname === "/v1/admin/devices/revoke-all") return await adminRevokeAllDevices(request, env);
      if (request.method === "GET" && url.pathname === "/v1/admin/audit") return await adminAudit(request, env);
      if (request.method === "POST" && url.pathname === "/v1/admin/sessions/revoke-all") return await adminRevokeAllSessions(request, env);
      if (request.method === "GET" && url.pathname === "/v1/admin/runtime") return await adminRuntime(request, env);
      if (request.method === "GET" && url.pathname === "/v1/admin/runtime/releases") return await adminRuntimeReleases(request, env);
      if (request.method === "POST" && url.pathname === "/v1/admin/runtime/pause") return await adminRuntimeToggle(request, env, false);
      if (request.method === "POST" && url.pathname === "/v1/admin/runtime/resume") return await adminRuntimeToggle(request, env, true);
      if (request.method === "POST" && url.pathname === "/v1/admin/runtime/select") return await adminRuntimeSelect(request, env);
      if (request.method === "POST" && url.pathname === "/v1/client/config") return await clientConfig(request, env);
      if (request.method === "POST" && url.pathname === "/v1/challenge") return await issueChallenge(request, env);
      if (request.method === "POST" && url.pathname === "/v1/activate") return await activate(request, env);
      if (request.method === "POST" && url.pathname === "/v1/check") return await check(request, env);
      if (request.method === "POST" && url.pathname === "/v1/device/unbind") return await selfUnbind(request, env);
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
  const settings = await loadSettings(env);
  const now = nowSeconds();
  const token = await signToken({
    typ: "admin",
    iat: now,
    exp: now + settings.adminSessionSeconds,
    jti: crypto.randomUUID(),
  }, env);
  await audit(env, "admin_login_ok", null, null, "");
  return reply({ ok: true, token, expiresAt: now + settings.adminSessionSeconds, apiVersion: 4 });
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
  const offset = clampInteger(url.searchParams.get("offset"), 0, 1000000, 0);
  const status = text(url.searchParams.get("status"), 20);
  const query = text(url.searchParams.get("q"), 100);
  const conditions = [];
  const bindings = [];
  if (["active", "disabled", "expired"].includes(status)) {
    conditions.push("l.status=?");
    bindings.push(status);
  }
  if (query) {
    conditions.push("(l.key_preview LIKE ? OR l.note LIKE ? OR l.id=?)");
    bindings.push(`%${query}%`, `%${query}%`, query);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const countRow = await env.DB.prepare(`SELECT COUNT(*) AS count FROM licenses l ${where}`)
    .bind(...bindings).first();
  const rows = await env.DB.prepare(
    `SELECT l.id,l.key_preview,l.status,l.created_at,l.activated_at,l.expires_at,
            l.max_devices,l.note,l.last_seen_at,l.last_unbind_at,l.rebind_available_at,
            SUM(CASE WHEN d.id IS NOT NULL AND d.revoked_at IS NULL THEN 1 ELSE 0 END)
              AS active_devices
       FROM licenses l LEFT JOIN devices d ON d.license_id=l.id ${where}
      GROUP BY l.id ORDER BY l.created_at DESC LIMIT ? OFFSET ?`
  ).bind(...bindings, limit, offset).all();
  return reply({
    ok: true,
    total: Number(countRow?.count || 0),
    limit,
    offset,
    licenses: rows.results || [],
  });
}


async function adminLicenseAction(request, env) {
  await requireAdmin(request, env);
  const body = await readJson(request);
  const action = text(body.action, 32);
  const license = await findLicenseForAdmin(env, body);
  if (!license) throw new HttpError(404, "license_not_found", "未找到卡密");
  const now = nowSeconds();
  if (action === "disable") {
    await env.DB.prepare("UPDATE licenses SET status='disabled' WHERE id=?").bind(license.id).run();
  } else if (action === "enable") {
    const status = license.expires_at && Number(license.expires_at) <= now ? "expired" : "active";
    await env.DB.prepare("UPDATE licenses SET status=? WHERE id=?").bind(status, license.id).run();
  } else if (action === "extend") {
    const seconds = body.seconds != null
      ? clampInteger(body.seconds, 60, 315360000, 2592000)
      : clampInteger(body.days, 1, 3650, 30) * 86400;
    const base = license.expires_at && Number(license.expires_at) > now
      ? Number(license.expires_at) : now;
    await env.DB.prepare("UPDATE licenses SET expires_at=?,status='active' WHERE id=?")
      .bind(base + seconds, license.id).run();
  } else if (action === "permanent") {
    await env.DB.prepare("UPDATE licenses SET expires_at=NULL,status='active' WHERE id=?")
      .bind(license.id).run();
  } else if (action === "unbind") {
    await revokeDevicesForLicense(env, license.id, now);
    await env.DB.prepare("UPDATE licenses SET rebind_available_at=NULL WHERE id=?")
      .bind(license.id).run();
  } else {
    throw new HttpError(400, "bad_action", "不支持的管理操作");
  }
  await audit(env, `license_${action}`, license.id, null,
    JSON.stringify({ days: body.days || null, seconds: body.seconds || null }));
  return reply({ ok: true, license: await getLicenseSummary(env, license.id) });
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
  if (license.rebind_available_at && Number(license.rebind_available_at) > nowSeconds()) {
    throw new HttpError(429, "rebind_cooldown", "解绑后暂时不能重新绑定");
  }

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
  const settings = await loadSettings(env);
  if (!settings.selfUnbindEnabled) {
    throw new HttpError(403, "unbind_disabled", "当前不允许自助解绑");
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
  if (license.last_unbind_at
      && now - Number(license.last_unbind_at) < settings.unbindCooldownSeconds) {
    throw new HttpError(429, "unbind_cooldown", "解绑操作过于频繁，请稍后再试");
  }
  const result = await env.DB.prepare(
    "UPDATE devices SET revoked_at=?,session_version=session_version+1 " +
    "WHERE id=? AND revoked_at IS NULL"
  ).bind(now, device.id).run();
  if (changesOf(result) !== 1) {
    throw new HttpError(409, "device_unbound", "设备已解除绑定");
  }
  await env.DB.prepare(
    "UPDATE licenses SET last_unbind_at=?,rebind_available_at=? WHERE id=?"
  ).bind(now, now + settings.unbindPenaltySeconds, license.id).run();
  await audit(env, "device_self_unbound", license.id, deviceHash, "");
  return reply({
    ok: true,
    message: "当前设备已解除绑定",
    rebindAvailableAt: now + settings.unbindPenaltySeconds,
  });
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
  const settings = await loadSettings(env);
  const sessionGeneration = Number(session.gen == null ? 1 : session.gen);
  if (session.kid !== device.key_fingerprint
      || Number(session.sv) !== Number(device.session_version)
      || sessionGeneration !== Number(settings.sessionGeneration || 1)) {
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
  const settings = await loadSettings(env);
  const tokenExpiresAt = now + settings.sessionSeconds;
  const token = await signToken({
    typ: "session",
    lic: license.id,
    dev: device.device_hash,
    kid: device.key_fingerprint,
    sv: Number(device.session_version),
    gen: Number(settings.sessionGeneration || 1),
    iat: now,
    exp: tokenExpiresAt,
    jti: crypto.randomUUID(),
  }, env);
  return reply({
    ok: true,
    token,
    tokenExpiresAt,
    licenseExpiresAt: license.expires_at || null,
    permanent: license.expires_at == null,
    offlineGraceSeconds: settings.offlineGraceSeconds,
    foregroundRecheckSeconds: settings.foregroundRecheckSeconds,
    serverTime: now,
    latestAppVersion: settings.latestAppVersion,
    forceUpdate: settings.forceUpdate,
    updateUrl: settings.updateUrl,
    updateMessage: settings.updateMessage,
    configVersion: settings.configVersion,
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


async function activeDeviceCount(env, licenseId) {
  const row = await env.DB.prepare("SELECT COUNT(*) AS count FROM devices WHERE license_id=? AND revoked_at IS NULL").bind(licenseId).first();
  return Number(row?.count || 0);
}


async function adminAudit(request, env) {
  await requireAdmin(request, env);
  const url = new URL(request.url);
  const limit = clampInteger(url.searchParams.get("limit"), 1, 200, 100);
  const offset = clampInteger(url.searchParams.get("offset"), 0, 1000000, 0);
  const event = string(url.searchParams.get("event"), 80);
  const licenseId = string(url.searchParams.get("licenseId"), 64);
  const conditions = [], bindings = [];
  if (event) { conditions.push("event=?"); bindings.push(event); }
  if (licenseId) { conditions.push("license_id=?"); bindings.push(licenseId); }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = await env.DB.prepare(`SELECT id,event,license_id,device_hash,detail,created_at FROM audit_log ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).bind(...bindings, limit, offset).all();
  return reply({ ok: true, audit: rows.results || [], limit, offset });
}


async function adminDashboard(request, env) {
  await requireAdmin(request, env);
  const settings = await loadSettings(env);
  const [licenses, devices, today, risk] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) total,SUM(status='active') active,SUM(status='disabled') disabled,SUM(status='expired') expired FROM licenses").first(),
    env.DB.prepare("SELECT COUNT(*) total,SUM(revoked_at IS NULL) active FROM devices").first(),
    env.DB.prepare("SELECT COUNT(*) count FROM licenses WHERE activated_at>=?").bind(nowSeconds() - 86400).first(),
    env.DB.prepare("SELECT COUNT(*) count FROM devices WHERE revoked_at IS NULL AND risk_flags<>''").first(),
  ]);
  let runtime = null;
  try { runtime = (await loadScriptRelease(env, settings)).manifest; } catch { runtime = null; }
  return reply({ ok: true, settings, licenses, devices, activations24h: Number(today?.count || 0), riskDevices: Number(risk?.count || 0), runtime });
}


async function adminDeviceDetail(request, env) {
  await requireAdmin(request, env);
  const id = string(new URL(request.url).searchParams.get("id"), 64);
  const device = await env.DB.prepare("SELECT d.*,l.key_preview,l.status license_status,l.expires_at FROM devices d JOIN licenses l ON l.id=d.license_id WHERE d.id=?").bind(id).first();
  if (!device) throw new HttpError(404, "device_not_found", "未找到设备");
  return reply({ ok: true, device });
}


async function adminGetSettings(request, env) { await requireAdmin(request, env); return reply({ ok: true, settings: await loadSettings(env, true) }); }


async function adminLicenseBatchAction(request, env) {
  await requireAdmin(request, env);
  const body = await readJson(request);
  const ids = Array.isArray(body.ids) ? [...new Set(body.ids.map((x) => string(x, 64)).filter(Boolean))].slice(0, 100) : [];
  if (!ids.length) throw new HttpError(400, "bad_ids", "请选择卡密");
  const action = string(body.action, 32);
  let success = 0;
  for (const id of ids) {
    const license = await env.DB.prepare("SELECT * FROM licenses WHERE id=?").bind(id).first();
    if (!license) continue;
    const now = nowSeconds();
    if (action === "disable") await env.DB.prepare("UPDATE licenses SET status='disabled' WHERE id=?").bind(id).run();
    else if (action === "enable") await env.DB.prepare("UPDATE licenses SET status=? WHERE id=?").bind(license.expires_at && license.expires_at <= now ? "expired" : "active", id).run();
    else if (action === "unbind") await revokeDevicesForLicense(env, id, now);
    else if (action === "extend") {
      const seconds = clampInteger(body.seconds, 60, 315360000, 2592000);
      const base = license.expires_at && license.expires_at > now ? Number(license.expires_at) : now;
      await env.DB.prepare("UPDATE licenses SET expires_at=?,status='active' WHERE id=?").bind(base + seconds, id).run();
    } else throw new HttpError(400, "bad_action", "不支持的批量操作");
    success += 1;
  }
  await audit(env, `license_batch_${action}`, null, null, JSON.stringify({ requested: ids.length, success }));
  return reply({ ok: true, requested: ids.length, success });
}


async function adminLicenseDetail(request, env) {
  await requireAdmin(request, env);
  const url = new URL(request.url);
  const license = await findLicenseForAdmin(env, { id: url.searchParams.get("id"), licenseKey: url.searchParams.get("licenseKey") });
  if (!license) throw new HttpError(404, "license_not_found", "未找到卡密");
  const devices = await env.DB.prepare("SELECT id,device_hash,label,created_at,last_seen_at,revoked_at,key_fingerprint,certificate_digest,risk_flags,session_version FROM devices WHERE license_id=? ORDER BY created_at DESC").bind(license.id).all();
  return reply({ ok: true, license: await getLicenseSummary(env, license.id), devices: devices.results || [] });
}


async function adminLicenseUpdate(request, env) {
  await requireAdmin(request, env);
  const body = await readJson(request);
  const license = await findLicenseForAdmin(env, body);
  if (!license) throw new HttpError(404, "license_not_found", "未找到卡密");
  const note = body.note == null ? license.note : string(body.note, 200);
  const maxDevices = body.maxDevices == null ? Number(license.max_devices) : clampInteger(body.maxDevices, 1, 10, Number(license.max_devices));
  let expiresAt = license.expires_at;
  if (body.expiresAt !== undefined) expiresAt = body.expiresAt == null ? null : clampInteger(body.expiresAt, nowSeconds() + 60, 4102444800, Number(license.expires_at || nowSeconds() + 86400));
  await env.DB.prepare("UPDATE licenses SET note=?,max_devices=?,expires_at=?,status=? WHERE id=?")
    .bind(note, maxDevices, expiresAt, expiresAt && expiresAt <= nowSeconds() ? "expired" : (license.status === "disabled" ? "disabled" : "active"), license.id).run();
  await audit(env, "license_updated", license.id, null, JSON.stringify({ note, maxDevices, expiresAt }));
  return reply({ ok: true, license: await getLicenseSummary(env, license.id) });
}


async function adminListDevices(request, env) {
  await requireAdmin(request, env);
  const url = new URL(request.url);
  const limit = clampInteger(url.searchParams.get("limit"), 1, 100, 50);
  const offset = clampInteger(url.searchParams.get("offset"), 0, 1000000, 0);
  const active = string(url.searchParams.get("active"), 8);
  const risk = string(url.searchParams.get("risk"), 8);
  const conditions = [], bindings = [];
  if (active === "true") conditions.push("d.revoked_at IS NULL");
  if (active === "false") conditions.push("d.revoked_at IS NOT NULL");
  if (risk === "true") conditions.push("d.risk_flags<>''");
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const total = await env.DB.prepare(`SELECT COUNT(*) count FROM devices d ${where}`).bind(...bindings).first();
  const rows = await env.DB.prepare(`SELECT d.id,d.license_id,l.key_preview,d.device_hash,d.label,d.created_at,d.last_seen_at,d.revoked_at,d.key_fingerprint,d.certificate_digest,d.risk_flags,d.session_version FROM devices d JOIN licenses l ON l.id=d.license_id ${where} ORDER BY d.last_seen_at DESC LIMIT ? OFFSET ?`).bind(...bindings, limit, offset).all();
  return reply({ ok: true, total: Number(total?.count || 0), devices: rows.results || [], limit, offset });
}


async function adminRevokeAllDevices(request, env) {
  await requireAdmin(request, env);
  const body = await readJson(request);
  const license = await findLicenseForAdmin(env, body);
  if (!license) throw new HttpError(404, "license_not_found", "未找到卡密");
  const count = await revokeDevicesForLicense(env, license.id, nowSeconds());
  await audit(env, "admin_devices_revoked_all", license.id, null, JSON.stringify({ count }));
  return reply({ ok: true, count });
}


async function adminRevokeAllSessions(request, env) {
  const admin = await requireAdmin(request, env);
  const current = await loadSettings(env, true);
  const nextGeneration = current.sessionGeneration + 1;
  const nextVersion = current.configVersion + 1;
  const now = nowSeconds();
  const next = { ...current, sessionGeneration: nextGeneration }; delete next.configVersion;
  await env.DB.batch([
    env.DB.prepare("INSERT INTO system_settings_history(id,config_version,settings_json,changed_at,changed_by,reason) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(), current.configVersion, JSON.stringify(stripConfigVersion(current)), now, admin.jti || "admin", "revoke-all-sessions"),
    env.DB.prepare("UPDATE system_settings SET config_version=?,settings_json=?,updated_at=?,updated_by=? WHERE id=1").bind(nextVersion, JSON.stringify(next), now, admin.jti || "admin"),
  ]);
  memorySettingsCache = null;
  await audit(env, "sessions_revoked_all", null, null, JSON.stringify({ sessionGeneration: nextGeneration }));
  return reply({ ok: true, sessionGeneration: nextGeneration, configVersion: nextVersion });
}


async function adminRevokeDevice(request, env) {
  await requireAdmin(request, env);
  const body = await readJson(request);
  const id = string(body.id, 64);
  const device = await env.DB.prepare("SELECT * FROM devices WHERE id=?").bind(id).first();
  if (!device) throw new HttpError(404, "device_not_found", "未找到设备");
  const now = nowSeconds();
  await env.DB.prepare("UPDATE devices SET revoked_at=?,session_version=session_version+1 WHERE id=?").bind(now, id).run();
  await audit(env, "admin_device_revoked", device.license_id, device.device_hash, "");
  return reply({ ok: true });
}


async function adminRollbackSettings(request, env) {
  const admin = await requireAdmin(request, env);
  const body = await readJson(request);
  const id = string(body.historyId, 64);
  const row = id ? await env.DB.prepare("SELECT * FROM system_settings_history WHERE id=?").bind(id).first()
    : await env.DB.prepare("SELECT * FROM system_settings_history WHERE config_version=? ORDER BY changed_at DESC LIMIT 1").bind(clampInteger(body.configVersion, 1, 1000000000, 0)).first();
  if (!row) throw new HttpError(404, "history_not_found", "未找到配置历史");
  const current = await loadSettings(env, true);
  const snapshot = safeJson(row.settings_json);
  snapshot.sessionGeneration = Math.max(current.sessionGeneration, Number(snapshot.sessionGeneration || 1));
  const next = await saveSettings(env, snapshot, admin.jti || "admin", `rollback:${row.config_version}`, body.expectedVersion);
  await audit(env, "settings_rollback", null, null, JSON.stringify({ from: current.configVersion, source: row.config_version, to: next.configVersion }));
  return reply({ ok: true, settings: next });
}


async function adminSettingsHistory(request, env) {
  await requireAdmin(request, env);
  const url = new URL(request.url);
  const limit = clampInteger(url.searchParams.get("limit"), 1, 100, 30);
  const rows = await env.DB.prepare("SELECT id,config_version,settings_json,changed_at,changed_by,reason FROM system_settings_history ORDER BY changed_at DESC LIMIT ?").bind(limit).all();
  return reply({ ok: true, history: (rows.results || []).map((row) => ({ ...row, settings: safeJson(row.settings_json) })) });
}


async function adminUpdateSettings(request, env) {
  const admin = await requireAdmin(request, env);
  const body = await readJson(request);
  const next = await saveSettings(env, body.settings || {}, admin.jti || "admin", body.reason || "", body.expectedVersion);
  await audit(env, "settings_updated", null, null, JSON.stringify({ configVersion: next.configVersion, reason: body.reason || "" }));
  return reply({ ok: true, settings: next });
}


function calculateRiskScore(flags) { return String(flags || "").split(",").map((x) => x.trim()).filter(Boolean).length; }


async function findLicenseByKey(env, key) {
  return env.DB.prepare("SELECT * FROM licenses WHERE key_hash=?").bind(await sha256Hex(key)).first();
}


async function getLicenseSummary(env, id) {
  return env.DB.prepare(`SELECT l.id,l.key_preview,l.status,l.created_at,l.activated_at,l.expires_at,l.max_devices,l.note,l.last_seen_at,l.last_unbind_at,l.rebind_available_at,SUM(CASE WHEN d.id IS NOT NULL AND d.revoked_at IS NULL THEN 1 ELSE 0 END) active_devices FROM licenses l LEFT JOIN devices d ON d.license_id=l.id WHERE l.id=? GROUP BY l.id`).bind(id).first();
}


function normalizeDevice(value) { const result = String(value || "").trim().toLowerCase(); return /^[0-9a-f]{64}$/.test(result) ? result : ""; }


async function revokeDevicesForLicense(env, licenseId, now) {
  const result = await env.DB.prepare("UPDATE devices SET revoked_at=?,session_version=session_version+1 WHERE license_id=? AND revoked_at IS NULL").bind(now, licenseId).run();
  return Number(result.meta?.changes || 0);
}


function safeJson(value) { try { return JSON.parse(String(value || "{}")); } catch { return {}; } }


async function saveSettings(env, nextInput, actor, reason, expectedVersion = null) {
  const current = await loadSettings(env, true);
  if (expectedVersion != null && Number(expectedVersion) !== Number(current.configVersion)) throw new HttpError(409, "config_conflict", "配置已被其他操作修改，请刷新后重试");
  const next = validateSettings({ ...current, ...nextInput, sessionGeneration: current.sessionGeneration }, current);
  const nextVersion = Number(current.configVersion) + 1;
  const now = nowSeconds();
  const currentJson = JSON.stringify(stripConfigVersion(current));
  const nextJson = JSON.stringify(stripConfigVersion(next));
  await env.DB.batch([
    env.DB.prepare("INSERT INTO system_settings_history(id,config_version,settings_json,changed_at,changed_by,reason) VALUES(?,?,?,?,?,?)")
      .bind(crypto.randomUUID(), current.configVersion, currentJson, now, actor, string(reason, 300)),
    env.DB.prepare("UPDATE system_settings SET config_version=?,settings_json=?,updated_at=?,updated_by=? WHERE id=1")
      .bind(nextVersion, nextJson, now, actor),
  ]);
  memorySettingsCache = null;
  memoryScriptCache = null;
  return { ...next, configVersion: nextVersion };
}


function string(value, max) { return String(value == null ? "" : value).trim().slice(0, max); }


function stripConfigVersion(settings) { const copy = { ...settings }; delete copy.configVersion; return copy; }


function validateSettings(input, fallback) {
  const out = { ...fallback };
  const integer = (key, min, max) => { out[key] = clampInteger(input[key], min, max, fallback[key]); };
  integer("minAppVersion", 1, 1000000);
  integer("secureAppVersion", 1, 1000000);
  integer("latestAppVersion", 1, 1000000);
  integer("sessionSeconds", 900, 86400);
  integer("adminSessionSeconds", 900, 86400);
  integer("foregroundRecheckSeconds", 300, 43200);
  integer("offlineGraceSeconds", 0, 86400);
  integer("legacyOfflineGraceSeconds", 0, 172800);
  integer("scriptLeaseSeconds", 300, 86400);
  integer("challengeSeconds", 30, 300);
  integer("riskForceOnlineThreshold", 1, 5);
  integer("unbindPenaltySeconds", 0, 259200);
  integer("unbindCooldownSeconds", 0, 2592000);
  integer("unbindWindowSeconds", 86400, 7776000);
  integer("unbindWindowLimit", 1, 30);
  integer("sessionGeneration", 1, 1000000000);
  integer("configCacheSeconds", 5, 300);
  for (const key of ["forceUpdate", "globalForceOnline", "selfUnbindEnabled", "scriptDeliveryEnabled"]) out[key] = Boolean(input[key]);
  out.updateUrl = string(input.updateUrl, 2048);
  if (out.updateUrl && !/^https:\/\//i.test(out.updateUrl)) out.updateUrl = fallback.updateUrl || "";
  out.updateMessage = string(input.updateMessage, 1000);
  out.activeScriptVersion = string(input.activeScriptVersion, 64);
  if (out.activeScriptVersion && !/^[0-9A-Za-z._-]+$/.test(out.activeScriptVersion)) out.activeScriptVersion = fallback.activeScriptVersion || "";
  if (out.latestAppVersion < out.minAppVersion) out.latestAppVersion = out.minAppVersion;
  if (out.secureAppVersion < out.minAppVersion) out.secureAppVersion = out.minAppVersion;
  return out;
}


async function loadSettings(env, force = false) {
  const now = Date.now();
  if (!force && memorySettingsCache && memorySettingsCache.expiresAt > now) {
    return memorySettingsCache.value;
  }
  try {
    const row = await env.DB.prepare(
      "SELECT config_version,settings_json FROM system_settings WHERE id=1"
    ).first();
    const parsed = row ? JSON.parse(row.settings_json) : {};
    const value = validateSettings({ ...DEFAULT_SETTINGS, ...parsed }, DEFAULT_SETTINGS);
    value.minAppVersion = Math.max(MIN_SIGNED_APP_VERSION, value.minAppVersion);
    value.secureAppVersion = Math.max(MIN_SIGNED_APP_VERSION, value.secureAppVersion);
    value.latestAppVersion = Math.max(12, value.latestAppVersion);
    value.offlineGraceSeconds = Math.max(86400, Number(value.offlineGraceSeconds || 0));
    value.legacyOfflineGraceSeconds = Math.max(86400, Number(value.legacyOfflineGraceSeconds || 0));
    value.configVersion = Number(row?.config_version || 1);
    memorySettingsCache = {
      value,
      expiresAt: now + value.configCacheSeconds * 1000,
    };
    return value;
  } catch (error) {
    console.warn("settings fallback", error);
    return {
      ...DEFAULT_SETTINGS,
      offlineGraceSeconds: 86400,
      legacyOfflineGraceSeconds: 86400,
      configVersion: 1,
    };
  }
}


async function clientConfig(request, env) {
  const body = await readJson(request);
  const settings = await loadSettings(env);
  const appVersion = appVersionOf(body);
  return reply({
    ok: true,
    minAppVersion: settings.minAppVersion,
    latestAppVersion: settings.latestAppVersion,
    forceUpdate: settings.forceUpdate,
    updateUrl: settings.updateUrl,
    updateMessage: settings.updateMessage,
    foregroundRecheckSeconds: settings.foregroundRecheckSeconds,
    offlineGraceSeconds: settings.offlineGraceSeconds,
    serverTime: nowSeconds(),
    upgradeRequired: appVersion > 0 && appVersion < settings.minAppVersion,
    configVersion: settings.configVersion,
  });
}


async function fetchCurrentManifest(env) {
  const response = await fetch(`${RUNTIME_RELEASE_BASE}manifest.json`, {
    headers: { accept: "application/json", "user-agent": "GAMS-Control-Center/4" },
    cf: { cacheTtl: 0, cacheEverything: false },
  });
  if (!response.ok) {
    throw new HttpError(503, "runtime_unavailable", "运行服务信息暂时不可用");
  }
  const value = await response.json();
  if (!value
      || !/^[0-9A-Za-z._-]+$/.test(String(value.versionName || ""))
      || !/^[0-9A-Za-z._-]+\.bin$/.test(String(value.file || ""))
      || !/^[0-9a-f]{64}$/i.test(String(value.sha256 || ""))
      || !Number.isFinite(Number(value.size))) {
    throw new HttpError(503, "runtime_invalid", "运行服务信息异常");
  }
  return value;
}


async function rememberRuntimeRelease(env, manifest) {
  const now = nowSeconds();
  await env.DB.prepare(
    `INSERT INTO script_releases
       (version,manifest_json,file_name,sha256,size_bytes,first_seen_at,last_seen_at)
     VALUES(?,?,?,?,?,?,?)
     ON CONFLICT(version) DO UPDATE SET
       manifest_json=excluded.manifest_json,
       file_name=excluded.file_name,
       sha256=excluded.sha256,
       size_bytes=excluded.size_bytes,
       last_seen_at=excluded.last_seen_at`
  ).bind(
    String(manifest.versionName),
    JSON.stringify(manifest),
    String(manifest.file),
    String(manifest.sha256).toLowerCase(),
    Number(manifest.size),
    now,
    now
  ).run();
}


async function adminRuntime(request, env) {
  await requireAdmin(request, env);
  const settings = await loadSettings(env, true);
  let manifest = null;
  let error = "";
  try {
    manifest = await fetchCurrentManifest(env);
    await rememberRuntimeRelease(env, manifest);
  } catch (failure) {
    error = failure?.message || "unavailable";
  }
  return reply({
    ok: true,
    enabled: settings.scriptDeliveryEnabled,
    activeScriptVersion: settings.activeScriptVersion || manifest?.versionName || "",
    manifest,
    error,
  });
}


async function adminRuntimeReleases(request, env) {
  await requireAdmin(request, env);
  try {
    await rememberRuntimeRelease(env, await fetchCurrentManifest(env));
  } catch { }
  const rows = await env.DB.prepare(
    "SELECT version,manifest_json,file_name,sha256,size_bytes,first_seen_at,last_seen_at " +
    "FROM script_releases ORDER BY last_seen_at DESC LIMIT 100"
  ).all();
  return reply({
    ok: true,
    releases: (rows.results || []).map((row) => ({
      ...row,
      manifest: safeJson(row.manifest_json),
    })),
  });
}


async function adminRuntimeToggle(request, env, enabled) {
  const admin = await requireAdmin(request, env);
  const body = await readJson(request);
  const next = await saveSettings(
    env,
    { scriptDeliveryEnabled: enabled },
    admin.jti || "admin",
    text(body.reason, 200) || (enabled ? "runtime-resume" : "runtime-pause"),
    body.expectedVersion
  );
  await audit(env, enabled ? "runtime_resumed" : "runtime_paused", null, null, "");
  return reply({ ok: true, settings: next });
}


async function adminRuntimeSelect(request, env) {
  const admin = await requireAdmin(request, env);
  const body = await readJson(request);
  const requested = text(body.version, 64);
  const currentManifest = await fetchCurrentManifest(env);
  await rememberRuntimeRelease(env, currentManifest);
  const version = requested || currentManifest.versionName;
  const row = await env.DB.prepare("SELECT version FROM script_releases WHERE version=?")
    .bind(version).first();
  if (!row) throw new HttpError(404, "runtime_not_found", "未找到该运行版本");
  if (version !== currentManifest.versionName) {
    throw new HttpError(409, "runtime_not_available", "该历史版本当前没有可部署的加密运行包");
  }
  const next = await saveSettings(
    env,
    { activeScriptVersion: version },
    admin.jti || "admin",
    text(body.reason, 200) || `runtime-select:${version}`,
    body.expectedVersion
  );
  await audit(env, "runtime_selected", null, null, JSON.stringify({ version }));
  return reply({ ok: true, settings: next });
}

class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
