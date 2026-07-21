CREATE TABLE IF NOT EXISTS system_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  config_version INTEGER NOT NULL DEFAULT 1,
  settings_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT NOT NULL DEFAULT 'migration'
);

CREATE TABLE IF NOT EXISTS system_settings_history (
  id TEXT PRIMARY KEY,
  config_version INTEGER NOT NULL,
  settings_json TEXT NOT NULL,
  changed_at INTEGER NOT NULL,
  changed_by TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_settings_history_version
  ON system_settings_history(config_version DESC, changed_at DESC);

CREATE TABLE IF NOT EXISTS script_releases (
  version TEXT PRIMARY KEY,
  manifest_json TEXT NOT NULL,
  file_name TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_script_releases_seen
  ON script_releases(last_seen_at DESC);

INSERT OR IGNORE INTO system_settings(id,config_version,settings_json,updated_at,updated_by)
VALUES(
  1,
  1,
  '{"minAppVersion":5,"secureAppVersion":6,"latestAppVersion":7,"forceUpdate":false,"updateUrl":"","updateMessage":"","sessionSeconds":7200,"adminSessionSeconds":43200,"foregroundRecheckSeconds":1800,"offlineGraceSeconds":21600,"legacyOfflineGraceSeconds":86400,"scriptLeaseSeconds":21600,"challengeSeconds":90,"globalForceOnline":false,"riskForceOnlineThreshold":2,"selfUnbindEnabled":true,"unbindPenaltySeconds":21600,"unbindCooldownSeconds":86400,"unbindWindowSeconds":2592000,"unbindWindowLimit":5,"sessionGeneration":1,"scriptDeliveryEnabled":true,"activeScriptVersion":"","configCacheSeconds":30}',
  unixepoch(),
  'migration'
);
