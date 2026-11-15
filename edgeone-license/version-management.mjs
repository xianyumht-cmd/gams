/** GG app release policy: private Blob, separate from JS runtime manifests. */
import { createHash, randomUUID } from 'node:crypto';

const PATH = 'app-version/policy.json';
const HISTORY_LIMIT = 30;
export const VERSION_CHANNELS = ['stable', 'development'];
const defaultChannel = () => ({
  versionCode: 0, versionName: '', minVersionCode: 0,
  mode: 'off', rolloutPercent: 100, downloadUrl: '',
  notes: '', sha256: '', publishedAt: 0,
});
export const defaultVersionState = () => ({
  schemaVersion: 1, revision: 0,
  channels: { stable: defaultChannel(), development: defaultChannel() },
  history: [],
});

function policyError(status, code, message) {
  const err = new Error(message);
  Object.assign(err, { status, code });
  throw err;
}
function channelName(name) {
  if (!VERSION_CHANNELS.includes(name)) policyError(400, 'bad_channel', '无效的版本通道');
  return name;
}
function isInteger(value, min, max) {
  return Number.isSafeInteger(value) && value >= min && value <= max;
}
function validateUrl(value, required) {
  if (typeof value !== 'string' || value.length > 600) {
    policyError(400, 'bad_url', '下载地址不合法');
  }
  if (!value) {
    if (required) policyError(400, 'bad_url', '发布更新时必须填写 HTTPS 下载地址');
    return '';
  }
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' || !parsed.hostname.includes('.') ||
        parsed.username || parsed.password || parsed.hash ||
        parsed.port && parsed.port !== '443' ||
        /^(?:localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.)/i.test(parsed.hostname)) {
      throw new Error('unsafe');
    }
    return parsed.href;
  } catch {
    policyError(400, 'bad_url', '请填写合法的公网 HTTPS 下载地址');
  }
}
function validateConfig(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    policyError(400, 'bad_release', '版本配置格式无效');
  }
  const { versionCode, versionName, minVersionCode, mode, rolloutPercent,
    downloadUrl, notes, sha256 } = input;
  if (!isInteger(versionCode, 0, 2100000000) ||
      !isInteger(minVersionCode, 0, 2100000000) || minVersionCode > versionCode) {
    policyError(400, 'bad_version', '版本代码必须为非负整数，最低版本不得超过最新版本');
  }
  if (typeof versionName !== 'string' ||
      (versionCode > 0 && !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(versionName)) ||
      (versionCode === 0 && versionName !== '')) {
    policyError(400, 'bad_version', '版本名称格式无效');
  }
  if (!['off', 'optional', 'required'].includes(mode)) {
    policyError(400, 'bad_mode', '更新策略不支持');
  }
  if (!isInteger(rolloutPercent, 0, 100)) {
    policyError(400, 'bad_rollout', '灰度比例必须是 0–100');
  }
  if (typeof notes !== 'string' || notes.length > 500) {
    policyError(400, 'bad_notes', '更新说明不得超过 500 字');
  }
  if (typeof sha256 !== 'string' || (sha256 && !/^[a-f0-9]{64}$/.test(sha256))) {
    policyError(400, 'bad_hash', 'APK SHA-256 必须是 64 位小写十六进制');
  }
  if (mode !== 'off' && (versionCode < 1 || !minVersionCode)) {
    policyError(400, 'bad_version', '启用版本策略前必须设置最新与最低版本代码');
  }
  return {
    versionCode, versionName, minVersionCode, mode, rolloutPercent,
    downloadUrl: validateUrl(downloadUrl, mode !== 'off'),
    notes, sha256,
  };
}
function validStoredState(value) {
  if (!value || value.schemaVersion !== 1 || !isInteger(value.revision, 0, 2000000000) ||
      !value.channels || !Array.isArray(value.history) || value.history.length > HISTORY_LIMIT ||
      !VERSION_CHANNELS.every(ch => {
        const c = value.channels[ch];
        return c && c.mode && isInteger(c.versionCode, 0, 2100000000);
      })) policyError(503, 'policy_invalid', '版本管理数据异常，请检查私有 Blob');
  return value;
}

export async function readVersionState(store) {
  const state = await store.get(PATH, { type: 'json', consistency: 'strong' });
  return state == null ? defaultVersionState() : validStoredState(state);
}
export async function saveVersionPolicy(store, body, now) {
  const channel = channelName(body.channel);
  const config = validateConfig(body.config);
  if (!isInteger(body.expectedRevision, 0, 2000000000)) {
    policyError(400, 'bad_revision', '请刷新版本列表后重试');
  }
  const state = await readVersionState(store);
  if (state.revision !== body.expectedRevision) {
    policyError(409, 'version_conflict', '版本设置已被其他操作修改，请刷新后重试');
  }
  // Avoid accidental downgrade; use explicit rollback from the audit history.
  if (config.versionCode < state.channels[channel].versionCode) {
    policyError(409, 'downgrade', '降低版本代码请使用历史回滚功能');
  }
  if (config.versionCode === state.channels[channel].versionCode &&
      state.channels[channel].versionName &&
      config.versionName !== state.channels[channel].versionName) {
    policyError(409, 'version_conflict', '同一版本代码不可改写版本名称');
  }
  const previous = state.channels[channel];
  const next = { ...config, publishedAt: now };
  const event = { id: randomUUID(), at: now, channel, action: 'publish',
    before: previous, after: next };
  const updated = { ...state, revision: state.revision + 1,
    channels: { ...state.channels, [channel]: next },
    history: [event, ...state.history].slice(0, HISTORY_LIMIT) };
  // One authoritative write: the previous release remains intact if this fails.
  await store.setJSON(PATH, updated);
  return updated;
}
export async function rollbackVersionPolicy(store, body, now) {
  const channel = channelName(body.channel);
  if (!isInteger(body.expectedRevision, 0, 2000000000) ||
      typeof body.historyId !== 'string' || !/^[0-9a-f-]{36}$/.test(body.historyId)) {
    policyError(400, 'bad_revision', '回滚参数无效');
  }
  const state = await readVersionState(store);
  if (state.revision !== body.expectedRevision) {
    policyError(409, 'version_conflict', '版本记录已经改变，请刷新后重试');
  }
  const target = state.history.find(item => item.id === body.historyId && item.channel === channel);
  if (!target) policyError(404, 'history_missing', '回滚记录不存在或已超出历史保留范围');
  const previous = state.channels[channel];
  const next = { ...validateConfig(target.before), publishedAt: now };
  const event = { id: randomUUID(), at: now, channel, action: 'rollback',
    before: previous, after: next, from: target.id };
  const updated = { ...state, revision: state.revision + 1,
    channels: { ...state.channels, [channel]: next },
    history: [event, ...state.history].slice(0, HISTORY_LIMIT) };
  await store.setJSON(PATH, updated);
  return updated;
}
export async function getApkUpdatePolicy(store, body) {
  // Older installed APKs have no version report: do not change their legacy authorization.
  const code = body?.appVersionCode;
  if (!isInteger(code, 1, 2100000000)) return null;
  const channel = body.appChannel === 'development' ? 'development' : 'stable';
  const state = await readVersionState(store);
  const policy = state.channels[channel];
  const tooOld = policy.mode === 'required' && code < policy.minVersionCode;
  const newer = code < policy.versionCode && policy.mode !== 'off';
  const device = typeof body.deviceId === 'string' ? body.deviceId : '';
  const bucket = createHash('sha256').update(channel + ':' + policy.versionCode + ':' + device)
    .digest().readUInt32BE(0) % 10000;
  const eligible = tooOld || bucket < policy.rolloutPercent * 100;
  return {
    channel, latestVersionCode: policy.versionCode, latestVersionName: policy.versionName,
    minimumVersionCode: policy.minVersionCode, currentVersionCode: code,
    updateAvailable: newer && eligible, forceUpdate: tooOld,
    updateUrl: newer && eligible ? policy.downloadUrl : '',
    updateMessage: newer && eligible ? policy.notes : '',
    sha256: newer && eligible ? policy.sha256 : '',
  };
}
