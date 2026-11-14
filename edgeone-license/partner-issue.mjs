import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const HEADERS = {
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};
const MAX_BODY_BYTES = 2048;
const TEST_ORDER = 'test-order';
const TEST_IDEMPOTENCY_KEY = 'test-idempotency-key';

function response(status, payload) {
  return new Response(JSON.stringify(payload), { status, headers: HEADERS });
}

function envValue(env, name) {
  return typeof env?.[name] === 'string' ? env[name] : (process.env[name] || '');
}

function digest(value) {
  return createHash('sha256').update(value).digest();
}

function matchesBearer(request, secret) {
  const authorization = request.headers.get('authorization') || '';
  if (!/^Bearer [\x21-\x7e]{32,256}$/.test(authorization)) return false;
  const candidate = authorization.slice(7);
  return timingSafeEqual(digest(candidate), digest(secret));
}

function allowedDays(env) {
  const raw = envValue(env, 'GG_PARTNER_ALLOWED_DAYS') || '0,7,30,365';
  const parts = raw.split(',').map(value => value.trim());
  if (!parts.length || parts.some(part => !/^(0|[1-9][0-9]{0,3})$/.test(part) || Number(part) > 3650)) {
    return null;
  }
  return new Set(parts.map(Number));
}

// This endpoint mints one GG license per delivery unit. Yuyu owns order status,
// refunds and message delivery; this function never communicates with Xianyu.
export async function handlePartnerIssue(request, { env, storeFactory, now = Math.floor(Date.now() / 1000) }) {
  if (request.method !== 'POST') return response(405, { ok: false, code: 'method_not_allowed' });
  const apiToken = envValue(env, 'GG_PARTNER_ISSUE_TOKEN');
  const masterSecret = envValue(env, 'GG_TOKEN_SECRET');
  const durations = allowedDays(env);
  if (apiToken.length < 32 || apiToken.length > 256 || masterSecret.length < 32 ||
      apiToken === masterSecret || !durations) {
    return response(503, { ok: false, code: 'partner_not_configured' });
  }
  if (!matchesBearer(request, apiToken)) return response(401, { ok: false, code: 'unauthorized' });
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) {
    return response(415, { ok: false, code: 'json_required' });
  }
  if (Number(request.headers.get('content-length') || 0) > MAX_BODY_BYTES) {
    return response(413, { ok: false, code: 'too_large' });
  }
  let body;
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) return response(413, { ok: false, code: 'too_large' });
    body = JSON.parse(raw);
  } catch {
    return response(400, { ok: false, code: 'bad_json' });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      typeof body.order_id !== 'string' || body.order_id.length < 1 || body.order_id.length > 128 ||
      /[\x00-\x1f\x7f]/.test(body.order_id) ||
      typeof body.idempotency_key !== 'string' ||
      !/^[a-zA-Z0-9_-]{16,128}$/.test(body.idempotency_key) ||
      !Number.isInteger(body.days) || !durations.has(body.days)) {
    return response(400, { ok: false, code: 'invalid_issue_request' });
  }
  // Yuyu's API tester supplies these placeholders. Never mint a license during testing.
  if (body.order_id === TEST_ORDER && body.idempotency_key === TEST_IDEMPOTENCY_KEY) {
    return response(200, { ok: true, test: true, data: { card: { code: 'GG-TEST-ONLY' } } });
  }
  // Do not incorporate days into the key derivation: duration changes must conflict,
  // instead of producing a second license for the same delivery unit.
  const key = createHmac('sha256', masterSecret).update('gg-yuyu-partner-issue-v1\n')
    .update(body.idempotency_key).digest('hex').slice(0, 32).toUpperCase();
  const id = createHash('sha256').update(key).digest('hex');
  const path = `licenses/${id}.json`;
  const idempotencyDigest = digest(body.idempotency_key).toString('hex');
  const orderDigest = digest(body.order_id).toString('hex');
  try {
    const store = storeFactory();
    const existing = await store.get(path, { type: 'json', consistency: 'strong' });
    if (existing) {
      if (existing.partnerSource !== 'yuyu-v1' ||
          existing.partnerIdempotencyDigest !== idempotencyDigest ||
          existing.partnerOrderDigest !== orderDigest || existing.partnerDays !== body.days) {
        return response(409, { ok: false, code: 'idempotency_conflict' });
      }
      return response(200, { ok: true, reused: true, data: { card: { code: key } } });
    }
    const record = {
      disabled: false, permanent: body.days === 0, durationSeconds: body.days * 86400,
      expiresAt: 0, deviceId: null, devicePublicKey: null, createdAt: now,
      partnerSource: 'yuyu-v1', partnerDays: body.days,
      partnerIdempotencyDigest: idempotencyDigest, partnerOrderDigest: orderDigest,
    };
    await store.setJSON(path, record);
    return response(200, { ok: true, reused: false, data: { card: { code: key } } });
  } catch {
    // Storage errors must not leak private details or raw license keys.
    return response(503, { ok: false, code: 'issue_unavailable' });
  }
}
