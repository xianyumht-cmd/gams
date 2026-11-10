# GG Android / EdgeOne internal candidate

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
   device binding. It reads the versioned ZIP named by `runtime/manifest.json`
   from private Blob storage, verifies its size/hash, and returns both in one
   `no-store` HTTPS response. The bundle limit is **5,500,000 compressed bytes**
   (EdgeOne Cloud Functions response limit is 6 MB). This candidate sets the
   Node Cloud Functions maximum duration to 120 seconds in `edgeone.json`
   after a 30-second runtime-download timeout was observed.
4. `EdgeOneCandidateClient` checks the response digest, then passes the ZIP to
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
