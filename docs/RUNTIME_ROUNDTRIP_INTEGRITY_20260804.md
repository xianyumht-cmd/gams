# Runtime round-trip integrity — 2026-08-04

- Candidate branch: `candidate-script-repeat-20260804`
- Runtime version: `2.0.5-script-repeat-c1`
- Result: `PASS`

## Exact-byte checks

- `bundleSizeMatchesManifest`: `PASS`
- `bundleSha256MatchesManifest`: `PASS`
- `zipEntryOrderExact`: `PASS`
- `zipCrcValid`: `PASS`
- `nonameBytesExact`: `PASS`
- `gameBytesExact`: `PASS`
- `nonameSizeMatchesManifest`: `PASS`
- `nonameSha256MatchesManifest`: `PASS`
- `gameSizeMatchesManifest`: `PASS`
- `gameSha256MatchesManifest`: `PASS`
- `nonameUtf8RoundTripExact`: `PASS`
- `publishedManifestVersionExact`: `PASS`
- `publishedBundleBytesExact`: `PASS`
- `publishedBundleSha256Matches`: `PASS`

## Interpretation

The encrypted bundle was decrypted with the production runtime key, unpacked, and compared byte-for-byte with the exact pre-encryption inputs after applying the release builder's fixed address transformation.

A PASS result excludes silent byte corruption, truncation, encoding conversion, ZIP entry replacement, or published-bundle drift in this candidate release chain.

This check does not by itself prove whether the remaining repeat-execution defect is caused by runtime state/lifecycle behavior or an upstream page-flow change.
