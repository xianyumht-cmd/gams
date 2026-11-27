#!/usr/bin/env python3
"""Negative release-gate tests that do not require an installed Android SDK."""
import pathlib
import subprocess
import sys
import tempfile
import unittest
import zipfile

GATE = pathlib.Path(__file__).with_name("verify-gg-apk.py")


class GateNegativeTests(unittest.TestCase):
    def call(self, apk, *additional):
        return subprocess.run([sys.executable, str(GATE), "--apk", str(apk),
             "--mode", "production-signed", "--package", "com.jinli.quickweb.edgeonecpp",
             "--version-code", "20001", "--version-name", "3.2.0-security",
             *additional], capture_output=True, text=True)

    def test_missing_certificate_fails(self):
        with tempfile.TemporaryDirectory() as temp:
            apk = pathlib.Path(temp, "fake.apk")
            apk.write_bytes(b"test")
            self.assertNotEqual(0, self.call(apk).returncode)
            self.assertIn("requires exact expected signer", self.call(apk).stderr)

    def test_wrong_certificate_fails(self):
        with tempfile.TemporaryDirectory() as temp:
            apk = pathlib.Path(temp, "fake.apk")
            apk.write_bytes(b"x" * 1024)
            result = self.call(apk, "--expected-cert", "0" * 64)
            self.assertNotEqual(0, result.returncode)
            self.assertIn("not the pinned", result.stderr)

    def test_corrupted_apk_fails(self):
        with tempfile.TemporaryDirectory() as temp:
            apk = pathlib.Path(temp, "fake.apk")
            apk.write_bytes(b"0" * 2048)
            result = subprocess.run([sys.executable, str(GATE), "--apk", str(apk),
                  "--mode", "debug", "--package", "com.jinli.quickweb.edgeonecpp.debug",
                  "--version-code", "20001", "--version-name", "3.2.0-security-debug"],
                  capture_output=True, text=True)
            self.assertNotEqual(0, result.returncode)
            self.assertIn("APK ZIP invalid", result.stderr)

    def test_non_apk_zip_fails(self):
        with tempfile.TemporaryDirectory() as temp:
            apk = pathlib.Path(temp, "fake.apk")
            with zipfile.ZipFile(apk, "w") as output:
                output.writestr("random.txt", "x" * 2048)
            result = subprocess.run([sys.executable, str(GATE), "--apk", str(apk),
                  "--mode", "debug", "--package", "com.jinli.quickweb.edgeonecpp.debug",
                  "--version-code", "20001", "--version-name", "3.2.0-security-debug"],
                  capture_output=True, text=True)
            self.assertNotEqual(0, result.returncode)
            self.assertIn("not an Android APK", result.stderr)

    def test_unsigned_requires_mapping(self):
        with tempfile.TemporaryDirectory() as temp:
            apk = pathlib.Path(temp, "fake.apk")
            apk.write_bytes(b"x" * 2048)
            result = subprocess.run([sys.executable, str(GATE), "--apk", str(apk),
                  "--mode", "production-unsigned",
                  "--package", "com.jinli.quickweb.edgeonecpp",
                  "--version-code", "20001", "--version-name", "3.2.0-security"],
                  capture_output=True, text=True)
            self.assertNotEqual(0, result.returncode)
            self.assertIn("mapping is missing", result.stderr)


if __name__ == "__main__":
    unittest.main()
