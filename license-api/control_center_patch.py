from pathlib import Path
import re

path = Path("src/index.js")
text = path.read_text(encoding="utf-8")


def replace_function(source: str, name: str, replacement: str) -> str:
    match = re.search(rf"(?:async\s+)?function\s+{re.escape(name)}\s*\(", source)
    if not match:
        raise SystemExit(f"Missing function: {name}")
    brace = source.find("{", match.start())
    if brace < 0:
        raise SystemExit(f"Missing function body: {name}")
    depth = 0
    quote = None
    escaped = False
    template_depth = 0
    index = brace
    while index < len(source):
        char = source[index]
        if quote:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == quote and template_depth == 0:
                quote = None
            elif quote == "`" and char == "$" and index + 1 < len(source) and source[index + 1] == "{":
                template_depth += 1
                index += 1
            elif quote == "`" and char == "}" and template_depth:
                template_depth -= 1
        else:
            if char in ('"', "'", "`"):
                quote = char
            elif char == "{":
                depth += 1
            elif char == "}":
                depth -= 1
                if depth == 0:
                    return source[:match.start()] + replacement.rstrip() + "\n" + source[index + 1:]
        index += 1
    raise SystemExit(f"Unclosed function: {name}")


def insert_before(source: str, marker: str, value: str) -> str:
    index = source.find(marker)
    if index < 0:
        raise SystemExit(f"Missing insertion marker: {marker}")
    return source[:index] + value.rstrip() + "\n\n" + source[index:]


settings_block = r'''
const DEFAULT_SETTINGS = Object.freeze({
  minAppVersion: 5,
  secureAppVersion: 6,
  latestAppVersion: 7,
  forceUpdate: false,
  updateUrl: "",
  updateMessage: "",
  sessionSeconds: 7200,
  adminSessionSeconds: 43200,
  foregroundRecheckSeconds: 1800,
  offlineGraceSeconds: 21600,
  legacyOfflineGraceSeconds: 86400,
  scriptLeaseSeconds: 21600,
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
'''
text = text.replace("let memoryScriptCache = null;", "let memoryScriptCache = null;\n" + settings_block, 1)

router = r'''export default {
  async fetch(request, env) {
    try {
      if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }));
      const url = new URL(request.url);
      if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
        const settings = await loadSettings(env);
        return reply({ ok: true, service: "gams-license-api", version: 3,
          configVersion: settings.configVersion, minAppVersion: settings.minAppVersion,
          latestAppVersion: settings.latestAppVersion, scriptDeliveryEnabled: settings.scriptDeliveryEnabled });
      }
      if (request.method === "POST" && url.pathname === "/v1/admin/login") return adminLogin(request, env);
      if (request.method === "GET" && url.pathname === "/v1/admin/dashboard") return adminDashboard(request, env);
      if (request.method === "GET" && url.pathname === "/v1/admin/settings") return adminGetSettings(request, env);
      if (request.method === "POST" && url.pathname === "/v1/admin/settings/update") return adminUpdateSettings(request, env);
      if (request.method === "GET" && url.pathname === "/v1/admin/settings/history") return adminSettingsHistory(request, env);
      if (request.method === "POST" && url.pathname === "/v1/admin/settings/rollback") return adminRollbackSettings(request, env);
      if (request.method === "POST" && url.pathname === "/v1/admin/licenses/create") return adminCreateLicenses(request, env);
      if (request.method === "GET" && url.pathname === "/v1/admin/licenses") return adminListLicenses(request, env);
      if (request.method === "GET" && url.pathname === "/v1/admin/licenses/detail") return adminLicenseDetail(request, env);
      if (request.method === "POST" && url.pathname === "/v1/admin/licenses/action") return adminLicenseAction(request, env);
      if (request.method === "POST" && url.pathname === "/v1/admin/licenses/update") return adminLicenseUpdate(request, env);
      if (request.method === "POST" && url.pathname === "/v1/admin/licenses/batch-action") return adminLicenseBatchAction(request, env);
      if (request.method === "GET" && url.pathname === "/v1/admin/devices") return adminListDevices(request, env);
      if (request.method === "GET" && url.pathname === "/v1/admin/devices/detail") return adminDeviceDetail(request, env);
      if (request.method === "POST" && url.pathname === "/v1/admin/devices/revoke") return adminRevokeDevice(request, env);
      if (request.method === "POST" && url.pathname === "/v1/admin/devices/revoke-all") return adminRevokeAllDevices(request, env);
      if (request.method === "GET" && url.pathname === "/v1/admin/audit") return adminAudit(request, env);
      if (request.method === "POST" && url.pathname === "/v1/admin/sessions/revoke-all") return adminRevokeAllSessions(request, env);
      if (request.method === "GET" && url.pathname === "/v1/admin/runtime") return adminRuntime(request, env);
      if (request.method === "GET" && url.pathname === "/v1/admin/runtime/releases") return adminRuntimeReleases(request, env);
      if (request.method === "POST" && url.pathname === "/v1/admin/runtime/pause") return adminRuntimeToggle(request, env, false);
      if (request.method === "POST" && url.pathname === "/v1/admin/runtime/resume") return adminRuntimeToggle(request, env, true);
      if (request.method === "POST" && url.pathname === "/v1/admin/runtime/select") return adminRuntimeSelect(request, env);
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
};'''
text = re.sub(r"export default \{.*?\n\};", router, text, count=1, flags=re.S)

admin_login = r'''async function adminLogin(request, env) {
  const ipKey = await requestRateKey(request, "admin-login");
  if (!(await allowRate(env, ipKey, 5, 600))) return reply({ ok: false, code: "too_many_requests", message: "尝试次数过多，请稍后再试" }, 429);
  const body = await readJson(request);
  const password = string(body.password, 128);
  if (!password || !(await constantTimeTextEqual(password, env.ADMIN_PASSWORD || ""))) {
    await audit(env, "admin_login_failed", null, null, "");
    return reply({ ok: false, code: "bad_password", message: "管理密码错误" }, 401);
  }
  const settings = await loadSettings(env);
  const now = nowSeconds();
  const token = await signToken({ typ: "admin", iat: now, exp: now + settings.adminSessionSeconds, jti: crypto.randomUUID() }, env);
  await audit(env, "admin_login_ok", null, null, "");
  return reply({ ok: true, token, expiresAt: now + settings.adminSessionSeconds, apiVersion: 3 });
}'''
text = replace_function(text, "adminLogin", admin_login)

admin_list = r'''async function adminListLicenses(request, env) {
  await requireAdmin(request, env);
  const url = new URL(request.url);
  const limit = clampInteger(url.searchParams.get("limit"), 1, 100, 50);
  const offset = clampInteger(url.searchParams.get("offset"), 0, 1000000, 0);
  const status = string(url.searchParams.get("status"), 20);
  const query = string(url.searchParams.get("q"), 100);
  const conditions = [];
  const bindings = [];
  if (["active", "disabled", "expired"].includes(status)) { conditions.push("l.status=?"); bindings.push(status); }
  if (query) { conditions.push("(l.key_preview LIKE ? OR l.note LIKE ? OR l.id=?)"); bindings.push(`%${query}%`, `%${query}%`, query); }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const countRow = await env.DB.prepare(`SELECT COUNT(*) AS count FROM licenses l ${where}`).bind(...bindings).first();
  const rows = await env.DB.prepare(
    `SELECT l.id,l.key_preview,l.status,l.created_at,l.activated_at,l.expires_at,l.max_devices,l.note,
            l.last_seen_at,l.last_unbind_at,l.rebind_available_at,
            SUM(CASE WHEN d.id IS NOT NULL AND d.revoked_at IS NULL THEN 1 ELSE 0 END) AS active_devices
       FROM licenses l LEFT JOIN devices d ON d.license_id=l.id ${where}
      GROUP BY l.id ORDER BY l.created_at DESC LIMIT ? OFFSET ?`
  ).bind(...bindings, limit, offset).all();
  return reply({ ok: true, total: Number(countRow?.count || 0), limit, offset, licenses: rows.results || [] });
}'''
text = replace_function(text, "adminListLicenses", admin_list)

admin_action = r'''async function adminLicenseAction(request, env) {
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
    const seconds = body.seconds != null ? clampInteger(body.seconds, 60, 315360000, 2592000) : clampInteger(body.days, 1, 3650, 30) * 86400;
    const base = license.expires_at && license.expires_at > now ? Number(license.expires_at) : now;
    await env.DB.prepare("UPDATE licenses SET expires_at=?,status='active' WHERE id=?").bind(base + seconds, license.id).run();
  } else if (action === "permanent") {
    await env.DB.prepare("UPDATE licenses SET expires_at=NULL,status='active' WHERE id=?").bind(license.id).run();
  } else if (action === "unbind") {
    await revokeDevicesForLicense(env, license.id, now);
    await env.DB.prepare("UPDATE licenses SET rebind_available_at=NULL WHERE id=?").bind(license.id).run();
  } else {
    return reply({ ok: false, code: "bad_action", message: "不支持的管理操作" }, 400);
  }
  await audit(env, `license_${action}`, license.id, null, JSON.stringify({ days: body.days || null, seconds: body.seconds || null }));
  return reply({ ok: true, license: await getLicenseSummary(env, license.id) });
}'''
text = replace_function(text, "adminLicenseAction", admin_action)

issue_challenge = r'''async function issueChallenge(request, env) {
  const body = await readJson(request);
  const appVersion = appVersionOf(body);
  await requireSupportedVersion(env, appVersion);
  const settings = await loadSettings(env);
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
    env.DB.prepare("INSERT INTO challenges(nonce,device_hash,purpose,created_at,expires_at) VALUES(?,?,?,?,?)")
      .bind(nonce, deviceHash, purpose, now, now + settings.challengeSeconds),
  ]);
  return reply({ ok: true, nonce, purpose, serverTime: now, expiresAt: now + settings.challengeSeconds });
}'''
text = replace_function(text, "issueChallenge", issue_challenge)

activate = r'''async function activate(request, env) {
  const body = await readJson(request);
  const appVersion = appVersionOf(body);
  await requireSupportedVersion(env, appVersion);
  const settings = await loadSettings(env);
  return appVersion >= settings.secureAppVersion ? activateSecure(request, env, body, appVersion) : activateLegacy(request, env, body, appVersion);
}'''
text = replace_function(text, "activate", activate)

check = r'''async function check(request, env) {
  const body = await readJson(request);
  const appVersion = appVersionOf(body);
  await requireSupportedVersion(env, appVersion);
  const settings = await loadSettings(env);
  return appVersion >= settings.secureAppVersion ? checkSecure(request, env, body, appVersion) : checkLegacy(request, env, body, appVersion);
}'''
text = replace_function(text, "check", check)

script_fn = r'''async function script(request, env) {
  const body = await readJson(request);
  const appVersion = appVersionOf(body);
  await requireSupportedVersion(env, appVersion);
  const settings = await loadSettings(env);
  if (appVersion < settings.secureAppVersion) return reply({ ok: false, code: "upgrade_required", message: "请更新客户端后继续使用" }, 426);
  if (!settings.scriptDeliveryEnabled) return reply({ ok: false, code: "runtime_paused", message: "服务维护中，请稍后再试" }, 503);
  const deviceHash = normalizeDevice(body.deviceId);
  const tokenText = string(body.token, 4096);
  const payload = await verifyToken(tokenText, env, "session");
  if (!payload || payload.dev !== deviceHash) return reply({ ok: false, code: "bad_session", message: "服务状态已失效" }, 401);
  const license = await env.DB.prepare("SELECT * FROM licenses WHERE id=?").bind(payload.lic).first();
  if (!license) return reply({ ok: false, code: "license_not_found", message: "服务状态无效" }, 404);
  const stateError = await licenseStateError(env, license);
  if (stateError) return stateError;
  const device = await env.DB.prepare("SELECT * FROM devices WHERE license_id=? AND device_hash=? AND revoked_at IS NULL").bind(license.id, deviceHash).first();
  if (!device || payload.kid !== device.key_fingerprint || Number(payload.sv) !== Number(device.session_version)) return reply({ ok: false, code: "device_unbound", message: "当前设备状态无效" }, 401);
  await verifySignedRequest(env, body, "script", device.public_key, await sha256Hex(`${tokenText}|script`), device);
  const rateKey = `script:${license.id}:${device.id}`;
  if (!(await allowRate(env, rateKey, 30, 60))) return reply({ ok: false, code: "too_many_requests", message: "初始化过于频繁" }, 429);
  const release = await loadScriptRelease(env, settings);
  const now = nowSeconds();
  await touch(env, license.id, device.id, now);
  return reply({ ok: true, manifest: release.manifest, scriptBase64: release.scriptBase64,
    leaseSeconds: settings.scriptLeaseSeconds, serverTime: now, configVersion: settings.configVersion });
}'''
text = replace_function(text, "script", script_fn)

self_unbind = r'''async function selfUnbind(request, env) {
  const body = await readJson(request);
  const appVersion = appVersionOf(body);
  await requireSupportedVersion(env, appVersion);
  const settings = await loadSettings(env);
  if (appVersion < settings.secureAppVersion) return reply({ ok: false, code: "upgrade_required", message: "请更新客户端后继续使用" }, 426);
  if (!settings.selfUnbindEnabled) return reply({ ok: false, code: "self_unbind_disabled", message: "当前不允许自助更换设备" }, 403);
  const deviceHash = normalizeDevice(body.deviceId);
  const tokenText = string(body.token, 4096);
  const payload = await verifyToken(tokenText, env, "session");
  if (!payload || payload.dev !== deviceHash) return reply({ ok: false, code: "bad_session", message: "服务状态已失效" }, 401);
  const license = await env.DB.prepare("SELECT * FROM licenses WHERE id=?").bind(payload.lic).first();
  if (!license) return reply({ ok: false, code: "license_not_found", message: "服务状态无效" }, 404);
  const stateError = await licenseStateError(env, license);
  if (stateError) return stateError;
  const device = await env.DB.prepare("SELECT * FROM devices WHERE license_id=? AND device_hash=? AND revoked_at IS NULL").bind(license.id, deviceHash).first();
  if (!device || payload.kid !== device.key_fingerprint || Number(payload.sv) !== Number(device.session_version)) return reply({ ok: false, code: "device_unbound", message: "当前设备状态无效" }, 401);
  await verifySignedRequest(env, body, "unbind", device.public_key, await sha256Hex(`${tokenText}|unbind`), device);
  const now = nowSeconds();
  if (license.last_unbind_at && now - Number(license.last_unbind_at) < settings.unbindCooldownSeconds) return reply({ ok: false, code: "unbind_cooldown", message: "更换设备操作冷却中，请稍后再试" }, 429);
  const recent = await env.DB.prepare("SELECT COUNT(*) AS count FROM audit_log WHERE license_id=? AND event='self_unbind' AND created_at>=?")
    .bind(license.id, now - settings.unbindWindowSeconds).first();
  if (Number(recent?.count || 0) >= settings.unbindWindowLimit) return reply({ ok: false, code: "unbind_limit", message: "近期更换设备次数已达上限" }, 429);
  let expiresAt = license.expires_at == null ? null : Number(license.expires_at);
  let rebindAvailableAt = null;
  if (expiresAt == null) rebindAvailableAt = now + settings.unbindPenaltySeconds;
  else {
    if (expiresAt - now <= settings.unbindPenaltySeconds) return reply({ ok: false, code: "insufficient_time", message: "剩余时间不足，无法自助更换设备" }, 409);
    expiresAt -= settings.unbindPenaltySeconds;
  }
  await env.DB.batch([
    env.DB.prepare("UPDATE devices SET revoked_at=?,session_version=session_version+1 WHERE id=?").bind(now, device.id),
    env.DB.prepare("UPDATE licenses SET expires_at=?,last_unbind_at=?,rebind_available_at=? WHERE id=?").bind(expiresAt, now, rebindAvailableAt, license.id),
  ]);
  await audit(env, "self_unbind", license.id, deviceHash, JSON.stringify({ penaltySeconds: settings.unbindPenaltySeconds, expiresAt, rebindAvailableAt }));
  return reply({ ok: true, penaltySeconds: settings.unbindPenaltySeconds, licenseExpiresAt: expiresAt, rebindAvailableAt });
}'''
text = replace_function(text, "selfUnbind", self_unbind)

license_success = r'''async function licenseSuccess(env, license, deviceHash, device, now, secure, appVersion) {
  const settings = await loadSettings(env);
  const riskScore = secure ? calculateRiskScore(device.risk_flags || "") : 0;
  const forceOnline = settings.globalForceOnline || riskScore >= settings.riskForceOnlineThreshold;
  const token = await signToken({ typ: "session", lic: license.id, dev: deviceHash,
    kid: secure ? device.key_fingerprint : "", sv: Number(device.session_version || 1), app: appVersion,
    sg: settings.sessionGeneration, iat: now, exp: now + settings.sessionSeconds, jti: crypto.randomUUID() }, env);
  return reply({
    ok: true, token, tokenExpiresAt: now + settings.sessionSeconds,
    licenseExpiresAt: license.expires_at || null, permanent: license.expires_at == null,
    offlineGraceSeconds: forceOnline ? 0 : (secure ? settings.offlineGraceSeconds : settings.legacyOfflineGraceSeconds),
    scriptLeaseSeconds: settings.scriptLeaseSeconds,
    foregroundRecheckSeconds: settings.foregroundRecheckSeconds,
    forceOnline, serverTime: now, configVersion: settings.configVersion,
    minAppVersion: settings.minAppVersion, latestAppVersion: settings.latestAppVersion,
    forceUpdate: settings.forceUpdate && appVersion < settings.latestAppVersion,
    updateUrl: settings.updateUrl, updateMessage: settings.updateMessage,
    selfUnbindEnabled: settings.selfUnbindEnabled, unbindPenaltySeconds: settings.unbindPenaltySeconds,
  });
}'''
text = replace_function(text, "licenseSuccess", license_success)

load_script = r'''async function loadScriptRelease(env, settings = null) {
  settings = settings || await loadSettings(env);
  const cacheKey = settings.activeScriptVersion || "current";
  const nowMs = Date.now();
  if (memoryScriptCache && memoryScriptCache.key === cacheKey && memoryScriptCache.expiresAt > nowMs) return memoryScriptCache.value;
  let manifest;
  if (settings.activeScriptVersion) {
    const stored = await env.DB.prepare("SELECT manifest_json FROM script_releases WHERE version=?").bind(settings.activeScriptVersion).first();
    if (!stored) throw new HttpError(409, "release_not_registered", "所选资源版本尚未登记");
    try { manifest = JSON.parse(stored.manifest_json); } catch { throw new HttpError(503, "script_invalid", "资源版本记录无效"); }
  } else {
    manifest = await fetchCurrentManifest(env);
    await rememberScriptRelease(env, manifest);
  }
  if (!manifest || !/^[A-Za-z0-9._-]+\.js$/.test(String(manifest.file || ""))) throw new HttpError(503, "script_invalid", "核心服务数据异常");
  const scriptResponse = await githubFetch(env, `${GITHUB_RELEASE_BASE}${manifest.file}`);
  if (!scriptResponse.ok) throw new HttpError(503, "script_unavailable", "核心服务暂时不可用");
  const bytes = new Uint8Array(await scriptResponse.arrayBuffer());
  if (bytes.length <= 0 || bytes.length > MAX_SCRIPT_BYTES || Number(manifest.size) !== bytes.length) throw new HttpError(503, "script_invalid", "核心服务数据异常");
  const digest = await sha256HexBytes(bytes);
  if (!(await constantTimeTextEqual(digest, String(manifest.sha256).toLowerCase()))) throw new HttpError(503, "script_invalid", "核心服务校验失败");
  const value = { manifest, scriptBase64: base64Standard(bytes) };
  memoryScriptCache = { key: cacheKey, value, expiresAt: nowMs + 60000 };
  return value;
}'''
text = replace_function(text, "loadScriptRelease", load_script)

verify_token = r'''async function verifyToken(token, env, expectedType) {
  try {
    const [payloadPart, signaturePart] = token.split(".");
    if (!payloadPart || !signaturePart) return null;
    const expected = await hmac(payloadPart, env.ADMIN_PASSWORD || "");
    const supplied = base64UrlDecode(signaturePart);
    if (!constantTimeBytes(expected, supplied)) return null;
    const payload = JSON.parse(decoder.decode(base64UrlDecode(payloadPart)));
    if (payload.typ !== expectedType || !Number.isFinite(payload.exp) || payload.exp <= nowSeconds()) return null;
    if (expectedType === "session") {
      const settings = await loadSettings(env);
      if (Number(payload.sg || 1) !== Number(settings.sessionGeneration)) return null;
    }
    return payload;
  } catch { return null; }
}'''
text = replace_function(text, "verifyToken", verify_token)

require_version = r'''async function requireSupportedVersion(env, appVersion) {
  const settings = await loadSettings(env);
  if (appVersion < settings.minAppVersion) throw new HttpError(426, "upgrade_required", settings.updateMessage || "客户端版本过低，请更新后继续使用");
}'''
text = replace_function(text, "requireSupportedVersion", require_version)

text = text.replace(
    'if (Math.abs(nowSeconds() - timestamp) > 120) throw new HttpError(401, "stale_request", "请求已过期，请重试");',
    'const requestSettings = await loadSettings(env);\n  if (Math.abs(nowSeconds() - timestamp) > Math.max(120, requestSettings.challengeSeconds + 30)) throw new HttpError(401, "stale_request", "请求已过期，请重试");',
    1,
)

helpers = r'''
async function loadSettings(env, force = false) {
  const now = Date.now();
  if (!force && memorySettingsCache && memorySettingsCache.expiresAt > now) return memorySettingsCache.value;
  try {
    const row = await env.DB.prepare("SELECT config_version,settings_json FROM system_settings WHERE id=1").first();
    const parsed = row ? JSON.parse(row.settings_json) : {};
    const value = validateSettings({ ...DEFAULT_SETTINGS, ...parsed }, DEFAULT_SETTINGS);
    value.configVersion = Number(row?.config_version || 1);
    memorySettingsCache = { value, expiresAt: now + value.configCacheSeconds * 1000 };
    return value;
  } catch (error) {
    console.warn("settings fallback", error);
    const value = { ...DEFAULT_SETTINGS, configVersion: 1 };
    memorySettingsCache = { value, expiresAt: now + 5000 };
    return value;
  }
}

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

function stripConfigVersion(settings) { const copy = { ...settings }; delete copy.configVersion; return copy; }

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

async function adminGetSettings(request, env) { await requireAdmin(request, env); return reply({ ok: true, settings: await loadSettings(env, true) }); }

async function adminUpdateSettings(request, env) {
  const admin = await requireAdmin(request, env);
  const body = await readJson(request);
  const next = await saveSettings(env, body.settings || {}, admin.jti || "admin", body.reason || "", body.expectedVersion);
  await audit(env, "settings_updated", null, null, JSON.stringify({ configVersion: next.configVersion, reason: body.reason || "" }));
  return reply({ ok: true, settings: next });
}

async function adminSettingsHistory(request, env) {
  await requireAdmin(request, env);
  const url = new URL(request.url);
  const limit = clampInteger(url.searchParams.get("limit"), 1, 100, 30);
  const rows = await env.DB.prepare("SELECT id,config_version,settings_json,changed_at,changed_by,reason FROM system_settings_history ORDER BY changed_at DESC LIMIT ?").bind(limit).all();
  return reply({ ok: true, history: (rows.results || []).map((row) => ({ ...row, settings: safeJson(row.settings_json) })) });
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

async function adminDeviceDetail(request, env) {
  await requireAdmin(request, env);
  const id = string(new URL(request.url).searchParams.get("id"), 64);
  const device = await env.DB.prepare("SELECT d.*,l.key_preview,l.status license_status,l.expires_at FROM devices d JOIN licenses l ON l.id=d.license_id WHERE d.id=?").bind(id).first();
  if (!device) throw new HttpError(404, "device_not_found", "未找到设备");
  return reply({ ok: true, device });
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

async function adminRevokeAllDevices(request, env) {
  await requireAdmin(request, env);
  const body = await readJson(request);
  const license = await findLicenseForAdmin(env, body);
  if (!license) throw new HttpError(404, "license_not_found", "未找到卡密");
  const count = await revokeDevicesForLicense(env, license.id, nowSeconds());
  await audit(env, "admin_devices_revoked_all", license.id, null, JSON.stringify({ count }));
  return reply({ ok: true, count });
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

async function adminRuntime(request, env) {
  await requireAdmin(request, env);
  const settings = await loadSettings(env, true);
  let manifest = null, error = "";
  try { manifest = (await loadScriptRelease(env, settings)).manifest; } catch (failure) { error = failure.message || "unavailable"; }
  return reply({ ok: true, enabled: settings.scriptDeliveryEnabled, activeScriptVersion: settings.activeScriptVersion, manifest, error });
}

async function adminRuntimeReleases(request, env) {
  await requireAdmin(request, env);
  try { await rememberScriptRelease(env, await fetchCurrentManifest(env)); } catch { }
  const rows = await env.DB.prepare("SELECT version,manifest_json,file_name,sha256,size_bytes,first_seen_at,last_seen_at FROM script_releases ORDER BY last_seen_at DESC LIMIT 100").all();
  return reply({ ok: true, releases: (rows.results || []).map((row) => ({ ...row, manifest: safeJson(row.manifest_json) })) });
}

async function adminRuntimeToggle(request, env, enabled) {
  const admin = await requireAdmin(request, env);
  const body = await readJson(request);
  const next = await saveSettings(env, { scriptDeliveryEnabled: enabled }, admin.jti || "admin", body.reason || (enabled ? "runtime-resume" : "runtime-pause"), body.expectedVersion);
  await audit(env, enabled ? "runtime_resumed" : "runtime_paused", null, null, "");
  return reply({ ok: true, settings: next });
}

async function adminRuntimeSelect(request, env) {
  const admin = await requireAdmin(request, env);
  const body = await readJson(request);
  const version = string(body.version, 64);
  if (version) {
    const row = await env.DB.prepare("SELECT version FROM script_releases WHERE version=?").bind(version).first();
    if (!row) throw new HttpError(404, "release_not_found", "未找到已登记的资源版本");
  }
  const next = await saveSettings(env, { activeScriptVersion: version }, admin.jti || "admin", body.reason || `runtime-select:${version || "current"}`, body.expectedVersion);
  await audit(env, "runtime_selected", null, null, JSON.stringify({ version }));
  return reply({ ok: true, settings: next });
}

async function fetchCurrentManifest(env) {
  const response = await githubFetch(env, `${GITHUB_RELEASE_BASE}manifest.json`);
  if (!response.ok) throw new HttpError(503, "script_unavailable", "核心服务暂时不可用");
  const text = await response.text();
  if (text.length > 65536) throw new HttpError(503, "script_invalid", "核心服务数据异常");
  let manifest; try { manifest = JSON.parse(text); } catch { throw new HttpError(503, "script_invalid", "核心服务数据异常"); }
  if (!manifest || !/^[A-Za-z0-9._-]+\.js$/.test(String(manifest.file || "")) || !/^[0-9a-f]{64}$/i.test(String(manifest.sha256 || ""))) throw new HttpError(503, "script_invalid", "核心服务数据异常");
  return manifest;
}

async function rememberScriptRelease(env, manifest) {
  const version = string(manifest.version, 64);
  if (!version) return;
  const now = nowSeconds();
  await env.DB.prepare("INSERT INTO script_releases(version,manifest_json,file_name,sha256,size_bytes,first_seen_at,last_seen_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(version) DO UPDATE SET manifest_json=excluded.manifest_json,file_name=excluded.file_name,sha256=excluded.sha256,size_bytes=excluded.size_bytes,last_seen_at=excluded.last_seen_at")
    .bind(version, JSON.stringify(manifest), String(manifest.file), String(manifest.sha256).toLowerCase(), Number(manifest.size), now, now).run();
}

async function getLicenseSummary(env, id) {
  return env.DB.prepare(`SELECT l.id,l.key_preview,l.status,l.created_at,l.activated_at,l.expires_at,l.max_devices,l.note,l.last_seen_at,l.last_unbind_at,l.rebind_available_at,SUM(CASE WHEN d.id IS NOT NULL AND d.revoked_at IS NULL THEN 1 ELSE 0 END) active_devices FROM licenses l LEFT JOIN devices d ON d.license_id=l.id WHERE l.id=? GROUP BY l.id`).bind(id).first();
}

async function revokeDevicesForLicense(env, licenseId, now) {
  const result = await env.DB.prepare("UPDATE devices SET revoked_at=?,session_version=session_version+1 WHERE license_id=? AND revoked_at IS NULL").bind(now, licenseId).run();
  return Number(result.meta?.changes || 0);
}

function safeJson(value) { try { return JSON.parse(String(value || "{}")); } catch { return {}; } }
'''
text = insert_before(text, "async function issueChallenge", helpers)

path.write_text(text, encoding="utf-8")
print("Applied backward-compatible GG Worker API v3 control center")
