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
7. No conclusion is made yet about whether the failure is caused by an upstream page-flow change or by the repository packaging/encryption/decryption/runtime-loading chain.

## Current status

- White-screen regression: isolated from this candidate and recorded as a separate client issue.
- Startup server-routing regression from code18: not reproduced by the code19 delivery route.
- Repeat-execution defect: still open and reproducible.

## Required next checks

1. Perform an exact byte-for-byte round-trip check from repository plaintext input through encrypted release generation and decryption back to runtime plaintext.
2. Compare source size, SHA-256, byte length, separator boundaries and load order before and after the release chain.
3. Compare the last known repeat-capable baseline with the current runtime without changing client navigation or white-screen-related code.
4. Only after release-chain integrity is proven should the investigation attribute the defect to an upstream page-flow change.

## Guardrails

- Do not merge the reusable-callback candidate as a confirmed fix.
- Do not combine the white-screen client change with the repeat-execution investigation.
- Preserve the stable client baseline while diagnosing the runtime chain.
