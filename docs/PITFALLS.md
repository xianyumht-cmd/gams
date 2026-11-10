# EdgeOne candidate pitfalls

- Keygate requires a long-running Go process and PostgreSQL, so copying its
  Docker configuration to EdgeOne Functions does not deploy it. The branch
  implements a smaller, independently tested authorization service instead.
- EdgeOne Cloud Functions cap request/response bodies at 6 MB. Do not return
  the raw >10 MB game JS; ZIP it under 5.5 MB and check the runtime archive in
  the builder, server and client.
- Even a correctly sized 4.98 MB ZIP timed out at the default **30-second**
  Makers Node Cloud Functions duration: the project log showed HTTP 200 but
  `ReverseProxy read error during body copy: context deadline exceeded` at
  30,000 ms. An HTTP 200 is not proof of a complete binary body. Configure
  `cloudFunctions.nodejs.maxDuration` in `edgeone.json` and keep the Android
  runtime read timeout longer than the server limit. Confirm complete transfer
  and APK integrity checks on-device; do not treat CI success as integration proof.
- EdgeOne KV's cached reads can lag. The candidate uses private Blob **strong**
  reads for license state and revocation. Even strong reads are not a database
  transaction, so simultaneous seat activation still needs a production fix.
- Distinguish public repository source from APK packaging: Git history remains
  public even if APK contains zero JS assets. Never describe this as making
  previously public scripts secret or impossible to extract from memory.
- The `1.4.1` userscript directly uses the official `game.js` path rather than
  old `stable.js`. It needs its own HTML/gzip/SRI compatibility branch and
  must not inherit the older runtime's empty official-engine response.
- On GitHub's 2026 Ubuntu runner, `android-actions/setup-android@v3` tries to
  install the removed Android SDK `tools` package and fails before Gradle runs.
  Use the runner's preinstalled SDK and Gradle's normal SDK package resolution.
- The owner's Windows PowerShell console has shown multi-line paste ordering
  errors. Provide a downloadable `.cmd`/`.ps1` helper with file pickers rather
  than asking them to paste a long, brace-heavy provisioning command. The
  helper must hide the API Token, avoid printing it and use local-only files.
- A PowerShell `Read-Host 'prompt' -AsSecureString` prompt argument is **visible**
  text; pasting an API Token between its quotes leaks the token into terminal
  history/screenshots even if the subsequently typed input is hidden. Use the
  native prompt label without embedding a secret, rotate accidentally exposed
  Tokens, and do routine card operations in the password-protected browser UI.
- The first deployed browser admin login reported `bad_origin` despite using
  the owner's own domain and configuring `GG_ADMIN_PASSWORD`. The original
  origin guard compared the browser `Origin` only to `request.url`; an EdgeOne
  proxy may expose an internal deployment host in `request.url`. Retain a
  strict, explicit allowlist for the project's custom domain and assigned
  `edgeone.dev` host (plus exact-request-origin for local testing), rather than
  blindly trusting arbitrary `X-Forwarded-Host` headers or disabling CSRF.
