import test from 'node:test';
import assert from 'node:assert/strict';
import { readVersionState, saveVersionPolicy, rollbackVersionPolicy,
  getApkUpdatePolicy } from '../version-management.mjs';
import { handleAdminRequest } from '../admin-core.mjs';

const NOW = 1800000000;
const BASE = 'https://gg-api.dijiav.top';
const ENV = { GG_ADMIN_PASSWORD: 'test-admin-long-password-1234567',
  GG_TOKEN_SECRET: 'test-version-management-very-long-secret' };
function memoryStore() {
  const data = new Map();
  return { data,
    async get(key) { return data.has(key) ? structuredClone(data.get(key)) : null; },
    async setJSON(key, value) { data.set(key, structuredClone(value)); },
    async list({ prefix }) { return { blobs: [...data.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key })) }; },
  };
}
function config(patch = {}) {
  return { versionCode: 250, versionName: '3.2.0', minVersionCode: 230,
    mode: 'optional', rolloutPercent: 100,
    downloadUrl: 'https://github.com/example/gg/releases/download/v3.2.0/GG.apk',
    notes: 'Security and stability update', sha256: 'a'.repeat(64), ...patch };
}
async function publish(store, channel = 'stable', patch = {}, revision = undefined) {
  const current = await readVersionState(store);
  return saveVersionPolicy(store, {
    channel, expectedRevision: revision ?? current.revision, config: config(patch)
  }, NOW);
}
const body = (code, channel = 'stable', deviceId = 'test-device') =>
  ({ appVersionCode: code, appChannel: channel, deviceId });

test('unconfigured version management leaves all clients running normally', async () => {
  const store = memoryStore();
  const state = await readVersionState(store);
  assert.equal(state.revision, 0);
  assert.equal(state.channels.stable.mode, 'off');
  assert.equal(state.channels.development.mode, 'off');
  assert.equal(await getApkUpdatePolicy(store, { deviceId: 'legacy' }), null);
  const modern = await getApkUpdatePolicy(store, body(100));
  assert.equal(modern.updateAvailable, false);
  assert.equal(modern.forceUpdate, false);
  assert.equal(modern.latestVersionCode, 0);
});
test('publish isolates stable and developer APK channels', async () => {
  const store = memoryStore();
  const state = await publish(store);
  assert.equal(state.revision, 1);
  assert.equal(state.channels.stable.versionCode, 250);
  assert.equal(state.channels.development.versionCode, 0);
  assert.equal((await getApkUpdatePolicy(store, body(240))).updateAvailable, true);
  assert.equal((await getApkUpdatePolicy(store, body(240))).forceUpdate, false);
  assert.equal((await getApkUpdatePolicy(store, body(240, 'development'))).updateAvailable, false);
  await publish(store, 'development', { versionCode: 500, versionName: '3.3.0-dev',
    minVersionCode: 400, mode: 'required' });
  assert.equal((await getApkUpdatePolicy(store, body(350, 'development'))).forceUpdate, true);
  assert.equal((await getApkUpdatePolicy(store, body(240))).forceUpdate, false);
});
test('mandatory minimum applies even when optional rollout is 0%', async () => {
  const store = memoryStore();
  await publish(store, 'stable', { mode: 'required', rolloutPercent: 0 });
  const outdated = await getApkUpdatePolicy(store, body(200));
  assert.equal(outdated.forceUpdate, true);
  assert.equal(outdated.updateAvailable, true);
  assert.equal(outdated.updateUrl.startsWith('https://'), true);
  const allowed = await getApkUpdatePolicy(store, body(240));
  assert.equal(allowed.forceUpdate, false);
  assert.equal(allowed.updateAvailable, false);
  const current = await getApkUpdatePolicy(store, body(250));
  assert.equal(current.forceUpdate, false);
  assert.equal(current.updateAvailable, false);
});
test('rollout remains deterministic and can be paused immediately', async () => {
  const store = memoryStore();
  await publish(store, 'stable', { rolloutPercent: 30 });
  const one = await getApkUpdatePolicy(store, body(240));
  const two = await getApkUpdatePolicy(store, body(240));
  assert.deepEqual(one, two);
  await publish(store, 'stable', { mode: 'off' });
  assert.equal((await getApkUpdatePolicy(store, body(100))).updateAvailable, false);
});
test('reject invalid version data, insecure URLs and concurrent edits', async () => {
  const store = memoryStore();
  await assert.rejects(() => publish(store, 'stable', { mode: 'required',
    downloadUrl: 'http://example.com/gg.apk' }), { code: 'bad_url' });
  await assert.rejects(() => publish(store, 'stable', { mode: 'required',
    downloadUrl: 'https://127.0.0.1/gg.apk' }), { code: 'bad_url' });
  await assert.rejects(() => publish(store, 'stable', { minVersionCode: 251 }),
    { code: 'bad_version' });
  await assert.rejects(() => publish(store, 'stable', { rolloutPercent: 110 }),
    { code: 'bad_rollout' });
  await publish(store);
  await assert.rejects(() => publish(store, 'stable', { versionCode: 251 }, 0),
    { code: 'version_conflict' });
  await assert.rejects(() => publish(store, 'stable', { versionCode: 240, minVersionCode: 230 }),
    { code: 'downgrade' });
  assert.equal((await readVersionState(store)).revision, 1);
});
test('rollback uses audit history and creates a fresh audit entry', async () => {
  const store = memoryStore();
  const first = await publish(store);
  const second = await publish(store, 'stable', { versionCode: 251, versionName: '3.2.1' });
  assert.equal(second.history.length, 2);
  const undo = await rollbackVersionPolicy(store, { channel: 'stable',
    historyId: second.history[0].id, expectedRevision: 2 }, NOW + 1);
  assert.equal(undo.channels.stable.versionCode, 250);
  assert.equal(undo.revision, 3);
  assert.equal(undo.history[0].action, 'rollback');
  assert.equal(undo.history[0].from, second.history[0].id);
  assert.equal(first.channels.stable.versionCode, 250);
  await assert.rejects(() => rollbackVersionPolicy(store, { channel: 'stable',
    historyId: second.history[0].id, expectedRevision: 2 }, NOW + 2),
    { code: 'version_conflict' });
});
test('failed write keeps previous policy and does not mutate other Blob objects', async () => {
  const store = memoryStore();
  await publish(store);
  const old = await readVersionState(store);
  store.setJSON = async () => { throw new Error('injected write failure'); };
  await assert.rejects(() => publish(store, 'stable', { versionCode: 251,
    versionName: '3.2.1' }), /injected write failure/);
  assert.deepEqual(await readVersionState(store), old);
});
test('version routes require authenticated CSRF session and use no-store', async () => {
  const store = memoryStore();
  const send = async (path, payload, extra = {}) => {
    const request = new Request(BASE + path, { method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: BASE, ...extra },
      body: JSON.stringify(payload) });
    const response = await handleAdminRequest(request, { env: ENV,
      storeFactory: () => store, now: NOW });
    return { response, data: await response.json() };
  };
  assert.equal((await send('/api/admin/version/status', {})).response.status, 401);
  const login = await send('/api/admin/login', { password: ENV.GG_ADMIN_PASSWORD });
  assert.equal(login.response.status, 200);
  const headers = { Cookie: login.response.headers.get('set-cookie').split(';')[0],
    'X-GG-Admin-CSRF': login.data.csrf };
  const status = await send('/api/admin/version/status', {}, headers);
  assert.equal(status.response.status, 200);
  assert.equal(status.response.headers.get('cache-control'), 'no-store');
  assert.equal((await send('/api/admin/version/publish',
    { channel: 'stable', expectedRevision: 0, config: config() },
    { ...headers, 'X-GG-Admin-CSRF': 'tampered' })).response.status, 403);
  const saved = await send('/api/admin/version/publish',
    { channel: 'stable', expectedRevision: 0, config: config() }, headers);
  assert.equal(saved.response.status, 200);
  assert.equal(saved.data.revision, 1);
  const rolled = await send('/api/admin/version/rollback', { channel: 'stable',
    expectedRevision: 1, historyId: saved.data.history[0].id }, headers);
  assert.equal(rolled.response.status, 200);
  assert.equal(rolled.data.channels.stable.mode, 'off');
});
test('admin shell contains version controls with CSP-safe event code', async () => {
  const request = new Request(BASE + '/api/admin');
  const response = await handleAdminRequest(request, { env: ENV,
    storeFactory: memoryStore, now: NOW });
  const html = await response.text();
  assert.match(html, /APK 版本管理/);
  assert.match(html, /id="vm-publish"/);
  assert.match(html, /id="vm-history"/);
  assert.match(html, /version\/rollback/);
  assert.doesNotMatch(html, / style=/);
  assert.match(response.headers.get('content-security-policy'), /script-src 'nonce-/);
});
