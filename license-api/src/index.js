const SESSION_SECONDS = 12 * 60 * 60;
const ADMIN_SECONDS = 12 * 60 * 60;
const OFFLINE_GRACE_SECONDS = 24 * 60 * 60;
const MAX_BODY_BYTES = 32 * 1024;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export default {
  async fetch(request, env) {
    try {
      if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }));
      const url = new URL(request.url);
      if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
        return reply({ ok: true, service: "gams-license-api", version: 1 });
      }
      if (request.method === "POST" && url.pathname === "/v1/admin/login") {
        return await adminLogin(request, env);
      }
      if (request.method === "POST" && url.pathname === "/v1/admin/licenses/create") {
        return await adminCreateLicenses(request, env);
      }
      if (request.method === "GET" && url.pathname === "/v1/admin/licenses") {
        return await adminListLicenses(request, env);
      }
      if (request.method === "POST" && url.pathname === "/v1/admin/licenses/action") {
        return await adminLicenseAction(request, env);
      }
      if (request.method === "POST" && url.pathname === "/v1/activate") {
        return await activate(request, env);
      }
      if (request.method === "POST" && url.pathname === "/v1/check") {
        return await check(request, env);
      }
      return reply({ ok: false, code: "not_found", message: "接口不存在" }, 404);
    } catch (error) {
      if (error instanceof HttpError) {
        return reply({ ok: false, code: error.code, message: error.message }, error.status);
      }
      console.error("Unhandled error", error);
      return reply({ ok: false, code: "server_error", message: "服务器暂时不可用" }, 500);
    }
  },
};

async function adminLogin(request, env) {
  const ipKey = await requestRateKey(request, "admin-login");
  if (!(await allowRate(env, ipKey, 5, 600))) {
    return reply({ ok: false, code: "too_many_requests", message: "尝试次数过多，请稍后再试" }, 429);
  }
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
      `INSERT INTO licenses
       (id,key_hash,key_preview,status,created_at,expires_at,max_devices,note)
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
            l.max_devices,l.note,l.last_seen_at,
            SUM(CASE WHEN d.revoked_at IS NULL THEN 1 ELSE 0 END) AS active_devices
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
    await env.DB.prepare("UPDATE licenses SET expires_at=?,status='active' WHERE id=?")
      .bind(base + days * 86400, license.id).run();
  } else if (action === "permanent") {
    await env.DB.prepare("UPDATE licenses SET expires_at=NULL,status='active' WHERE id=?")
      .bind(license.id).run();
  } else if (action === "unbind") {
    await env.DB.prepare("UPDATE devices SET revoked_at=? WHERE license_id=? AND revoked_at IS NULL")
      .bind(now, license.id).run();
  } else {
    return reply({ ok: false, code: "bad_action", message: "不支持的管理操作" }, 400);
  }

  await audit(env, `license_${action}`, license.id, null, JSON.stringify({ days: body.days || null }));
  const updated = await env.DB.prepare(
    `SELECT id,key_preview,status,created_at,activated_at,expires_at,max_devices,note,last_seen_at
       FROM licenses WHERE id=?`
  ).bind(license.id).first();
  return reply({ ok: true, license: updated });
}

async function activate(request, env) {
  const ipKey = await requestRateKey(request, "activate");
  if (!(await allowRate(env, ipKey, 30, 60))) {
    return reply({ ok: false, code: "too_many_requests", message: "验证过于频繁，请稍后再试" }, 429);
  }
  const body = await readJson(request);
  const key = normalizeKey(body.licenseKey);
  const deviceHash = normalizeDevice(body.deviceId);
  const label = string(body.deviceLabel, 100);
  if (key.length !== 32) return reply({ ok: false, code: "bad_key", message: "卡密必须是 32 位" }, 400);
  if (!deviceHash) return reply({ ok: false, code: "bad_device", message: "设备标识无效" }, 400);

  const keyHash = await sha256Hex(key);
  const license = await env.DB.prepare("SELECT * FROM licenses WHERE key_hash=?").bind(keyHash).first();
  if (!license) return reply({ ok: false, code: "license_not_found", message: "卡密无效" }, 404);
  const stateError = await licenseStateError(env, license);
  if (stateError) return stateError;

  const now = nowSeconds();
  let device = await env.DB.prepare(
    "SELECT * FROM devices WHERE license_id=? AND device_hash=? AND revoked_at IS NULL"
  ).bind(license.id, deviceHash).first();

  if (!device) {
    const activeCount = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM devices WHERE license_id=? AND revoked_at IS NULL"
    ).bind(license.id).first();
    if (Number(activeCount?.count || 0) >= Number(license.max_devices)) {
      return reply({ ok: false, code: "device_limit", message: "该卡密已绑定其他设备，请先解绑" }, 409);
    }
    const deviceId = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO devices(id,license_id,device_hash,label,created_at,last_seen_at)
       VALUES (?,?,?,?,?,?)`
    ).bind(deviceId, license.id, deviceHash, label, now, now).run();
    device = { id: deviceId };
    await audit(env, "device_bound", license.id, deviceHash, label);
  } else {
    await env.DB.prepare("UPDATE devices SET last_seen_at=?,label=? WHERE id=?")
      .bind(now, label, device.id).run();
  }

  await env.DB.prepare(
    "UPDATE licenses SET activated_at=COALESCE(activated_at,?),last_seen_at=? WHERE id=?"
  ).bind(now, now, license.id).run();
  return licenseSuccess(env, license, deviceHash, now);
}

async function check(request, env) {
  const ipKey = await requestRateKey(request, "check");
  if (!(await allowRate(env, ipKey, 120, 60))) {
    return reply({ ok: false, code: "too_many_requests", message: "验证过于频繁" }, 429);
  }
  const body = await readJson(request);
  const deviceHash = normalizeDevice(body.deviceId);
  const token = string(body.token, 4096);
  const payload = await verifyToken(token, env, "session");
  if (!payload || payload.dev !== deviceHash) {
    return reply({ ok: false, code: "bad_session", message: "授权会话无效，请重新输入卡密" }, 401);
  }
  const license = await env.DB.prepare("SELECT * FROM licenses WHERE id=?").bind(payload.lic).first();
  if (!license) return reply({ ok: false, code: "license_not_found", message: "授权不存在" }, 404);
  const stateError = await licenseStateError(env, license);
  if (stateError) return stateError;
  const device = await env.DB.prepare(
    "SELECT id FROM devices WHERE license_id=? AND device_hash=? AND revoked_at IS NULL"
  ).bind(license.id, deviceHash).first();
  if (!device) return reply({ ok: false, code: "device_unbound", message: "设备绑定已被解除，请重新验证" }, 401);
  const now = nowSeconds();
  await env.DB.batch([
    env.DB.prepare("UPDATE devices SET last_seen_at=? WHERE id=?").bind(now, device.id),
    env.DB.prepare("UPDATE licenses SET last_seen_at=? WHERE id=?").bind(now, license.id),
  ]);
  return licenseSuccess(env, license, deviceHash, now);
}

async function licenseSuccess(env, license, deviceHash, now) {
  const token = await signToken({
    typ: "session", lic: license.id, dev: deviceHash,
    iat: now, exp: now + SESSION_SECONDS, jti: crypto.randomUUID(),
  }, env);
  return reply({
    ok: true,
    token,
    tokenExpiresAt: now + SESSION_SECONDS,
    licenseExpiresAt: license.expires_at || null,
    permanent: license.expires_at == null,
    offlineGraceSeconds: OFFLINE_GRACE_SECONDS,
    serverTime: now,
  });
}

async function licenseStateError(env, license) {
  const now = nowSeconds();
  if (license.status === "disabled") {
    return reply({ ok: false, code: "license_disabled", message: "卡密已被停用" }, 403);
  }
  if (license.status === "expired" || (license.expires_at && license.expires_at <= now)) {
    if (license.status !== "expired") {
      await env.DB.prepare("UPDATE licenses SET status='expired' WHERE id=?").bind(license.id).run();
    }
    return reply({ ok: false, code: "license_expired", message: "卡密已到期" }, 403);
  }
  return null;
}

async function findLicenseForAdmin(env, body) {
  const id = string(body.id, 64);
  if (id) return env.DB.prepare("SELECT * FROM licenses WHERE id=?").bind(id).first();
  const key = normalizeKey(body.licenseKey);
  if (key.length !== 32) return null;
  return env.DB.prepare("SELECT * FROM licenses WHERE key_hash=?").bind(await sha256Hex(key)).first();
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
  } catch {
    return null;
  }
}

async function hmac(text, secret) {
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(`gams-license-v1:${secret}`),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(text)));
}

async function constantTimeTextEqual(a, b) {
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(a)),
    crypto.subtle.digest("SHA-256", encoder.encode(b)),
  ]);
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
  try { return text ? JSON.parse(text) : {}; }
  catch { throw new HttpError(400, "bad_json", "请求格式错误"); }
}

async function allowRate(env, key, limit, windowSeconds) {
  const now = nowSeconds();
  const row = await env.DB.prepare("SELECT window_start,count FROM rate_limits WHERE key=?").bind(key).first();
  if (!row || now - row.window_start >= windowSeconds) {
    await env.DB.prepare(
      "INSERT INTO rate_limits(key,window_start,count) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET window_start=excluded.window_start,count=1"
    ).bind(key, now).run();
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
    await env.DB.prepare(
      "INSERT INTO audit_log(id,event,license_id,device_hash,detail,created_at) VALUES(?,?,?,?,?,?)"
    ).bind(crypto.randomUUID(), event, licenseId, deviceHash, detail || "", nowSeconds()).run();
  } catch (error) {
    console.warn("audit failed", error);
  }
}

function normalizeKey(value) {
  return String(value || "").replace(/[^0-9a-f]/gi, "").toUpperCase();
}

function normalizeDevice(value) {
  const result = String(value || "").trim().toLowerCase();
  return /^[0-9a-f]{64}$/.test(result) ? result : "";
}

function randomKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

async function sha256Hex(value) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(String(value))));
  return [...digest].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function string(value, max) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function clampInteger(value, min, max, fallback) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function nowSeconds() { return Math.floor(Date.now() / 1000); }

function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(text) {
  const normalized = text.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

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
