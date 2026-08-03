#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
CURRENT_PATH = ROOT / "license-api/src/index.js"
HISTORICAL_PATH = Path("/tmp/control-center/license-api/src/index.js")
RUNTIME_PATH = ROOT / "v2/runtime/src/index.js"
MIGRATION_PATH = ROOT / "license-api/migrations/0003_control_center.sql"


def function_span(source: str, name: str) -> tuple[int, int]:
    match = re.search(rf"(?m)^(?:async\s+)?function\s+{re.escape(name)}\s*\(", source)
    if not match:
        raise SystemExit(f"missing function: {name}")
    brace = source.find("{", match.start())
    if brace < 0:
        raise SystemExit(f"missing function body: {name}")
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
                    return match.start(), index + 1
        index += 1
    raise SystemExit(f"unclosed function: {name}")


def extract_function(source: str, name: str) -> str:
    start, end = function_span(source, name)
    return source[start:end]


def replace_function(source: str, name: str, replacement: str) -> str:
    start, end = function_span(source, name)
    return source[:start] + replacement.rstrip() + "\n" + source[end:]


def has_function(source: str, name: str) -> bool:
    return re.search(rf"(?m)^(?:async\s+)?function\s+{re.escape(name)}\s*\(", source) is not None


def append_function(source: str, block: str) -> str:
    marker = "\nclass HttpError extends Error"
    position = source.find(marker)
    if position < 0:
        raise SystemExit("HttpError insertion marker missing")
    return source[:position] + "\n\n" + block.rstrip() + "\n" + source[position:]


current = CURRENT_PATH.read_text(encoding="utf-8")
historical = HISTORICAL_PATH.read_text(encoding="utf-8")

settings_block = r'''
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
'''.strip()

marker = "const decoder = new TextDecoder();"
if marker not in current:
    raise SystemExit("decoder marker missing")
if "const DEFAULT_SETTINGS" not in current:
    current = current.replace(marker, marker + "\n\n" + settings_block, 1)

router = r'''export default {
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
};'''
current, count = re.subn(r"export default \{.*?\n\};", router, current, count=1, flags=re.S)
if count != 1:
    raise SystemExit(f"router replacement count={count}")

historical_functions = [
    "activeDeviceCount",
    "adminAudit",
    "adminDashboard",
    "adminDeviceDetail",
    "adminGetSettings",
    "adminLicenseBatchAction",
    "adminLicenseDetail",
    "adminLicenseUpdate",
    "adminListDevices",
    "adminRevokeAllDevices",
    "adminRevokeAllSessions",
    "adminRevokeDevice",
    "adminRollbackSettings",
    "adminSettingsHistory",
    "adminUpdateSettings",
    "calculateRiskScore",
    "findLicenseByKey",
    "getLicenseSummary",
    "normalizeDevice",
    "revokeDevicesForLicense",
    "safeJson",
    "saveSettings",
    "string",
    "stripConfigVersion",
    "validateSettings",
]
for name in historical_functions:
    block = extract_function(historical, name)
    if has_function(current, name):
        current = replace_function(current, name, block)
    else:
        current = append_function(current, block)

admin_login = r'''async function adminLogin(request, env) {
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
}'''
current = replace_function(current, "adminLogin", admin_login)

admin_list = r'''async function adminListLicenses(request, env) {
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
}'''
current = replace_function(current, "adminListLicenses", admin_list)

admin_action = r'''async function adminLicenseAction(request, env) {
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
}'''
current = replace_function(current, "adminLicenseAction", admin_action)

load_settings = r'''async function loadSettings(env, force = false) {
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
    value.configVersion = Number(row?.config_version || 1);
    memorySettingsCache = {
      value,
      expiresAt: now + value.configCacheSeconds * 1000,
    };
    return value;
  } catch (error) {
    console.warn("settings fallback", error);
    return { ...DEFAULT_SETTINGS, configVersion: 1 };
  }
}'''
if has_function(current, "loadSettings"):
    current = replace_function(current, "loadSettings", load_settings)
else:
    current = append_function(current, load_settings)

client_config = r'''async function clientConfig(request, env) {
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
}'''
current = append_function(current, client_config)

license_success = r'''async function licenseSuccess(env, license, device, now) {
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
}'''
current = replace_function(current, "licenseSuccess", license_success)

require_active_device = r'''async function requireActiveDevice(env, session, deviceHash) {
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
}'''
current = replace_function(current, "requireActiveDevice", require_active_device)

self_unbind = r'''async function selfUnbind(request, env) {
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
}'''
current = replace_function(current, "selfUnbind", self_unbind)

activate_block = extract_function(current, "activate")
needle = "  await requireActiveLicense(env, license);\n"
if needle not in activate_block:
    raise SystemExit("activate license-state marker missing")
activate_block = activate_block.replace(
    needle,
    needle +
    "  if (license.rebind_available_at && Number(license.rebind_available_at) > nowSeconds()) {\n"
    "    throw new HttpError(429, \"rebind_cooldown\", \"解绑后暂时不能重新绑定\");\n"
    "  }\n",
    1,
)
current = replace_function(current, "activate", activate_block)

fetch_manifest = r'''async function fetchCurrentManifest(env) {
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
}'''
current = append_function(current, fetch_manifest)

remember_runtime = r'''async function rememberRuntimeRelease(env, manifest) {
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
}'''
current = append_function(current, remember_runtime)

runtime_functions = {
"adminRuntime": r'''async function adminRuntime(request, env) {
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
}''',
"adminRuntimeReleases": r'''async function adminRuntimeReleases(request, env) {
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
}''',
"adminRuntimeToggle": r'''async function adminRuntimeToggle(request, env, enabled) {
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
}''',
"adminRuntimeSelect": r'''async function adminRuntimeSelect(request, env) {
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
}''',
}
for name, block in runtime_functions.items():
    if has_function(current, name):
        current = replace_function(current, name, block)
    else:
        current = append_function(current, block)

required_routes = [
    "/v1/admin/dashboard",
    "/v1/admin/settings/update",
    "/v1/admin/settings/history",
    "/v1/admin/licenses/detail",
    "/v1/admin/licenses/update",
    "/v1/admin/licenses/batch-action",
    "/v1/admin/devices",
    "/v1/admin/devices/detail",
    "/v1/admin/devices/revoke",
    "/v1/admin/audit",
    "/v1/admin/runtime",
    "/v1/admin/sessions/revoke-all",
]
for route in required_routes:
    if route not in current:
        raise SystemExit(f"route missing after restore: {route}")

CURRENT_PATH.write_text(current, encoding="utf-8")

runtime = RUNTIME_PATH.read_text(encoding="utf-8")
for function_name in ("runtimeAccess", "runtimeBundle"):
    block = extract_function(runtime, function_name)
    if "await requireRuntimeEnabled(env);" not in block:
        brace = block.find("{")
        block = block[:brace + 1] + "\n  await requireRuntimeEnabled(env);" + block[brace + 1:]
        runtime = replace_function(runtime, function_name, block)

runtime_guard = r'''async function requireRuntimeEnabled(env) {
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
}'''
if not has_function(runtime, "requireRuntimeEnabled"):
    runtime = runtime.replace(
        "\nasync function requireActiveDevice(",
        "\n" + runtime_guard + "\n\nasync function requireActiveDevice(",
        1,
    )
RUNTIME_PATH.write_text(runtime, encoding="utf-8")

migration = r'''CREATE TABLE IF NOT EXISTS system_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  config_version INTEGER NOT NULL DEFAULT 1,
  settings_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT NOT NULL DEFAULT 'migration'
);

CREATE TABLE IF NOT EXISTS system_settings_history (
  id TEXT PRIMARY KEY,
  config_version INTEGER NOT NULL,
  settings_json TEXT NOT NULL,
  changed_at INTEGER NOT NULL,
  changed_by TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_settings_history_version
  ON system_settings_history(config_version DESC, changed_at DESC);

CREATE TABLE IF NOT EXISTS script_releases (
  version TEXT PRIMARY KEY,
  manifest_json TEXT NOT NULL,
  file_name TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_script_releases_seen
  ON script_releases(last_seen_at DESC);

INSERT OR IGNORE INTO system_settings(id,config_version,settings_json,updated_at,updated_by)
VALUES(
  1,
  1,
  '{"minAppVersion":11,"secureAppVersion":11,"latestAppVersion":12,"forceUpdate":false,"updateUrl":"","updateMessage":"","sessionSeconds":43200,"adminSessionSeconds":43200,"foregroundRecheckSeconds":1800,"offlineGraceSeconds":86400,"legacyOfflineGraceSeconds":86400,"scriptLeaseSeconds":600,"challengeSeconds":90,"globalForceOnline":false,"riskForceOnlineThreshold":2,"selfUnbindEnabled":true,"unbindPenaltySeconds":21600,"unbindCooldownSeconds":86400,"unbindWindowSeconds":2592000,"unbindWindowLimit":5,"sessionGeneration":1,"scriptDeliveryEnabled":true,"activeScriptVersion":"","configCacheSeconds":30}',
  unixepoch(),
  'signed-control-center-restore'
);
'''
MIGRATION_PATH.write_text(migration, encoding="utf-8")
print("complete signed control center assembled")
