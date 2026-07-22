# JavaScript maintenance workspace

This branch contains static-analysis tools and generated maintenance documentation for the current `noname.js` and versioned `game.js` baseline.

- Runtime, APK, Worker and release behavior are not modified here.
- Generated reports are written to `docs/js-maintenance/generated/`.
- Run `tools/js_maintenance/analyze_runtime_fast.py analyze` to refresh the baseline.
- Run the `compare` subcommand against two `baseline.json` files to produce an update report.
