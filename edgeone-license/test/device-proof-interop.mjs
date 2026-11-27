import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { handle, hash } from '../core.mjs';

// The fixture uses a fresh Java P-256 key, the real shared DER codec, C++
// proofCanonical/signedRequestJson JNI and finally the production Node proof
// verifier. No actual license, device identity, or HTTPS endpoint is touched.
const request = JSON.parse(execFileSync('java', [
  '-Djava.library.path=/tmp/gg-cpp-jni', '-cp', '/tmp/gg-cpp-java-classes',
  'com.jinli.ggsecure.DeviceProofInteropSmoke',
], { encoding: 'utf8' }));
const now = 1_794_344_400;
const id = hash(request.licenseKey);
const record = { permanent: true, disabled: false, expiresAt: 0, durationSeconds: 0,
  deviceId: null, devicePublicKey: null };
const store = {
  async get(path) { return path === `licenses/${id}.json` ? record : null; },
  async setJSON(path, value) { if (path === `licenses/${id}.json`) Object.assign(record, value); },
};
const env = { GG_TOKEN_SECRET: 'test-only-secret-not-for-deployment-0123456789' };
const result = await handle('activate', request, { store, env, now });
assert.equal(result.ok, true);
assert.equal(record.devicePublicKey, request.devicePublicKey);

const tamperedBytes = Buffer.from(request.proof, 'base64');
tamperedBytes[10] ^= 0x01;
const altered = { ...request, proof: tamperedBytes.toString('base64') };
await assert.rejects(() => handle('activate', altered, { store, env, now }),
  { code: 'invalid_device' });
console.log('Java ECDSA DER/P1363 → C++ JNI proof → EdgeOne Node signature parity OK');
