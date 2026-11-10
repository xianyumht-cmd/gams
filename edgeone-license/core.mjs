import { createHash, createHmac, createPublicKey, timingSafeEqual, verify } from 'node:crypto';

const KEY_RE = /^[0-9A-F]{32}$/;
const DEVICE_RE = /^[a-f0-9]{64}$/;
const MAX_BUNDLE = 5_500_000; // EdgeOne Cloud Functions responses are capped at 6 MB.
const TIME_SKEW = 180;

export const hash = (value) => createHash('sha256').update(value).digest('hex');

function fail(status, code, message) {
  const error = new Error(message);
  Object.assign(error, { status, code });
  throw error;
}

function secret(env) {
  const value = env?.GG_TOKEN_SECRET || process.env.GG_TOKEN_SECRET || '';
  if (value.length < 32) fail(503, 'not_configured', '授权中心尚未配置');
  return value;
}

function compareHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function issueToken(recordId, deviceId, publicKey, env, now) {
  const data = Buffer.from(JSON.stringify({ id: recordId, dev: deviceId, pub: hash(publicKey), exp: now + 3600 }))
    .toString('base64url');
  return `${data}.${createHmac('sha256', secret(env)).update(data).digest('hex')}`;
}

function verifyToken(token, env, now) {
  if (typeof token !== 'string' || token.length > 1600) fail(401, 'bad_session', '授权会话无效');
  const [data, mac, extra] = token.split('.');
  if (!data || !mac || extra !== undefined) fail(401, 'bad_session', '授权会话无效');
  const expected = createHmac('sha256', secret(env)).update(data).digest('hex');
  if (!compareHex(mac, expected)) fail(401, 'bad_session', '授权会话无效');
  let decoded;
  try { decoded = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')); }
  catch { fail(401, 'bad_session', '授权会话无效'); }
  if (!DEVICE_RE.test(decoded.id || '') || !DEVICE_RE.test(decoded.dev || '') ||
      !DEVICE_RE.test(decoded.pub || '') || !Number.isSafeInteger(decoded.exp) || decoded.exp <= now) {
    fail(401, 'bad_session', '授权会话已过期');
  }
  return decoded;
}

function verifyDeviceProof(body, action, keyMaterial, now, expectedPublicKey = '') {
  const { deviceId, devicePublicKey, proof, requestTime } = body;
  if (!DEVICE_RE.test(deviceId || '') || typeof devicePublicKey !== 'string' ||
      devicePublicKey.length > 1000 || typeof proof !== 'string' || proof.length > 200 ||
      !Number.isSafeInteger(requestTime) || Math.abs(now - requestTime) > TIME_SKEW) {
    fail(401, 'invalid_device', '设备验证失败，请校准时间');
  }
  if (expectedPublicKey && expectedPublicKey !== devicePublicKey) {
    fail(401, 'invalid_device', '设备密钥不匹配');
  }
  const canonical = `${action}\n${requestTime}\n${deviceId}\n${hash(keyMaterial)}`;
  try {
    const pub = Buffer.from(devicePublicKey, 'base64');
    const sig = Buffer.from(proof, 'base64');
    if (pub.length < 70 || pub.length > 200 || sig.length !== 64 ||
        !verify('sha256', Buffer.from(canonical),
          { key: createPublicKey({ key: pub, format: 'der', type: 'spki' }), dsaEncoding: 'ieee-p1363' }, sig)) {
      fail(401, 'invalid_device', '设备签名无效');
    }
  } catch { fail(401, 'invalid_device', '设备签名无效'); }
}

function validateLicense(record, now) {
  if (!record || record.disabled) fail(403, 'license_disabled', '激活码不可用');
  if (record.expiresAt > 0 && record.expiresAt <= now) fail(403, 'license_expired', '激活码已到期');
}

function authResponse(record, token) {
  return { ok: true, token, licenseExpiresAt: record.expiresAt || null,
    permanent: Boolean(record.permanent), latestAppVersion: 12, forceUpdate: false };
}

export async function handle(action, body, { store, env, now = Math.floor(Date.now() / 1000) }) {
  secret(env);
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'bad_request', '请求无效');

  if (action === 'activate') {
    const key = typeof body.licenseKey === 'string' ? body.licenseKey.toUpperCase() : '';
    if (!KEY_RE.test(key)) fail(400, 'bad_key', '激活码格式错误');
    verifyDeviceProof(body, action, key, now);
    const id = hash(key);
    const path = `licenses/${id}.json`;
    const record = await store.get(path, { type: 'json', consistency: 'strong' });
    if (!record) fail(404, 'bad_key', '激活码不存在');
    validateLicense(record, now);
    if (record.deviceId && (record.deviceId !== body.deviceId || record.devicePublicKey !== body.devicePublicKey)) {
      fail(403, 'device_limit', '激活码已绑定其他设备');
    }
    if (!record.deviceId) {
      record.deviceId = body.deviceId;
      record.devicePublicKey = body.devicePublicKey;
      if (!record.permanent && !record.expiresAt && record.durationSeconds > 0) {
        record.expiresAt = now + record.durationSeconds;
      }
      await store.setJSON(path, record);
      // Strong reread prevents returning an immediately stale device binding.
      const current = await store.get(path, { type: 'json', consistency: 'strong' });
      if (current.deviceId !== body.deviceId || current.devicePublicKey !== body.devicePublicKey) {
        fail(409, 'device_limit', '设备绑定冲突，请重试');
      }
    }
    return authResponse(record, issueToken(id, body.deviceId, body.devicePublicKey, env, now));
  }

  if (!['check', 'runtime', 'unbind'].includes(action)) fail(404, 'not_found', '接口不存在');
  const session = verifyToken(body.token, env, now);
  verifyDeviceProof(body, action, body.token, now);
  if (session.dev !== body.deviceId || session.pub !== hash(body.devicePublicKey)) {
    fail(401, 'bad_session', '授权设备不匹配');
  }
  const path = `licenses/${session.id}.json`;
  const record = await store.get(path, { type: 'json', consistency: 'strong' });
  validateLicense(record, now);
  if (record.deviceId !== session.dev || record.devicePublicKey !== body.devicePublicKey) {
    fail(401, 'device_unbound', '当前设备尚未绑定');
  }
  if (action === 'check') {
    return authResponse(record, issueToken(session.id, body.deviceId, body.devicePublicKey, env, now));
  }
  if (action === 'unbind') {
    record.deviceId = null;
    record.devicePublicKey = null;
    await store.setJSON(path, record);
    return { ok: true };
  }

  const manifest = await store.get('runtime/manifest.json', { type: 'json', consistency: 'strong' });
  if (!manifest || !Number.isInteger(manifest.size) || manifest.size < 1 || manifest.size > MAX_BUNDLE ||
      !/^[a-f0-9]{64}$/.test(manifest.sha256 || '') ||
      !/^runtime\/bundles\/[a-f0-9]{64}\.zip$/.test(manifest.file || '')) {
    fail(503, 'runtime_unavailable', '云端脚本未就绪');
  }
  const data = await store.get(manifest.file, { type: 'arrayBuffer', consistency: 'strong' });
  if (!data) fail(503, 'runtime_unavailable', '云端脚本未就绪');
  const bytes = Buffer.from(data);
  if (bytes.length !== manifest.size || hash(bytes) !== manifest.sha256) {
    fail(503, 'runtime_invalid', '云端脚本校验失败');
  }
  return { ok: true, bytes, manifest };
}

export function toHttpError(error) {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  return new Response(JSON.stringify({ ok: false, code: error?.code || 'server_error',
    message: status === 500 ? '授权服务暂时不可用' : error.message }),
  { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}
