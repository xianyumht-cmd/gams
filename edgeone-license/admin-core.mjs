import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { adminHtml } from './admin-page.mjs';
import { getMfaState, mfaEpoch, verifyManagedSecondFactor,
  beginMfaSetup, confirmMfaSetup, disableManagedMfa } from './admin-mfa.mjs';

const COOKIE_NAME = 'gg_admin_session';
const CARD_PATH_RE = /^licenses\/([a-f0-9]{64})\.json$/;
const SESSION_SECONDS = 2 * 3600;
const MAX_ISSUE_BATCH = 50;
const ISSUE_WRITE_CONCURRENCY = 5;
// Makers may internally rewrite request.url to its deployment host even when
// the browser is visiting the custom domain. Accept only known project origins;
// never trust arbitrary X-Forwarded-Host headers for this CSRF boundary.
const ADMIN_ORIGINS = new Set([
  'https://gg-api.dijiav.top',
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
  // Invalidates pre-MFA/password-change sessions when the admin policy changes.
  return createHmac('sha256', envValue(env, 'GG_TOKEN_SECRET'))
    .update('gg-admin-session-v2\n')
    .update(sha256(envValue(env, 'GG_ADMIN_PASSWORD')))
    .update(sha256(envValue(env, 'GG_ADMIN_TOTP_SECRET')))
    .digest();
}


function totpSecret(env) {
  const raw = envValue(env, 'GG_ADMIN_TOTP_SECRET');
  if (!raw) return null;
  const clean = raw.replace(/\s/g, '').toUpperCase();
  // At least 160 bits of secret material (32 base32 characters).
  if (!/^[A-Z2-7]{32,128}$/.test(clean)) {
    error(503, 'admin_mfa_config', '管理员动态验证码配置无效');
  }
  let bits = 0;
  let buffer = 0;
  const bytes = [];
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  for (const char of clean) {
    buffer = (buffer << 5) | alphabet.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >>> bits) & 255);
    }
  }
  if (bits > 0 && (buffer & ((1 << bits) - 1)) !== 0) {
    error(503, 'admin_mfa_config', '管理员动态验证码配置无效');
  }
  return Buffer.from(bytes);
}

function verifyTotp(code, key, now) {
  if (typeof code !== 'string' || !/^[0-9]{6}$/.test(code)) return false;
  const provided = Buffer.from(code, 'ascii');
  const counter = Math.floor(now / 30);
  for (let offset = -1; offset <= 1; offset++) {
    const challenge = Buffer.alloc(8);
    challenge.writeBigUInt64BE(BigInt(counter + offset));
    const digest = createHmac('sha1', key).update(challenge).digest();
    const index = digest[digest.length - 1] & 0x0f;
    const truncated = (digest.readUInt32BE(index) & 0x7fffffff) % 1000000;
    const actual = Buffer.from(String(truncated).padStart(6, '0'), 'ascii');
    if (timingSafeEqual(provided, actual)) return true;
  }
  return false;
}

function sessionSignature(payload, env) {
  return createHmac('sha256', signingKey(env)).update(payload).digest('base64url');
}

function newSession(env, now, epoch = 'off') {
  const csrf = randomBytes(24).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ exp: now + SESSION_SECONDS, csrf, epoch })).toString('base64url');
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
      typeof parsed.csrf !== 'string' || !/^[A-Za-z0-9_-]{32}$/.test(parsed.csrf) ||
      typeof parsed.epoch !== 'string') {
    error(401, 'login_required', '管理登录已过期');
  }
  return parsed;
}

function checkOrigin(request) {
  // The request URL may be EdgeOne's internal origin, so match the browser
  // supplied Origin against explicit public hostnames rather than request.url.
  // Never accept arbitrary subdomains or X-Forwarded-Host.
  const suppliedOrigin = request.headers.get('origin');
  if (!suppliedOrigin || !ADMIN_ORIGINS.has(suppliedOrigin)) {
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

/**
 * Derive each key from a server secret and a 128-bit one-time request ID.
 * Retrying a partially completed batch returns identical keys and preserves
 * already activated license records; plaintext keys are never stored.
 */
async function issueBatch(store, days, count, requestId, now, env) {
  if (!Number.isInteger(days) || (days !== 0 && (days < 1 || days > 3650))) {
    error(400, 'bad_days', '有效期需为 1–3650 天，或选择永久');
  }
  if (!Number.isInteger(count) || count < 1 || count > MAX_ISSUE_BATCH) {
    error(400, 'bad_count', '每批只能生成 1–50 张卡密');
  }
  if (typeof requestId !== 'string' || !/^[a-f0-9]{32}$/.test(requestId)) {
    error(400, 'bad_request_id', '批次标识格式无效，请刷新后重试');
  }
  const issueOne = async index => {
    const key = createHmac('sha256', envValue(env, 'GG_TOKEN_SECRET'))
      .update('gg-admin-issue-v1\n')
      .update(requestId + '|' + days + '|' + count + '|' + index)
      .digest('hex').slice(0, 32).toUpperCase();
    const id = createHash('sha256').update(key).digest('hex');
    const path = keyPath(id);
    const current = await store.get(path, { type: 'json', consistency: 'strong' });
    if (current) {
      if (current.issueBatchId !== requestId || current.issueIndex !== index ||
          current.issueDays !== days || current.issueCount !== count) {
        error(409, 'card_collision', '卡密索引冲突，请重新创建批次');
      }
      return { key, card: visibleCard(id, current) };
    }
    const record = { disabled: false, permanent: days === 0,
      durationSeconds: days * 86400, expiresAt: 0, deviceId: null,
      devicePublicKey: null, createdAt: now,
      issueBatchId: requestId, issueIndex: index, issueDays: days, issueCount: count };
    await store.setJSON(path, record);
    return { key, card: visibleCard(id, record) };
  };
  const succeeded = [];
  const failedIndexes = [];
  // Limit Blob fan-out; settle every write before reporting partial success.
  for (let start = 0; start < count; start += ISSUE_WRITE_CONCURRENCY) {
    const work = Array.from({ length: Math.min(ISSUE_WRITE_CONCURRENCY, count - start) },
      (_, offset) => start + offset);
    const results = await Promise.allSettled(work.map(issueOne));
    for (let i = 0; i < results.length; i++) {
      if (results[i].status === 'fulfilled') {
        succeeded.push({ index: work[i], ...results[i].value });
      } else {
        failedIndexes.push(work[i] + 1);
      }
    }
  }
  if (!succeeded.length) {
    error(503, 'issue_unavailable', '卡密保存失败，请用相同设置重试');
  }
  succeeded.sort((a, b) => a.index - b.index);
  return { requested: count, issued: succeeded.length,
    failed: failedIndexes.length, failedIndexes, requestId,
    keys: succeeded.map(item => item.key), cards: succeeded.map(item => item.card) };
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
      'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; img-src data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'` } });
  }
  try {
    if (!configured(env)) error(503, 'admin_not_configured', '请先在 EdgeOne 项目环境变量中设置至少 20 位的 GG_ADMIN_PASSWORD，并确认 GG_TOKEN_SECRET 已配置，然后重新部署');
    if (path === '/api/admin/session' && request.method === 'GET') {
      const session = requireSession(request, env, now);
      const manual = totpSecret(env);
      const state = await getMfaState(storeFactory());
      if (session.epoch !== mfaEpoch(state, Boolean(manual))) {
        error(401, 'login_required', '管理登录已失效，请重新登录');
      }
      return json({ ok: true, csrf: session.csrf,
        mfaMode: manual ? 'manual' : state?.enabled ? 'managed' : 'off' });
    }
    if (request.method !== 'POST') error(405, 'method_not_allowed', '请求方法不支持');
    checkOrigin(request);
    const body = await readBody(request);
    if (path === '/api/admin/login') {
      const entered = typeof body.password === 'string' && body.password.length <= 512 ? body.password : '';
      const manual = totpSecret(env);
      const validPassword = safeEqual(sha256(entered), sha256(envValue(env, 'GG_ADMIN_PASSWORD')));
      if (!validPassword) error(401, 'bad_credentials', '管理员凭据错误');
      const store = storeFactory();
      const state = await getMfaState(store);
      const factor = manual ? { valid: verifyTotp(body.totp, manual, now) } :
        state?.enabled ? await verifyManagedSecondFactor(store, state, body.totp, env, now) : { valid: true };
      if (!factor.valid) error(401, 'bad_credentials', '管理员凭据错误');
      const session = newSession(env, now, mfaEpoch(state, Boolean(manual)));
      return json({ ok: true, csrf: session.csrf,
        usedRecovery: Boolean(factor.usedRecovery) }, 200, { 'Set-Cookie':
        COOKIE_NAME + '=' + session.value + '; Path=/api/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=' + SESSION_SECONDS });
    }
    const session = requireSession(request, env, now);
    const manual = totpSecret(env);
    const store = storeFactory();
    const state = await getMfaState(store);
    if (session.epoch !== mfaEpoch(state, Boolean(manual))) {
      error(401, 'login_required', '管理登录已失效，请重新登录');
    }
    if (!safeEqual(Buffer.from(request.headers.get('x-gg-admin-csrf') || ''), Buffer.from(session.csrf))) {
      error(403, 'bad_csrf', '操作校验失败，请刷新页面重试');
    }
    if (path === '/api/admin/logout') {
      return json({ ok: true }, 200, { 'Set-Cookie':
        COOKIE_NAME + '=; Path=/api/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=0' });
    }
    if (path === '/api/admin/mfa/status') {
      return json({ ok: true, mode: manual ? 'manual' : state?.enabled ? 'managed' : 'off',
        recoveryRemaining: state?.enabled ? state.recovery.length : 0 });
    }
    if (path === '/api/admin/mfa/setup') {
      if (manual) error(409, 'manual_mfa', '环境变量已配置动态验证，请先在控制台停用手动模式');
      if (state?.enabled) error(409, 'mfa_enabled', '双重验证已经启用');
      return json({ ok: true, ...await beginMfaSetup(store, env, now, cookieValue(request)) });
    }
    if (path === '/api/admin/mfa/confirm') {
      if (manual || state?.enabled) error(409, 'mfa_enabled', '双重验证已经启用');
      const result = await confirmMfaSetup(store, env, now, cookieValue(request), body.totp);
      const renewed = newSession(env, now, mfaEpoch(result.state, false));
      return json({ ok: true, csrf: renewed.csrf, codes: result.codes }, 200, { 'Set-Cookie':
        COOKIE_NAME + '=' + renewed.value + '; Path=/api/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=' + SESSION_SECONDS });
    }
    if (path === '/api/admin/mfa/disable') {
      if (manual) error(409, 'manual_mfa', '请在 EdgeOne 环境变量中管理手动模式');
      const passwordValid = typeof body.password === 'string' &&
        safeEqual(sha256(body.password), sha256(envValue(env, 'GG_ADMIN_PASSWORD')));
      const disabled = await disableManagedMfa(store, state, env, now, passwordValid, body.totp);
      const renewed = newSession(env, now, disabled.version);
      return json({ ok: true, csrf: renewed.csrf }, 200, { 'Set-Cookie':
        COOKIE_NAME + '=' + renewed.value + '; Path=/api/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=' + SESSION_SECONDS });
    }
    if (path === '/api/admin/list') return json({ ok: true, ...await listCards(store) });
    if (path === '/api/admin/issue') {
      // Preserve the legacy response for existing single-card callers.
      if (body.count === undefined && body.requestId === undefined) {
        return json({ ok: true, ...await issueCard(store, body.days, now) });
      }
      const result = await issueBatch(store, body.days, body.count, body.requestId, now, env);
      return json({ ok: true, ...result,
        ...(result.issued === 1 ? { key: result.keys[0], card: result.cards[0] } : {}) },
      result.failed ? 207 : 200);
    }
    const action = path.match(/^\/api\/admin\/(unbind|revoke|restore)$/)?.[1];
    if (action) return json({ ok: true, ...await updateCard(store, action, body.id) });
    error(404, 'not_found', '管理接口不存在');
  } catch (err) { return failResponse(err); }
}
