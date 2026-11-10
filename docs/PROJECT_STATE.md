# Verified task state — EdgeOne candidate

## 2026-11-11: Isolated Android C++ core migration (in progress)

- **Eleventh increment awaiting CI:** The native Android candidate now
  performs additional pure WebView/lifecycle decisions in C++: five-minute
  background return reinitialization, HTTP(S)-versus-system external URL
  routing, the two recognized document-start hosts, and the exact
  `脚本加载完成~` alert suppression rule (including U+FF5E replacement and
  Java-style UTF-16 trimming). C++ reproduces Java `long` subtraction's
  wraparound comparison for the background timer. Java still executes Android
  lifecycle, Intent, WebView and UI operations; the Java-only reference keeps
  its original decisions. Local C++ sanitizer and all ten EdgeOne Node tests
  passed. Actual Java→JNI/Android build checks are pending GitHub Actions;
  device behavior is still unverified by the owner's request.

- **Tenth increment verified by CI:** The separate C++ Android candidate now
  decides WebView resource routes (native `game.js`, disabled legacy official
  engine, forbidden GitHub core, or `1.4.1` main-frame HTML rewrite), including
  version-gated direct-engine mode. C++ also wraps the resident control script
  for document-start injection using the original Java wrapper bytes. Android
  still parses the request URI and headers, owns the WebView response and
  injection APIs, and the Java-only reference retains its old routing and
  script wrapper. C++ sanitizer test and the ten Node API tests passed
  locally. GitHub Actions
  [`42924722960`](https://github.com/xianyumht-cmd/gams/actions/runs/42924722960)
  passed actual Java→JNI script-wrapper and routing fixtures, Android NDK
  and Java reference builds, lint, all three ABIs, signing and no-private-JS
  packaging checks. The 14-day artifact `GG-EdgeOne-CPP-internal-10`
  (ID `13812973948`) contains APK SHA-256
  `c3c6576e3b85ed12aaf33871490660af5cc566e9d47dd064b10b25b6d1b6c8c3`.
  Device WebView routing and injection behavior remain unverified by request.

- **Ninth increment verified by CI:** The isolated C++ candidate now performs
  the `1.4.1` EdgeOne HTML compatibility rewrite directly against its resident
  native control-script bytes: ordered `about:blank` call/href replacements,
  `sha384` SRI removal, first `<head>` insertion, and escaping embedded
  `</script` sequences. `RuntimePayload.rewriteHtml()` synchronizes native
  handle use with `wipe()`; the Java-only reference continues to use its
  original `EdgeOneHtmlCompatibility.rewrite()`. Android retains the existing
  bounded gzip/HTML input reader, HTTPS/Cookie handling, and WebView response
  creation. Host C++ sanitizer tests, all ten Node API tests and GitHub
  Actions [`42922732974`](https://github.com/xianyumht-cmd/gams/actions/runs/42922732974)
  passed the real Java→JNI byte-for-byte reference fixture, native and Java
  baseline Android builds, lint, three ABIs, APK signing and no-private-JS
  packaging. The 14-day Actions artifact `GG-EdgeOne-CPP-internal-9`
  (ID `13812168341`) contains APK SHA-256
  `e33324d868ba2b381620e8faf0fc5eeb4cf82bcf5edea0d5c772eacdc057ebfc`.
  No device testing was requested; HTML/navigation behavior on a device
  remains unverified.

- **Eighth increment verified by CI:** C++ now classifies the
  post-authorization startup presentation (`activation form`, `WebView`, or
  `mandatory update`) and computes actual-byte initialization progress from
  0 to 90% using overflow-safe arithmetic. The Java Android UI remains the
  presentation adapter; both initial key activation and saved-card startup now
  use the same result policy. The manual activation path previously returned
  to the card form without an update dialog when `forceUpdate` was required;
  it now shows the same mandatory update dialog as saved-card startup. Any
  unexpected payload on a non-browser result is wiped. The Java-only app uses
  equivalent local decisions and its original `RuntimeZipReader.displayPercent`.
  Host C++ sanitizer tests and ten Node tests passed. GitHub Actions
  [`42920817856`](https://github.com/xianyumht-cmd/gams/actions/runs/42920817856)
  passed the actual Java→JNI startup and progress parity fixture, both
  Android builds, lint, APK signing, three ABIs and the no-private-JS check.
  The 14-day artifact `GG-EdgeOne-CPP-internal-8` (ID `13812330939`)
  contains APK SHA-256
  `6e27dec02f5fee072ed4b5e2a9c27d978db0f732d7e8dae814e5e36e2efee9d6`.
  On-device startup/update behavior remains unverified at the owner's request.

- **Seventh increment verified by CI:** native candidate runtime-v2
  ciphertext now streams through a dedicated C++ exact-length transfer buffer
  rather than Java `ByteArrayOutputStream`. C++ validates declared maximum,
  bounds each JNI append to 8192 bytes, rejects trailing or missing bytes,
  and clears its ciphertext buffer on exit. Java retains Android HTTPS,
  the existing received-byte progress callback, system JCA AES-GCM, and
  WebView injection. The Java reference retains `RuntimeZipReader` unchanged.
  A new Java→JNI test covers complete, truncated, oversized and invalid-source
  transfers. Local C++ sanitizer checks and ten Node API tests passed.
  GitHub Actions
  [`42918661930`](https://github.com/xianyumht-cmd/gams/actions/runs/42918661930)
  passed the real JNI fixture, C++ parity, both Android builds, lint, APK
  signing, all three native ABIs and the no-private-JS package check.
  The 14-day artifact `GG-EdgeOne-CPP-internal-7` (ID `13809204790`)
  contains APK SHA-256
  `70b22fda26627a353b38422f49b7346869eba35c7bf097f91b7429ea4e9341d5`.
  On-device parity remains unverified at the owner's request.

- **Sixth increment verified by CI:** the C++ candidate no longer
  copies the entire `game.js` engine to a Java `byte[]` for each intercepted
  WebView request. A bounded JNI range reader (maximum 64 KiB per native
  call) feeds a Java `InputStream` in 16 KiB chunks, with independent read
  cursors for parallel resource requests. Reads and native-handle deletion
  synchronize on the owning `RuntimePayload`; after logout/reload a pending
  stream reports `IOException` instead of accessing freed native memory.
  WebView's resource-response creation now pairs length and stream creation
  under the same lock and returns HTTP 503 if teardown won the race. Java-only
  payload parsing remains unchanged. C++ host sanitizer checks and ten Node
  API tests passed locally. GitHub Actions
  [`42915193572`](https://github.com/xianyumht-cmd/gams/actions/runs/42915193572)
  passed the real JVM→JNI chunked-stream fixture, C++ core parity tests,
  native and Java-reference Android builds, lint, three native ABIs, APK
  signing, and the no-private-JS packaging check. The 14-day internal
  artifact `GG-EdgeOne-CPP-internal-6` (ID `13808877931`) contains APK
  SHA-256 `0ef7f646444066b302d32a79527619d3e072d72f45a5c8e8b0cb140a64d7cfe7`.
  Real-device parity remains unverified at the owner's request.

- **Fifth increment verified by CI:** the native candidate now
  normalizes typed and saved license keys with the same ASCII-hex filter as
  the Java baseline, then makes the initial activation-versus-check decision
  for manual and saved-card launches. Its existing C++ recovery policy still
  reactivates only for `bad_session` or `device_unbound`. C++ now also gates
  post-authorization runtime download when an update is mandatory: the
  candidate saves the refreshed authorization but does not request/decrypt
  private JS if the server requires a higher client version. Android Java
  retains secure preferences, networking, the single-thread executor,
  initialization progress and WebView. Local C++ sanitizer smoke and all ten
  Node API tests passed. GitHub Actions
  [`42910264189`](https://github.com/xianyumht-cmd/gams/actions/runs/42910264189)
  also passed actual Java→JNI startup/update policy cases, Node crypto
  interoperability, native + Java reference Android builds, lint, three
  native ABIs, APK signing and the no-private-JS/ZIP packaging check. The
  internal 14-day artifact `GG-EdgeOne-CPP-internal-5` (ID `13808110144`)
  contains APK SHA-256
  `44d5483728dfd7ef125f739f06a633f55b8dde6c756012301915c2a6841c2f2a`.
  Real-device parity is still unverified at the owner's request.

- **Fourth increment verified by CI:** C++ now owns successful
  authorization response classification, session-token shape validation, and
  encrypted-runtime delivery header/manifest bounds (delivery version, strict
  base64 key/IV, archive and entry sizes, and matching SHA-256 fields).
  The candidate validates these before persisting the token or reading the
  encrypted response; its existing Java HTTPS/JSON/JCA adapters still handle
  platform interfaces. Tests add native rejected-response/envelope cases and
  actual Java→JNI error propagation. Local C++ sanitizer smoke and all ten
  Node EdgeOne API tests passed. GitHub Actions run
  [`42908690497`](https://github.com/xianyumht-cmd/gams/actions/runs/42908690497)
  also passed host C++/JNI/crypto tests, Android native and Java reference
  builds, Android lint, APK signing, all three native ABIs, and checks for
  absent private JS/ZIP. Its 14-day Actions artifact is
  `GG-EdgeOne-CPP-internal-4` (ID `13805314620`), APK SHA-256
  `070dd4b10b7cf4b3a062d4073c1479613cf7087b1713c7ee61fa0a6ff41343d8`.
  On-device parity remains **unverified** because the owner deferred manual
  tests.

- **Third native increment verified by CI:** for the isolated
  `:clientNative` app, C++ now controls the complete EdgeOne signed JSON
  request shape (activate/check/unbind/runtime-v2), the saved-license
  activation-versus-check policy, and recoverable invalid-session decisions.
  Android Java retains Keystore signing and the system HTTPS transport.
  An invalid locally saved session is reactivated rather than rejected at
  the new native serialization boundary. The C++ ZIP decoder also validates
  the signed manifest's **whole-archive SHA-256** during its existing parse,
  letting the native candidate avoid a second Java SHA-256 pass; the Java
  baseline remains unchanged. GitHub Actions run
  [`42906657086`](https://github.com/xianyumht-cmd/gams/actions/runs/42906657086)
  passed C++ sanitizer/Node protocol tests, actual JVM→JNI→native request/
  ZIP/HKDF validation, Node→Java AES-GCM interop, Android NDK and Java
  reference builds, lint, three ABI presence, APK identity/signing and no
  private JS/ZIP checks. The 14-day Actions artifact is
  `GG-EdgeOne-CPP-internal-3` (ID `13804643537`); its APK SHA-256 is
  `9ba4989f6d9fb1b9aa5218781b14d84f1702d3bf6b45ff3b9638cec9500829ce`.
  No on-device testing was requested, so device behavior remains unverified.

- The second native increment moves EdgeOne request-proof canonicalization,
  SHA-256 of its signed material, and the runtime AES-256-GCM HKDF-SHA256
  key/AAD derivation into C++. The existing Android Keystore, JCA ephemeral
  P-256 ECDH and AES-GCM provider remain the OS-facing crypto boundary.
  The HTTP protocol, server, Android UI and WebView injection are unchanged.
  Independent Node/C++ host proof/HKDF vectors match. A newly added CI test
  exercises the **real JNI bridge** plus Node→Java→native-HKDF→AES-GCM
  decrypt to catch cross-language regressions. GitHub Actions run
  [`42904507733`](https://github.com/xianyumht-cmd/gams/actions/runs/42904507733)
  **passed** its C++ sanitizer tests, Node reference vectors, real
  Java→JNI→C++ ZIP/proof/HKDF tests, tampered ciphertext rejection,
  Android native and Java baseline builds, lint, signed package identity,
  three ABI libraries and no embedded JS/ZIP checks. Internal artifact
  `GG-EdgeOne-CPP-internal-2` (ID `13803419518`) contains APK SHA-256
  `3dc5ea213542ad3fca855b7976f8e98676d21c952240157fe421c53b14f6b705`.
  Owner requested uninterrupted development without intermediate manual
  testing; **on-device parity remains unverified**, not implicitly accepted.

- Owner explicitly chose **plan A**: a C++ core with the smallest possible
  Android Java/WebView bridge, preserving every existing interaction before
  retiring any Java implementation. This is **not** a claim of a completed
  100% C++ rewrite.
- Added standalone `:clientNative` (`com.jinli.quickweb.edgeonecpp`) that shares
  the exact existing `MainActivity`, authorization flow, WebView document-start
  injection, 1.4.1 HTML compatibility, UI and resources with the already-tested
  EdgeOne candidate. Existing `:client` production and `edgeOneTest` builds
  still select their original Java payload parser.
- `:clientNative` selects a C++17/NDK ZIP parser, deflate, CRC32/SHA256/size
  verification, and native-memory payload lifetime exposed through a narrow JNI
  bridge. No private JS bundle or license credential is added to the APK.
- The C++ host smoke compiled and passed on a historical public script pair,
  including byte-for-byte parity, SHA-256 known-answer, truncated ZIP,
  corruption and mismatch rejections. All ten Node EdgeOne API tests pass.
  GitHub Actions C++ internal run
  [`42901857291`](https://github.com/xianyumht-cmd/gams/actions/runs/42901857291)
  passed the host C++ sanitizers/parity gate, Android NDK `lintRelease` /
  `assembleRelease`, the Java candidate reference APK build, three-native-ABI
  `.so` presence checks, signing, distinct package identity and absence of
  bundled private JS/ZIP. The internal artifact is `GG-EdgeOne-CPP-internal-1`
  (ID `13803616264`; native APK SHA-256
  `ef1afe1e14376667589107d29ac816b1a1d31e9ef41811df4b4c18636f822d6c`).
  **On-device full parity remains unverified.** Do not label this a finished
  complete C++ rewrite or publish it as a formal production release.

- Base: `main` at `6f25a6f32b6ebf5dfc57e06a5612ef372466ec4e`.
- Task branch: `feat/gg-edgeone-license-remote-js-20261111`.
- EdgeOne runtime v2 on remote code commit `bf9861e7d4a27376fca7af6ca9c5fef504d4e7cb`
  adds per-download ephemeral P-256 ECDH / HKDF / AES-GCM delivery,
  per-device replay receipts, staged backward compatibility and an opt-in
  `GG_REQUIRE_RUNTIME_V2=1` strict mode. New Node tests reproduce and reject
  sequential reuse of an identical proof and validate the encrypted response.
  GitHub Actions internal run
  [`42896834272`](https://github.com/xianyumht-cmd/gams/actions/runs/42896834272)
  succeeded with Node suite, Java cross-language crypto/transfer and HTML
  smokes, Android lint/assemble, signed APK identity and no bundled JS checks.
  Output is the 14-day **Actions artifact** `GG-EdgeOne-internal-9` (ID
  `13799669660`), **not a formal Release**. Makers deployment, encrypted
  on-device startup and strict-mode rollout still require owner verification.
  The private Blob SDK has no atomic conditional write, so simultaneous
  duplicate requests remain a known limitation.
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
