# EdgeOne candidate pitfalls

- **Windows curl can fail Google's TLS handshake while other downloads work.**
  The owner's offline Build-Tools bootstrap returned Schannel `curl: (35)`
  before downloading the official Google command-line tools ZIP. This is a
  network/Schannel path failure, not evidence the JKS or APK is corrupted.
  The bootstrap can now consume a browser-downloaded official ZIP supplied
  locally and verifies its SHA-256 against the Android Developers published
  checksum. Do not disable TLS certificate verification or silently switch
  to an unverified mirror to work around this error.

- **A JDK does not supply Android `apksigner`.** The owner successfully
  verified the release `.cer` and JKS alias with JDK `keytool` but found no
  `apksigner.bat` in the usual Windows SDK directories. Android SDK
  Build-Tools must be installed separately before offline signing. `keytool`
  warns that legacy JKS can be migrated to PKCS12; do not migrate the actual
  GG release JKS merely because of that warning. The owner's local DPAPI
  recovery helper needed the `System.Security` assembly loaded in Windows
  PowerShell 5.1; do not publish the resulting password or credentials.

- **Do not mistake APK signature pinning for server identity attestation.**
  `PackageManager` exposes the installed APK signing certificate to local
  checks, but a modified app can bypass such a check or forge a claimed
  digest in an HTTP request. EdgeOne's existing device ECDSA proof verifies a
  *device key*, not that the official GG JKS signed the requesting APK.
  Protect the original JKS outside Git and verify its certificate against the
  owner-supplied fingerprint; never grant arbitrary feature-branch workflow
  code access to the release key merely to obtain a persistent test APK.
  New and previous release fingerprints do not by themselves create a valid
  Android signing rotation lineage.

- **APK-signature metadata has tool-specific wording.** The Android SDK
  `apksigner verify --print-certs` currently prints
  `V2 Signer: certificate SHA-256 digest:` for a v2-only internal APK, not
  `Signer #1 certificate SHA-256 digest:`. A release CI grep for the latter
  incorrectly failed after both Android builds and all JNI tests succeeded.
  Match the stable `Signer: certificate SHA-256 digest:` suffix and preserve
  the real certificate fingerprint in artifact metadata. Do not describe a
  post-build metadata check failure as an APK compilation error.
- **View copy can leak search anchors even with native C++ auth.** `MainActivity`
  formerly embedded the login, loading, service and browser text as plain
  Java literals. `UiText` encodes selected owned UI phrases and the host JVM
  parity test protects exact rendering; artifact inspection checks a small
  set is absent from compiled DEX. This makes simple `strings` searching less
  helpful, not dynamic hooks or screenshot extraction impossible.

- The UI's activation flow also requests the private runtime ZIP before it
  reports startup success. A visible `设备签名无效` does **not** imply
  `/api/activate` failed. If a freshly issued card already shows `已绑定` in
  the admin UI, activation actually succeeded; inspect `/api/runtime` proof
  compatibility. Original EdgeOne server commit `6893b40` expects
  `runtime\nTIME\nDEVICE\nsha256(token)` and rejects a new APK's
  `runtime-v2\nTIME\nDEVICE\nsha256(token|deliveryPublicKey)` with **the exact
  same** `invalid_device / 设备签名无效`. A live server can be old even when a
  local Java→JNI→Node test against current `core.mjs` passes. Deploy the
  `edgeone-license` Makers project from the correct branch/root before
  changing the APK again; verify `GET /api/health` announces
  `runtimeProofAction=runtime-v2` and `deliveryVersion=2`. An old health
  response without these fields does not establish deployment freshness.
- **An unchanged version label does not prove that an updated internal APK is
  installed.** Previous builds hardcoded `2.0.3-native-internal` and
  `versionCode=16`. Without persistent internal signing secrets,
  each GitHub-hosted Actions runner creates a
  new disposable Android debug keystore: APK #16 and APK #17 were confirmed
  to have *different* APK signing certificates (SHA-256 fingerprints beginning
  `4c07ad69` and `eea01a4e`). Android rejects an in-place installation over
  the prior certificate, potentially leaving an older APK running. This APK
  *installation* signature is unrelated to the Keystore ECDSA *device proof*
  validated by EdgeOne. Check the installed `base.apk` SHA-256 against the
  published build, or uninstall only the `com.jinli.quickweb.edgeonecpp` test
  package (which deletes its local state) before installing. Never uninstall
  the production GG package or reuse production signing keys to solve this.
- EdgeOne `invalid_device` / `设备签名无效` is raised by Node when a
  P-256 ECDSA proof fails. `/api/activate` verifies proof *before* license
  lookup or checking existing device binding, so an admin unbind cannot
  repair it. Android `SHA256withECDSA` returns DER while Node expects a
  64-byte P1363 `r||s`: export the matching public key in the same Keystore
  snapshot, strictly convert DER, and verify the converted bytes locally.
  Host Java→C++→Node cryptographic interop is a useful regression but does
  not reproduce emulator-specific AndroidKeyStore providers; confirm on the
  actual device before declaring the report fixed. The APK's disposable
  debug signing certificate is unrelated to this device-proof key pair.
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
- The ~5 MB encrypted EdgeOne download previously accumulated in a growing
  Java `ByteArrayOutputStream`, leaving intermediate allocations before JCA
  decryption. The C++ candidate now reserves an exact-size native ciphertext
  collector and wipes it in `finally`, but **must still return a short-lived
  Java byte array** for Android AES-GCM. Never finish before EOF, accept bytes
  past the declared length or forget native release on truncated input or a
  callback failure. This is a memory/lifecycle improvement, not an assertion
  that an authorized client cannot inspect its eventual plaintext.
- Saved-card startup showed the mandatory update prompt, but the manual-card
  callback returned to the activation form without opening that dialog when
  authorization reported `forceUpdate`. Both entry points must use the same
  browser/form/update outcome, and a result not opening WebView must wipe any
  unexpected runtime payload. Keep the initialization bar capped at 90%
  until validation and WebView setup complete; use widened integer math to
  avoid overflow for large transfer counts.
- License checks and runtime ZIP downloads can outlive the Activity state
  they started under. A single-thread executor does not protect against a
  synchronous logout calling `clearAuthorization()` while an older request
  later calls `saveAuth()`. Every request needs a generation ticket checked
  under the same lock as saved-token writes; UI/progress callbacks must
  recheck after main-thread dispatch. Close the native generation registry
  entry during Activity destruction, and wipe stale native payloads even if
  the callback is never rendered. A request already sent to the server cannot
  be unsent by this cancellation gate; only its local effects are suppressed.
- In the candidate's single-thread executor, dropping stale callbacks alone
  does **not** cancel a 135-second runtime HTTP wait: a new login can remain
  queued behind it. Track the active runtime `HttpURLConnection`, disconnect
  it when a newer native startup ticket replaces the old one, and check the
  ticket before/after each blocking read. Treat disconnect as best effort;
  network stacks may not interrupt every blocked call. Ensure the input stream,
  native ciphertext collector and decrypted ZIP memory are released on all
  canceled paths and do not alter authorization wire formats.
- JNI `jlong` values previously held raw `RuntimeBundle*` addresses. Java
  `RuntimePayload` monitors protect its known callers but cannot guarantee
  safety for every future or direct native caller: duplicate close could
  double-free and a read racing close could dereference freed JS vectors.
  Use monotonic opaque IDs and a C++ `shared_ptr` registry, retain the
  reference for the *entire* JNI read (never a temporary expression beside
  a vector reference), and wipe removed bundles after releasing the mutex.
- Even a memory-safe opaque native ZIP ID is not automatically tied to the
  license session: a stale WebView could keep reading old authorized JS after
  logout if Java has not yet closed its `RuntimePayload`. Bind every C++
  candidate runtime registry entry to its startup ticket and refuse native
  control/HTML/engine reads after invalidation. Check the ticket on both
  sides of ZIP parsing; release the Java lifecycle monitor during parsing
  to let logout proceed. Reads already underway may complete, so the Java
  UI callback gate and `wipe()` remain necessary. JNI error compatibility
  differs by operation: `rewriteHtml` maps native failures to Java
  `IllegalArgumentException`, while source/engine/handle reads map them to
  `SecurityException`. A stage-15 CI fixture initially asserted the wrong
  exception class and blocked APK packaging despite correct revocation;
  preserve each API's historical exception category in regression tests.
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
- During the C++ HTML compatibility migration, keep the replacement order,
  case-insensitive ASCII matches, first `<head>` insertion and fixed lowercase
  `<\\/script` escape exactly aligned with the Java reference. Never treat
  a passing host text fixture as verification of Android WebView/gzip behavior;
  those are deliberately still handled by the original platform adapter.
- For the C++ WebView routing boundary, official `game.js` requests must win
  over document rewriting. A direct `1.4.1` browser passes unrelated resources
  through without legacy core blocking, while the old runtime must still
  return an empty official-engine response and block source-repository JS.
  Never move Android URI parsing or WebView response APIs into this pure policy.
- Java's WebView alert suppression uses UTF-16 `trim()` (removing only code
  units at most U+0020) followed by a fullwidth-tilde U+FF5E replacement.
  A native UTF-8 whitespace trim can change which alerts are suppressed.
  Java `long` elapsed-time subtraction also wraps; avoid undefined signed C++
  overflow when moving background resume policy into the native layer.
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
