import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { handle, hash } from '../core.mjs';

const env = { GG_TOKEN_SECRET: 'test-only-secret-not-for-deployment-0123456789' };
const NOW = 1_800_000_000;
const key = 'A1B2C3D4E5F60987A1B2C3D4E5F60987';

function store() {
  const data = new Map();
  return { data,
    async get(k, options = {}) {
      const value = data.get(k);
      if (value === undefined) return null;
      return options.type === 'json' ? JSON.parse(JSON.stringify(value)) : value;
    },
    async setJSON(k, v) { data.set(k, JSON.parse(JSON.stringify(v))); },
    async set(k, v) { data.set(k, v); },
  };
}

function device() {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  return { privateKey, pub: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
    id: hash(publicKey.export({ type: 'spki', format: 'der' })) };
}

function proof(d, action, material, requestTime = NOW) {
  const canonical = `${action}\n${requestTime}\n${d.id}\n${hash(material)}`;
  return { deviceId: d.id, devicePublicKey: d.pub, requestTime,
    proof: sign('sha256', Buffer.from(canonical), { key: d.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64') };
}

function context(s) { return { store: s, env, now: NOW }; }

test('activate first time, keep expiry, check and serve private bundle', async () => {
  const s = store();
  s.data.set(`licenses/${hash(key)}.json`, { disabled: false, permanent: false,
    durationSeconds: 86400, expiresAt: 0, deviceId: null, devicePublicKey: null });
  const d = device();
  const activated = await handle('activate', { ...proof(d, 'activate', key), licenseKey: key }, context(s));
  assert.equal(activated.licenseExpiresAt, NOW + 86400);
  const again = await handle('activate', { ...proof(d, 'activate', key), licenseKey: key }, context(s));
  assert.equal(again.licenseExpiresAt, NOW + 86400);
  const checked = await handle('check', { ...proof(d, 'check', activated.token), token: activated.token }, context(s));
  assert.equal(checked.permanent, false);
  const bundle = Buffer.from('test zipped content');
  const file = `runtime/bundles/${hash(bundle)}.zip`;
  s.data.set('runtime/manifest.json', { size: bundle.length, sha256: hash(bundle), file });
  s.data.set(file, bundle);
  const served = await handle('runtime', { ...proof(d, 'runtime', checked.token), token: checked.token }, context(s));
  assert.deepEqual(Buffer.from(served.bytes), bundle);
});

test('reject forged proof, wrong device, expired/revoked license, invalid token', async () => {
  const s = store();
  s.data.set(`licenses/${hash(key)}.json`, { disabled: false, permanent: true,
    durationSeconds: 0, expiresAt: 0, deviceId: null, devicePublicKey: null });
  const d = device(), impostor = device();
  await assert.rejects(() => handle('activate', { ...proof(impostor, 'activate', key),
    devicePublicKey: d.pub, licenseKey: key }, context(s)), { code: 'invalid_device' });
  const auth = await handle('activate', { ...proof(d, 'activate', key), licenseKey: key }, context(s));
  await assert.rejects(() => handle('activate', { ...proof(impostor, 'activate', key),
    licenseKey: key }, context(s)), { code: 'device_limit' });
  await assert.rejects(() => handle('runtime', { ...proof(impostor, 'runtime', auth.token),
    token: auth.token }, context(s)), { code: 'bad_session' });
  await assert.rejects(() => handle('check', { ...proof(d, 'check', auth.token),
    token: auth.token + 'changed' }, context(s)), { code: 'bad_session' });
  const record = s.data.get(`licenses/${hash(key)}.json`);
  record.disabled = true;
  await assert.rejects(() => handle('runtime', { ...proof(d, 'runtime', auth.token),
    token: auth.token }, context(s)), { code: 'license_disabled' });
});

test('reject clock drift and oversized or mismatched bundles', async () => {
  const s = store(), d = device();
  s.data.set(`licenses/${hash(key)}.json`, { disabled: false, permanent: true,
    durationSeconds: 0, expiresAt: 0, deviceId: null, devicePublicKey: null });
  await assert.rejects(() => handle('activate', { ...proof(d, 'activate', key, NOW - 999), licenseKey: key },
    context(s)), { code: 'invalid_device' });
  const auth = await handle('activate', { ...proof(d, 'activate', key), licenseKey: key }, context(s));
  s.data.set('runtime/manifest.json', { size: 12, sha256: hash('bad'), file: `runtime/bundles/${hash('bad')}.zip` });
  s.data.set(`runtime/bundles/${hash('bad')}.zip`, Buffer.from('different'));
  await assert.rejects(() => handle('runtime', { ...proof(d, 'runtime', auth.token),
    token: auth.token }, context(s)), { code: 'runtime_invalid' });
});
