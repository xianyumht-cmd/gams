/** Local administrator CLI. Do not run this in public GitHub Actions. */
import { randomBytes, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { getStore } from '@edgeone/pages-blob';

const [command, ...args] = process.argv.slice(2);
const projectId = process.env.EDGEONE_PROJECT_ID;
const token = process.env.EDGEONE_API_TOKEN;
if (!projectId || !token) throw new Error('Set EDGEONE_PROJECT_ID and EDGEONE_API_TOKEN in local environment');
const store = getStore({ name: 'gg-private', projectId, token, consistency: 'strong' });
const hash = (value) => createHash('sha256').update(value).digest('hex');
const keyPattern = /^[A-F0-9]{32}$/;

if (command === 'issue') {
  const days = args[0] === 'permanent' ? 0 : Number(args[0]);
  if (args.length !== 1 || (args[0] !== 'permanent' &&
      (!Number.isInteger(days) || days < 1 || days > 3650))) {
    throw new Error('Usage: node scripts/provision.mjs issue 30|permanent');
  }
  const key = randomBytes(16).toString('hex').toUpperCase();
  await store.setJSON(`licenses/${hash(key)}.json`, {
    disabled: false, permanent: days === 0, durationSeconds: days * 86400,
    expiresAt: 0, deviceId: null, devicePublicKey: null,
  });
  console.log('NEW LICENSE KEY (store privately):', key);
} else if (command === 'upload') {
  if (args.length !== 1) throw new Error('Usage: node scripts/provision.mjs upload .local');
  const folder = args[0];
  const bytes = await readFile(`${folder}/bundle.zip`);
  const manifest = JSON.parse(await readFile(`${folder}/manifest.json`, 'utf8'));
  if (bytes.length !== manifest.size || bytes.length > 5_500_000 || hash(bytes) !== manifest.sha256 ||
      manifest.file !== `runtime/bundles/${manifest.sha256}.zip`) {
    throw new Error('Package size/hash mismatch');
  }
  await store.set(manifest.file, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  await store.setJSON('runtime/manifest.json', manifest);
  console.log('Uploaded private runtime version:', manifest.versionName);
} else if (command === 'revoke' || command === 'unbind') {
  const key = (args[0] || '').toUpperCase();
  if (args.length !== 1 || !keyPattern.test(key)) throw new Error(`Usage: node scripts/provision.mjs ${command} 32-HEX-KEY`);
  const location = `licenses/${hash(key)}.json`;
  const record = await store.get(location, { type: 'json', consistency: 'strong' });
  if (!record) throw new Error('License does not exist');
  if (command === 'revoke') record.disabled = true;
  else { record.deviceId = null; record.devicePublicKey = null; }
  await store.setJSON(location, record);
  console.log(command === 'revoke' ? 'License revoked.' : 'Device unbound.');
} else {
  throw new Error('Commands: issue 30|permanent, upload .local, revoke KEY, unbind KEY');
}
