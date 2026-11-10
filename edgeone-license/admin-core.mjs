import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { adminHtml } from './admin-page.mjs';

const COOKIE_NAME = 'gg_admin_session';
const CARD_PATH_RE = /^licenses\/([a-f0-9]{64})\.json$/;
const SESSION_SECONDS = 8 * 3600;
// Makers may internally rewrite request.url to its deployment host even when
// the browser is visiting the custom domain. Accept only known project origins;
// never trust arbitrary X-Forwarded-Host headers for this CSRF boundary.
const ADMIN_ORIGINS = new Set([
  'https://gg-api.xn--8pv109c.top',
  'https://gg-license-api-dxk0o7j9.edgeone.dev',
]);
const NO_CACHE = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };

function error(status, code, message) {
  const value = new Error(message);
  Object.assign(value, { status, code });
  throw value;
}

function failResponse(err) {
  const status = Number.isInteger(err?.status) ? err.status : 500;
  return json({ ok: false, code: status === 500 ? 'server_error' : err.code,
    message: status === 500 ? '管理服务暂时不可用' : err.message }, status);
}

function json(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), { status,
    headers: { ...NO_CACHE, 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders } });
}

function envValue(env, key) {
  return typeof env?.[key] === 'string' ? env[key] : (process.env[key] || '');
}

function configured(env) {
  return envValue(env, 'GG_ADMIN_PASSWORD').length >= 20 && envValue(env, 'GG_TOKEN_SECRET').length >= 32;
}

function sha256(value) { return createHash('sha256').update(value).digest(); }

function safeEqual(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function signingKey(env) {
  return createHmac('sha256', envValue(env, 'GG_TOKEN_SECRET')).update('gg-admin-session-v1').digest();
}

function sessionSignature(payload, env) {
  return createHmac('sha256', signingKey(env)).update(payload).digest('base64url');
}

function newSession(env, now) {
  const csrf = randomBytes(24).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ exp: now + SESSION_SECONDS, csrf })).toString('base64url');
  return { value: `${payload}.${sessionSignature(payload, env)}`, csrf };
}

function cookieValue(request) {
  const cookies = request.headers.get('cookie') || '';
  const part = cookies.split(';').map(x => x.trim()).find(x => x.startsWith(`${COOKIE_NAME}=`));
  return part?.slice(COOKIE_NAME.length + 1) || '';
}

function requireSession(request, env, now) {
  const token = cookieValue(request);
  if (token.length > 500 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) {
    error(401, 'login_required', '请先登录管理端');
  }
  const [payload, mac] = token.split('.');
  if (!safeEqual(mac, sessionSignature(payload, env))) error(401, 'login_required', '管理登录已失效');
  let parsed;
  try { parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); }
  catch { error(401, 'login_required', '管理登录已失效'); }
  if (!Number.isSafeInteger(parsed.exp) || parsed.exp <= now || parsed.exp > now + SESSION_SECONDS ||
      typeof parsed.csrf !== 'string' || !/^[A-Za-z0-9_-]{32}$/.test(parsed.csrf)) {
    error(401, 'login_required', '管理登录已过期');
  }
  return parsed;
}

function checkOrigin(request) {
  const requestOrigin = new URL(request.url).origin;
  const suppliedOrigin = request.headers.get('origin');
  if (!suppliedOrigin || (suppliedOrigin !== requestOrigin && !ADMIN_ORIGINS.has(suppliedOrigin))) {
    error(403, 'bad_origin', '请求来源校验失败');
  }
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) {
    error(415, 'bad_content_type', '请使用 JSON 请求');
  }
}

async function readBody(request) {
  if (Number(request.headers.get('content-length') || 0) > 4096) error(413, 'too_large', '请求内容过长');
  const value = await request.text();
  if (Buffer.byteLength(value, 'utf8') > 4096) error(413, 'too_large', '请求内容过长');
  let body;
  try { body = JSON.parse(value); }
  catch { error(400, 'bad_json', '请求内容不是有效 JSON'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) error(400, 'bad_json', '请求内容无效');
  return body;
}

function keyPath(id) {
  if (typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id)) error(400, 'bad_id', '卡密索引无效');
  return `licenses/${id}.json`;
}

function visibleCard(id, record) {
  return { id, shortId: `${id.slice(0, 8)}…${id.slice(-8)}`, disabled: Boolean(record.disabled),
    permanent: Boolean(record.permanent), durationDays: Math.round((record.durationSeconds || 0) / 86400),
    expiresAt: Number(record.expiresAt) || 0, bound: Boolean(record.deviceId),
    createdAt: Number(record.createdAt) || 0 };
}

async function listCards(store) {
  // The namespace is intentionally small in this internal test. Limit reads so one request
  // cannot fan out to an unbounded number of Blob operations.
  const result = await store.list({ prefix: 'licenses/', paginate: false, consistency: 'strong' });
  const candidates = (result.blobs || []).map(item => item.key).filter(path => CARD_PATH_RE.test(path));
  const paths = candidates.slice(0, 100);
  const cards = [];
  for (let i = 0; i < paths.length; i += 10) {
    const values = await Promise.all(paths.slice(i, i + 10).map(async path => {
      const record = await store.get(path, { type: 'json', consistency: 'strong' });
      return record ? visibleCard(CARD_PATH_RE.exec(path)[1], record) : null;
    }));
    cards.push(...values.filter(Boolean));
  }
  cards.sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id));
  return { cards, hasMore: candidates.length > paths.length || Boolean(result.cursor) };
}

async function issueCard(store, days, now) {
  if (!Number.isInteger(days) || (days !== 0 && (days < 1 || days > 3650))) {
    error(400, 'bad_days', '有效期需为 1–3650 天，或选择永久');
  }
  const key = randomBytes(16).toString('hex').toUpperCase();
  const id = createHash('sha256').update(key).digest('hex');
  await store.setJSON(keyPath(id), { disabled: false, permanent: days === 0,
    durationSeconds: days * 86400, expiresAt: 0, deviceId: null,
    devicePublicKey: null, createdAt: now });
  return { key, card: visibleCard(id, { disabled: false, permanent: days === 0,
    durationSeconds: days * 86400, expiresAt: 0, deviceId: null, createdAt: now }) };
}

async function updateCard(store, action, id) {
  const path = keyPath(id);
  const record = await store.get(path, { type: 'json', consistency: 'strong' });
  if (!record) error(404, 'card_missing', '未找到该卡密');
  if (action === 'unbind') { record.deviceId = null; record.devicePublicKey = null; }
  else if (action === 'revoke') record.disabled = true;
  else if (action === 'restore') record.disabled = false;
  else error(404, 'not_found', '管理操作不存在');
  await store.setJSON(path, record);
  return { card: visibleCard(id, record) };
}

export async function handleAdminRequest(request, { env, storeFactory, now = Math.floor(Date.now() / 1000) }) {
  const path = new URL(request.url).pathname;
  if (path === '/api/admin' && request.method === 'GET') {
    const nonce = randomBytes(16).toString('base64');
    return new Response(adminHtml(nonce), { headers: { ...NO_CACHE,
      'Content-Type': 'text/html; charset=utf-8', 'X-Frame-Options': 'DENY',
      'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'` } });
  }
  try {
    if (!configured(env)) error(503, 'admin_not_configured', '请先在 EdgeOne 项目环境变量中设置至少 20 位的 GG_ADMIN_PASSWORD，并确认 GG_TOKEN_SECRET 已配置，然后重新部署');
    if (path === '/api/admin/session' && request.method === 'GET') {
      return json({ ok: true, csrf: requireSession(request, env, now).csrf });
    }
    if (request.method !== 'POST') error(405, 'method_not_allowed', '请求方法不支持');
    checkOrigin(request);
    const body = await readBody(request);
    if (path === '/api/admin/login') {
      const entered = typeof body.password === 'string' && body.password.length <= 512 ? body.password : '';
      if (!safeEqual(sha256(entered), sha256(envValue(env, 'GG_ADMIN_PASSWORD')))) {
        error(401, 'bad_password', '管理密码错误');
      }
      const session = newSession(env, now);
      return json({ ok: true, csrf: session.csrf }, 200, { 'Set-Cookie':
        `${COOKIE_NAME}=${session.value}; Path=/api/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_SECONDS}` });
    }
    const session = requireSession(request, env, now);
    if (!safeEqual(Buffer.from(request.headers.get('x-gg-admin-csrf') || ''), Buffer.from(session.csrf))) {
      error(403, 'bad_csrf', '操作校验失败，请刷新页面重试');
    }
    if (path === '/api/admin/logout') {
      return json({ ok: true }, 200, { 'Set-Cookie':
        `${COOKIE_NAME}=; Path=/api/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=0` });
    }
    const store = storeFactory();
    if (path === '/api/admin/list') return json({ ok: true, ...await listCards(store) });
    if (path === '/api/admin/issue') return json({ ok: true, ...await issueCard(store, body.days, now) });
    const action = path.match(/^\/api\/admin\/(unbind|revoke|restore)$/)?.[1];
    if (action) return json({ ok: true, ...await updateCard(store, action, body.id) });
    error(404, 'not_found', '管理接口不存在');
  } catch (err) { return failResponse(err); }
}
