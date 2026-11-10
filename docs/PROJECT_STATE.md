# Verified task state — EdgeOne candidate

- Base: `main` at `6f25a6f32b6ebf5dfc57e06a5612ef372466ec4e`.
- Task branch: `feat/gg-edgeone-license-remote-js-20261111`.
- In the current working branch, a **not-yet-deployed** EdgeOne runtime v2
  enhancement adds per-download ephemeral P-256 ECDH / HKDF / AES-GCM delivery,
  per-device replay receipts, staged backward compatibility and an opt-in
  `GG_REQUIRE_RUNTIME_V2=1` strict mode. New Node tests reproduce and reject
  sequential reuse of an identical proof and validate the encrypted response;
  the local Node suite passes. Cross-language Java crypto CI, Android build,
  Makers deployment, encrypted on-device startup and strict-mode rollout are
  **pending** at this point. The private Blob SDK has no atomic conditional
  write, so simultaneous duplicate requests remain a known limitation.
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
  During the first device attempt, `/api/runtime` returned an apparent HTTP
  200 but Makers logged a 30,000 ms Cloud Functions execution followed by
  `ReverseProxy read error during body copy: context deadline exceeded`.
  That is **owner-supplied server evidence** of an incomplete runtime transfer;
  successful Android runtime installation remains unverified.
- GitHub Actions internal candidate run
  [`42871796349`](https://github.com/xianyumht-cmd/gams/actions/runs/42871796349)
  passed Node license tests, Java HTML compatibility smoke, Android build,
  package/signature/embedded-JS checks and artifact upload. The configured
  output was `GG-EdgeOne-internal-4`, a 14-day **Actions artifact**, not a Release.
- The earlier run `42857192391` failed because `android-actions/setup-android`
  attempted an obsolete `sdkmanager tools` package; CI now uses the hosted
  runner's preinstalled Android SDK.
- The first configured device build encountered the 30-second default Cloud
  Functions timeout while delivering a 4.98 MB ZIP. The candidate now proposes
  `cloudFunctions.nodejs.maxDuration=120` via project-root `edgeone.json`,
  increases only the Android runtime read timeout to 135 seconds, and logs
  unexpected candidate startup exceptions. GitHub Actions internal run
  [`42875890765`](https://github.com/xianyumht-cmd/gams/actions/runs/42875890765)
  built `GG-EdgeOne-internal-5` successfully, validating the duration config,
  Android build, APK identity/signature and absence of bundled JS. Its downloaded
  artifact also passed ZIP and SHA256 checks. The Makers deployment of the
  120-second config and on-device complete transfer still require verification;
  do not yet claim the startup timeout is fixed. Cloud activation,
  runtime injection and Android device acceptance remain **unverified**.
- No formal release or production authorization protocol has changed.
- A browser administration panel is added to the same internal test branch at
  `/api/admin`. It enables password login, listing cards, generation, device
  unbinding, suspension and restoration via private Blob, with no browser-side
  EdgeOne API Token. Local Node admin/security tests pass, but deployment,
  login and live Blob operations await Makers configuration of the new
  `GG_ADMIN_PASSWORD` environment variable and a fresh deployment. Do not
  claim the dashboard is live before those checks are performed.
- The owner subsequently confirmed the administrator login page deployed and
  both required environment variables configured, but the first login failed
  with `请求来源校验失败` (`bad_origin`). A narrow Origin-allowlist fix for the
  public custom domain and assigned deployment hostname passed local Node
  regression tests. Successful live login and card unbind still require a
  fresh Makers deployment and owner verification.
- On 2026-11-11 the owner reported that the GG EdgeOne internal APK could
  complete activation and launch normally on their test device. This
  owner-reported end-to-end acceptance supersedes the earlier pending-startup
  status above, but does not constitute a production release acceptance.
  The next candidate now includes a common `正在初始化中…` progress bar for first
  activation and saved-license restart, driven by actual ZIP transfer bytes
  (indeterminate while waiting, maximum 90% before validation/WebView setup).
  A standalone Java transfer smoke check has been added to CI. GitHub Actions
  run [`42889209803`](https://github.com/xianyumht-cmd/gams/actions/runs/42889209803)
  completed successfully for code commit `a31d01a`, including Node auth tests,
  Java HTML/ZIP progress smokes, Android lint/assemble, APK identity, signing
  and absence of bundled JS. The 14-day internal-only artifact is
  `GG-EdgeOne-internal-8` (artifact ID `13797482921`). The new initialization
  UI still needs owner on-device verification; no formal release was created.
