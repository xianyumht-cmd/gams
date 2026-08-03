# Script repeat candidate user test — 2026-08-04

## Tested package

- APK: `GG-2.0.9-script-candidate-code19.apk`
- versionName: `2.0.9-script-candidate`
- versionCode: `19`
- APK SHA-256: `b84f48a39818e468e704f44a0993c856eef8fb61963c9c32edb560e830d1dd5a`

## Confirmed observations

1. The candidate starts without a white screen.
2. This confirms that the previously observed white-screen regression belongs to a separate client-side change and is not reproduced by the current stable-client-based script candidate.
3. The first execution succeeds.
4. A second execution still fails after approximately 1–3 seconds and returns to the login screen.
5. The failure reproduces both when remaining on the same target page and when leaving that page and entering it again.
6. The reusable callback candidate did not resolve the repeat-execution failure.

## Runtime release-chain integrity result

The exact round-trip diagnosis completed successfully:

- The encrypted candidate bundle was decrypted with the configured runtime key.
- ZIP entry names and order were exact.
- Both decrypted files matched the exact pre-encryption inputs byte-for-byte.
- File sizes and SHA-256 values matched the signed manifest.
- UTF-8 conversion of the injected text file was lossless.
- The bundle published through GitHub matched the repository bundle byte-for-byte.
- No silent truncation, encoding conversion, altered line ending, ZIP replacement, download drift or decryption corruption was detected.

The release builder performs a deterministic fixed-address transformation before encryption. The decrypted candidate exactly matches the transformed input. Therefore, repository upload, encryption, download and decryption corruption are excluded as the cause of the repeat-execution defect. The remaining diagnosis must distinguish between runtime loading/lifecycle differences and an upstream page-flow change.

Detailed evidence:

- `docs/RUNTIME_ROUNDTRIP_INTEGRITY_20260804.json`
- `docs/RUNTIME_ROUNDTRIP_INTEGRITY_20260804.md`

## A/B candidate prepared

A controlled A/B package has been built:

- APK: `GG-2.0.10-remote-engine-ab-code20.apk`
- versionName: `2.0.10-remote-engine-ab`
- versionCode: `20`
- APK SHA-256: `192f173c6084e34d58a085695ea4b07adc5b00b8879f045656c7eb34f989f020`
- Runtime version: `2.0.6-remote-engine-ab-c1`

Isolation contract:

- Uses the stable script baseline rather than the unsuccessful reusable-callback candidate.
- Keeps `MainActivity.java` unchanged.
- Keeps client runtime host names unchanged.
- Keeps the production default runtime channel unchanged.
- Changes only the second runtime file's delivery path from the application virtual route to the signed remote stable route.
- Remote stable bytes, size and SHA-256 were verified before the APK was built.

Interpretation of the next user test:

- If code20 restores repeat execution, continue diagnosis in the application virtual-route and runtime lifecycle layer.
- If code20 fails identically, runtime encryption/decryption and the virtual-route delivery difference are excluded; upstream page-flow change or baseline incompatibility becomes the leading direction.

Detailed status:

- `docs/REMOTE_ENGINE_AB_CANDIDATE_STATUS.json`

## Current status

- White-screen regression: isolated from this candidate and recorded as a separate client issue.
- Startup server-routing regression from code18: not reproduced by the code19 delivery route.
- Runtime release-chain byte corruption: excluded by exact round-trip verification.
- Remote-engine A/B candidate: built and ready for device testing.
- Repeat-execution defect: still open and reproducible on code19.

## Guardrails

- Do not merge the reusable-callback candidate as a confirmed fix.
- Do not combine the white-screen client change with the repeat-execution investigation.
- Preserve the stable client baseline while diagnosing the runtime chain.
