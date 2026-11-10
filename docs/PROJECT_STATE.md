# Verified task state — EdgeOne candidate

- Base: `main` at `6f25a6f32b6ebf5dfc57e06a5612ef372466ec4e`.
- Task branch: `feat/gg-edgeone-license-remote-js-20261111`.
- Added EdgeOne Node API, private Blob provisioning, isolated Android
  `edgeOneTest` build type, candidate-only 1.4.1 HTML compatibility, and a
  manual/branch-triggered GitHub Actions internal-artifact workflow.
- Independent cloud runtime is **not yet deployed**: requires the owner's
  EdgeOne Makers project, a private `GG_TOKEN_SECRET`, API host and private Blob
  provisioning. No actual license/key values are stored in this repository.
- GitHub Actions internal candidate run
  [`42857438084`](https://github.com/xianyumht-cmd/gams/actions/runs/42857438084)
  passed Node license tests, Java HTML compatibility smoke, Android build,
  package/signature/embedded-JS checks and artifact upload. Its output is
  `GG-EdgeOne-internal-2`, a 14-day **Actions artifact**, not a Release.
- The earlier run `42857192391` failed because `android-actions/setup-android`
  attempted an obsolete `sdkmanager tools` package; CI now uses the hosted
  runner's preinstalled Android SDK.
- The candidate APK is currently a **structural build only** unless the owner
  supplies `GG_EDGEONE_BASE_URL`, deploys the independent EdgeOne service and
  provisions private runtime payloads and licenses. Cloud activation, runtime
  injection and Android device acceptance remain **unverified**.
- No formal release or production authorization protocol has changed.
