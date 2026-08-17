from pathlib import Path
import sqlite3
import unittest

ROOT = Path(__file__).resolve().parent
INIT = ROOT / "migrations" / "0001_init.sql"
MIGRATION = ROOT / "migrations" / "0005_activation_relative_expiry.sql"
DAY = 86400

class ActivationRelativeExpiryTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.executescript(INIT.read_text(encoding="utf-8"))

    def tearDown(self):
        self.db.close()

    def apply_migration(self):
        self.db.executescript(MIGRATION.read_text(encoding="utf-8"))

    def insert_license(self, license_id, created_at, expires_at, activated_at=None, status="active"):
        self.db.execute(
            """INSERT INTO licenses
               (id,key_hash,key_preview,status,created_at,activated_at,expires_at,max_devices,note)
               VALUES (?,?,?,?,?,?,?,?,?)""",
            (license_id, f"hash-{license_id}", f"preview-{license_id}", status,
             created_at, activated_at, expires_at, 1, ""),
        )
        self.db.commit()

    def row(self, license_id):
        return self.db.execute(
            "SELECT status,created_at,activated_at,expires_at,duration_seconds FROM licenses WHERE id=?",
            (license_id,),
        ).fetchone()

    def test_old_unused_timed_key_is_restored_with_full_duration(self):
        created = 1_700_000_000
        duration = 30 * DAY
        self.insert_license("old-timed", created, created + duration, status="expired")
        self.apply_migration()
        status, _, activated, expires, stored_duration = self.row("old-timed")
        self.assertEqual(status, "active")
        self.assertIsNone(activated)
        self.assertIsNone(expires)
        self.assertEqual(stored_duration, duration)

    def test_new_timed_key_stays_unused_until_first_activation(self):
        self.apply_migration()
        created = 1_800_000_000
        duration = 7 * DAY
        self.insert_license("new-timed", created, created + duration)
        status, _, activated, expires, stored_duration = self.row("new-timed")
        self.assertEqual(status, "active")
        self.assertIsNone(activated)
        self.assertIsNone(expires)
        self.assertEqual(stored_duration, duration)

        activated_at = created + 90 * DAY
        self.db.execute(
            "UPDATE licenses SET activated_at=COALESCE(activated_at,?),last_seen_at=? WHERE id=?",
            (activated_at, activated_at, "new-timed"),
        )
        self.db.commit()
        _, _, activated, expires, stored_duration = self.row("new-timed")
        self.assertEqual(activated, activated_at)
        self.assertEqual(expires, activated_at + duration)
        self.assertEqual(stored_duration, duration)

        second_attempt = activated_at + DAY
        self.db.execute(
            "UPDATE licenses SET activated_at=COALESCE(activated_at,?),last_seen_at=? WHERE id=?",
            (second_attempt, second_attempt, "new-timed"),
        )
        self.db.commit()
        self.assertEqual(self.row("new-timed")[3], activated_at + duration)

    def test_unused_expiry_guard_does_not_start_the_clock(self):
        self.apply_migration()
        created = 1_800_000_000
        duration = 14 * DAY
        self.insert_license("guarded", created, created + duration)
        self.db.execute(
            "UPDATE licenses SET expires_at=?,status='expired' WHERE id=?",
            (created + 60, "guarded"),
        )
        self.db.commit()
        status, _, activated, expires, stored_duration = self.row("guarded")
        self.assertEqual(status, "active")
        self.assertIsNone(activated)
        self.assertIsNone(expires)
        self.assertEqual(stored_duration, duration)

    def test_permanent_key_remains_permanent_after_activation(self):
        self.apply_migration()
        created = 1_800_000_000
        self.insert_license("permanent", created, None)
        self.assertEqual(self.row("permanent")[4], -1)
        activated_at = created + 365 * DAY
        self.db.execute(
            "UPDATE licenses SET activated_at=COALESCE(activated_at,?) WHERE id=?",
            (activated_at, "permanent"),
        )
        self.db.commit()
        _, _, activated, expires, stored_duration = self.row("permanent")
        self.assertEqual(activated, activated_at)
        self.assertIsNone(expires)
        self.assertEqual(stored_duration, -1)

if __name__ == "__main__":
    unittest.main()
