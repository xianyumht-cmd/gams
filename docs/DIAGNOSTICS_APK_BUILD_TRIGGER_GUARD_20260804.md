# Diagnostics-only APK build trigger guard — 2026-08-04

Commit `3ce180958663bd763a2bccd948928be15e3b99cd` updates `.github/workflows/build-apk.yml` so diagnostics-only changes do not trigger the generic Android build.

Ignored paths are limited to:

- `docs/**`;
- `scripts/run_latest_page_lifecycle_request_trace.mjs`;
- `scripts/review_latest_page_lifecycle_request_trace.py`;
- `.github/workflows/trace-latest-page-lifecycle-request.yml`;
- `.github/workflows/run-latest-page-lifecycle-trace.yml`;
- `.github/workflows/build-apk.yml` itself.

Normal client, manager, backend, payload and patch changes remain eligible for the existing push and pull-request build.

This guard was added after diagnostics pull request `#27` triggered generic build run `30923548662`. That pull request was closed without merge. Its generic artifacts were not released, deployed or selected as a compatibility candidate.
