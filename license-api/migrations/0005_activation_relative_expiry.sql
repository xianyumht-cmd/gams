-- Timed licenses are inventory until first activation.
-- Unused keys never expire; their purchased duration is stored separately.

ALTER TABLE licenses ADD COLUMN duration_seconds INTEGER;

-- Backfill the duration for existing keys. For unused timed keys the original
-- configured duration is recoverable from the generation-time expiry.
UPDATE licenses
SET duration_seconds = CASE
  WHEN activated_at IS NULL AND expires_at IS NULL THEN -1
  WHEN activated_at IS NULL AND expires_at IS NOT NULL THEN MAX(60, expires_at - created_at)
  WHEN activated_at IS NOT NULL AND expires_at IS NULL THEN -1
  ELSE duration_seconds
END
WHERE duration_seconds IS NULL;

-- Restore every unused key to inventory state. Disabled keys stay disabled,
-- but an old generation-time expiry must never consume an unused key.
UPDATE licenses
SET expires_at = NULL,
    status = CASE WHEN status = 'disabled' THEN 'disabled' ELSE 'active' END
WHERE activated_at IS NULL;

-- Compatibility guard for the currently deployed Worker while a new Worker is
-- rolling out: creation may still submit a generation-time expires_at value.
CREATE TRIGGER IF NOT EXISTS licenses_unused_insert_normalize
AFTER INSERT ON licenses
WHEN NEW.activated_at IS NULL
BEGIN
  UPDATE licenses
     SET duration_seconds = CASE
           WHEN NEW.expires_at IS NULL THEN -1
           ELSE MAX(60, NEW.expires_at - NEW.created_at)
         END,
         expires_at = NULL,
         status = CASE WHEN NEW.status = 'disabled' THEN 'disabled' ELSE 'active' END
   WHERE id = NEW.id;
END;

-- Defensive invariant: no code path may assign an expiry to an unused key.
-- The lifecycle entrypoint handles admin duration edits; this trigger only
-- enforces the invariant and deliberately does not reinterpret the duration.
CREATE TRIGGER IF NOT EXISTS licenses_unused_expiry_guard
AFTER UPDATE OF expires_at ON licenses
WHEN NEW.activated_at IS NULL AND NEW.expires_at IS NOT NULL
BEGIN
  UPDATE licenses
     SET expires_at = NULL,
         status = CASE WHEN NEW.status = 'disabled' THEN 'disabled' ELSE 'active' END
   WHERE id = NEW.id;
END;

-- The first real activation starts the purchased duration exactly once.
-- Later device checks/rebinds cannot restart or extend the clock.
CREATE TRIGGER IF NOT EXISTS licenses_start_expiry_on_first_activation
AFTER UPDATE OF activated_at ON licenses
WHEN OLD.activated_at IS NULL AND NEW.activated_at IS NOT NULL
BEGIN
  UPDATE licenses
     SET expires_at = CASE
           WHEN NEW.duration_seconds IS NOT NULL AND NEW.duration_seconds > 0
             THEN NEW.activated_at + NEW.duration_seconds
           ELSE NULL
         END,
         status = CASE WHEN NEW.status = 'disabled' THEN 'disabled' ELSE 'active' END
   WHERE id = NEW.id;
END;
