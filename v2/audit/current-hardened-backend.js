const SESSION_SECONDS = 2 * 60 * 60;
const ADMIN_SECONDS = 12 * 60 * 60;
const OFFLINE_GRACE_SECONDS = 6 * 60 * 60;
const LEGACY_OFFLINE_GRACE_SECONDS = 24 * 60 * 60;
const SCRIPT_LEASE_SECONDS = 6 * 60 * 60;
const CHALLENGE_SECONDS = 90;
const UNBIND_PENALTY_SECONDS = 6 * 60 * 60;
const UNBIND_COOLDOWN_SECONDS = 24 * 60 * 60;
const UNBIND_WINDOW_SECONDS = 30 * 24 * 60 * 60;
const UNBIND_WINDOW_LIMIT = 5;
const MIN_APP_VERSION = 5;
const SECURE_APP_VERSION = 6;
const LATEST_APP_VERSION = 6;
const MAX_BODY_BYTES = 64 * 1024;
const MAX_SCRIPT_BYTES = 2 * 1024 * 1024;
const GITHUB_RELEASE_BASE = "https://raw.githubusercontent.com/xianyumht-cmd/gams/main/remote-script/release/";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
let memoryScriptCache = null;

export default {
  async fetch(request, env) {
    try {
      if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }));
      const url = new URL(request.url);
      if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
        return reply({
          ok: true,
          service: "gams-license-api",
          version: 2,
          minAppVersion: MIN_APP_VERSION,
          latestAppVersion: LATEST_APP_VERSION,
        });
      }
      if (request.method === "POST" && url.pathname === "/v1/admin/login") return adminLogin(request, env);
      if (request.method === "POST" && url.pathname === "/v1/admin/licenses/create") return adminCreateLicenses(request, env);
      if (request.method === "GET" && url.pathname === "/v1/admin/licenses") return adminListLicenses(request, env);
      if (request.method === "POST" && url.pathname === "/v1/admin/licenses/action") return adminLicenseAction(request, env);
      if (request.method === "POST" && url.pathname === "/v1/challenge") return issueChallenge(request, env);
      if (request.method === "POST" && url.pathname === "/v1/activate") return activate(request, env);
      if (request.method === "POST" && url.pathname === "/v1/check") return check(request, env);
      if (request.method === "POST" && url.pathname === "/v1/script") return script(request, env);
      if (request.method === "POST" && url.pathname === "/v1/device/unbind") return selfUnbind(request, env);
      return reply({ ok: false, code: "not_found", message: "接口不存在" }, 404);
    } catch (error) {
      if (error instanceof HttpError) return reply({ ok: false, code: error.code, message: error.message }, error.status);
      console.error("Unhandled error", error);
      return reply({ ok: false, code: "server_error", message: "服务暂时不可用" }, 500);
    }
  },
};

async function adminLogin(request, env) {
  const ipKey = await requestRateKey(request, "admin-login");
  if (!(await allowRate(env, ipKey, 5, 600))) return reply({ ok: false, code: "too_many_requests", message: "尝试次数过多，请稍后再试" }, 429);
  const body = await readJson(request);
  const password = string(body.password, 128);
  if (!password || !(await constantTimeTextEqual(password, env.ADMIN_PASSWORD || ""))) {
    await audit(env, "admin_login_failed", null, null, "");
    return reply({ ok: false, code: "bad_password", message: "管理密码错误" }, 401);
  }
  const now = nowSeconds();
  const token = await signToken({ typ: "admin", iat: now, exp: now + ADMIN_SECONDS, jti: crypto.randomUUID() }, env);
  await audit(env, "admin_login_ok", null, null, "");
  return reply({ ok: true, token, expiresAt: now + ADMIN_SECONDS });
}

async function adminCreateLicenses(request, env) {
  await requireAdmin(request, env);
  const body = await readJson(request);
  const count = clampInteger(body.count, 1, 50, 1);
  const durationDays = body.durationDays === -1 ? -1 : clampInteger(body.durationDays, 1, 3650, 30);
  const maxDevices = clampInteger(body.maxDevices, 1, 10, 1);
  const note = string(body.note, 200);
  const now = nowSeconds();
  const expiresAt = durationDays === -1 ? null : now + durationDays * 86400;
  const created = [];
  const statements = [];
  for (let i = 0; i < count; i += 1) {
    const key = randomKey();
    const id = crypto.randomUUID();
    const keyHash = await sha256Hex(key);
    const preview = `${key.slice(0, 4)}…${key.slice(-4)}`;
    statements.push(env.DB.prepare(
      `INSERT INTO licenses (id,key_hash,key_preview,status,created_at,expires_at,max_devices,note)
       VALUES (?,?,?,'active',?,?,?,?)`
    ).bind(id, keyHash, preview, now, expiresAt, maxDevices, note));
    created.push({ id, key, preview, expiresAt, maxDevices });
  }
  await env.DB.batch(statements);
  await audit(env, "licenses_created", null, null, JSON.stringify({ count, durationDays, maxDevices }));
  return reply({ ok: true, licenses: created });
}

async function adminListLicenses(request, env) {
  await requireAdmin(request, env);
  const url = new URL(request.url);
  const limit = clampInteger(url.searchParams.get("limit"), 1, 100, 50);
  const rows = await env.DB.prepare(
    `SELECT l.id,l.key_preview,l.status,l.created_at,l.activated_at,l.expires_at,
            l.max_devices,l.note,l.last_seen_at,l.last_unbind_at,l.rebind_available_at,
            SUM(CASE WHEN d.id IS NOT NULL AND d.revoked_at IS NULL THEN 1 ELSE 0 END) AS active_devices
       FROM licenses l LEFT JOIN devices d ON d.license_id=l.id
      GROUP BY l.id ORDER BY l.created_at DESC LIMIT ?`
  ).bind(limit).all();
  return reply({ ok: true, licenses: rows.results || [] });
}

async function adminLicenseAction(request, env) {
  await requireAdmin(request, env);
  const body = await readJson(request);
  const action = string(body.action, 32);
  const license = await findLicenseForAdmin(env, body);
  if (!license) return reply({ ok: false, code: "license_not_found", message: "未找到卡密" }, 404);
  const now = nowSeconds();
  if (action === "disable") {
    await env.DB.prepare("UPDATE licenses SET status='disabled' WHERE id=?").bind(license.id).run();
  } else if (action === "enable") {
    const status = license.expires_at && license.expires_at <= now ? "expired" : "active";
    await env.DB.prepare("UPDATE licenses SET status=? WHERE id=?").bind(status, license.id).run();
  } else if (action === "extend") {
    const days = clampInteger(body.days, 1, 3650, 30);
    const base = license.expires_at && license.expires_at > now ? license.expires_at : now;
    await env.DB.prepare("UPDATE licenses SET expires_at=?,status='active' WHERE id=?").bind(base + days * 86400, license.id).run();
  } else if (action === "permanent") {
    await env.DB.prepare("UPDATE licenses SET expires_at=NULL,status='active' WHERE id=?").bind(license.id).run();
  } else if (action === "unbind") {
    const active = await env.DB.prepare("SELECT id FROM devices WHERE license_id=? AND revoked_at IS NULL").bind(license.id).all();
    const statements = [env.DB.prepare("UPDATE licenses SET rebind_available_at=NULL WHERE id=?").bind(license.id)];
    for (const device of active.results || []) {
      statements.push(env.DB.prepare("UPDATE devices SET revoked_at=?,session_version=session_version+1 WHERE id=?").bind(now, device.id));
    }
    await env.DB.batch(statements);
  } else {
    return reply({ ok: false, code: "bad_action", message: "不支持的管理操作" }, 400);
  }
  await audit(env, `license_${action}`, license.id, null, JSON.stringify({ days: body.days || null }));
  const updated = await env.DB.prepare(
    `SELECT id,key_preview,status,created_at,activated_at,expires_at,max_devices,note,last_seen_at,last_unbind_at,rebind_available_at
       FROM licenses WHERE id=?`
  ).bind(license.id).first();
  return reply({ ok: true, license: updated });
}

async function issueChallenge(request, env) {
  const body = await readJson(request);
  const appVersion = appVersionOf(body);
  requireSupportedVersion(appVersion);
  const deviceHash = normalizeDevice(body.deviceId);
  const purpose = string(body.purpose, 24);
  if (!deviceHash) throw new HttpError(400, "bad_device", "设备信息无效");
  if (!["activate", "check", "script", "unbind"].includes(purpose)) throw new HttpError(400, "bad_purpose", "请求用途无效");
  const rateKey = `${await requestRateKey(request, "challenge")}:${deviceHash.slice(0, 12)}`;
  if (!(await allowRate(env, rateKey, 60, 60))) throw new HttpError(429, "too_many_requests", "操作过于频繁");
  const now = nowSeconds();
  const nonce = base64Url(crypto.getRandomValues(new Uint8Array(24)));
  await env.DB.batch([
    env.DB.prepare("DELETE FROM challenges WHERE expires_at<? OR used_at IS NOT NULL").bind(now - 300),
    env.DB.prepare(
      "INSERT INTO challenges(nonce,device_hash,purpose,created_at,expires_at) VALUES(?,?,?,?,?)"
    ).bind(nonce, deviceHash, purpose, now, now + CHALLENGE_SECONDS),
  ]);
  return reply({ ok: true, nonce, purpose, serverTime: now, expiresAt: now + CHALLENGE_SECONDS });
}

async function activate(request, env) {
  const body = await readJson(request);
  const appVersion = appVersionOf(body);
  requireSupportedVersion(appVersion);
  return appVersion >= SECURE_APP_VERSION ? activateSecure(request, env, body, appVersion) : activateLegacy(request, env, body, appVersion);
}

async function activateLegacy(request, env, body, appVersion) {
  const ipKey = await requestRateKey(request, "activate-legacy");
  if (!(await allowRate(env, ipKey, 30, 60))) return reply({ ok: false, code: "too_many_requests", message: "验证过于频繁，请稍后再试" }, 429);
  const key = normalizeKey(body.licenseKey);
  const deviceHash = normalizeDevice(body.deviceId);
  const label = string(body.deviceLabel, 100);
  if (key.length !== 32) return reply({ ok: false, code: "bad_key", message: "激活码格式错误" }, 400);
  if (!deviceHash) return reply({ ok: false, code: "bad_device", message: "设备信息无效" }, 400);
  const license = await findLicenseByKey(env, key);
  if (!license) return reply({ ok: false, code: "license_not_found", message: "激活码无效" }, 404);
  const stateError = await licenseStateError(env, license);
  if (stateError) return stateError;
  const now = nowSeconds();
  const device = await bindLegacyDevice(env, license, deviceHash, label, now);
  if (device.error) return device.error;
  await env.DB.prepare("UPDATE licenses SET activated_at=COALESCE(activated_at,?),last_seen_at=? WHERE id=?").bind(now, now, license.id).run();
  return licenseSuccess(env, license, deviceHash, device.row, now, false, appVersion);
}

async function activateSecure(request, env, body, appVersion) {
  const ipKey = await requestRateKey(request, "activate-secure");
  if (!(await allowRate(env, ipKey, 30, 60))) throw new HttpError(429, "too_many_requests", "操作过于频繁");
  const key = normalizeKey(body.licenseKey);
  const deviceHash = normalizeDevice(body.deviceId);
  const label = string(body.deviceLabel, 100);
  const publicKey = string(body.publicKey, 4096);
  if (key.length !== 32) throw new HttpError(400, "bad_key", "激活码格式错误");
  if (!deviceHash || !publicKey) throw new HttpError(400, "bad_device", "设备信息无效");
  const payloadHash = await sha256Hex(`${key}|${publicKey}|${label}`);
  const verified = await verifySignedRequest(env, body, "activate", publicKey, payloadHash);
  const license = await findLicenseByKey(env, key);
  if (!license) return reply({ ok: false, code: "license_not_found", message: "激活码无效" }, 404);
  const stateError = await licenseStateError(env, license);
  if (stateError) return stateError;
  const now = nowSeconds();
  if (license.rebind_available_at && Number(license.rebind_available_at) > now) {
    return reply({ ok: false, code: "rebind_wait", message: `更换设备后需等待至 ${license.rebind_available_at}` }, 409);
  }
  const bound = await bindSecureDevice(env, license, deviceHash, label, publicKey, verified.keyFingerprint,
    verified.certificateDigest, verified.riskFlags, now);
  if (bound.error) return bound.error;
  await env.DB.prepare("UPDATE licenses SET activated_at=COALESCE(activated_at,?),last_seen_at=? WHERE id=?").bind(now, now, license.id).run();
  await audit(env, "secure_device_bound", license.id, deviceHash, JSON.stringify({ kid: verified.keyFingerprint, risk: verified.riskFlags }));
  return licenseSuccess(env, license, deviceHash, bound.row, now, true, appVersion);
}

async function bindLegacyDevice(env, license, deviceHash, label, now) {
  let device = await env.DB.prepare("SELECT * FROM devices WHERE license_id=? AND device_hash=?").bind(license.id, deviceHash).first();
  if (device && device.key_fingerprint) return { error: reply({ ok: false, code: "upgrade_required", message: "请更新客户端后继续使用" }, 426) };
  if (device && !device.revoked_at) {
    await env.DB.prepare("UPDATE devices SET last_seen_at=?,label=? WHERE id=?").bind(now, label, device.id).run();
    return { row: device };
  }
  const count = await activeDeviceCount(env, license.id);
  if (count >= Number(license.max_devices)) return { error: reply({ ok: false, code: "device_limit", message: "该激活码已绑定其他设备" }, 409) };
  if (device) {
    await env.DB.prepare("UPDATE devices SET revoked_at=NULL,last_seen_at=?,label=?,session_version=session_version+1 WHERE id=?")
      .bind(now, label, device.id).run();
    device.revoked_at = null;
    device.session_version = Number(device.session_version || 1) + 1;
    return { row: device };
  }
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO devices(id,license_id,device_hash,label,created_at,last_seen_at,session_version)
     VALUES(?,?,?,?,?,?,1)`
  ).bind(id, license.id, deviceHash, label, now, now).run();
  return { row: { id, session_version: 1 } };
}

async function bindSecureDevice(env, license, deviceHash, label, publicKey, keyFingerprint, certDigest, riskFlags, now) {
  let device = await env.DB.prepare("SELECT * FROM devices WHERE license_id=? AND device_hash=?").bind(license.id, deviceHash).first();
  if (device && !device.revoked_at) {
    if (device.key_fingerprint && device.key_fingerprint !== keyFingerprint) {
      return { error: reply({ ok: false, code: "device_key_changed", message: "设备安全信息发生变化，请先更换设备" }, 409) };
    }
    const version = Number(device.session_version || 1) + 1;
    await env.DB.prepare(
      `UPDATE devices SET last_seen_at=?,label=?,public_key=?,key_fingerprint=?,certificate_digest=?,risk_flags=?,session_version=? WHERE id=?`
    ).bind(now, label, publicKey, keyFingerprint, certDigest, riskFlags, version, device.id).run();
    return { row: { ...device, public_key: publicKey, key_fingerprint: keyFingerprint, certificate_digest: certDigest, session_version: version } };
  }
  const count = await activeDeviceCount(env, license.id);
  if (count >= Number(license.max_devices)) return { error: reply({ ok: false, code: "device_limit", message: "该激活码已绑定其他设备" }, 409) };
  if (device) {
    const version = Number(device.session_version || 1) + 1;
    await env.DB.prepare(
      `UPDATE devices SET revoked_at=NULL,last_seen_at=?,label=?,public_key=?,key_fingerprint=?,certificate_digest=?,risk_flags=?,session_version=? WHERE id=?`
    ).bind(now, label, publicKey, keyFingerprint, certDigest, riskFlags, version, device.id).run();
    return { row: { ...device, revoked_at: null, public_key: publicKey, key_fingerprint: keyFingerprint, certificate_digest: certDigest, session_version: version } };
  }
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO devices(id,license_id,device_hash,label,created_at,last_seen_at,public_key,key_fingerprint,certificate_digest,risk_flags,session_version)
     VALUES(?,?,?,?,?,?,?,?,?,?,1)`
  ).bind(id, license.id, deviceHash, label, now, now, publicKey, keyFingerprint, certDigest, riskFlags).run();
  return { row: { id, public_key: publicKey, key_fingerprint: keyFingerprint, certificate_digest: certDigest, risk_flags: riskFlags, session_version: 1 } };
}

async function check(request, env) {
  const body = await readJson(request);
  const appVersion = appVersionOf(body);
  requireSupportedVersion(appVersion);
  return appVersion >= SECURE_APP_VERSION ? checkSecure(request, env, body, appVersion) : checkLegacy(request, env, body, appVersion);
}

async function checkLegacy(request, env, body, appVersion) {
  const ipKey = await requestRateKey(request, "check-legacy");
  if (!(await allowRate(env, ipKey, 120, 60))) return reply({ ok: false, code: "too_many_requests", message: "验证过于频繁" }, 429);
  const deviceHash = normalizeDevice(body.deviceId);
  const payload = await verifyToken(string(body.token, 4096), env, "session");
  if (!payload || payload.dev !== deviceHash) return reply({ ok: false, code: "bad_session", message: "服务状态已失效，请重新启动" }, 401);
  const license = await env.DB.prepare("SELECT * FROM licenses WHERE id=?").bind(payload.lic).first();
  if (!license) return reply({ ok: false, code: "license_not_found", message: "服务状态无效" }, 404);
  const stateError = await licenseStateError(env, license);
  if (stateError) return stateError;
  const device = await env.DB.prepare("SELECT * FROM devices WHERE license_id=? AND device_hash=? AND revoked_at IS NULL").bind(license.id, deviceHash).first();
  if (!device) return reply({ ok: false, code: "device_unbound", message: "当前设备已解除绑定" }, 401);
  if (device.key_fingerprint) return reply({ ok: false, code: "upgrade_required", message: "请更新客户端后继续使用" }, 426);
  const now = nowSeconds();
  await touch(env, license.id, device.id, now);
  return licenseSuccess(env, license, deviceHash, device, now, false, appVersion);
}

async function checkSecure(request, env, body, appVersion) {
  const deviceHash = normalizeDevice(body.deviceId);
  const tokenText = string(body.token, 4096);
  const payload = await verifyToken(tokenText, env, "session");
  if (!payload || payload.dev !== deviceHash) return reply({ ok: false, code: "bad_session", message: "服务状态已失效，请重新启动" }, 401);
  const license = await env.DB.prepare("SELECT * FROM licenses WHERE id=?").bind(payload.lic).first();
  if (!license) return reply({ ok: false, code: "license_not_found", message: "服务状态无效" }, 404);
  const stateError = await licenseStateError(env, license);
  if (stateError) return stateError;
  const device = await env.DB.prepare("SELECT * FROM devices WHERE license_id=? AND device_hash=? AND revoked_at IS NULL").bind(license.id, deviceHash).first();
  if (!device || !device.public_key || !device.key_fingerprint) return reply({ ok: false, code: "device_unbound", message: "当前设备已解除绑定" }, 401);
  if (payload.kid !== device.key_fingerprint || Number(payload.sv) !== Number(device.session_version)) {
    return reply({ ok: false, code: "bad_session", message: "服务状态已更新，请重新启动" }, 401);
  }
  await verifySignedRequest(env, body, "check", device.public_key, await sha256Hex(tokenText), device);
  const now = nowSeconds();
  await touch(env, license.id, device.id, now);
  return licenseSuccess(env, license, deviceHash, device, now, true, appVersion);
}

async function script(request, env) {
  const body = await readJson(request);
  const appVersion = appVersionOf(body);
  if (appVersion < SECURE_APP_VERSION) return reply({ ok: false, code: "upgrade_required", message: "请更新客户端后继续使用" }, 426);
  const deviceHash = normalizeDevice(body.deviceId);
  const tokenText = string(body.token, 4096);
  const payload = await verifyToken(tokenText, env, "session");
  if (!payload || payload.dev !== deviceHash) return reply({ ok: false, code: "bad_session", message: "服务状态已失效" }, 401);
  const license = await env.DB.prepare("SELECT * FROM licenses WHERE id=?").bind(payload.lic).first();
  if (!license) return reply({ ok: false, code: "license_not_found", message: "服务状态无效" }, 404);
  const stateError = await licenseStateError(env, license);
  if (stateError) return stateError;
  const device = await env.DB.prepare("SELECT * FROM devices WHERE license_id=? AND device_hash=? AND revoked_at IS NULL").bind(license.id, deviceHash).first();
  if (!device || payload.kid !== device.key_fingerprint || Number(payload.sv) !== Number(device.session_version)) {
    return reply({ ok: false, code: "device_unbound", message: "当前设备状态无效" }, 401);
  }
  await verifySignedRequest(env, body, "script", device.public_key, await sha256Hex(`${tokenText}|script`), device);
  const rateKey = `script:${license.id}:${device.id}`;
  if (!(await allowRate(env, rateKey, 30, 60))) return reply({ ok: false, code: "too_many_requests", message: "初始化过于频繁" }, 429);
  const release = await loadScriptRelease(env);
  const now = nowSeconds();
  await touch(env, license.id, device.id, now);
  return reply({
    ok: true,
    manifest: release.manifest,
    scriptBase64: release.scriptBase64,
    leaseSeconds: SCRIPT_LEASE_SECONDS,
    serverTime: now,
  });
}

async function selfUnbind(request, env) {
  const body = await readJson(request);
  const appVersion = appVersionOf(body);
  if (appVersion < SECURE_APP_VERSION) return reply({ ok: false, code: "upgrade_required", message: "请更新客户端后继续使用" }, 426);
  const deviceHash = normalizeDevice(body.deviceId);
  const tokenText = string(body.token, 4096);
  const payload = await verifyToken(tokenText, env, "session");
  if (!payload || payload.dev !== deviceHash) return reply({ ok: false, code: "bad_session", message: "服务状态已失效" }, 401);
  const license = await env.DB.prepare("SELECT * FROM licenses WHERE id=?").bind(payload.lic).first();
  if (!license) return reply({ ok: false, code: "license_not_found", message: "服务状态无效" }, 404);
  const stateError = await licenseStateError(env, license);
  if (stateError) return stateError;
  const device = await env.DB.prepare("SELECT * FROM devices WHERE license_id=? AND device_hash=? AND revoked_at IS NULL").bind(license.id, deviceHash).first();
  if (!device || payload.kid !== device.key_fingerprint || Number(payload.sv) !== Number(device.session_version)) {
    return reply({ ok: false, code: "device_unbound", message: "当前设备状态无效" }, 401);
  }
  await verifySignedRequest(env, body, "unbind", device.public_key, await sha256Hex(`${tokenText}|unbind`), device);
  const now = nowSeconds();
  if (license.last_unbind_at && now - Number(license.last_unbind_at) < UNBIND_COOLDOWN_SECONDS) {
    return reply({ ok: false, code: "unbind_cooldown", message: "更换设备操作冷却中，请稍后再试" }, 429);
  }
  const recent = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM audit_log WHERE license_id=? AND event='self_unbind' AND created_at>=?"
  ).bind(license.id, now - UNBIND_WINDOW_SECONDS).first();
  if (Number(recent?.count || 0) >= UNBIND_WINDOW_LIMIT) {
    return reply({ ok: false, code: "unbind_limit", message: "近期更换设备次数已达上限" }, 429);
  }
  let expiresAt = license.expires_at == null ? null : Number(license.expires_at);
  let rebindAvailableAt = null;
  if (expiresAt == null) {
    rebindAvailableAt = now + UNBIND_PENALTY_SECONDS;
  } else {
    if (expiresAt - now <= UNBIND_PENALTY_SECONDS) {
      return reply({ ok: false, code: "insufficient_time", message: "剩余时间不足6小时，无法自助更换设备" }, 409);
    }
    expiresAt -= UNBIND_PENALTY_SECONDS;
  }
  await env.DB.batch([
    env.DB.prepare("UPDATE devices SET revoked_at=?,session_version=session_version+1 WHERE id=?").bind(now, device.id),
    env.DB.prepare("UPDATE licenses SET expires_at=?,last_unbind_at=?,rebind_available_at=? WHERE id=?")
      .bind(expiresAt, now, rebindAvailableAt, license.id),
  ]);
  await audit(env, "self_unbind", license.id, deviceHash, JSON.stringify({ penaltySeconds: UNBIND_PENALTY_SECONDS, expiresAt, rebindAvailableAt }));
  return reply({ ok: true, penaltySeconds: UNBIND_PENALTY_SECONDS, licenseExpiresAt: expiresAt, rebindAvailableAt });
}

async function verifySignedRequest(env, body, expectedPurpose, publicKeyBase64, expectedPayloadHash, storedDevice = null) {
  const deviceHash = normalizeDevice(body.deviceId);
  const purpose = string(body.purpose, 24);
  const nonce = string(body.nonce, 128);
  const timestamp = Number(body.timestamp);
  const keyFingerprint = normalizeHex64(body.keyFingerprint);
  const certificateDigest = normalizeHex64(body.certificateDigest);
  const payloadHash = normalizeHex64(body.payloadHash);
  const riskFlags = string(body.riskFlags, 300);
  const signature = string(body.signature, 1024);
  if (!deviceHash || purpose !== expectedPurpose || !nonce || !Number.isFinite(timestamp)) throw new HttpError(400, "bad_signature_request", "设备验证信息无效");
  if (Math.abs(nowSeconds() - timestamp) > 120) throw new HttpError(401, "stale_request", "请求已过期，请重试");
  if (!keyFingerprint || !certificateDigest || !payloadHash || !signature) throw new HttpError(400, "bad_signature_request", "设备验证信息不完整");
  if (!(await constantTimeTextEqual(payloadHash, expectedPayloadHash))) throw new HttpError(401, "payload_mismatch", "请求校验失败");
  const publicBytes = base64Decode(publicKeyBase64);
  const actualFingerprint = await sha256HexBytes(publicBytes);
  if (!(await constantTimeTextEqual(actualFingerprint, keyFingerprint))) throw new HttpError(401, "key_mismatch", "设备密钥校验失败");
  if (storedDevice) {
    if (storedDevice.key_fingerprint !== keyFingerprint) throw new HttpError(401, "key_mismatch", "设备密钥校验失败");
    if (storedDevice.certificate_digest && storedDevice.certificate_digest !== certificateDigest) throw new HttpError(401, "certificate_changed", "客户端签名发生变化");
  }
  const consumed = await env.DB.prepare(
    "UPDATE challenges SET used_at=? WHERE nonce=? AND device_hash=? AND purpose=? AND used_at IS NULL AND expires_at>=?"
  ).bind(nowSeconds(), nonce, deviceHash, purpose, nowSeconds()).run();
  if (Number(consumed.meta?.changes || 0) !== 1) throw new HttpError(401, "bad_nonce", "验证请求已失效，请重试");
  const canonical = [purpose, nonce, String(timestamp), deviceHash, keyFingerprint, String(appVersionOf(body)), certificateDigest, payloadHash].join("\n");
  const publicKey = await crypto.subtle.importKey("spki", publicBytes, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  const signatureBytes = base64Decode(signature);
  const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, publicKey, signatureBytes, encoder.encode(canonical));
  if (!ok) throw new HttpError(401, "bad_signature", "设备签名校验失败");
  return { keyFingerprint, certificateDigest, riskFlags };
}

async function licenseSuccess(env, license, deviceHash, device, now, secure, appVersion) {
  const riskScore = secure ? calculateRiskScore(device.risk_flags || "") : 0;
  const forceOnline = riskScore >= 2;
  const token = await signToken({
    typ: "session",
    lic: license.id,
    dev: deviceHash,
    kid: secure ? device.key_fingerprint : "",
    sv: Number(device.session_version || 1),
    app: appVersion,
    iat: now,
    exp: now + SESSION_SECONDS,
    jti: crypto.randomUUID(),
  }, env);
  return reply({
    ok: true,
    token,
    tokenExpiresAt: now + SESSION_SECONDS,
    licenseExpiresAt: license.expires_at || null,
    permanent: license.expires_at == null,
    offlineGraceSeconds: forceOnline ? 0 : (secure ? OFFLINE_GRACE_SECONDS : LEGACY_OFFLINE_GRACE_SECONDS),
    forceOnline,
    serverTime: now,
    minAppVersion: MIN_APP_VERSION,
    latestAppVersion: LATEST_APP_VERSION,
  });
}

async function loadScriptRelease(env) {
  const now = Date.now();
  if (memoryScriptCache && memoryScriptCache.expiresAt > now) return memoryScriptCache.value;
  const manifestResponse = await githubFetch(env, `${GITHUB_RELEASE_BASE}manifest.json`);
  if (!manifestResponse.ok) throw new HttpError(503, "script_unavailable", "核心服务暂时不可用");
  const manifestText = await manifestResponse.text();
  if (manifestText.length > 64 * 1024) throw new HttpError(503, "script_invalid", "核心服务数据异常");
  let manifest;
  try { manifest = JSON.parse(manifestText); } catch { throw new HttpError(503, "script_invalid", "核心服务数据异常"); }
  if (!manifest || !/^[A-Za-z0-9._-]+\.js$/.test(String(manifest.file || ""))) throw new HttpError(503, "script_invalid", "核心服务数据异常");
  if (!/^[0-9a-f]{64}$/i.test(String(manifest.sha256 || ""))) throw new HttpError(503, "script_invalid", "核心服务数据异常");
  const scriptResponse = await githubFetch(env, `${GITHUB_RELEASE_BASE}${manifest.file}`);
  if (!scriptResponse.ok) throw new HttpError(503, "script_unavailable", "核心服务暂时不可用");
  const bytes = new Uint8Array(await scriptResponse.arrayBuffer());
  if (bytes.length <= 0 || bytes.length > MAX_SCRIPT_BYTES || Number(manifest.size) !== bytes.length) throw new HttpError(503, "script_invalid", "核心服务数据异常");
  const digest = await sha256HexBytes(bytes);
  if (!(await constantTimeTextEqual(digest, String(manifest.sha256).toLowerCase()))) throw new HttpError(503, "script_invalid", "核心服务校验失败");
  const value = { manifest, scriptBase64: base64Standard(bytes) };
  memoryScriptCache = { value, expiresAt: now + 60_000 };
  return value;
}

function githubFetch(env, url) {
  const headers = new Headers({ "Accept": "application/vnd.github.raw+json", "User-Agent": "GG-License-Worker/2" });
  if (env.GITHUB_TOKEN) headers.set("Authorization", `Bearer ${env.GITHUB_TOKEN}`);
  return fetch(url, { headers, cf: { cacheEverything: true, cacheTtl: 60 } });
}

async function touch(env, licenseId, deviceId, now) {
  await env.DB.batch([
    env.DB.prepare("UPDATE devices SET last_seen_at=? WHERE id=?").bind(now, deviceId),
    env.DB.prepare("UPDATE licenses SET last_seen_at=? WHERE id=?").bind(now, licenseId),
  ]);
}

async function activeDeviceCount(env, licenseId) {
  const row = await env.DB.prepare("SELECT COUNT(*) AS count FROM devices WHERE license_id=? AND revoked_at IS NULL").bind(licenseId).first();
  return Number(row?.count || 0);
}

async function findLicenseByKey(env, key) {
  return env.DB.prepare("SELECT * FROM licenses WHERE key_hash=?").bind(await sha256Hex(key)).first();
}

async function licenseStateError(env, license) {
  const now = nowSeconds();
  if (license.status === "disabled") return reply({ ok: false, code: "license_disabled", message: "服务已暂停" }, 403);
  if (license.status === "expired" || (license.expires_at && license.expires_at <= now)) {
    if (license.status !== "expired") await env.DB.prepare("UPDATE licenses SET status='expired' WHERE id=?").bind(license.id).run();
    return reply({ ok: false, code: "license_expired", message: "服务已到期" }, 403);
  }
  return null;
}

async function findLicenseForAdmin(env, body) {
  const id = string(body.id, 64);
  if (id) return env.DB.prepare("SELECT * FROM licenses WHERE id=?").bind(id).first();
  const key = normalizeKey(body.licenseKey);
  if (key.length !== 32) return null;
  return findLicenseByKey(env, key);
}

async function requireAdmin(request, env) {
  const header = request.headers.get("authorization") || "";
  if (!header.startsWith("Bearer ")) throw new HttpError(401, "unauthorized", "请先登录管理端");
  const payload = await verifyToken(header.slice(7), env, "admin");
  if (!payload) throw new HttpError(401, "unauthorized", "管理登录已失效");
  return payload;
}

async function signToken(payload, env) {
  const encoded = base64Url(encoder.encode(JSON.stringify(payload)));
  const signature = await hmac(encoded, env.ADMIN_PASSWORD || "");
  return `${encoded}.${base64Url(signature)}`;
}

async function verifyToken(token, env, expectedType) {
  try {
    const [payloadPart, signaturePart] = token.split(".");
    if (!payloadPart || !signaturePart) return null;
    const expected = await hmac(payloadPart, env.ADMIN_PASSWORD || "");
    const supplied = base64UrlDecode(signaturePart);
    if (!constantTimeBytes(expected, supplied)) return null;
    const payload = JSON.parse(decoder.decode(base64UrlDecode(payloadPart)));
    if (payload.typ !== expectedType || !Number.isFinite(payload.exp) || payload.exp <= nowSeconds()) return null;
    return payload;
  } catch { return null; }
}

async function hmac(text, secret) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(`gams-license-v1:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(text)));
}

async function constantTimeTextEqual(a, b) {
  const [ha, hb] = await Promise.all([crypto.subtle.digest("SHA-256", encoder.encode(String(a))), crypto.subtle.digest("SHA-256", encoder.encode(String(b)))]);
  return constantTimeBytes(new Uint8Array(ha), new Uint8Array(hb));
}

function constantTimeBytes(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function readJson(request) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > MAX_BODY_BYTES) throw new HttpError(413, "body_too_large", "请求内容过大");
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new HttpError(413, "body_too_large", "请求内容过大");
  try { return text ? JSON.parse(text) : {}; } catch { throw new HttpError(400, "bad_json", "请求格式错误"); }
}

async function allowRate(env, key, limit, windowSeconds) {
  const now = nowSeconds();
  const row = await env.DB.prepare("SELECT window_start,count FROM rate_limits WHERE key=?").bind(key).first();
  if (!row || now - row.window_start >= windowSeconds) {
    await env.DB.prepare("INSERT INTO rate_limits(key,window_start,count) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET window_start=excluded.window_start,count=1").bind(key, now).run();
    return true;
  }
  if (row.count >= limit) return false;
  await env.DB.prepare("UPDATE rate_limits SET count=count+1 WHERE key=?").bind(key).run();
  return true;
}

async function requestRateKey(request, prefix) {
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  return `${prefix}:${await sha256Hex(ip)}`;
}

async function audit(env, event, licenseId, deviceHash, detail) {
  try {
    await env.DB.prepare("INSERT INTO audit_log(id,event,license_id,device_hash,detail,created_at) VALUES(?,?,?,?,?,?)")
      .bind(crypto.randomUUID(), event, licenseId, deviceHash, detail || "", nowSeconds()).run();
  } catch (error) { console.warn("audit failed", error); }
}

function requireSupportedVersion(appVersion) {
  if (appVersion < MIN_APP_VERSION) throw new HttpError(426, "upgrade_required", "客户端版本过低，请更新后继续使用");
}

function appVersionOf(body) { return clampInteger(body.appVersion, 0, 1000000, 0); }
function normalizeKey(value) { return String(value || "").replace(/[^0-9a-f]/gi, "").toUpperCase(); }
function normalizeDevice(value) { const result = String(value || "").trim().toLowerCase(); return /^[0-9a-f]{64}$/.test(result) ? result : ""; }
function normalizeHex64(value) { const result = String(value || "").trim().toLowerCase(); return /^[0-9a-f]{64}$/.test(result) ? result : ""; }
function randomKey() { const bytes = crypto.getRandomValues(new Uint8Array(16)); return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase(); }
async function sha256Hex(value) { return sha256HexBytes(encoder.encode(String(value))); }
async function sha256HexBytes(bytes) { const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)); return [...digest].map((b) => b.toString(16).padStart(2, "0")).join(""); }
function string(value, max) { return String(value == null ? "" : value).trim().slice(0, max); }
function clampInteger(value, min, max, fallback) { const number = Number.parseInt(value, 10); return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback; }
function nowSeconds() { return Math.floor(Date.now() / 1000); }
function calculateRiskScore(flags) { return String(flags || "").split(",").map((x) => x.trim()).filter(Boolean).length; }

function base64Standard(bytes) { let binary = ""; for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(binary); }
function base64Decode(text) { const binary = atob(String(text || "")); return Uint8Array.from(binary, (c) => c.charCodeAt(0)); }
function base64Url(bytes) { return base64Standard(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, ""); }
function base64UrlDecode(text) { const normalized = text.replace(/-/g, "+").replace(/_/g, "/"); return base64Decode(normalized + "=".repeat((4 - normalized.length % 4) % 4)); }

function cors(response) {
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-allow-methods", "GET,POST,OPTIONS");
  headers.set("access-control-allow-headers", "content-type,authorization");
  headers.set("x-content-type-options", "nosniff");
  headers.set("cache-control", "no-store");
  return new Response(response.body, { status: response.status, headers });
}

function reply(data, status = 200) {
  return cors(new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8" } }));
}

class HttpError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
