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

For the EdgeOne-only device proof, `DeviceIdentity.signEdgeOneProof()` obtains
the Keystore certificate and private key together and returns one immutable
public-key/proof pair. `DeviceProofCodec` validates Android's DER ECDSA
encoding, converts it to 64-byte P1363 for Node, and verifies the transmitted
format locally before `EdgeOneCandidateClient` supplies the pair to either
Java or C++ request assembly. The original production signing method remains
unchanged. CI tests actual host-JCA ECDSA through JNI and the unmodified Node
`handle('activate')`; Android Keystore device behavior still needs a device.

The next native boundary owns the **full outbound authorization JSON** for
`activate`, `check`, `unbind` and `runtime-v2`, including action-specific
license/token/delivery-key fields. Android invokes the Keystore signature on
the C++ canonical string and passes it back for strict-ASCII JSON creation.
C++ also decides whether a saved session should be checked, freshly activated,
or rejected due to a missing license; a malformed saved token is treated as a
recoverable session. Java still owns asynchronous lifecycle, HTTPS connections,
encrypted SharedPreferences and WebView. On inbound delivery, the native ZIP
parser additionally matches the server's expected whole-ZIP SHA-256 before
extracting and verifying each script. The Java APK retains its independent
SHA-256 validation path.

In the fourth increment, the isolated native core also classifies successful
EdgeOne API JSON responses (a 2xx response with `ok:false` is rejected),
validates the shape of server-issued session tokens before the credential is
persisted, and checks the encrypted-runtime response envelope. The Java HTTPS
adapter still reads response bytes and parses JSON, but C++ enforces the
delivery-version, base64 P-256 key/96-bit IV shape, archive/entry size limits,
and matching lower-case SHA-256 hashes from the manifest and HTTP header.
The existing Android provider independently validates the P-256 key and
authenticates AES-GCM; the native ZIP reader independently verifies the
archive's digest and each script. Java-only builds retain their previous
response checks. A validated header is not itself proof of authenticity;
the TLS transport and AES-GCM tag remain essential.

The fifth native increment consolidates **license field normalization** and
the first-launch / saved-session decision into C++, retaining Java's exact
ASCII-hex normalization semantics and rejecting a corrupted saved key. Java
continues to own execution order, cancellation and callbacks; a failed check
is reactivated only for the native-approved session errors. After a server
authorization, C++ evaluates `forceUpdate` against current app version
*before* Java asks EdgeOne for the encrypted ZIP. This preserves the existing
`updateRequired` result shape while preventing unnecessary private-runtime
delivery to a candidate that must upgrade first.

The sixth increment changes native engine delivery from a whole-script
`gameBytes()` JNI copy to a **bounded range reader**. `NativeGameInputStream`
is a pure Java `InputStream` adapter with a 16 KiB per-read maximum; each
read enters `RuntimePayload`'s monitor before invoking C++ `copyGameRange`
(64 KiB hard JNI bound). `wipe()` uses the same monitor to destroy the native
bundle. Multiple WebView requests maintain independent cursors over the same
immutable native data. If teardown happened first, the stream raises a Java
`IOException` rather than invoking JNI on the disposed handle. This avoids
full-size Java heap replicas for engine-resource requests, but the WebView
consumer still necessarily receives plaintext chunks. The smaller control
script remains a Java String for Android document-start injection.

In the seventh increment, encrypted runtime-v2 download accumulation crosses
the native boundary too. `NativeCiphertextReader` keeps the Android HTTPS
stream and progress callback, forwarding up to 8192 ciphertext bytes per JNI
call into a C++ `EncryptedTransfer` reserved to the manifest's exact encrypted
size. Native bounds checking rejects extra bytes, incomplete EOF and duplicate
finalization; `releaseEncryptedTransfer()` wipes the ciphertext vector on
success or exception. Java still needs one final ciphertext `byte[]` for
system JCA AES-GCM, and the decrypted ZIP goes to the existing native runtime
parser. This avoids Java `ByteArrayOutputStream` growth/copies, but cannot
eliminate the JCA adapter. The Java-only candidate retains its original
runtime stream reader.

The eighth native boundary moves the final startup result and initialization
percentage **decisions** to C++ without moving Android widgets, main-thread
callbacks or lifecycle methods. `startupPresentation(valid, hasPayload,
updateRequired)` prioritizes mandatory updates, then permits WebView only
with both an authorized result and a payload; other outcomes return to the
activation form and wipe any unused payload. `initializationPercent()` follows
the Java reference's byte-driven 0–90% convention. Saved-card and manual
activation both show the mandatory-update dialog, closing a previously missed
manual branch. The Java-only build keeps the same result mapping but never
loads the native library.

The ninth native boundary owns the *text-only* `1.4.1` HTML compatibility
rewrite. `RuntimePayload.rewriteHtml()` holds its monitor during the JNI
call so that native script memory cannot be released by `wipe()` mid-rewrite.
C++ applies the same ordered regular-expression replacements for
`location.replace/assign('about:blank')`, `location.href`, and `sha384`
integrity attributes as the reference Java adapter. It then inserts a
`<script>` after the first case-insensitive `<head>` tag, escaping any
`</script` fragments inside the native control script. The bridge returns
UTF-8 HTML response bytes directly; it no longer creates a separate Java
control-script String merely to rewrite the intercepted page. The normal
document-start injection still needs the Android WebView String API. Java
continues to own HTTPS, Cookie headers, bounded gzip decoding, UTF-8 input,
and WebResourceResponse. The original Java rewrite stays the reference for
`:client`, and host JNI tests compare entire UTF-8 HTML outputs.

The tenth native boundary takes the **deterministic WebView resource-routing
decision** and document-start script wrapping into C++. For the isolated
native APK, Java passes its Android `Uri` scheme/host, request method,
main-frame flag and Accept value to `resourceRoute`. C++ checks the exact
legacy official/virtual/forbidden-engine patterns and the `1.4.1` direct
engine HTML eligibility in the same precedence as the original Java WebView
client. The native version gate preserves the old `1.4.1` prefix check.
Java remains responsible for rendering or bypassing the intercepted request,
HTTP/cookies, UI and file downloads; the Java-only APK continues using its
original route checks. `wrappedControlBytes` constructs the original JS
guard/try/catch wrapper around native-resident control-script bytes, and
Android decodes the resulting UTF-8 for its WebView API and wipes the
temporary Java byte array. Native tests cover route precedence and wrapper
bytes; live WebView behavior still requires device acceptance.

The eleventh native boundary extends `browser_policy.cpp` to pure lifecycle
and navigation decisions: the existing five-minute background reload policy,
external link handling for non-HTTP(S) URI schemes, document-start target
hosts, and suppression of the historical engine-ready JavaScript alert.
The JNI alert bridge reads UTF-16 code units so C++ reproduces Java's
`String.trim()` and U+FF5E-to-ASCII-tilde replacement without different
UTF-8 whitespace semantics. The timestamp comparison preserves Java long
arithmetic even at overflow boundaries. Android still captures wall-clock
time, parses `Uri`, launches external `Intent`s, injects scripts, and manages
`Activity`/`WebView` lifetimes; the Java-only APK stays on the old code paths.

The twelfth boundary adds a per-`V2LicenseManager` C++ `StartupCoordinator`.
Each saved-card login, manual activation, or self-unbind receives a fresh,
monotonic generation. `clear()` invalidates all earlier tickets atomically
with clearing saved authorization, and `shutdown()` closes the registry-backed
native gate. The JNI registry uses shared ownership instead of raw pointers,
so a racing network callback can safely observe a closed gate without
dereferencing a freed coordinator. Worker results may only save tokens under
the Android authorization lock while their ticket remains current; posted
callbacks and download progress check the ticket again on the main thread.
Stale decrypted bundles are wiped. The Java-only build uses a synchronized
generation fallback and keeps the same network, persistence and UI adapters.

The thirteenth boundary extends this ticket into the asynchronous runtime
delivery path. A new authentication operation or logout invalidates the C++
ticket and best-effort disconnects the currently tracked EdgeOne runtime
HTTP connection. The Java HTTPS adapter owns `HttpURLConnection`, but
`NativeCiphertextReader` calls the native ticket check between input chunks;
the C++ `EncryptedTransfer` also holds a reference to its coordinator and
rejects every obsolete append/finalize. The collector is released by
`finally` on any canceled read.
The Java-only reference uses the equivalent cancellable reader. Both paths
reject stale work before decryption and wipe newly materialized ZIP payloads
if cancellation wins after parsing. The HTTP transport may still be unable
to interrupt certain blocked system reads immediately; authorization state
and UI publication remain protected by the twelfth-stage generation gate.

The fourteenth native boundary replaces the raw `RuntimeBundle*` returned
as a `jlong` with a monotonically numbered handle registry. Each JNI read
resolves a `shared_ptr<const RuntimeBundle>` before touching JS bytes and
holds it through the Java-copy or HTML rewrite. Closing removes the ID
atomically, then releases/wipes the bundle outside the registry mutex; any
in-flight read keeps its own copy alive until it finishes. A closed ID is
never reused or accepted again, including on duplicate `close`. Android
`RuntimePayload` continues synchronizing WebView streams and `wipe` as its
platform-facing resource owner, while C++ now enforces native memory safety
independently if an unexpected concurrent JNI caller appears.

The fifteenth boundary binds each candidate `RuntimeBundle` registry entry
to the native `StartupCoordinator` and its active generation ticket.
`EdgeOneCandidateClient` passes the ticket through `RuntimePayload.fromZip`
and `StartupGate.openRuntime()` to the JNI `openAuthorized()` parser. C++
verifies that generation both before and after ZIP parsing; each later
`resolve()` checks it again before returning JS bytes for control injection,
HTML rewrite or bounded game streaming. The shared coordinator can safely
outlive a closed registry ID until the last bundle reference is released.
The registry mutex is not held while checking the coordinator lock, and
Java's `StartupGate` monitor is not held during ZIP parsing, so logout
can invalidate the session immediately. A native read already underway
may finish after invalidation, but new reads and stale runtime publication
are denied. The legacy/reference `open()` path stays unbound; only the
isolated C++ EdgeOne candidate uses the authorized runtime entry point.

This remains a staged C++ migration, not an assertion that the
remaining Java license/WebView logic has been translated. The app must still
pass the complete acceptance matrix below before replacing the baseline.

| Existing behavior to preserve | Native candidate verification |
| --- | --- |
| First key activation and device binding | On-device required |
| Relaunch with saved key / expiry / revoked key | On-device required |
| Download progress and `正在初始化中…` | On-device required |
| v2 ECDH/HKDF/AES-GCM download and ZIP SHA-256 | Server tests; on-device required |
| Exact-length encrypted runtime stream in C++ | Host JNI and Android CI; on-device required |
| `noname.js` document-start injection | On-device required |
| `game.js` intercept and HTML rewrite / gzip | Native HTML host parity; gzip remains Java; on-device required |
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
`GET /api/health`. The unauthenticated health result includes the active
server's `runtimeProofAction` (`runtime-v2`) and `deliveryVersion` (`2`),
allowing a deployed-branch compatibility check without revealing keys or
license records. Shared, framework-independent validation is in `core.mjs`.

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
