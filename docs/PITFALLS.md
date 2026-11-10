# EdgeOne candidate pitfalls

- The C++ project is **not** a pure-native Android WebView: `WebView`, activity
  lifecycle, platform permission prompts and Keystore calls remain Java API
  boundaries. The first native build currently migrates only ZIP/JS memory
  handling. A compiled `.so` or a successful smoke test is **not** proof of
  full feature parity. Avoid claiming otherwise.
- `WebView.shouldInterceptRequest` runs off the Activity's main thread.
  Returning a full `game.js` byte array on every request multiplied Java
  heap usage, while releasing the native ZIP between `gameSize()` and
  `openGameStream()` could race with JNI reads. For the C++ candidate,
  capture the response length and stream under the same payload monitor,
  bound each native range read, and synchronize it with `wipe()`. A stream
  used after teardown must produce `IOException`, never access an old handle.
- The EdgeOne v2 HKDF `info` is also the AES-GCM authenticated data; changing
  its timestamp/device/token-hash serialization breaks decryption even when
  the key length is correct. Preserve Java/Node/C++ byte-for-byte fixtures
  and keep Keystore/EC/AES operations in the Android platform provider.
- EdgeOne's session is `base64urlPayload.hexHmac`. A saved token can become
  malformed or expire; strict native JSON validators must not turn an
  otherwise recoverable `bad_session` into a permanent generic startup error.
  The native saved-key policy reactivates when local token syntax is invalid;
  real server `bad_session` and `device_unbound` still trigger reactivation.
- Java and C++ test packages have different app-scoped Keystore/device IDs;
  if a single-device license reports bound elsewhere, unbind it in the EdgeOne
  browser administrator before testing the other package. Never add a hidden
  bypass of the license check for the C++ build.

- Keygate requires a long-running Go process and PostgreSQL, so copying its
  Docker configuration to EdgeOne Functions does not deploy it. The branch
  implements a smaller, independently tested authorization service instead.
- EdgeOne Cloud Functions cap request/response bodies at 6 MB. Do not return
  the raw >10 MB game JS; ZIP it under 5.5 MB and check the runtime archive in
  the builder, server and client.
- Even a correctly sized 4.98 MB ZIP timed out at the default **30-second**
  Makers Node Cloud Functions duration: the project log showed HTTP 200 but
  `ReverseProxy read error during body copy: context deadline exceeded` at
  30,000 ms. An HTTP 200 is not proof of a complete binary body. Configure
  `cloudFunctions.nodejs.maxDuration` in `edgeone.json` and keep the Android
  runtime read timeout longer than the server limit. Confirm complete transfer
  and APK integrity checks on-device; do not treat CI success as integration proof.
- EdgeOne KV's cached reads can lag. The candidate uses private Blob **strong**
  reads for license state and revocation. Even strong reads are not a database
  transaction, so simultaneous seat activation still needs a production fix.
- `@edgeone/pages-blob` marks `onlyIfNew` as deprecated and explicitly not
  enforced. A nonce/replay record with strong reads is **not** an atomic
  one-time ticket: multiple Cloud Function instances can accept concurrent
  copies. Use one-use recipient encryption to prevent captured-request
  *plaintext extraction*; implement a transactional counter or atomic ledger
  before claiming complete replay prevention.
- New encrypted v2 transport requires the updated EdgeOne Cloud Function and
  updated test APK. Deploy the dual-protocol server **before** the new APK,
  verify on device, and only then set `GG_REQUIRE_RUNTIME_V2=1`. If strict
  mode is enabled early, old test APKs will receive HTTP 426.
- Distinguish public repository source from APK packaging: Git history remains
  public even if APK contains zero JS assets. Never describe this as making
  previously public scripts secret or impossible to extract from memory.
- The `1.4.1` userscript directly uses the official `game.js` path rather than
  old `stable.js`. It needs its own HTML/gzip/SRI compatibility branch and
  must not inherit the older runtime's empty official-engine response.
- On GitHub's 2026 Ubuntu runner, `android-actions/setup-android@v3` tries to
  install the removed Android SDK `tools` package and fails before Gradle runs.
  Use the runner's preinstalled SDK and Gradle's normal SDK package resolution.
- The owner's Windows PowerShell console has shown multi-line paste ordering
  errors. Provide a downloadable `.cmd`/`.ps1` helper with file pickers rather
  than asking them to paste a long, brace-heavy provisioning command. The
  helper must hide the API Token, avoid printing it and use local-only files.
- A PowerShell `Read-Host 'prompt' -AsSecureString` prompt argument is **visible**
  text; pasting an API Token between its quotes leaks the token into terminal
  history/screenshots even if the subsequently typed input is hidden. Use the
  native prompt label without embedding a secret, rotate accidentally exposed
  Tokens, and do routine card operations in the password-protected browser UI.
- The first deployed browser admin login reported `bad_origin` despite using
  the owner's own domain and configuring `GG_ADMIN_PASSWORD`. The original
  origin guard compared the browser `Origin` only to `request.url`; an EdgeOne
  proxy may expose an internal deployment host in `request.url`. Retain a
  strict, explicit allowlist for the project's custom domain and assigned
  `edgeone.dev` host (plus exact-request-origin for local testing), rather than
  blindly trusting arbitrary `X-Forwarded-Host` headers or disabling CSRF.
