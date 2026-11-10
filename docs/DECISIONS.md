# Technical decisions

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
