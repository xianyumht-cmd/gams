# Technical decisions

## 2026-11-11: Separate UI from platform WebView and auth session persistence

Keep lightweight Java Android Views and one WebView while moving view
construction into `ClientScreens`, user dialogs into `ClientDialogs`, WebView
callbacks/chooser/download lifecycle into `BrowserWebViewController`, resource
routing and HTML rewrite into `BrowserResourceRouter`, and saved auth records
into `LicenseSessionStore`. Keep the existing native-backed resource-policy
and licensing decisions; do not replace the working `about:blank`, HTML
rewrite or document-start paths in a single rewrite. A single native library
already owns high-value policy and memory
boundaries. `UiText` encodes only fixed GG UI copy to raise simple static
search costs; dynamic instrumentation can still see rendered text. Retain
Android Keystore device keys and server-only EdgeOne secrets; compiling
everything into C++ would not improve their security.

The dedicated internal candidate should ultimately use a persistent signing
certificate managed outside source control. Its signing key must not be
confused with the device-specific Keystore P-256 private key, nor silently
reused from the production APK. Until secrets are configured, CI explicitly
marks its output as `ephemeral-debug` and does **not** promise upgrade-safe
installation across Actions runs.

## 2026-11-11: Expose EdgeOne runtime proof compatibility at `/api/health`

The internal Android startup flow can successfully bind a card and then fail
on `/api/runtime`, displaying the last error on the activation screen. Old
Makers code verifies `runtime` against a token; the new native APK signs
`runtime-v2` over the token and one-use delivery key. A local fixture proved
that old code rejects an otherwise correct v2 proof with `设备签名无效`. Expose
the shared `RUNTIME_PROOF_ACTION` and device delivery version in the health
response so operations can distinguish source checkout from actual EdgeOne
deployment without accessing credentials or card records. Do not silently
downgrade the client to plaintext legacy runtime to work around an old cloud
deployment.

## 2026-11-11: EdgeOne device proof uses an atomic Keystore pair and wire self-check

The internal C++/Java EdgeOne candidates preserve the Node service's existing
SHA256withECDSA/P-256 contract: Android emits ASN.1 DER but Node verifies
64-byte IEEE P1363 `r||s`, signed over exactly the existing canonical text.
Acquire the private key and certificate together from one AndroidKeyStore
snapshot, convert DER strictly to P1363, verify the *converted* signature
locally with the matching public key, then submit both together to C++ JSON
serialization. Keep legacy `DeviceIdentity.signRawBase64()` unchanged so
production licensing is not moved as part of an internal test repair. Gate
the change with a real Java ECDSA→C++ JNI→Node handler fixture, and do not
require an EdgeOne Makers redeploy for a client-only codec change. The owner
must still confirm the Android emulator activation; host JCA is not the
device's AndroidKeyStore provider.

## 2026-11-11: Plan A staged native GG client, with functional parity as gate

Use a separately installable Android `clientNative` module with a C++17 native
runtime core and a minimal Java WebView/Android API adapter. Reuse the **exact**
current screen, injection, initialization progress, license state machine and
network handling while replacing subsystems; do not rewrite all interactions
simultaneously or remove Java source before behavior is reproduced. The first
native boundary handles ZIP extraction, verification and native lifetime; this
first candidate is **not** a full native license/crypto rewrite. Produce only
an Actions test artifact until the owner verifies first activation, saved-card
relaunch and JS behavior on an Android device. Future C++ conversion of crypto
and licensing requires explicit cross-language parity tests and a fresh gate.

The second increment moves canonical proof construction and HKDF-SHA256
derivation into native C++, while retaining the platform Android Keystore,
ECDH and AES-GCM cryptographic providers. This avoids pulling unreviewed
native EC/AES implementations into the APK, preserves the current wire
protocol and keeps only a narrow JNI handoff of a per-download shared secret.
The Node reference vectors and Java→JNI cross-language decryption must pass
before producing the next artifact. The code remains an incremental C++
port, not a completed native rewrite.

The third increment moves complete EdgeOne request-body serialization and
saved-license reauthorization policy into C++. The existing `HttpURLConnection`
and Android Keystore are deliberately retained as OS adapters: moving network
transport to an unreviewed native TLS stack would create material compatibility
and trust-store regressions without evidence of a performance gain. Only the
native candidate selects this protocol; the legacy Java APK follows its
original request builder. Strictly whitelist base64, hex and base64url session
fields to prevent JSON injection, and turn malformed saved tokens into the
same activation recovery that the old server-side `bad_session` path provided.

The fourth increment moves the inbound API success/error decision, session
response shape, and encrypted-delivery header/manifest bounds into C++. Java
continues to decode JSON and use Android's vetted HTTPS/Keystore/crypto APIs;
the C++ layer rejects malformed or contradictory metadata *before* fetching
the private ciphertext. Tests cover malformed responses and headers on the
host JNI boundary while preserving the existing Java baseline unchanged.

The fifth increment keeps the Android lifecycle orchestration in Java and
concentrates only the authorization **decisions** in C++: key normalization,
manual-versus-saved login start, recoverable-session classification, and
mandatory-update gating. Existing SecureStore, the single-thread executor,
progress callbacks and WebView are left in place to avoid race and UI
regressions. Gating before the runtime download means a forced update cannot
needlessly transfer private JS into a process that will reject startup.

The sixth increment replaces whole-engine JNI copies with a streaming bridge
that borrows the *existing* native bundle handle only while synchronized with
`RuntimePayload.wipe()`. Do not create unmanaged per-stream native pointers:
their lifetime can outlive the Activity and risk stale-pointer reads if a
WebView cancels a request before closing the response body. Keep the Android
HTTP/WebView stream adapter in Java, use bounded native range reads, and
fail closed if teardown wins a race. The Java baseline keeps its independent
existing `ByteArrayInputStream` behavior.

The seventh increment gives C++ ownership of the **encrypted download buffer**
and exact-length transfer policy. Keep `HttpURLConnection` and system JCA
AES-GCM in Java, where Android's trusted providers and existing callbacks
already work. Preallocate at most `5,500,016` bytes in the native collector,
append only bounded 8192-byte ranges, release/zero it in Java `finally`, and
copy only the completed ciphertext back to Java for JCA. The standalone Java
reference keeps its original `RuntimeZipReader`.

The eighth increment consolidates native startup **presentation policy** and
byte-based progress calculations, while keeping Android Activity lifecycle
and UI rendering in Java. One `startupPresentation()` contract covers initial
activation and saved-card launch; forced-update results are not allowed to
open WebView or skip the update dialog, and unused payloads must be wiped.
This is a parity-oriented native migration, not a rewrite of Android widgets.

The ninth increment moves only the pure HTML transformation behind JNI:
preserve the Java reference's replacement **order**, literals, first `<head>`
match and control-script `</script` escaping. Use resident C++ bundle bytes
and a synchronized owner handle; wipe temporary native HTML/control copies.
Keep `HttpURLConnection`, Android gzip/UTF-8 decoding and
`WebResourceResponse` in Java so the `1.4.1` browser behavior remains
identical. The document-start `WebView` injection still requires a Java
String. Compile and test the original Java implementation alongside C++
rather than deleting the comparison oracle before real-device acceptance.

The tenth increment moves WebView **request classification and control-script
wrapping** to C++ but leaves the actual Android WebView/URI/HTTP/Intent APIs
in Java. This preserves request/header parsing and platform behavior while
reducing duplicated Java-side script copies and enforcing the existing
official-engine versus HTML-rewrite precedence in a single native policy.
The native app routes only through the C++ policy; the Java reference retains
its original classifier for side-by-side regression tests. Passing host JNI
and Android builds does not certify navigation in a live WebView.

The eleventh increment adds the remaining side-effect-free WebView lifecycle
checks to the C++ policy and intentionally **does not** port Android lifecycle
callbacks, navigation Intents or script evaluation. Reproduce the Java
five-minute background threshold without C++ signed-overflow undefined
behavior, and use UTF-16 for the user-facing alert comparison so Java's trim
and fullwidth-tilde rules stay byte-for-byte equivalent. Both native and Java
paths remain available for parity validation; no network or authorization
contract changes are allowed in this increment.

The twelfth increment moves authorization **operation ownership** into a
per-instance native generation gate, but retains Android `ExecutorService`,
`Handler`, secure preferences and networking. Starting a new operation cancels
publication by older operations; logout holds a lock across invalidation and
credential removal, and saving a newly authorized token holds the same lock
while validating its generation. A removed native gate must reject late JNI
checks without a use-after-free. Both main-thread callbacks and progress
events are guarded at dispatch time; discard any decrypted JS payload from a
superseded operation. Keep a synchronized Java fallback for baseline builds,
and do not change EdgeOne requests or response fields during this transition.

The thirteenth increment uses the native startup-generation ticket to stop
obsolete runtime deliveries promptly. Android still owns HTTP connections
and Android platform crypto; a canceled ticket asks the Android network
adapter to disconnect its active runtime connection and requires both
stream readers to check cancellation before/after chunk reads. Native
ciphertext transfers retain a shared C++ coordinator ticket, rejecting
stale append/finalize attempts independently of Java checks. The transfer
is released on all failures and cancellation paths.
Disconnect is **best effort** on Android system networking; do not claim that
it interrupts every blocked `getResponseCode` or `InputStream.read` call.
Keep the complete server wire format, private runtime validation, progress
UI and unbinding semantics intact for the Java baseline.

The fourteenth increment makes native ZIP handles opaque, monotonic IDs in
a `shared_ptr` registry rather than memory addresses. The previous raw-pointer
bridge depended entirely on Java monitors to prevent stale asynchronous
readers from dereferencing a freed bundle; C++ must now own that safety
invariant. Resolve a strong reference once per JNI call and keep it through
all vector access; `close` removes an ID before wiping outside the registry
lock, and duplicate close is idempotent. Do not change WebView stream APIs,
HTML transform output, JS bytes, or the existing authorization wire format.

The fifteenth increment makes the native startup ticket a **runtime access
capability** as well as a download-cancellation token. New C++ candidate
bundles must be opened through `openAuthorized` with the coordinator and
ticket; each JNI read rechecks its ownership. A plain JNI ZIP open remains
for compatibility with legacy and host reference fixtures, not for the
EdgeOne candidate's authorized download. Check tickets before and after ZIP
parsing without holding the Java session monitor so a concurrent logout can
invalidate promptly. Do not report previously started native reads as
retroactively interrupted, and do not change the original Java APK path.

## 2026-11-11: Replay-resistant, device-bound EdgeOne runtime transport

The candidate now uses per-download ephemeral P-256 ECDH and HKDF-SHA256 /
AES-256-GCM to encrypt the remote ZIP for the requesting device's one-use key.
This prevents a captured signed request from being replayed to obtain JS
plaintext without the matching private delivery key. Keep a bounded,
server-side replay ledger in private Blob to reject sequential duplicate
proofs. Because the official Blob SDK explicitly does not support atomic
`onlyIfNew` writes, this ledger alone is insufficient for concurrent replay
prevention; do not claim global exactly-once delivery. The legacy runtime
protocol remains available during upgrade, then the owner can explicitly
set `GG_REQUIRE_RUNTIME_V2=1` and redeploy to disable plaintext legacy
downloads. No change is made to the canonical Android release protocol.

## 2026-11-11: EdgeOne-native authorization candidate

Use a separate EdgeOne Makers Cloud Functions / private Blob implementation
for the GG internal test APK, rather than attempting to run the Keygate Go
daemon/PostgreSQL deployment unchanged on EdgeOne. Reason: the owner does not
want to rely on unstable LAN Linux machines, and the immediate requirement is
license-gated, memory-only delivery of two JS files. Keep production Android
builds and production Cloudflare endpoints unchanged. The new APK has a separate
package name and uses GitHub Actions Artifacts only; never commit JS upload
bundles, signing secrets or issued licenses. A production decision requires
review of authorization atomicity and independent payload signatures.

## 2026-11-11: Same-origin EdgeOne license administration

Use a password-protected web dashboard on the existing internal Makers project
for issue/list/unbind/suspend/restore operations. This replaces the requirement
to enter an EdgeOne API Token into a local PowerShell session for every card
operation. A long random admin password is configured **once** in Makers
environment variables; all Blob access stays on the server. Session cookies
are HttpOnly/Secure/SameSite=Strict with short expiry and request-CSRF checks.
Retain the existing local-only SDK tool for **private JS uploads**, which are
not exposed through the admin webpage. No changes to production APK or release.
