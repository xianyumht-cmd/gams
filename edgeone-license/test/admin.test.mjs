import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { handleAdminRequest } from '../admin-core.mjs';
import { hash } from '../core.mjs';

const BASE = 'https://gg-api.dijiav.top';
const NOW = 1_800_000_000;
const PASSWORD = 'admin-local-test-password-not-production';
const ENV = { GG_ADMIN_PASSWORD: PASSWORD, GG_TOKEN_SECRET: 'signed-runtime-token-secret-at-least-32-bytes' };

function memoryStore() {
  const data = new Map();
  return { data,
    async list({ prefix }) { return { blobs: [...data.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key })) }; },
    async get(key) { return data.has(key) ? structuredClone(data.get(key)) : null; },
    async setJSON(key, value) { data.set(key, structuredClone(value)); },
  };
}

function fixture() {
  const store = memoryStore();
  return { store, send: async (path, body, options = {}) => {
    const method = options.method || (body === undefined ? 'GET' : 'POST');
    const headers = new Headers(options.headers || {});
    if (method === 'POST' && !headers.has('content-type')) headers.set('Content-Type', 'application/json');
    if (method === 'POST' && !headers.has('origin') && !options.noOrigin) headers.set('Origin', BASE);
    const request = new Request(`${BASE}${path}`, { method, headers, body: method === 'POST' ? JSON.stringify(body) : undefined });
    const response = await handleAdminRequest(request, { env: options.env || ENV,
      storeFactory: () => store, now: options.now || NOW });
    const result = response.headers.get('content-type')?.includes('application/json') ? await response.json() : await response.text();
    return { response, result };
  } };
}

async function login(f) {
  const { response, result } = await f.send('/api/admin/login', { password: PASSWORD });
  assert.equal(response.status, 200);
  assert.equal(result.ok, true);
  const cookie = response.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly; Secure; SameSite=Strict/);
  return { csrf: result.csrf, cookie: cookie.split(';')[0] };
}

function authHeaders(session) { return { Cookie: session.cookie, 'X-GG-Admin-CSRF': session.csrf }; }

test('public admin shell has strict CSP, but no admin API is available anonymously', async () => {
  const f = fixture();
  const page = await f.send('/api/admin');
  assert.equal(page.response.status, 200);
  assert.match(page.result, /GG · 授权管理/);
  assert.match(page.response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.doesNotMatch(page.result, new RegExp(PASSWORD));
  assert.doesNotMatch(page.result, / style=/, 'styles must honor the nonce-only CSP');
  const script = page.result.match(/<script nonce="[^"]+">([\s\S]+?)<\/script>/)?.[1];
  assert.ok(script);
  assert.doesNotThrow(() => new vm.Script(script));
  assert.equal((await f.send('/api/admin/session')).response.status, 401);
  assert.equal((await f.send('/api/admin/list', {})).response.status, 401);
  assert.equal((await f.send('/api/admin/issue', { days: 30 })).response.status, 401);
});

test('login requires a configured password, valid origin, and correct credential', async () => {
  const f = fixture();
  assert.equal((await f.send('/api/admin/login', { password: 'wrong' })).response.status, 401);
  assert.equal((await f.send('/api/admin/login', { password: PASSWORD }, { noOrigin: true })).response.status, 403);
  assert.equal((await f.send('/api/admin/login', { password: PASSWORD }, { headers: { Origin: 'https://evil.example' } })).response.status, 403);
  assert.equal((await f.send('/api/admin/login', { password: PASSWORD },
    { headers: { Origin: 'https://fake-gg-api.dijiav.top' } })).response.status, 403);
  assert.equal((await f.send('/api/admin/login', { password: PASSWORD },
    { headers: { Origin: 'https://gg-api.dijiav.top.evil.example' } })).response.status, 403);
  const missing = await f.send('/api/admin/login', { password: PASSWORD }, { env: { GG_TOKEN_SECRET: ENV.GG_TOKEN_SECRET } });
  assert.equal(missing.response.status, 503);
  assert.equal(missing.result.code, 'admin_not_configured');
});

test('same-site custom domain login survives an EdgeOne internal request URL', async () => {
  const f = fixture();
  // Makers can normalize request.url to an internal deployment host while
  // the browser sends the canonical new domain in its Origin header.
  const canonical = await f.send('/api/admin/login', { password: PASSWORD }, {
    headers: { Origin: 'https://gg-api.dijiav.top' },
  });
  assert.equal(canonical.response.status, 200);
  const legacy = await f.send('/api/admin/login', { password: PASSWORD }, {
    headers: { Origin: 'https://gg-api.xn--8pv109c.top' },
  });
  assert.equal(legacy.response.status, 200);
  const project = await f.send('/api/admin/login', { password: PASSWORD }, {
    headers: { Origin: 'https://gg-license-api-dxk0o7j9.edgeone.dev' },
  });
  assert.equal(project.response.status, 200);
  assert.ok(project.result.csrf);
});

test('issue, list, unbind, revoke and restore operate on existing Blob schema', async () => {
  const f = fixture();
  const session = await login(f);
  const headers = authHeaders(session);
  const created = await f.send('/api/admin/issue', { days: 30 }, { headers });
  assert.equal(created.response.status, 200);
  assert.match(created.result.key, /^[A-F0-9]{32}$/);
  const id = hash(created.result.key);
  const keyPath = `licenses/${id}.json`;
  assert.deepEqual(f.store.data.get(keyPath), { disabled: false, permanent: false,
    durationSeconds: 30 * 86400, expiresAt: 0, deviceId: null,
    devicePublicKey: null, createdAt: NOW });
  const permanent = await f.send('/api/admin/issue', { days: 0 }, { headers });
  assert.equal(permanent.result.card.permanent, true);
  assert.equal((await f.send('/api/admin/issue', { days: -1 }, { headers })).response.status, 400);
  assert.equal((await f.send('/api/admin/issue', { days: 30.5 }, { headers })).response.status, 400);
  const listed = await f.send('/api/admin/list', {}, { headers });
  assert.equal(listed.result.cards.length, 2);
  assert.ok(!JSON.stringify(listed.result).includes(created.result.key));
  f.store.data.set(keyPath, { ...f.store.data.get(keyPath), deviceId: 'first-device',
    devicePublicKey: 'public-key', expiresAt: NOW + 123 });
  const unbound = await f.send('/api/admin/unbind', { id }, { headers });
  assert.equal(unbound.result.card.bound, false);
  assert.equal(unbound.result.card.expiresAt, NOW + 123, 'unbind must not reset expiration');
  assert.equal(f.store.data.get(keyPath).devicePublicKey, null);
  const revoked = await f.send('/api/admin/revoke', { id }, { headers });
  assert.equal(revoked.result.card.disabled, true);
  const restored = await f.send('/api/admin/restore', { id }, { headers });
  assert.equal(restored.result.card.disabled, false);
  assert.equal(f.store.data.get(keyPath).expiresAt, NOW + 123);
  assert.equal((await f.send('/api/admin/unbind', { id: '../runtime/manifest.json' }, { headers })).response.status, 400);
  assert.equal((await f.send('/api/admin/unbind', { id: '0'.repeat(64) }, { headers })).response.status, 404);
});

test('reject forgery, CSRF-free writes, expired cookies and logout correctly', async () => {
  const f = fixture(); const session = await login(f);
  assert.equal((await f.send('/api/admin/list', {}, { headers: { Cookie: session.cookie } })).response.status, 403);
  assert.equal((await f.send('/api/admin/list', {}, { headers: {
    ...authHeaders(session), Origin: 'https://attacker.example' } })).response.status, 403);
  assert.equal((await f.send('/api/admin/list', {}, { headers: {
    ...authHeaders(session), Cookie: session.cookie.slice(0, -1) + 'X' } })).response.status, 401);
  assert.equal((await f.send('/api/admin/session', undefined, { headers: { Cookie: session.cookie } })).result.csrf, session.csrf);
  const expired = await f.send('/api/admin/session', undefined, { headers: { Cookie: session.cookie }, now: NOW + 2 * 3600 + 1 });
  assert.equal(expired.response.status, 401);
  const logout = await f.send('/api/admin/logout', {}, { headers: authHeaders(session) });
  assert.match(logout.response.headers.get('set-cookie'), /Max-Age=0/);
});


test('optional TOTP second factor rejects bad codes and supports clock skew', async () => {
  const { createHmac } = await import('node:crypto');
  const f = fixture();
  // 32 RFC4648 base32 chars = 160 bits; test-only secret never deployed.
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  const key = Buffer.from('12345678901234567890');
  function otp(when) {
    const bytes = Buffer.alloc(8);
    bytes.writeBigUInt64BE(BigInt(Math.floor(when / 30)));
    const digest = createHmac('sha1', key).update(bytes).digest();
    const offset = digest[19] & 15;
    return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0');
  }
  const env = { ...ENV, GG_ADMIN_TOTP_SECRET: secret };
  const send = (body, options = {}) => f.send('/api/admin/login', body, { ...options, env });
  assert.equal((await send({ password: PASSWORD })).response.status, 401);
  assert.equal((await send({ password: PASSWORD, totp: '12345x' })).response.status, 401);
  assert.equal((await send({ password: 'wrong', totp: otp(NOW) })).response.status, 401);
  assert.equal((await send({ password: PASSWORD, totp: otp(NOW) })).response.status, 200);
  assert.equal((await send({ password: PASSWORD, totp: otp(NOW - 30) })).response.status, 200);
  assert.equal((await send({ password: PASSWORD, totp: otp(NOW + 30) })).response.status, 200);
  assert.equal((await send({ password: PASSWORD, totp: otp(NOW + 90) })).response.status, 401);
  const broken = await f.send('/api/admin/login', { password: PASSWORD }, {
    env: { ...ENV, GG_ADMIN_TOTP_SECRET: 'wrongly-formatted' },
  });
  assert.equal(broken.response.status, 503);
  assert.equal(broken.result.code, 'admin_mfa_config');
});

test('enabling MFA and changing the admin password invalidates existing sessions', async () => {
  const f = fixture();
  const session = await login(f);
  const headers = { Cookie: session.cookie };
  const changed = await f.send('/api/admin/session', undefined, {
    env: { ...ENV, GG_ADMIN_PASSWORD: PASSWORD + '-rotated' }, headers,
  });
  assert.equal(changed.response.status, 401);
  const mfaEnabled = await f.send('/api/admin/session', undefined, {
    env: { ...ENV, GG_ADMIN_TOTP_SECRET: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ' }, headers,
  });
  assert.equal(mfaEnabled.response.status, 401);
});
