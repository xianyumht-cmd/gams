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

## Current status

- White-screen regression: isolated from this candidate and recorded as a separate client issue.
- Startup server-routing regression from code18: not reproduced by the code19 delivery route.
- Runtime release-chain byte corruption: excluded by exact round-trip verification.
- Repeat-execution defect: still open and reproducible.

## Required next checks

1. Compare the last known repeat-capable delivery baseline with the current runtime while keeping the same script and engine bytes.
2. Build an A/B diagnostic that changes only the runtime loading path, without changing client navigation or white-screen-related code.
3. If both loading paths fail identically, treat an upstream page-flow change or baseline incompatibility as the leading cause.
4. If only the current loading path fails, continue tracing runtime lifecycle and reinjection state.

## Guardrails

- Do not merge the reusable-callback candidate as a confirmed fix.
- Do not combine the white-screen client change with the repeat-execution investigation.
- Preserve the stable client baseline while diagnosing the runtime chain.
