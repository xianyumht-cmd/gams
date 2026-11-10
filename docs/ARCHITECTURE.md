# GG Android / EdgeOne internal candidate

## Isolated C++ candidate (`:clientNative`)

The `v2/android/clientNative` Gradle app builds its own NDK shared library
(`libggnative.so`) and package `com.jinli.quickweb.edgeonecpp`, allowing
side-by-side installation with `:client`'s
`com.jinli.quickweb.edgeonetest` APK. Both compile the same existing Java
WebView, network transport, ECDH authorization, UI and injection source.
The per-module `BuildConfig.GG_NATIVE_CORE` flag switches the verified
runtime-payload parser and EdgeOne proof/HKDF boundaries. The C++ library validates the central ZIP
directory and both fixed filenames, raw deflate, CRC-32, lengths, and manifest
SHA-256, then keeps the JS bytes in native memory until `wipe()` calls JNI
`close()`. The Java baseline does not load the native library.

For the new protocol boundary, C++ builds the exact ECDSA signing text from
`action`, timestamp, device ID and SHA-256(material). Java asks its Android
Keystore-backed private key to sign these bytes and submits the original
server request schema. On runtime delivery Java calls the Android provider
for one-use P-256 ECDH, passes the ephemeral 32-byte shared secret over JNI,
and receives the HKDF-SHA256 derived AES key and authenticated `info` bytes.
Java's platform AES-GCM verifies ciphertext before C++ handles the ZIP.
Neither device private keys nor a static runtime-decryption key are included
in the APK. The native/Java wire contract is cross-tested against Node.

This is stage 1 of the requested C++ migration, not an assertion that the
remaining Java license/WebView logic has been translated. The app must still
pass the complete acceptance matrix below before replacing the baseline.

| Existing behavior to preserve | Native candidate verification |
| --- | --- |
| First key activation and device binding | On-device required |
| Relaunch with saved key / expiry / revoked key | On-device required |
| Download progress and `正在初始化中…` | On-device required |
| v2 ECDH/HKDF/AES-GCM download and ZIP SHA-256 | Server tests; on-device required |
| `noname.js` document-start injection | On-device required |
| `game.js` intercept and HTML rewrite / gzip | On-device required |
| `about:blank` and navigation without breaking WebView | On-device required |
| Toolbar, back/home/reset, picker/download/dialogs | On-device required |
| No bundled JS, encrypted archives, or secrets | APK CI gate |
| Exact native unzip + SHA-256 parity with Java runtime | Native host test passed |

The canonical Android `debug`/`release` builds still use the existing Cloudflare
license and signed runtime-bundle protocol. The separate `edgeOneTest` build type
(`com.jinli.quickweb.edgeonetest`) routes only its authorization and JS delivery
through EdgeOne Makers Cloud Functions. It never packages `noname.js`, `game.js`
or an encrypted copy of either into its APK.

## Data flow

1. The installed client creates an Android Keystore P-256 signing key and a
   per-installation device ID (reusing `DeviceIdentity`). The operator issues a
   32-character hexadecimal license using the local provisioning tool.
2. The APK submits an HTTPS activation request with its license key and a
   timestamped, P-256-signed device proof. The EdgeOne Node function looks up
   `licenses/<sha256(key)>.json` from a private Blob store (strong read), binds
   the key to the first device, and returns a 1-hour HMAC-authenticated token.
   The time limit starts on first activation. Each check refreshes the token.
3. Every runtime fetch is a signed request, even with a valid session token.
   The function reloads the license record and checks suspension, expiry and
   device binding. The strengthened EdgeOne v2 request additionally supplies
   a fresh ephemeral P-256 delivery public key, bound into the device signature
   under `runtime-v2`. The server uses its own ephemeral P-256 key, ECDH,
   HKDF-SHA256 and AES-256-GCM to return **encrypted ZIP bytes**, with an
   authenticated context containing the device ID and session-token hash.
   The encrypted response includes its server public key and IV in headers.
   The server verifies the plaintext versioned ZIP size/hash first; the Android
   client decrypts and checks it again before injection. A captured v2 request
   can be repeated only to obtain ciphertext, not the device's ephemeral key.
   Server-side per-device replay receipts in strong Blob storage also reject
   sequential reuse of an identical signed request. The plaintext ZIP limit
   remains **5,500,000 bytes** (plus a 16-byte GCM tag), below the 6 MB EdgeOne
   response limit. This candidate sets the
   Node Cloud Functions maximum duration to 120 seconds in `edgeone.json`
   after a 30-second runtime-download timeout was observed.
4. `EdgeOneCandidateClient` decrypts the v2 response in memory with its
   one-use private key, checks the response digest, then passes the ZIP to
   existing `RuntimePayload.fromZip()`, which validates both script hashes and
   retains them in memory. The established `MainActivity` document-start / JS
   interception pathway does not write the scripts to disk. For remote `1.4.1`
   runtime bundles, a candidate-only HTML shim handles gzip, `about:blank`
   guards and official `game.js` interception, matching the isolated local-test
   compatibility strategy.
   Only the candidate runtime-download read timeout is extended to 135 seconds;
   license API reads retain the short 25-second timeout. Unexpected startup
   exceptions are written to Android Logcat under `GG-EdgeOne` without logging
   license keys or session tokens.

For a staged upgrade, the EdgeOne server still accepts legacy `runtime` proofs
and returns plaintext ZIP for old test APKs. Only after updating installed
clients should the operator set `GG_REQUIRE_RUNTIME_V2=1` on the Makers project
and redeploy; then legacy `/api/runtime` requests fail with HTTP 426. The
existing Cloudflare production protocol and canonical builds are unaffected.

The EdgeOne candidate's first activation and saved-license restart share one
native `正在初始化中…` screen. Before a runtime response body arrives its cyan bar
is indeterminate; `RuntimeZipReader` streams the ZIP into bounded memory and
reports only actually received bytes, capped visually at 90%. The remainder
is reserved for archive integrity validation and WebView startup. Progress
callbacks are delivered onto the Android main thread and ignored after the
loading view is replaced. Production Cloudflare builds remain unchanged.
Failed initial activation returns to the form with the entered key intact.

Functions: `edgeone-license/cloud-functions/api/[[default]].js` exposes
`POST /api/activate`, `/api/check`, `/api/unbind`, `/api/runtime` and
`GET /api/health`. Shared, framework-independent validation is in `core.mjs`.

## Private browser administrator (internal candidate)

`GET /api/admin` serves a self-contained Chinese admin page from the same
Makers Cloud Function. `admin-core.mjs` handles password login, session
verification, CSRF/origin checks, card creation/listing, device unbinding and
card suspension/restoration. `admin-page.mjs` is the UI. The server alone reads
the private `gg-private` Blob namespace; the browser receives neither the
EdgeOne API Token nor `GG_TOKEN_SECRET`.

The administrator provides `GG_ADMIN_PASSWORD` (at least 20 characters) as a
Makers server-side environment variable. Login compares its SHA-256 digest in
constant time. An eight-hour, `Secure; HttpOnly; SameSite=Strict` cookie is
HMAC-authenticated using a domain-separated key derived from `GG_TOKEN_SECRET`.
Mutating admin requests require same-origin JSON, an authenticated cookie and
a per-session CSRF header. The public login page uses a nonce-based CSP and
does not grant public access to any card records. The admin panel supports
up to 100 listed entries per request; this is suitable for the current private
candidate, not a full production licensing/CRM system.
The Origin guard additionally accepts the project's explicit public custom
domain and EdgeOne-generated host, because Makers' reverse proxy can present
an internal `request.url` host to Cloud Functions. It does not trust arbitrary
forwarded-host headers.

Cards remain stored under `licenses/<sha256(plaintext-key)>.json`; the license
key plaintext is shown once on issuance, and existing client records remain
compatible. Unbinding clears only device identity and leaves activation-based
expiry unchanged. Revocation is reversible with an administrator action.

## Limitations and trust boundaries

- Blob strong reads give read-after-write freshness, **not atomic compare-and-set**.
  Two simultaneous first activations could race. This implementation is an
  **internal candidate**, not a production-grade seat-allocation service.
- Replay receipts stored in Blob also **cannot atomically claim a request**;
  simultaneous requests may pass a check/write race. The independent v2
  recipient encryption mitigates JS disclosure from captured requests even in
  that case. Strict v2 mode is off until explicitly configured after rollout.
- Authorization cannot prevent a legitimate client from inspecting its own
  decrypted JavaScript inside the app/WebView at runtime. Transport encryption
  and APK obfuscation are friction layers, not DRM guarantees.
- Only the cloud controls whether a caller receives the runtime ZIP. The
  returned manifest is verified against the ZIP and each entry, but it is not
  independently signed; integrity currently depends on the authenticated TLS
  connection and trusted EdgeOne backend. Adopt a pinned public-key signature
  before treating this as the production hardening boundary.
- Public Git history already exposes historical scripts. Removing JS from the
  APK does not revoke access to publicly committed script versions. Once JS
  is delivered to an authorized device, memory inspection is still possible.
- CloudInject and third-party APK shelling remain **manual post-build** steps;
  this branch does not bundle those tools or final production signing keys.
