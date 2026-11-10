# EdgeOne GG internal deployment and verification

## Build and test the C++ client side by side

The independent `GG EdgeOne C++ Internal APK` GitHub Actions workflow builds
`:clientNative:lintRelease :clientNative:assembleRelease` and also builds the
original `:client:assembleEdgeOneTest` as a regression check. Its artifact is
named `GG-EdgeOne-CPP-internal-N` and contains `GG-EdgeOne-CPP-internal.apk`
plus `SHA256SUMS.txt`. **This is an internal test artifact, not a Release**.
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
