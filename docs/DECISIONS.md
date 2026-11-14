# Technical decisions

## 2026-11-15: Limit bulk licensing to 50 and make retries stable

Retain the existing administrator session and same card-record schema for single issuance. For bulk issuance, use a 128-bit browser request ID, server-only HMAC-derived per-item 128-bit keys, and Blob records with nonsecret issue metadata. Repeated identical requests return the same keys without resetting bound devices or expirations; failed items can be retried in-tab. Cap concurrency at five and batches at fifty to protect free-tier latency/resources. A partial result reports successful keys rather than hiding committed writes, but no cross-instance transactional guarantee or recovery after lost browser state is promised. Never persist plaintext keys in Blob or durable browser storage.

## 2026-11-15: Preserve the working EdgeOne GG release; harden through reversible, evidence-gated changes

Decision: keep the current C++17/Java WebView client, EdgeOne Makers Cloud Functions + private Blob authorization, server-validated card/device records, device-bound ECDH/AES-GCM remote JS delivery and offline owner-controlled official APK signing. The owner reports the deployed JS now works with the installed GG APK and the in-game black screen is resolved. Their already-tested final APK may be distributed after recording its bytes, certificate, version and minimum acceptance result; do not assume the unsigned Actions artifact or another newly protected copy is equivalent. No formal PR merge, GitHub Release or cloud deployment is implied.

Rationale: independent AI review provided useful issues (native ABI/JNI inspection, fail-open release gates, Blob concurrency, anti-rollback semantics, diagnostics), but also proposed unsafe shortcuts (device-key-only license tokens, client-held shared HMAC, ptrace signals mixed into encryption keys, TLS pinning with unreachable remote-disable). The strong-read private Blob is not an atomic CAS datastore; current manifest checks also do not provide an independently signed payload root of trust. Represent those as known boundaries, not solved DRM.

Sequence: P0 preserve exact owner-accepted distribution artifact; P1 add trustworthy diagnostics/release checks and explicitly evaluate first-activation concurrency; P2 consider JNI symbol minimization, signed manifest and carefully tested certificate/rollback evolution. Do not perturb the stable authorization and browser path for unverified hardening ideas.

## 2026-11-15: Use cross-AI security review to discover tests, not to replace engineering evidence

For high-impact authorization, crypto, release-signing and anti-tamper changes, independent adversarial review is worthwhile. Require all reviewers to use the same branch/commit and distinguish source state from actually deployed EdgeOne revision; ask for precise trust boundaries, code references, executable counterexamples, failed-case tests and limitations. Promote only verified, cost-effective findings into the canonical docs and changes. Stop multi-round debate once enough evidence exists to implement and test safely. Routine UI/features do not require repeated review rounds.

## 2026-11-15: Self-contained QR-based MFA instead of manually sharing TOTP keys

Prefer an authenticated, browser-based provisioning flow for the single-owner GG admin account. Server creates a random 160-bit TOTP secret, encrypts it under an AES-256-GCM key derived from `GG_TOKEN_SECRET`, and places it in private Blob with a 10-minute pending window bound to the initiating session. A vendored, MIT-licensed local QR implementation renders the standard `otpauth://` URI without any third-party service seeing the secret. After the owner confirms a valid six-digit Microsoft Authenticator code, server enables MFA, rotates session version, and shows eight one-time recovery codes once. The optional original `GG_ADMIN_TOTP_SECRET` environment-variable scheme remains for backward compatibility and takes precedence when configured. Use server-only origin/cookie/CSRF checks as before; do not use external QR APIs or embed the secret in public page HTML. Caveat: EdgeOne Blob get/set does not support true atomic compare-and-swap; simultaneous recovery-code submissions are not strictly single-use under races. Enforce a trusted login-interface edge rate rule and do not represent it as solved by the Blob store.


## 2026-11-15: Admin auth allowlist and opt-in second factor

Use strict exact Origin host allowlisting for admin POST APIs, including the new `gg-api.dijiav.top` hostname plus the previous and assigned Makers deployment domains. EdgeOne may rewrite the upstream request URL: do not trust `request.url` equality with any arbitrary browser Origin, or user-supplied forwarding headers. Keep existing CSP, secure HttpOnly SameSite cookies and CSRF checks. Add opt-in TOTP only when `GG_ADMIN_TOTP_SECRET` is securely configured on Makers; accept 160-bit-or-longer base32 secret, six-digit codes with one step skew; fail closed for invalid configured secrets. Make session signatures dependent on the admin password and MFA policy, and shorten session validity to 2 hours. Do not add insecure Blob counter-based "brute force protection" and call it reliable: apply real rate limiting/access controls at a trusted EdgeOne gateway on admin paths (all hostnames), separately from client license/runtime APIs.



## 2026-11-15: Move the GG API to a dedicated domain without breaking existing clients

Use `https://gg-api.dijiav.top` as the canonical HTTPS origin for newly built EdgeOne C++ and Java candidate APKs. Prefer the new domain for unattended CI even if the previous `GG_EDGEONE_BASE_URL` repository variable has not been changed; preserve an explicit workflow-dispatch override for troubleshooting. Require `backend_url=https://gg-api.dijiav.top` in the unsigned official-local kit's metadata and signing helper to avoid signing a stale package. Continue using the same EdgeOne Makers project, private Blob runtime, licenses, signing identity and client protocols. Retain `https://gg-api.xn--8pv109c.top` as a compatibility/rollback origin until older installed clients are migrated; never remove that binding just because a DNS/HTTPS health check succeeds.


## 2026-11-11: Pin owner-designated official signer locally, leave server attestation separate

For the owner's immediately usable Windows path, choose **offline local
signing** instead of uploading the release JKS to feature-branch Actions
secrets. CI creates an explicitly unsigned release APK with
`GG_REQUIRE_OFFICIAL_APK_SIGNER=true` and a separate signed emulator-test
APK. The offline signing script checks metadata, SHA-256, and the public
certificate, prompts for the local JKS password through Android `apksigner`,
then verifies the resulting APK certificate. Never sign the debug test APK
and describe it as a protected official build.

The owner explicitly chose the existing `gams-signing-key-official` JKS
instead of issuing another internal signing lineage. This supersedes the
earlier preference below *not* to reuse the production signer for this
particular candidate, but does **not** authorize putting its JKS or DPAPI
credentials into Git or broad unprotected feature-branch Actions secrets.
Pin its owner-reported new certificate SHA-256 in native code and CI; retain
the former certificate only as a rotation record. Recheck the actual JKS
certificate and signing permissions independently before enabling persistent
signing. A certificate digest comparison executed in the client cannot prove
APK identity to EdgeOne because a patched client can lie. Keep the existing
Keystore device proof wire protocol unchanged; assess hardware-backed app
attestation and emulator compatibility before proposing any server gate.

## 2026-11-11: Isolate legacy authorization protocol without changing wire semantics

Extract the old challenge/sign/activate/check/unbind and encrypted-runtime
download into `LegacyLicenseProtocol` and `LegacyRuntimeLoader`. Keep the
exact protocol `appVersion=12`, signed canonical field order, endpoint paths,
ECDSA public key, AES-GCM AAD and runtime size/sha256 verification. The
shared `V2LicenseManager` continues to serialize and cancel authorization
operations; only `EdgeOneCandidateClient` drives the native candidate. This
refactor is not permission to change deployed EdgeOne Makers endpoints.

## 2026-11-11: Tighten native proof inputs and verify ELF protections per ABI

Allow native authorization proof generation only for the four live EdgeOne
actions (`activate`, `check`, `unbind`, `runtime-v2`), a canonical lowercase
SHA-256 device identifier, and nonempty bounded proof material. Ensure the
request JSON's accepted action set and proof canonicalizer agree, so invalid
action names cannot obtain a signature. Request NX stack in CMake and inspect
GNU_STACK/RELRO/BIND_NOW and JNI exports in each packaged ABI rather than
assuming ARM64 inspection covers the full APK. This is defense in depth;
runtime attackers can still inspect strings, and these flags do not replace
server-side authorization.

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
