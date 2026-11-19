import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { handlePartnerIssue } from '../partner-issue.mjs';

const env = { GG_TOKEN_SECRET: 'master-secret-for-test-12345678901234567890123',
  GG_PARTNER_ISSUE_TOKEN: 'partner-token-for-test-12345678901234567890123' };
const auth = { Authorization: `Bearer ${env.GG_PARTNER_ISSUE_TOKEN}`, 'Content-Type': 'application/json' };
function fixture() {
  const data = new Map();
  let writes = 0;
  const store = { get: async path => data.get(path), setJSON: async (path, record) => { data.set(path, record); writes++; } };
  const send = async (body, { headers = auth, envOverride = env, method = 'POST' } = {}) => {
    const request = new Request('https://gg-api.dijiav.top/api/partner/issue', {
      method, headers, ...(method === 'POST' ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
    });
    const result = await handlePartnerIssue(request, { env: envOverride, storeFactory: () => store, now: 1_800_000_000 });
    return { status: result.status, body: await result.json() };
  };
  return { data, get writes() { return writes; }, send };
}
const request = { order_id: 'PAY-1234', idempotency_key: 'a'.repeat(64), days: 30 };

test('unauthorized calls and unconfigured partner token never reach Blob', async () => {
  const f = fixture();
  assert.equal((await f.send(request, { headers: { 'Content-Type': 'application/json' } })).status, 401);
  assert.equal((await f.send(request, { headers: { ...auth, Authorization: 'Bearer ' + 'x'.repeat(40) } })).status, 401);
  assert.equal((await f.send(request, { envOverride: { GG_TOKEN_SECRET: env.GG_TOKEN_SECRET } })).status, 503);
  assert.equal((await f.send(request, { envOverride: { ...env, GG_PARTNER_ISSUE_TOKEN: env.GG_TOKEN_SECRET } })).status, 503);
  assert.equal(f.writes, 0);
});

test('one order unit is stable across retries; activated record is never reset', async () => {
  const f = fixture();
  const first = await f.send(request);
  assert.equal(first.status, 200);
  const code = first.body.data.card.code;
  assert.match(code, /^[A-F0-9]{32}$/);
  const path = `licenses/${createHash('sha256').update(code).digest('hex')}.json`;
  const record = f.data.get(path);
  assert.equal(record.durationSeconds, 30 * 86400);
  assert.equal(JSON.stringify(record).includes(code), false);
  record.deviceId = 'bound-device'; record.expiresAt = 1_900_000_000;
  const again = await f.send(request);
  assert.equal(again.status, 200);
  assert.equal(again.body.reused, true);
  assert.equal(again.body.data.card.code, code);
  assert.equal(f.writes, 1);
  assert.equal(f.data.get(path).deviceId, 'bound-device');
  assert.equal(f.data.get(path).expiresAt, 1_900_000_000);
});

test('another unit gets a different code; conflicting duration/order cannot create a new one', async () => {
  const f = fixture();
  const first = await f.send(request);
  const second = await f.send({ ...request, idempotency_key: 'b'.repeat(64) });
  assert.notEqual(first.body.data.card.code, second.body.data.card.code);
  assert.equal((await f.send({ ...request, days: 7 })).status, 409);
  assert.equal((await f.send({ ...request, order_id: 'PAY-other' })).status, 409);
  assert.equal(f.writes, 2);
});

test('Yuyu test placeholders are dry-run and never create activatable cards', async () => {
  const f = fixture();
  const result = await f.send({ order_id: 'test-order', idempotency_key: 'test-idempotency-key', days: 30 });
  assert.equal(result.status, 200);
  assert.equal(result.body.test, true);
  assert.equal(result.body.data.card.code, 'GG-TEST-ONLY');
  assert.equal(f.writes, 0);
});

test('invalid methods, bodies, durations and idempotency keys are rejected', async () => {
  const f = fixture();
  assert.equal((await f.send(undefined, { method: 'GET' })).status, 405);
  assert.equal((await f.send(request, { headers: { ...auth, 'Content-Type': 'text/plain' } })).status, 415);
  assert.equal((await f.send('oops')).status, 400);
  for (const bad of [
    { ...request, days: -1 }, { ...request, days: 15 }, { ...request, days: '30' },
    { ...request, idempotency_key: 'x' }, { ...request, order_id: '' },
    { ...request, order_id: 'bad\norder' }, { ...request, idempotency_key: null },
  ]) assert.equal((await f.send(bad)).status, 400);
  assert.equal(f.writes, 0);
});

test('storage failure permits retry without issuing a different key', async () => {
  const f = fixture();
  const throwing = { get: async () => null, setJSON: async () => { throw new Error('not in response'); } };
  const r = await handlePartnerIssue(new Request('https://gg-api.dijiav.top/api/partner/issue', { method: 'POST', headers: auth, body: JSON.stringify(request) }), { env, storeFactory: () => throwing });
  assert.equal(r.status, 503);
  assert.equal((await r.text()).includes('not in response'), false);
  assert.equal((await f.send(request)).status, 200);
});
