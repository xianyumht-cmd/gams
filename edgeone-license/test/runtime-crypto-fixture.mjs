import { createCipheriv, createHash, diffieHellman, generateKeyPairSync, hkdfSync,
  randomBytes } from 'node:crypto';

// Print only synthetic ephemeral test data, never real devices, credentials, or JS.
const client = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const server = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const deviceId = '4d'.repeat(32);
const token = 'synthetic-test-session';
const plaintext = Buffer.from('GG EdgeOne ephemeral transport Java/Node smoke', 'utf8');
const info = Buffer.from(`gg-edgeone-runtime-v2|${deviceId}|${createHash('sha256').update(token).digest('hex')}`);
const shared = diffieHellman({ privateKey: server.privateKey, publicKey: client.publicKey });
const key = Buffer.from(hkdfSync('sha256', shared, Buffer.from('gg-edgeone-v2'), info, 32));
const iv = randomBytes(12);
const cipher = createCipheriv('aes-256-gcm', key, iv);
cipher.setAAD(info);
const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
for (const line of [
  client.privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64'),
  server.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
  iv.toString('base64'), ciphertext.toString('base64'), deviceId, token,
  plaintext.toString('base64'),
]) process.stdout.write(line + '\n');
shared.fill(0);
key.fill(0);
