# Script repeat candidate user test — 2026-08-04

## Tested packages

### code19

- APK: `GG-2.0.9-script-candidate-code19.apk`
- versionName: `2.0.9-script-candidate`
- versionCode: `19`
- APK SHA-256: `b84f48a39818e468e704f44a0993c856eef8fb61963c9c32edb560e830d1dd5a`

### code20

- APK: `GG-2.0.10-remote-engine-ab-code20.apk`
- versionName: `2.0.10-remote-engine-ab`
- versionCode: `20`
- APK SHA-256: `192f173c6084e34d58a085695ea4b07adc5b00b8879f045656c7eb34f989f020`
- Runtime version: `2.0.6-remote-engine-ab-c1`

## Confirmed device observations

1. Both candidates start without a white screen.
2. The previously observed white-screen regression belongs to a separate client-side change and is not reproduced by the stable-client-based candidates.
3. The first execution succeeds.
4. A second execution fails after approximately 1–3 seconds and returns to the login screen.
5. The failure reproduces both when remaining on the same page and when leaving that page and entering it again.
6. The reusable-callback candidate in code19 did not resolve the failure.
7. Code20, which restored the stable script baseline and changed only the second runtime file delivery path, failed identically.

## Runtime release-chain integrity result

The exact round-trip diagnosis completed successfully:

- The encrypted candidate bundle was decrypted with the configured runtime key.
- ZIP entry names and order were exact.
- Both decrypted files matched the exact pre-encryption inputs byte-for-byte.
- File sizes and SHA-256 values matched the signed manifest.
- UTF-8 conversion of the injected text file was lossless.
- The bundle published through GitHub matched the repository bundle byte-for-byte.
- No silent truncation, encoding conversion, altered line ending, ZIP replacement, download drift or decryption corruption was detected.

The release builder performs a deterministic fixed-address transformation before encryption. The decrypted candidate exactly matches the transformed input. Repository upload, encryption, download and decryption corruption are excluded.

Detailed evidence:

- `docs/RUNTIME_ROUNDTRIP_INTEGRITY_20260804.json`
- `docs/RUNTIME_ROUNDTRIP_INTEGRITY_20260804.md`

## code20 A/B conclusion

The code20 isolation contract was satisfied:

- Stable script baseline was used.
- The unsuccessful code19 callback candidate was not used.
- `MainActivity.java` was unchanged.
- Client runtime host names were unchanged.
- The production default runtime channel was unchanged.
- Only the second runtime file delivery path changed from the application virtual route to the signed remote stable route.
- Remote stable bytes, size and SHA-256 were verified before build.

Because code20 failed identically to code19, the following causes are now excluded:

1. Repository upload corruption.
2. Runtime encryption corruption.
3. Runtime download corruption.
4. Runtime decryption or ZIP extraction corruption.
5. The application virtual-route delivery path as the sole cause.
6. The code19 reusable-callback modification as a valid fix.

## Current leading direction

The repeat-execution defect is now treated as a baseline compatibility problem until disproven. The next investigation must identify the last known repeat-capable file pair and compare version combinations without changing client navigation, runtime hosts, signing, authorization or white-screen-related code.

## Current status

- White-screen regression: isolated and recorded as a separate client issue.
- Startup server-routing regression from code18: not reproduced by code19 or code20 delivery.
- Runtime release-chain byte corruption: excluded.
- Runtime delivery-path difference: excluded as the sole cause by code20.
- Repeat-execution defect: still open and reproducible on code19 and code20.
- Next step: historical version-pair A/B.

## Guardrails

- Do not merge the reusable-callback candidate as a confirmed fix.
- Do not combine the white-screen client change with the repeat-execution investigation.
- Preserve the stable client baseline while diagnosing historical file compatibility.
- Change one version dimension at a time in the next candidates.
