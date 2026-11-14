# EdgeOne GG internal deployment and verification

## 2026-11-15: Scan-to-enable MFA in GG web administrator

1. Confirm the EdgeOne `gg-license-api` deployment uses the latest PR #48 source and `gg-api.dijiav.top` can log in with the existing `GG_ADMIN_PASSWORD`. Keep `GG_TOKEN_SECRET` unchanged: it derives the encryption key for the stored administrator MFA secret and signs sessions.
2. If `GG_ADMIN_TOTP_SECRET` is **unset**, open `https://gg-api.dijiav.top/api/admin`, log in, find **登录保护 → 使用手机扫码绑定**. Open Microsoft Authenticator for iOS → **+ → 其他账户 → 扫描二维码**, scan the page's QR, enter the current six-digit code back in GG and click **确认启用**.
3. After code confirmation GG creates eight **single-use** recovery codes. Copy and save offline in a password manager immediately. Plaintext codes are shown only in that response; the stored values are HMAC digests. Avoid screenshots or pasting the codes into GitHub/chat. Re-open admin in a private window: password-only login must fail, password + iPhone code must work. All pre-enrollment sessions should be invalid.
4. If a manual `GG_ADMIN_TOTP_SECRET` is configured, that mode remains authoritative; the web page shows the enabled state but does not offer a second enrollment. To migrate, explicitly remove the manual environment variable and redeploy (after planning credential continuity). Do **not** print the manual secret or any recovery code to troubleshoot.
5. MFA state is stored as encrypted `admin/mfa-state.json` and transient encrypted `admin/mfa-pending.json` in the existing private `gg-private` EdgeOne Blob namespace. An authenticated administrator can disable managed MFA only by re-entering the admin password plus TOTP or an unused recovery code. Do not delete these objects or rotate `GG_TOKEN_SECRET` casually: that would make sealed secrets undecryptable. Recovery from cloud/key loss requires manual owner access to the EdgeOne deployment and Blob storage.
6. `GET /api/admin` remains discoverable. The owner reported that free-plan EdgeOne allows only one Path-only `GG-Admin-Login` rate rule. Leave the existing protection active; verify it is enforced for `POST /api/admin/login` on the actual Pages custom domain (and any alternate hostnames). Neither a QR code nor an on-page TOTP input protects against denial-of-service or credential stuffing without trusted edge-level request limiting. Rates and emergency access policy must be tested without triggering lockout.
7. This is an admin web-service change; **no Android APK rebuild, private JS re-upload, card regeneration, or DNS change is required**. The GitHub branch update is not a deployed site until the correct Makers/Pages deployment is triggered and verified.


## 2026-11-15: Admin login migration and first-stage hardening

1. Deploy the existing `feat/gg-edgeone-license-remote-js-20261111` branch with the project root `edgeone-license`, **keeping** `GG_ADMIN_PASSWORD`, `GG_TOKEN_SECRET`, private Blob records, and both old/new EdgeOne custom domains unchanged. Confirm `https://gg-api.dijiav.top/api/admin` can log in with the existing admin password.
2. The source now accepts admin POST origins **only** from `https://gg-api.dijiav.top`, the previous `https://gg-api.xn--8pv109c.top`, or `https://gg-license-api-dxk0o7j9.edgeone.dev`. Browser-origin errors were caused by the new domain missing from this fixed list; never disable the Origin/CSRF checks or trust `X-Forwarded-Host`.
3. Optional second factor: generate a random **160-bit or greater base32 TOTP secret** locally in a trusted authenticator, keep it privately in EdgeOne Makers project environment variable `GG_ADMIN_TOTP_SECRET`, then redeploy. Login requires the admin password and the authenticator's six-digit code, allowing ±30s clock drift. The login form's code field is optional only when the variable is not set. If the variable is malformed, login fails closed; revert/configure it in EdgeOne to recover. Never include this secret in GitHub, screenshots, logs or chat.
4. Sessions now expire after 2 hours and are invalidated when the admin password or TOTP secret changes. Existing sessions from before this update will need to log in again.
5. Rate limiting **requires separate edge configuration**. If the GG Pages/Makers custom domain is enrolled in an EdgeOne site supporting Web Protection, create a precise rate-limiting rule for `POST /api/admin/login` (suggested 5 requests/minute/client IP, block 10 minutes) across **all** reachable hostnames, and an optional admin-path IP allowlist under Custom Rules. Confirm the chosen product/package supports these policies; Makers Pages may not expose equivalent WAF controls. Do not block `/api/activate`, `/api/check`, `/api/runtime` or `/api/health`. If no edge WAF is available, use a trusted access gateway in front of admin APIs; never claim source-only fixes enforce edge limits. Avoid relying on arbitrary client-forwarded IP headers or non-atomic Blob counters.
6. Post-deployment checks: new hostname password login, old hostname login, wrong Origin=403, bad password=401, unauthenticated list/issue=401, successful existing card list, proper new-card creation only after explicit operator action. Test with MFA off first, then enable separately, without changing any real cards or their expiry during rollout.



## 2026-11-15: Migrate GG API hostname (leave old domain as rollback)

- New EdgeOne Makers custom hostname: `https://gg-api.dijiav.top`; owner confirmed the domain and HTTPS are deployed, and supplied the health response `{"ok":true,"runtimeProofAction":"runtime-v2","deliveryVersion":2}`.
- The C++ APK default and automatic GitHub Actions builds now target the new HTTPS origin. The explicit manual `edgeone_base_url` workflow-dispatch input is still available for controlled diagnostics; the potentially stale `GG_EDGEONE_BASE_URL` repository variable no longer overrides the new automatic-build default.
- The `official-local` unsigned artifact includes `backend_url=https://gg-api.dijiav.top` in `BUILD-METADATA.txt`; the bundled Windows signer rejects artifacts without this exact value. Download the full new Actions kit before local signing; never sign an older cached kit assuming its backend changed.
- Keep the old hostname `https://gg-api.xn--8pv109c.top` active with valid HTTPS and its DNS CNAME until all older APKs have moved to the new backend. Do not delete the old EdgeOne custom-domain binding, DNS record, or the common EdgeOne project during this migration. Existing runtime upload and license records remain in the same private Blob namespace; no re-upload or reissue is required solely for hostname migration.
- Acceptance order: wait for the new GitHub workflow and verify build metadata; sign on the owner's Windows machine; verify certificate and APK package; launch and check existing card/saved authorization, remote runtime download `1.4.6-1.0.43`, JS injection and in-game actions; test restarting and rollback. Only after all active clients have migrated may the old hostname be disabled/removed.
- Current scope is a candidate PR build, not a silent update to already installed APKs. The cloud health endpoint alone does not prove authenticated runtime delivery. No changes to production Blob objects, credentials, or cards are made by this commit.


## Official GG signing identity (2026-11-11)

### Offline official-signing kit (no key material in CI)

The C++ internal workflow publishes a second artifact named
`GG-EdgeOne-CPP-official-local-N`. It contains an **unsigned** release APK
compiled with `GG_REQUIRE_OFFICIAL_APK_SIGNER=true`,
`scripts/Sign-GG-Official-APK.ps1`,
`scripts/Install-GG-Android-BuildTools.ps1`, `BUILD-METADATA.txt` and
`SHA256SUMS.txt`.
This does not change the existing `GG-EdgeOne-CPP-internal-N` debug-signed
emulator test artifact. Do **not** take the latter and simply re-sign it:
its official signer gate is intentionally disabled.

On the owner's Windows computer, extract the complete `official-local`
artifact to one directory. If Android SDK **Build-Tools** is missing, run
the bundled `Install-GG-Android-BuildTools.ps1` first. It downloads Google's
official Windows command-line tools ZIP, validates the published SHA-256,
and installs just `build-tools;35.0.0` using `sdkmanager` into the current
user's SDK directory. It needs Java JDK and network access and may request
acceptance of the Android SDK license. If Google is blocked, install the
same package manually from the official Android SDK tools. The installer
also accepts an official browser-downloaded
`commandlinetools-win-15859902_latest.zip` beside the script or in its
parent folder, or a path explicitly supplied via `-ToolsZip`; the SHA-256
is checked before extraction. This avoids Windows `curl.exe` Schannel TLS
handshake failures without using an unverified mirror. Then run the
bundled PowerShell signer, e.g. from that directory:

```powershell
powershell.exe -NoProfile -File .\Sign-GG-Official-APK.ps1
```

The script checks SHA-256 and explicit `official-local-unsigned` metadata,
checks the public certificate, locates `apksigner.bat` under `ANDROID_HOME`,
`ANDROID_SDK_ROOT`, or the normal per-user Android SDK directory, then asks
for the private JKS credentials **only on the local machine**. It refuses
to overwrite an existing signed output. After signing, it runs `apksigner
verify --verbose --print-certs` and compares the actual APK signing digest
against the official SHA-256. Output is
`GG-EdgeOne-CPP-official-signed.apk`. This step does **not** update EdgeOne.

If the owner installed Build-Tools in a custom location, set the current
process's `GG_APKSIGNER_FILE` environment variable to the full
`apksigner.bat` path before invoking the helper. Do not put the JKS password
in arguments, process environment variables, GitHub secrets or chat. The
first switch from the disposable debug signer to official signing for the
same test application ID requires deliberately uninstalling only
`com.jinli.quickweb.edgeonecpp` (which wipes its local session). Check the
card binding before uninstalling; admin unbind may be required. Keep the
officially signed APK for future upgrade continuity.

Owner's offline signing directory (Windows only):
`D:\project2\gams\gams-signing-key-official`. It contains a JKS, a public
certificate, a fingerprint report and Windows DPAPI-protected credentials.
Do not copy, commit, attach or print its private key/password material.
The intended JKS alias is `gg-release`; the expected new certificate SHA-256
is `70608347ee8cc3cd72e7dc70c504013e261c9a2fee9850539219cda519c87f34`.
Cross-check the public `.cer` against the fingerprint report with a
certificate-inspection tool before any signed release, and verify the actual
APK afterward with `apksigner verify --print-certs`.

When all four `GG_INTERNAL_*` settings exist, the native candidate applies
an on-device official-signer check before licensing and the workflow refuses
to distribute a persistently signed artifact with the wrong certificate.
When none exist, it stays `ephemeral-debug` and the owner can continue
emulator testing. This candidate's application ID differs from older GG
packages; Android installs are distinct unless they share a package name.
Persistently signed APKs cannot simply upgrade debug-signed APKs of the
same application ID. **Do not install the official JKS into unrestricted
feature-branch CI secrets:** use protected release signing with branch/approval
gates and the least possible access before activating that build mode.

No EdgeOne Makers redeploy is required for this local APK signer check. The
current EdgeOne service validates Android Keystore device proofs, not the
release certificate. Remotely trustworthy APK identity would require a
separate verified attestation design, including emulator compatibility.

## Native candidate build signing and artifact provenance (2026-11-11)

The `.github/workflows/gg-edgeone-cpp-internal-apk.yml` job increments the
internal candidate `versionCode` to `10000 + GITHUB_RUN_NUMBER` and uses
`2.0.4-native-internal.N` as its visible version. Each published Actions
artifact includes the APK, `SHA256SUMS.txt`, and `BUILD-METADATA.txt` with
source SHA, version, signing mode, and certificate digest. The UI service
dialog reads the actual `BuildConfig.VERSION_NAME`; a screenshot alone still
does not prove the installed package bytes match an artifact.

To enable **persistent internal signing**, provision these GitHub Actions
secrets without storing their values or the JKS file in the repository:

- `GG_INTERNAL_KEYSTORE_B64`: base64 of a dedicated internal JKS file.
- `GG_INTERNAL_STORE_PASSWORD`: keystore password.
- `GG_INTERNAL_KEY_ALIAS`: internal key alias.
- `GG_INTERNAL_KEY_PASSWORD`: key password.

If all four are present, Actions decodes the JKS in its temporary runner
directory and records `persistent-internal`. Partial configuration fails the
build; if all are missing, a disposable debug key is used and explicitly
reported as `ephemeral-debug`. That fallback still requires uninstalling an
older differently signed **internal** package. Installing the first
persistently signed APK over a debug-signed internal APK also requires one
deliberate migration/uninstall; after that, use the same certificate for
upgrades. Never remove the production client or expose signing passwords
in issue comments, logs, scripts, or chat.

The host JNI test now includes `UiTextSmoke`; release APK inspection checks
selected GG-owned screen text is not available as direct DEX UTF-8 string
anchors, and validates native ARM64 RELRO/BIND_NOW. These are bounded
hardening checks, not proof against dynamic analysis.

## Repair `设备签名无效` after successful card binding

If a newly issued card shows `已绑定` immediately after the GG internal client
reports `设备签名无效`, activation succeeded and the startup flow probably failed
on its next `/api/runtime` request. The v2 APK sends proof action
`runtime-v2` over `token|deliveryPublicKey`; server code before `31ae7ad`
expects action `runtime` over `token` and returns that exact error. This was
reproduced locally with a synthetic signed request against both code versions.

1. In EdgeOne Makers/Pages, select **the GG license API project**, not the
   unrelated production website. Ensure the connected GitHub repository is
   `xianyumht-cmd/gams`, source branch
   `feat/gg-edgeone-license-remote-js-20261111`, and **project root** is
   `edgeone-license`; inspect the build source before clicking redeploy.
2. Redeploy the latest branch without changing `GG_TOKEN_SECRET`,
   `GG_ADMIN_PASSWORD`, existing private Blob/card records, or the
   `GG_REQUIRE_RUNTIME_V2` flag. The current server keeps backward
   compatibility unless the existing strict flag is already enabled.
3. Visit `https://gg-api.xn--8pv109c.top/api/health` after production
   deployment. It must return both `"runtimeProofAction":"runtime-v2"`
   and `"deliveryVersion":2` alongside `ok:true`. If either is missing,
   the custom domain still serves a different or older deployment.
4. Reopen the already installed `GG-EdgeOne-CPP-internal-17` and activate
   the existing bound card on the same emulator. This verification does not
   require generating a new card, unbinding, reinstalling, or another APK.

## Build and test the C++ client side by side

The independent `GG EdgeOne C++ Internal APK` GitHub Actions workflow builds
`:clientNative:lintRelease :clientNative:assembleRelease` and also builds the
original `:client:assembleEdgeOneTest` as a regression check. Its artifact is
named `GG-EdgeOne-CPP-internal-N` and contains `GG-EdgeOne-CPP-internal.apk`
plus `SHA256SUMS.txt`. **This is an internal test artifact, not a Release**.
Historically, #16 and #17 used fresh disposable debug certificates while the
displayed version remained `2.0.3-native-internal`. Their certificates were
measured to be different. A version label is now generated per CI run, but
**until persistent signing secrets exist**, an in-place upgrade can still
fail. Verify the device's
installed `base.apk` SHA-256 against `SHA256SUMS.txt`, or uninstall only the
independent `com.jinli.quickweb.edgeonecpp` test package before installing a
new artifact. Uninstalling wipes that test package's local preferences and
saved activation; a card may need a separate admin unbind. The production app
is unaffected, and its signing key must never be used for this workaround.
The sixteenth increment adds an actual Java JCA P-256 DER→P1363 signature,
C++ JNI canonical/JSON serialization and unmodified Node EdgeOne handler
round trip; a bit-flipped signature must be rejected. This detects a
cross-language mismatch, while actual emulator AndroidKeyStore acceptance
is still separate. For `设备签名无效` after a card unbind, check the device
proof first: `/api/activate` verifies it before consulting the license
record. The client-only wire-format repair does **not** require a Makers
Cloud Function / EdgeOne redeploy; production APK signing certificates and
`GG_TOKEN_SECRET` are unrelated to this P-256 device proof.
The second native increment also requires host C++ proof/HKDF known answers,
host JVM→JNI call parity on the real native library and end-to-end
Node→Java→JNI HKDF→AES-GCM decryption before Android package checks.
The third increment extends these host gates with all four outbound EdgeOne
JSON shapes, saved-license recovery decisions, unsafe credential rejection,
and whole-archive SHA-256 checks through JNI. Keep both native and Java APK
builds in CI to detect accidental impact on existing installs.
The fourth increment additionally rejects 2xx JSON responses with `ok:false`,
malformed session tokens, mismatched runtime manifest hashes and invalid
encryption envelope fields. The host C++ sanitizer suite and real JVM→JNI
smoke tests exercise both valid and invalid forms before the APK build.
The fifth increment tests Java-equivalent license normalization, manual and
saved-session startup branches, recoverable check failures, and forced-update
download blocking. Re-run real JNI tests plus both Android APK builds to
verify these startup decisions did not alter the reference client.
The sixth increment also compiles `NativeGameInputStream.java` in the host
Java→JNI test. The native fixture reads `game.js` via repeated bounded slices,
compares exact bytes, verifies a second independent cursor, closed-stream
handling, and out-of-bounds native destination rejection. An Android device
must still verify WebView streaming during navigation, refresh, and logout.
The seventh increment also compiles `NativeCiphertextReader.java` and
`RuntimeZipReader.java` in the host Java→JNI fixture. It checks exact
encrypted bytes/progress for a historical public ZIP, truncated/oversized
input, invalid JNI source slices, incomplete and repeated finalization.
The C++ sanitizer fixture covers native declared-size and chunk bounds;
actual on-device EdgeOne decryption remains an independent acceptance gate.
The eighth increment adds C++ host and actual JNI cases for every combination
of authorization validity, payload presence and mandatory update. It also
compares native initialization percentages with the Java reference for zero,
partial, complete, oversized, invalid and large transfer values. After APK
builds, check that the first-time activation **and** saved-key restart show
the same mandatory-update dialog when the server requires a newer version.
The ninth increment also compiles `html_compatibility.cpp` under the host
ASan/UBSan smoke gate and through the real Java→JNI native library fixture.
The JNI fixture uses the public historical control script to compare the
entire rewritten UTF-8 HTML byte array against the untouched Java reference;
it checks mixed-case `<head>`, `sha384` removal, blank navigation and a
missing-head rejection. After CI, a device must still verify the live
`1.4.1` site, compressed HTML, WebView navigation and document-start behavior.
The tenth increment adds an independent C++ sanitizer fixture for all five
resource-routing outcomes and the exact Java script-wrapper prefix/suffix.
The real Java→JNI fixture loads the historical public control script from the
ZIP, compares full wrapper bytes and exercises direct-engine/legacy/HTML
routing decisions. After CI, manually inspect engine requests, ignored
subresources and the main-document rewrite, including both navigation modes.
The eleventh increment additionally checks native background reinitialization
timing (before/at the five-minute threshold, hidden browser, absent timestamp,
clock jumps and signed-overflow boundary), URI scheme handoff, the two
document-start target hosts, and Java-equivalent engine-ready alert text.
The host JNI fixture compares the native choices with Java expressions;
on-device return-from-background and Intent/WebView behaviors are independent
acceptance gates and must not be inferred from a green APK build.
The twelfth increment adds C++ sanitizer and real JNI cases for per-manager
generation tickets, new-request invalidation, logout cancellation, idempotent
close and independence between two Activity instances. The Android manager
also rechecks the ticket under the credential-persistence lock and on the
UI thread. After build, device acceptance must exercise logout during an
in-flight runtime download, an immediate new login, resume reinitialization,
and Activity teardown; no automated host test reproduces those WebView events.
The thirteenth increment adds actual Java→JNI cancellation checks for an
in-flight native ciphertext stream and its unchanged Java reference:
cancellation after the first progress event must throw `InterruptedIOException`
and close the source instead of returning partial ciphertext. The C++ host
suite also checks bound transfers reject append and finish after the ticket
is invalidated. The EdgeOne
network adapter also tracks its runtime connection and requests disconnect
on logout, reactivation or Activity destruction. Verify on a device that a
new activation is not delayed by an old runtime transfer, including while
waiting for response headers; Android may not interrupt every socket read.
The fourteenth increment adds a real JNI regression for closing a parsed
runtime ZIP twice, reading each data type after closure, rejecting a reused
handle ID, and racing repeated bounded engine reads with teardown. All stale
native handle reads must fail with a managed Java exception, not a native
crash. A successful host concurrency fixture does not replace the owner's
future live WebView refresh/logout test.
The fifteenth increment extends the real JNI fixture with a server-valid
historical public ZIP opened using a native startup ticket. It compares
resident control, wrapped injection, HTML rewrite, engine length and bounded
range access; then invalidates that ticket and requires every subsequent
read or reopen to fail with `SecurityException` (the HTML-rewrite JNI
boundary deliberately retains `IllegalArgumentException`). A later ticket must accept
a fresh ZIP without reviving the earlier one; closing the coordinator must
revoke the fresh runtime too. The Java-only/reference ZIP open and both APK
builds remain in CI. On-device owner acceptance is still required for a
logout while the page holds a response stream and immediate reauthorization.
It is signed only with a disposable debug certificate. Install alongside the
original APK; it uses the same EdgeOne server and existing license records
but an independent Android package/app data directory. An existing
single-device-bound test key may need to be unbound in the web admin before
first activation on the native candidate (device identifiers are app-scoped).

Compare both packages on the same test device in this order: first activation;
saved-card reopen; progress/blank startup; script injection and official
game engine request; `about:blank`, refresh/home/back; toolbar and picker;
download, dialogs and errors; invalid/expired/revoked/license-bound rejection;
and process restart. Report mismatches before replacing the Java baseline.

## 1. Create the EdgeOne Makers project

In Tencent EdgeOne Makers/Pages, create a **new project** from the public
`xianyumht-cmd/gams` repository and set the project root to `edgeone-license`.
This does not change the existing website or Cloudflare production API.

- Node Cloud Functions entry is `cloud-functions/api/[[default]].js`.
- `edgeone.json` at the project root sets `cloudFunctions.nodejs.maxDuration`
  to 120 seconds for the ~5 MB private runtime transfer (the default 30-second
  limit previously cut off a 200 response while copying the body). Deploy the
  branch again after changing this setting; the Android internal candidate
  allows 135 seconds for this download but keeps shorter auth timeouts.
- Set secret environment variable `GG_TOKEN_SECRET` to at least 32 cryptographically
  random characters, generated **locally** (for example with `openssl rand -hex 32`).
  Never commit or paste this value to a chat or public Actions log.
- To enable the new card-management webpage, additionally set
  `GG_ADMIN_PASSWORD` to a different, unique, at-least-20-character random
  password via Makers > `gg-license-api` > Settings > Environment Variables.
  The password must never be put in GitHub code, screenshots or chat; after
  saving it, **redeploy the latest branch** so Cloud Functions receive it.
- Deploy the project and check `https://<actual-edgeone-project-host>/api/health`.
  Use the assigned HTTPS host or your configured subdomain, not a guessed URL.
- EdgeOne Blob namespace `gg-private` is created by the first SDK call; do not
  create a publicly served static folder for runtime ZIP files. The license
  API fails closed until a valid license record and manifest exist.

### Card management in the browser (recommended)

After the new `GG_ADMIN_PASSWORD` deployment has completed, open
`https://gg-api.xn--8pv109c.top/api/admin` in your browser. Enter the admin
password (not the EdgeOne API Token). The page lists existing hashed card
records and provides buttons to **Generate (7/30/90/365 days or permanent)**,
**Unbind device**, **Suspend**, **Restore**, and **Copy newly generated key**.
If the page says the administrator is not configured, ensure both
`GG_ADMIN_PASSWORD` and `GG_TOKEN_SECRET` are set and trigger a new Makers
deployment. Existing cards are retained; unbind does not restart an already
begun validity period. The original key cannot be recovered from its hash.
The page intentionally does not accept JS files or Makers API Tokens: keep
using the separate one-click local upload helper for private runtime updates.
Do not publish or merge this candidate as the production license service.

## 2. Initialize private JS and license records

Perform these commands on your own trusted computer, inside `edgeone-license`.
The generated `.local/` files are ignored by Git. This CLI requires the
EdgeOne Blob SDK (`npm install` / `npm ci`) and **your** EdgeOne API token;
the token is never needed by GitHub Actions.

**Windows one-click option:** extract the `edgeone-license` directory locally,
keeping `package.json`, `scripts/pack_runtime.py` and
`scripts/provision.mjs` together. Double-click `GG-EdgeOne-Upload.cmd` to run
`scripts/GG-EdgeOne-Upload.ps1` with Windows PowerShell 5.1. The helper defaults
to the owner's `makers-v0q1urwnypkn` project and the `1.4.1-1.0.41` runtime
pair, opens separate `.js` file pickers, installs the official Blob SDK locally,
packs a fresh private `.local/run-*` archive, requests the Makers API Token
with hidden input and performs `upload` followed by `issue 30`. It never sends
the API Token to GitHub Actions and clears the environment variables afterwards.
The local computer must already have Node.js/npm and Python 3 installed.
Do not screenshot or share the printed key; if the upload fails, the generated
archive remains locally for diagnosis and no license is issued.

```bash
python3 scripts/pack_runtime.py \
  --noname ../remote-script/release/noname-1.1.4.js \
  --game ../game-engine/release/game-1.0.5.js \
  --version 1.1.4-1.0.5 --out .local
```

For the newer `noname 1.4.1` / `game 1.0.41` pair, pass the **actual local
paths** to those two files instead; their compressed ZIP must also meet the
5.5 MB limit. No JS is ever inserted into the test APK.

Configure `EDGEONE_PROJECT_ID` and `EDGEONE_API_TOKEN` privately in that shell,
then run:

```bash
node scripts/provision.mjs upload .local
node scripts/provision.mjs issue 30
```

Keep the printed license key private. `issue permanent`, `revoke KEY` and
`unbind KEY` are also supported. Uploads write a versioned ZIP first and
publish the manifest last so previous versions remain usable during uploads.
Review old ZIP retention separately; no automatic deletion is performed.

## 3. Build the APK in GitHub Actions

### Encrypted runtime v2 rollout (internal candidate only)

1. Push the branch containing both the new `core.mjs` Cloud Function and the
   updated Android client. **Deploy the new Makers Functions first** while
   `GG_REQUIRE_RUNTIME_V2` is unset. This keeps the previous test APK working
   during migration; it still uses plaintext legacy delivery.
2. Let the `GG EdgeOne Internal APK` workflow finish and download its Actions
   artifact. Confirm the new APK can activate, download, decrypt and inject
   the runtime on an Android device, including a restart with a saved card.
   CI runs a Node/Java ECDH/HKDF/AES-GCM interop smoke and server replay tests,
   but these are not a substitute for on-device verification.
3. **After** all test devices have the new APK, set the Makers environment
   variable `GG_REQUIRE_RUNTIME_V2` to the literal `1`, save, and redeploy.
   This rejects all old plaintext `/api/runtime` requests with HTTP 426.
   Do not enable it before the device rollout. If you must roll back to an
   old candidate APK, remove this environment variable and redeploy first.

The replay ledger uses strong private Blob reads/writes and rejects sequential
duplicates; Blob lacks atomic compare-and-set, so concurrent requests may
still race. However a replayed v2 download remains encrypted for the original
ephemeral client key; it cannot expose plaintext without the key or compromise
of the authorized client. The client keeps JS in memory; no protector can
promise that a fully instrumented authorized device cannot extract it.

The test-branch workflow defaults to the owner's custom HTTPS domain
`https://gg-api.xn--8pv109c.top`. To change that origin, set the **repository
variable** `GG_EDGEONE_BASE_URL` or enter it in the workflow_dispatch
`edgeone_base_url` input (both override the default). Run
`GG EdgeOne Internal APK` on branch
`feat/gg-edgeone-license-remote-js-20261111`. A push to its paths also triggers
the workflow. The installed package is `com.jinli.quickweb.edgeonetest`,
R8-minified and signed using the disposable Android debug keystore.

If a configured URL is unavailable at runtime, activation reports a connection
error; verify the public domain and redeploy/rebuild if necessary. The workflow uploads
only a 14-day Actions Artifact, **never a Release** and never a production JKS.

## 4. Acceptance checks

For the EdgeOne initialization-progress candidate, validate **both** first
activation and saved-license restart. Each should display only
`正在初始化中…` and a cyan horizontal bar. The bar should animate while awaiting
the private runtime, then follow actual ZIP bytes up to 90% and be replaced by
WebView on successful verification. An error must return to the license form
instead of leaving the bar stuck. Run `RuntimeZipReaderSmoke` in Actions.

GitHub-hosted test artifacts are signed with a disposable Android debug
keystore; an older candidate may not install as an update. Reinstalling can
change the device identity, so the previous test card might require device
unbinding in the EdgeOne admin UI. Do not silently deploy production signing.

Automated: Node auth/proof/revocation tests, ZIP budget/hash preparation,
standalone Java HTML/gzip and Node-to-Java encrypted-delivery smokes,
Android lint/assemble, APK package identity,
signature validity and absence of JS/ZIP assets.

Device (not covered by CI): install alongside production; issue a test key;
verify activation then auto-login; test wrong key, expired/disabled key,
other-device activation, unbind and restart; open the `66rpg.com` homepage,
select a game, confirm the G button and `game.js` injection, and check no
`about:blank` redirect. Finally test CloudInject + APK shelling on a **copy**
of the internal artifact and verify signing again. Do not merge/publish before
those checks are complete.

If startup still fails, inspect Makers > the project > Log Analysis > Cloud
Functions for `/api/activate` and `/api/runtime` timing/status, then collect
Android Logcat filtered by `GG-EdgeOne`. In the candidate, unexpected Java
exceptions print a stack trace there, without printing keys/tokens. An HTTP
200 together with a proxy body-copy timeout is an incomplete transfer, not a
successful runtime load.
