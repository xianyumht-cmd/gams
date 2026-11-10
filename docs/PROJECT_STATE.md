# Verified task state — EdgeOne candidate

- Base: `main` at `6f25a6f32b6ebf5dfc57e06a5612ef372466ec4e`.
- Task branch: `feat/gg-edgeone-license-remote-js-20261111`.
- Added EdgeOne Node API, private Blob provisioning, isolated Android
  `edgeOneTest` build type, candidate-only 1.4.1 HTML compatibility, and a
  manual/branch-triggered GitHub Actions internal-artifact workflow.
- Owner has deployed an independent Makers project named `gg-license-api`
  (`makers-v0q1urwnypkn`) and reported receiving
  `{ "ok": true, "service": "gg-edgeone-internal" }` from the API health
  route, including its `https://gg-api.xn--8pv109c.top` custom domain.
  This is **owner-reported live evidence**, not independent integration testing.
  The owner subsequently reported successful private Blob upload for the
  `1.4.1-1.0.41` pair and creation of a 30-day test key via the local helper.
  Real Android activation remains pending.
- GitHub Actions internal candidate run
  [`42857438084`](https://github.com/xianyumht-cmd/gams/actions/runs/42857438084)
  passed Node license tests, Java HTML compatibility smoke, Android build,
  package/signature/embedded-JS checks and artifact upload. Its output is
  `GG-EdgeOne-internal-2`, a 14-day **Actions artifact**, not a Release.
- The earlier run `42857192391` failed because `android-actions/setup-android`
  attempted an obsolete `sdkmanager tools` package; CI now uses the hosted
  runner's preinstalled Android SDK.
- The early APK is a **structural build only**, generated before the private
  upload and without a configured URL. The candidate workflow now defaults to
  `https://gg-api.xn--8pv109c.top` and supports optional overrides; rebuild
  in Actions before device testing. `GG-EdgeOne-Upload.cmd` provides a local
  Windows onboarding path for the confirmed `1.4.1-1.0.41` pair. Cloud activation,
  runtime injection and Android device acceptance remain **unverified**.
- No formal release or production authorization protocol has changed.
