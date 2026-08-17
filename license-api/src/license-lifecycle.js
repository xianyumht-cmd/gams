import baseWorker from "./index.js";

const DAY_SECONDS = 86400;
const ADMIN_CREATE = "/v1/admin/licenses/create";
const ADMIN_ACTION = "/v1/admin/licenses/action";
const ADMIN_BATCH = "/v1/admin/licenses/batch-action";
const ADMIN_UPDATE = "/v1/admin/licenses/update";
const ADMIN_LIST = "/v1/admin/licenses";
const ADMIN_DETAIL = "/v1/admin/licenses/detail";
const ACTIVATE = "/v1/activate";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    let body = null;
    let before = null;
    let beforeBatch = [];

    if (request.method === "POST" && needsBody(path)) {
      body = await readJsonClone(request);
      if (body && (path === ADMIN_ACTION || path === ADMIN_UPDATE)) {
        before = await findLicense(env, body);
      } else if (body && path === ADMIN_BATCH && Array.isArray(body.ids)) {
        const ids = [...new Set(body.ids.map((value) => text(value, 64)).filter(Boolean))]
          .slice(0, 100);
        beforeBatch = await getLifecycles(env, ids, true);
      }
    }

    const response = await baseWorker.fetch(request, env, ctx);
    if (!response.ok) return response;

    try {
      if (request.method === "POST" && path === ADMIN_CREATE) {
        return await rewriteCreateResponse(response, env);
      }
      if (request.method === "POST" && path === ACTIVATE) {
        return await rewriteActivationResponse(response, env, body);
      }
      if (request.method === "POST" && path === ADMIN_ACTION) {
        await reconcileAdminAction(env, body, before);
        return await rewriteAdminLicenseResponse(response, env);
      }
      if (request.method === "POST" && path === ADMIN_BATCH) {
        await reconcileBatchAction(env, body, beforeBatch);
        return response;
      }
      if (request.method === "POST" && path === ADMIN_UPDATE) {
        await reconcileAdminUpdate(env, body, before);
        return await rewriteAdminLicenseResponse(response, env);
      }
      if (request.method === "GET" && path === ADMIN_LIST) {
        return await rewriteAdminListResponse(response, env);
      }
      if (request.method === "GET" && path === ADMIN_DETAIL) {
        return await rewriteAdminLicenseResponse(response, env);
      }
      return response;
    } catch (error) {
      console.error("license lifecycle reconciliation failed", path, error);
      if (path === ACTIVATE) {
        return jsonError(503, "activation_recheck_required", "授权已写入，请重新验证一次");
      }
      return response;
    }
  },
};

function needsBody(path) {
  return path === ADMIN_CREATE
    || path === ADMIN_ACTION
    || path === ADMIN_BATCH
    || path === ADMIN_UPDATE
    || path === ACTIVATE;
}

async function rewriteCreateResponse(response, env) {
  const payload = await response.clone().json();
  if (!Array.isArray(payload.licenses)) return response;
  const ids = payload.licenses.map((item) => text(item?.id, 64)).filter(Boolean);
  const lifecycleById = lifecycleMap(await getLifecycles(env, ids));
  const licenses = payload.licenses.map((item) => {
    const current = lifecycleById.get(item?.id);
    if (!current) return item;
    return {
      ...item,
      expiresAt: current.expires_at == null ? null : Number(current.expires_at),
      activatedAt: current.activated_at == null ? null : Number(current.activated_at),
      durationSeconds: nullableNumber(current.duration_seconds),
      durationDays: durationDays(current.duration_seconds),
      permanent: Number(current.duration_seconds) === -1,
      startsOnActivation: current.activated_at == null,
    };
  });
  return rewriteJson(response, { ...payload, licenses });
}

async function rewriteActivationResponse(response, env, body) {
  if (!body) return response;
  const license = await findLicense(env, body);
  if (!license) return response;
  const payload = await response.clone().json();
  return rewriteJson(response, {
    ...payload,
    licenseExpiresAt: license.expires_at == null ? null : Number(license.expires_at),
    activatedAt: license.activated_at == null ? null : Number(license.activated_at),
    durationSeconds: nullableNumber(license.duration_seconds),
    permanent: Number(license.duration_seconds) === -1,
    startsOnActivation: false,
  });
}

async function rewriteAdminListResponse(response, env) {
  const payload = await response.clone().json();
  if (!Array.isArray(payload.licenses)) return response;
  const ids = payload.licenses.map((item) => text(item?.id, 64)).filter(Boolean);
  const lifecycleById = lifecycleMap(await getLifecycles(env, ids));
  const licenses = payload.licenses.map((item) => enrichAdminLicense(item, lifecycleById.get(item?.id)));
  return rewriteJson(response, { ...payload, licenses });
}

async function rewriteAdminLicenseResponse(response, env) {
  const payload = await response.clone().json();
  if (!payload.license?.id) return response;
  const current = await getLifecycle(env, payload.license.id);
  return rewriteJson(response, {
    ...payload,
    license: enrichAdminLicense(payload.license, current),
  });
}

function enrichAdminLicense(item, current) {
  if (!item?.id || !current) return item;
  return {
    ...item,
    status: current.status,
    activated_at: current.activated_at == null ? null : Number(current.activated_at),
    expires_at: current.expires_at == null ? null : Number(current.expires_at),
    duration_seconds: nullableNumber(current.duration_seconds),
    durationSeconds: nullableNumber(current.duration_seconds),
    durationDays: durationDays(current.duration_seconds),
    permanent: Number(current.duration_seconds) === -1,
    startsOnActivation: current.activated_at == null,
  };
}

async function reconcileAdminAction(env, body, before) {
  if (!body || !before) return;
  const action = text(body.action, 32);
  if (action === "permanent") {
    await env.DB.prepare(
      "UPDATE licenses SET duration_seconds=-1,expires_at=NULL,status='active' WHERE id=?"
    ).bind(before.id).run();
    return;
  }
  if (before.activated_at != null) return;
  if (action === "enable") {
    await env.DB.prepare(
      "UPDATE licenses SET expires_at=NULL,status='active' WHERE id=? AND activated_at IS NULL"
    ).bind(before.id).run();
    return;
  }
  if (action !== "extend") return;

  const seconds = extensionSeconds(body);
  if (Number(before.duration_seconds) === -1) {
    await env.DB.prepare(
      "UPDATE licenses SET duration_seconds=-1,expires_at=NULL,status='active' WHERE id=? AND activated_at IS NULL"
    ).bind(before.id).run();
    return;
  }
  const currentDuration = positiveDuration(before);
  await env.DB.prepare(
    "UPDATE licenses SET duration_seconds=?,expires_at=NULL,status='active' WHERE id=? AND activated_at IS NULL"
  ).bind(currentDuration + seconds, before.id).run();
}

async function reconcileBatchAction(env, body, beforeBatch) {
  if (!body || !beforeBatch.length) return;
  const action = text(body.action, 32);
  if (action !== "extend" && action !== "enable") return;
  const seconds = action === "extend"
    ? clampInteger(body.seconds, 60, 315360000, 2592000)
    : 0;
  for (const before of beforeBatch) {
    if (before.activated_at != null) continue;
    if (action === "enable") {
      await env.DB.prepare(
        "UPDATE licenses SET expires_at=NULL,status='active' WHERE id=? AND activated_at IS NULL"
      ).bind(before.id).run();
      continue;
    }
    if (Number(before.duration_seconds) === -1) {
      await env.DB.prepare(
        "UPDATE licenses SET duration_seconds=-1,expires_at=NULL,status='active' WHERE id=? AND activated_at IS NULL"
      ).bind(before.id).run();
      continue;
    }
    await env.DB.prepare(
      "UPDATE licenses SET duration_seconds=?,expires_at=NULL,status='active' WHERE id=? AND activated_at IS NULL"
    ).bind(positiveDuration(before) + seconds, before.id).run();
  }
}

async function reconcileAdminUpdate(env, body, before) {
  if (!body || !before || before.activated_at != null) return;
  if (!Object.prototype.hasOwnProperty.call(body, "expiresAt")) return;
  const disabled = before.status === "disabled";
  if (body.expiresAt == null) {
    await env.DB.prepare(
      "UPDATE licenses SET duration_seconds=-1,expires_at=NULL,status=? WHERE id=? AND activated_at IS NULL"
    ).bind(disabled ? "disabled" : "active", before.id).run();
    return;
  }
  const now = nowSeconds();
  const target = clampInteger(
    body.expiresAt,
    now + 60,
    4102444800,
    now + Math.max(60, positiveDuration(before))
  );
  await env.DB.prepare(
    "UPDATE licenses SET duration_seconds=?,expires_at=NULL,status=? WHERE id=? AND activated_at IS NULL"
  ).bind(Math.max(60, target - now), disabled ? "disabled" : "active", before.id).run();
}

function extensionSeconds(body) {
  return body.seconds != null
    ? clampInteger(body.seconds, 60, 315360000, 2592000)
    : clampInteger(body.days, 1, 3650, 30) * DAY_SECONDS;
}

function positiveDuration(license) {
  const stored = Number(license?.duration_seconds);
  if (Number.isFinite(stored) && stored > 0) return stored;
  const created = Number(license?.created_at);
  const expires = Number(license?.expires_at);
  if (Number.isFinite(created) && Number.isFinite(expires) && expires > created) {
    return Math.max(60, expires - created);
  }
  return 0;
}

async function findLicense(env, body) {
  const id = text(body?.id, 64);
  if (id) return env.DB.prepare("SELECT * FROM licenses WHERE id=?").bind(id).first();
  const key = normalizeKey(body?.licenseKey);
  if (key.length !== 32) return null;
  const keyHash = await sha256Hex(key);
  return env.DB.prepare("SELECT * FROM licenses WHERE key_hash=?").bind(keyHash).first();
}

async function getLifecycle(env, id) {
  const rows = await getLifecycles(env, [text(id, 64)]);
  return rows[0] || null;
}

async function getLifecycles(env, ids, full = false) {
  const uniqueIds = [...new Set((ids || []).map((id) => text(id, 64)).filter(Boolean))].slice(0, 100);
  if (!uniqueIds.length) return [];
  const placeholders = uniqueIds.map(() => "?").join(",");
  const columns = full
    ? "*"
    : "id,status,created_at,activated_at,expires_at,duration_seconds";
  const rows = await env.DB.prepare(
    `SELECT ${columns} FROM licenses WHERE id IN (${placeholders})`
  ).bind(...uniqueIds).all();
  return rows.results || [];
}

function lifecycleMap(rows) {
  return new Map((rows || []).map((row) => [row.id, row]));
}

async function readJsonClone(request) {
  try {
    return await request.clone().json();
  } catch {
    return null;
  }
}

function rewriteJson(response, payload) {
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(payload), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function jsonError(status, code, message) {
  return new Response(JSON.stringify({ ok: false, code, message }), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, no-cache, max-age=0",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type,authorization",
    },
  });
}

function normalizeKey(value) {
  return String(value || "").replace(/[^0-9a-f]/gi, "").toUpperCase();
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(String(value));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...digest].map((part) => part.toString(16).padStart(2, "0")).join("");
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

function nullableNumber(value) {
  if (value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function durationDays(value) {
  const seconds = nullableNumber(value);
  if (seconds === -1) return -1;
  if (seconds == null || seconds <= 0) return null;
  return seconds / DAY_SECONDS;
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}
