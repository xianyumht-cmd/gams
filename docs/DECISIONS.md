# Technical decisions

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
