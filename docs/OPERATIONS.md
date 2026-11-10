# EdgeOne GG internal deployment and verification

## 1. Create the EdgeOne Makers project

In Tencent EdgeOne Makers/Pages, create a **new project** from the public
`xianyumht-cmd/gams` repository and set the project root to `edgeone-license`.
This does not change the existing website or Cloudflare production API.

- Node Cloud Functions entry is `cloud-functions/api/[[default]].js`.
- Set secret environment variable `GG_TOKEN_SECRET` to at least 32 cryptographically
  random characters, generated **locally** (for example with `openssl rand -hex 32`).
  Never commit or paste this value to a chat or public Actions log.
- Deploy the project and check `https://<actual-edgeone-project-host>/api/health`.
  Use the assigned HTTPS host or your configured subdomain, not a guessed URL.
- EdgeOne Blob namespace `gg-private` is created by the first SDK call; do not
  create a publicly served static folder for runtime ZIP files. The license
  API fails closed until a valid license record and manifest exist.

## 2. Initialize private JS and license records

Perform these commands on your own trusted computer, inside `edgeone-license`.
The generated `.local/` files are ignored by Git. This CLI requires the
EdgeOne Blob SDK (`npm install` / `npm ci`) and **your** EdgeOne API token;
the token is never needed by GitHub Actions.

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

Set the **repository variable** `GG_EDGEONE_BASE_URL` to the deployed HTTPS
origin, or enter it in the workflow_dispatch `edgeone_base_url` input. Run
`GG EdgeOne Internal APK` on branch
`feat/gg-edgeone-license-remote-js-20261111`. A push to its paths also triggers
the workflow. The installed package is `com.jinli.quickweb.edgeonetest`,
R8-minified and signed using the disposable Android debug keystore.

If the URL is missing, Actions intentionally produces an **unconfigured build**
that shows an error at activation; it is suitable only for static packaging
checks and must be rebuilt after the service is online. The workflow uploads
only a 14-day Actions Artifact, **never a Release** and never a production JKS.

## 4. Acceptance checks

Automated: Node auth/proof/revocation tests, ZIP budget/hash preparation,
standalone Java HTML/gzip smoke, Android lint/assemble, APK package identity,
signature validity and absence of JS/ZIP assets.

Device (not covered by CI): install alongside production; issue a test key;
verify activation then auto-login; test wrong key, expired/disabled key,
other-device activation, unbind and restart; open the `66rpg.com` homepage,
select a game, confirm the G button and `game.js` injection, and check no
`about:blank` redirect. Finally test CloudInject + APK shelling on a **copy**
of the internal artifact and verify signing again. Do not merge/publish before
those checks are complete.
