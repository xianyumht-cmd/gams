/** GG administrator MFA: server-generated TOTP, encrypted private Blob and recovery codes.
 * Never send provisioning secrets to external QR services or commit them to source.
 */
import { createHash, createHmac, createCipheriv, createDecipheriv,
  randomBytes, timingSafeEqual } from 'node:crypto';
import qrcode from './vendor/qrcode.mjs';

const STATE_KEY = 'admin/mfa-state.json';
const PENDING_KEY = 'admin/mfa-pending.json';
const PENDING_SECONDS = 10 * 60;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const QR_ISSUER = 'GG';
const AAD = Buffer.from('gg-admin-mfa-secret-v1');

function fault(status, code, message) {
  const e = new Error(message);
  Object.assign(e, { status, code });
  throw e;
}
const hash = data => createHash('sha256').update(data).digest('hex');
const keyFor = (env, purpose) =>
  createHmac('sha256', env.GG_TOKEN_SECRET || process.env.GG_TOKEN_SECRET || '')
    .update('gg-admin-mfa-' + purpose + '-v1').digest();

export function encodeBase32(bytes) {
  let bits = 0, buffer = 0, result = '';
  for (const value of bytes) {
    buffer = (buffer << 8) | value;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result += ALPHABET[(buffer >>> bits) & 31];
      buffer &= (1 << bits) - 1;
    }
  }
  if (bits) result += ALPHABET[(buffer << (5 - bits)) & 31];
  return result;
}
function encrypt(secret, env) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFor(env, 'encryption'), iv);
  cipher.setAAD(AAD);
  const body = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return { v: 1, iv: iv.toString('base64url'),
    body: body.toString('base64url'), tag: cipher.getAuthTag().toString('base64url') };
}
function decrypt(box, env) {
  try {
    if (!box || box.v !== 1) throw Error('invalid box');
    const iv = Buffer.from(box.iv, 'base64url'), tag = Buffer.from(box.tag, 'base64url');
    if (iv.length !== 12 || tag.length !== 16) throw Error('invalid nonce/tag');
    const cipher = createDecipheriv('aes-256-gcm', keyFor(env, 'encryption'), iv);
    cipher.setAAD(AAD);
    cipher.setAuthTag(tag);
    const decoded = Buffer.concat([
      cipher.update(Buffer.from(box.body, 'base64url')), cipher.final()
    ]).toString('utf8');
    if (!/^[A-Z2-7]{32}$/.test(decoded)) throw Error('invalid secret');
    return decoded;
  } catch {
    fault(503, 'mfa_unavailable', '动态验证密钥无法解密，请检查项目密钥配置');
  }
}
function decodeBase32(secret) {
  let bits = 0, buffer = 0;
  const bytes = [];
  for (const letter of secret) {
    buffer = (buffer << 5) | ALPHABET.indexOf(letter);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >>> bits) & 255);
      buffer &= (1 << bits) - 1;
    }
  }
  return Buffer.from(bytes);
}
export function validOtp(secret, code, now) {
  if (typeof code !== 'string' || !/^[0-9]{6}$/.test(code)) return false;
  const provided = Buffer.from(code, 'ascii');
  const key = decodeBase32(secret);
  const counter = Math.floor(now / 30);
  for (let offset = -1; offset <= 1; offset++) {
    const b = Buffer.alloc(8);
    b.writeBigUInt64BE(BigInt(counter + offset));
    const mac = createHmac('sha1', key).update(b).digest();
    const pos = mac[mac.length - 1] & 15;
    const expected = Buffer.from(
      String((mac.readUInt32BE(pos) & 0x7fffffff) % 1000000).padStart(6, '0'));
    if (timingSafeEqual(provided, expected)) return true;
  }
  return false;
}
export async function getMfaState(store) {
  const record = await store.get(STATE_KEY, { type: 'json', consistency: 'strong' });
  if (record === null || record === undefined) return null;
  if (record.enabled === false && /^[a-f0-9]{32}$/.test(record.version || '')) return record;
  if (record.enabled !== true || !/^[a-f0-9]{32}$/.test(record.version || '') ||
      !record.secret || !Array.isArray(record.recovery) ||
      record.recovery.length > 12 || record.recovery.some(x => !/^[a-f0-9]{64}$/.test(x))) {
    fault(503, 'mfa_state_invalid', '动态验证状态无效，请检查私有存储');
  }
  return record;
}
export function mfaEpoch(record, manual) {
  return manual ? 'manual' : record ? record.version : 'off';
}
function recoveryDigest(code, env) {
  return createHmac('sha256', keyFor(env, 'recovery'))
    .update(code.trim().replace(/-/g, '').toUpperCase()).digest('hex');
}
export async function verifyManagedSecondFactor(store, record, code, env, now) {
  if (typeof code === 'string' && validOtp(decrypt(record.secret, env), code, now)) {
    return { valid: true, usedRecovery: false };
  }
  if (typeof code !== 'string' || !/^[A-F0-9]{20}$/i.test(code.trim().replace(/-/g, ''))) {
    return { valid: false };
  }
  const digest = recoveryDigest(code, env);
  const index = record.recovery.findIndex(x => timingSafeEqual(
    Buffer.from(x, 'hex'), Buffer.from(digest, 'hex')));
  if (index < 0) return { valid: false };
  // Best effort for a small single-admin store; Blob has no atomic compare/swap.
  // A trusted edge login rate limit is still mandatory.
  const next = { ...record, recovery: record.recovery.filter((_, i) => i !== index) };
  await store.setJSON(STATE_KEY, next);
  const observed = await getMfaState(store);
  if (observed.recovery.includes(digest)) return { valid: false };
  return { valid: true, usedRecovery: true };
}
function makeCodes(env) {
  const codes = Array.from({ length: 8 }, () => randomBytes(10).toString('hex').toUpperCase());
  return { codes, digests: codes.map(x => recoveryDigest(x, env)) };
}
export async function beginMfaSetup(store, env, now, sessionCookie) {
  if ((await getMfaState(store))?.enabled) fault(409, 'mfa_enabled', '双重验证已经启用');
  const secret = encodeBase32(randomBytes(20));
  const pending = {
    expires: now + PENDING_SECONDS, owner: hash(sessionCookie),
    secret: encrypt(secret, env)
  };
  await store.setJSON(PENDING_KEY, pending);
  const label = encodeURIComponent('GG Admin:gg-api.dijiav.top');
  const url = 'otpauth://totp/' + label + '?secret=' + secret +
    '&issuer=' + encodeURIComponent(QR_ISSUER) + '&algorithm=SHA1&digits=6&period=30';
  const code = qrcode(0, 'M');
  code.addData(url);
  code.make();
  const svg = code.createSvgTag({ cellSize: 5, margin: 15 });
  return { qr: 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64'),
    secret, expiresIn: PENDING_SECONDS };
}
export async function confirmMfaSetup(store, env, now, sessionCookie, code) {
  if ((await getMfaState(store))?.enabled) fault(409, 'mfa_enabled', '双重验证已经启用');
  const pending = await store.get(PENDING_KEY, { type: 'json', consistency: 'strong' });
  if (!pending || pending.expires <= now || pending.expires > now + PENDING_SECONDS ||
      pending.owner !== hash(sessionCookie)) fault(410, 'mfa_setup_expired', '二维码已过期，请重新开始绑定');
  const secret = decrypt(pending.secret, env);
  if (!validOtp(secret, code, now)) fault(401, 'mfa_code_wrong', '动态验证码错误，请检查手机时间');
  const { codes, digests } = makeCodes(env);
  const state = { enabled: true, version: randomBytes(16).toString('hex'),
    secret: encrypt(secret, env), recovery: digests, createdAt: now };
  await store.setJSON(STATE_KEY, state);
  await store.setJSON(PENDING_KEY, { expires: 0, owner: '', secret: null });
  return { state, codes };
}
export async function disableManagedMfa(store, state, env, now, passwordValid, code) {
  if (!state?.enabled || !passwordValid) fault(401, 'bad_credentials', '管理员凭据错误');
  const result = await verifyManagedSecondFactor(store, state, code, env, now);
  if (!result.valid) fault(401, 'bad_credentials', '管理员凭据错误');
  // Preserve an explicit disabled marker rather than relying on undocumented delete.
  const version = randomBytes(16).toString('hex');
  await store.setJSON(STATE_KEY, { enabled: false, version });
  return { ok: true, version };
}
