#!/usr/bin/env python3
"""GG APK release gate: fail closed on identity, signing or binary-contract drift.

This checks *packaging facts*, not whether runtime heuristics are unbypassable.
Use an actual Android device to accept final vendor-protected/signature bytes.
"""
import argparse
import hashlib
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import zipfile

OFFICIAL_CERT = "70608347ee8cc3cd72e7dc70c504013e261c9a2fee9850539219cda519c87f34"
ABIS = ("arm64-v8a", "armeabi-v7a", "x86_64")


def fail(message):
    raise SystemExit("GG-APK-GATE FAIL: " + message)


def required_tool(name):
    path = shutil.which(name)
    if path:
        return path
    sdk = os.environ.get("ANDROID_HOME") or os.environ.get("ANDROID_SDK_ROOT")
    if sdk:
        directories = sorted((Path(sdk) / "build-tools").glob("*"), reverse=True)
        for directory in directories:
            candidate = directory / name
            if candidate.is_file():
                return str(candidate)
    fail("required Android build tool unavailable: " + name)


def command(args, allowed=(0,)):
    result = subprocess.run(args, stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT, text=True, errors="replace")
    if result.returncode not in allowed:
        fail("tool failed: " + str(args[0]) + " (exit " + str(result.returncode) + ")")
    return result


def source_contract():
    # Be explicit: the original main source set must not silently replace the C++ client.
    root = Path(__file__).resolve().parent.parent
    gradle = (root / "v2/android/clientNative/build.gradle.kts").read_text()
    activity = (root / "v2/android/client/src/main/java/com/jinli/ggsecure/MainActivity.java").read_text()
    policy = (root / "v2/android/client/src/main/java/com/jinli/ggsecure/ProductionSecurityPolicy.java").read_text()
    manifest = (root / "v2/android/client/src/main/AndroidManifest.xml").read_text()
    checks = {
        "dedicated production build type": 'buildTypes.create("production")' in gradle,
        "production profile enabled": 'buildConfigField("boolean", "GG_PRODUCTION_PROTECTION", "true")' in gradle,
        "production not Gradle-signed": "signingConfig = null" in gradle,
        "R8 enabled": "isMinifyEnabled = true" in gradle,
        "resource shrink enabled": "isShrinkResources = true" in gradle,
        "entrypoint guard": activity.count("ProductionSecurityPolicy.apply(this)") >= 2,
        "screenshot guard": "FLAG_SECURE" in policy,
        "debug detection": "Debug.isDebuggerConnected()" in policy,
        "root detection": "/system/bin/su" in policy,
        "virtual-device detection": "isEmulator()" in policy,
        "hook detection": "isHooked()" in policy,
        "debuggable controlled by build type": 'android:debuggable="false"' not in manifest,
    }
    for name, passed in checks.items():
        if not passed:
            fail("missing source contract: " + name)


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apk", type=Path, required=True)
    parser.add_argument("--mode", choices=("debug", "production-unsigned",
                                           "production-signed"), required=True)
    parser.add_argument("--package", required=True)
    parser.add_argument("--version-code", type=int, required=True)
    parser.add_argument("--version-name", required=True)
    parser.add_argument("--mapping", type=Path)
    parser.add_argument("--expected-cert")
    args = parser.parse_args()
    if not re.fullmatch(r"[a-zA-Z][a-zA-Z0-9_.]+", args.package):
        fail("missing/invalid expected application ID")
    if args.version_code < 1 or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,80}", args.version_name):
        fail("missing/invalid expected APK version")
    if args.mode == "production-signed":
        if args.expected_cert is None or not re.fullmatch(r"[0-9a-fA-F]{64}", args.expected_cert):
            fail("signed production requires exact expected signer fingerprint")
        if args.expected_cert.lower() != OFFICIAL_CERT:
            fail("requested signer is not the pinned GG official certificate")
    elif args.expected_cert:
        fail("signer expectation is only permitted for signed production")
    if args.mode.startswith("production"):
        if args.mode == "production-unsigned":
            if not args.mapping or not args.mapping.is_file() or args.mapping.stat().st_size == 0:
                fail("production R8 mapping is missing")
        source_contract()
    return args


def main():
    args = parse_args()
    if not args.apk.is_file() or args.apk.stat().st_size < 1024:
        fail("APK missing or unexpectedly small")
    try:
        with zipfile.ZipFile(args.apk) as apk:
            if apk.testzip() is not None:
                fail("APK ZIP CRC mismatch")
            names = set(apk.namelist())
            if "AndroidManifest.xml" not in names or "classes.dex" not in names:
                fail("not an Android APK (missing manifest/dex)")
            for abi in ABIS:
                if "lib/" + abi + "/libggnative.so" not in names:
                    fail("missing native runtime for ABI " + abi)
            for name in names:
                short = name.lower()
                if short.startswith("assets/") and (
                    re.search(r"(^|/)(noname|game)([._-][^/]*)?\.js$", short)
                    or short.endswith(".ggenc")
                    or short.endswith("/bundle.zip")
                ):
                    fail("private runtime asset packaged: " + name)
    except (OSError, zipfile.BadZipFile, RuntimeError) as error:
        fail("APK ZIP invalid: " + str(error))

    aapt = required_tool("aapt")
    apksigner = required_tool("apksigner")
    badging = command([aapt, "dump", "badging", str(args.apk)]).stdout
    match = re.search(r"package: name='([^']+)' versionCode='([^']+)' versionName='([^']+)'", badging)
    if not match or tuple(match.groups()) != (
        args.package, str(args.version_code), args.version_name
    ):
        fail("package/version mismatch")
    if args.mode == "debug" and "application-debuggable" not in badging:
        fail("development APK is not debuggable")
    if args.mode != "debug" and "application-debuggable" in badging:
        fail("production APK must not be debuggable")

    verify = subprocess.run([apksigner, "verify", "--min-sdk-version", "24",
                             "--verbose", "--print-certs", str(args.apk)],
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                            text=True, errors="replace")
    if args.mode == "production-unsigned":
        if verify.returncode == 0:
            fail("unsigned production candidate is unexpectedly signed")
    else:
        if verify.returncode != 0:
            fail("APK signature verification failed")
        digests = re.findall(r"certificate SHA-256 digest:\s*([0-9a-fA-F]{64})",
                             verify.stdout, re.IGNORECASE)
        if not digests:
            fail("apksigner returned no certificate digest")
        if args.mode == "debug":
            if OFFICIAL_CERT in [d.lower() for d in digests]:
                fail("development APK must not use the official key")
        elif len(digests) != 1 or digests[0].lower() != args.expected_cert.lower():
            fail("unexpected or multiple APK signers")
        if args.mode == "production-signed":
            if "Verified using v2 scheme (APK Signature Scheme v2): true" not in verify.stdout:
                fail("APK v2 signature not verified")
            if "Verified using v3 scheme (APK Signature Scheme v3): true" not in verify.stdout:
                fail("APK v3 signature not verified")
    digest = hashlib.sha256(args.apk.read_bytes()).hexdigest()
    print("GG-APK-GATE PASS")
    print("profile=" + args.mode)
    print("package=" + args.package)
    print("version=" + str(args.version_code) + "/" + args.version_name)
    print("sha256=" + digest)
    if args.mode == "production-signed":
        print("signer_sha256=" + args.expected_cert.lower())


if __name__ == "__main__":
    main()
