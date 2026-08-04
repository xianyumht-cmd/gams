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

### code21

- APK: `GG-2.0.11-game-baseline-ab-code21.apk`
- versionName: `2.0.11-game-baseline-ab`
- versionCode: `21`
- APK SHA-256: `a0cb05a774de0f2aa7abf69369520c9385e4f3448cb8063e7f676286bdf12cf7`
- Runtime version: `2.0.7-game-baseline-ab-c1`
- Version pair: first file `1.1.4`, second file `1.0.2`

## Confirmed device observations

1. Code19, code20 and code21 start without a white screen.
2. The previously observed white-screen regression belongs to a separate client-side change and is not reproduced by these stable-client-based candidates.
3. The first execution succeeds.
4. A second execution fails after approximately 1–3 seconds and returns to the login screen.
5. The failure reproduces both when remaining on the same page and when leaving that page and entering it again.
6. The reusable-callback candidate in code19 did not resolve the failure.
7. Code20, which restored the stable script baseline and changed only the second runtime file delivery path, failed identically.
8. Code21, which changed only the second file version from `1.0.5` to `1.0.2`, also failed identically.

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

Because code20 failed identically to code19, the application virtual-route delivery path is excluded as the sole cause.

## code21 A/B conclusion

The code21 isolation contract was satisfied:

- The first file remained on stable version `1.1.4`.
- Only the second file changed from version `1.0.5` to historical version `1.0.2`.
- Historical file size and SHA-256 were verified before build.
- The encrypted release was decrypted and compared with its exact inputs.
- `MainActivity.java`, client runtime hosts and the production default channel were unchanged.

Because code21 failed identically, the second file version is now substantially deprioritized. The next candidate must test the complete preserved historical pair rather than another second-file-only variation.

## Excluded causes

1. Repository upload corruption.
2. Runtime encryption corruption.
3. Runtime download corruption.
4. Runtime decryption or ZIP extraction corruption.
5. The application virtual-route delivery path as the sole cause.
6. The code19 reusable-callback modification as a valid fix.
7. The second file change from `1.0.5` back to `1.0.2` as a standalone fix.

## Next controlled candidate

Build code22 with the complete historical pair:

- First file: `1.1.1`
- Second file: `1.0.2`

The candidate must retain the stable Android client baseline and must not change navigation, runtime hosts, authorization, signing or white-screen-related code.

Interpretation:

- If code22 restores repeat execution, the regression is within first-file changes after `1.1.1`, and later testing should narrow that version interval.
- If code22 still fails identically, both preserved file baselines are no longer sufficient against the current page flow; upstream flow change becomes the dominant conclusion and diagnosis must move to current runtime observations rather than historical version rollback.

## Current status

- White-screen regression: isolated and recorded as a separate client issue.
- Startup server-routing regression from code18: not reproduced by code19 through code21.
- Runtime release-chain byte corruption: excluded.
- Runtime delivery-path difference: excluded as the sole cause by code20.
- Second file version `1.0.5` versus `1.0.2`: deprioritized by code21.
- Repeat-execution defect: still open and reproducible on code19, code20 and code21.
- Next step: complete historical pair `1.1.1 + 1.0.2`.

## Guardrails

- Do not merge the reusable-callback candidate as a confirmed fix.
- Do not combine the white-screen client change with the repeat-execution investigation.
- Preserve the stable client baseline while diagnosing historical file compatibility.
- Do not change any client dimension other than the candidate protocol version and package version required to select the isolated runtime channel.
