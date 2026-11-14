import test from 'node:test';
import assert from 'node:assert/strict';
import { createDecipheriv, createPublicKey, diffieHellman, generateKeyPairSync, hkdfSync, sign } from 'node:crypto';
import { handle, hash, RUNTIME_PROOF_ACTION } from '../core.mjs';

const env = { GG_TOKEN_SECRET: 'test-only-secret-not-for-deployment-0123456789' };
const NOW = 1_800_000_000;
const key = 'A1B2C3D4E5F60987A1B2C3D4E5F60987';

test('published runtime proof action remains runtime-v2', () => {
  assert.equal(RUNTIME_PROOF_ACTION, 'runtime-v2');
});

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

test('a captured runtime request is rejected on its second use', async () => {
  const s = store(), d = device();
  s.data.set(`licenses/${hash(key)}.json`, { disabled: false, permanent: true,
    durationSeconds: 0, expiresAt: 0, deviceId: null, devicePublicKey: null });
  const auth = await handle('activate', { ...proof(d, 'activate', key), licenseKey: key }, context(s));
  const bundle = Buffer.from('private script archive');
  const file = `runtime/bundles/${hash(bundle)}.zip`;
  s.data.set('runtime/manifest.json', { size: bundle.length, sha256: hash(bundle), file });
  s.data.set(file, bundle);
  const request = { ...proof(d, 'runtime', auth.token), token: auth.token };
  assert.deepEqual(Buffer.from((await handle('runtime', request, context(s))).bytes), bundle);
  await assert.rejects(() => handle('runtime', request, context(s)), { code: 'replayed_request' });
  // A fresh signed request by the same licensed device is still allowed.
  const renewed = { ...proof(d, 'runtime', auth.token, NOW + 1), token: auth.token };
  assert.deepEqual(Buffer.from((await handle('runtime', renewed, context(s))).bytes), bundle);
});

test('device-bound runtime delivery encrypts the ZIP for a single ephemeral client key', async () => {
  const s = store(), d = device();
  s.data.set(`licenses/${hash(key)}.json`, { disabled: false, permanent: true,
    durationSeconds: 0, expiresAt: 0, deviceId: null, devicePublicKey: null });
  const auth = await handle('activate', { ...proof(d, 'activate', key), licenseKey: key }, context(s));
  const bundle = Buffer.from('only this client can decrypt the runtime ZIP');
  const file = `runtime/bundles/${hash(bundle)}.zip`;
  s.data.set('runtime/manifest.json', { size: bundle.length, sha256: hash(bundle), file });
  s.data.set(file, bundle);

  const clientKey = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const deliveryPublicKey = clientKey.publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
  const material = `${auth.token}|${deliveryPublicKey}`;
  const request = { ...proof(d, 'runtime-v2', material), token: auth.token, deliveryPublicKey };
  const served = await handle('runtime', request, context(s));
  assert.equal(served.delivery.version, 2);
  assert.notDeepEqual(Buffer.from(served.bytes), bundle);
  const { serverPublicKey, iv } = served.delivery;
  const serverKey = createPublicKey({
    key: Buffer.from(serverPublicKey, 'base64'), type: 'spki', format: 'der' });
  const secret = diffieHellman({ privateKey: clientKey.privateKey, publicKey: serverKey });
  const info = Buffer.from(`gg-edgeone-runtime-v2|${d.id}|${hash(auth.token)}`);
  const derived = Buffer.from(hkdfSync('sha256', secret, Buffer.from('gg-edgeone-v2'), info, 32));
  const encrypted = Buffer.from(served.bytes);
  const decipher = createDecipheriv('aes-256-gcm', derived, Buffer.from(iv, 'base64'));
  decipher.setAAD(info);
  decipher.setAuthTag(encrypted.subarray(encrypted.length - 16));
  assert.deepEqual(Buffer.concat([
    decipher.update(encrypted.subarray(0, -16)), decipher.final()]), bundle);
  await assert.rejects(() => handle('runtime', request, context(s)), { code: 'replayed_request' });
  const altered = { ...request, deliveryPublicKey: device().pub };
  await assert.rejects(() => handle('runtime', altered, context(s)), { code: 'invalid_device' });

  const strict = { store: s, env: { ...env, GG_REQUIRE_RUNTIME_V2: '1' }, now: NOW };
  await assert.rejects(() => handle('runtime', {
    ...proof(d, 'runtime', auth.token, NOW + 1), token: auth.token,
  }, strict), { code: 'upgrade_required' });
  const secondKey = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const secondPub = secondKey.publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
  assert.equal((await handle('runtime', {
    ...proof(d, 'runtime-v2', `${auth.token}|${secondPub}`, NOW + 1),
    token: auth.token, deliveryPublicKey: secondPub,
  }, strict)).delivery.version, 2);
});
