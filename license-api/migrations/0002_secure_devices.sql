ALTER TABLE devices ADD COLUMN public_key TEXT;
ALTER TABLE devices ADD COLUMN key_fingerprint TEXT;
ALTER TABLE devices ADD COLUMN certificate_digest TEXT;
ALTER TABLE devices ADD COLUMN risk_flags TEXT NOT NULL DEFAULT '';
ALTER TABLE devices ADD COLUMN session_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE licenses ADD COLUMN last_unbind_at INTEGER;
ALTER TABLE licenses ADD COLUMN rebind_available_at INTEGER;

CREATE TABLE IF NOT EXISTS challenges (
  nonce TEXT PRIMARY KEY,
  device_hash TEXT NOT NULL,
  purpose TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_challenges_expiry ON challenges(expires_at, used_at);
CREATE INDEX IF NOT EXISTS idx_devices_key_fingerprint ON devices(key_fingerprint);
