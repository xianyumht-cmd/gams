# JavaScript maintenance workspace

This branch contains static-analysis tools and generated maintenance documentation for the current `noname.js` and versioned `game.js` baseline.

- Runtime, APK, Worker and release behavior are not modified here.
- Generated reports are written to `docs/js-maintenance/generated/`.
- Run `tools/js_maintenance/analyze_runtime_fast.py analyze` to refresh the direct baseline.
- Run `tools/js_maintenance/refine_obfuscated_anchors.py` to reconstruct simple string concatenations and improve SAL, field and URL coverage.
- Run the `compare` subcommand against two `baseline.json` files to produce an update report.
- Generated documentation distinguishes direct extraction from reconstructed-anchor extraction and records current coverage limits.
