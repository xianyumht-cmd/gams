# EdgeOne candidate pitfalls

- Keygate requires a long-running Go process and PostgreSQL, so copying its
  Docker configuration to EdgeOne Functions does not deploy it. The branch
  implements a smaller, independently tested authorization service instead.
- EdgeOne Cloud Functions cap request/response bodies at 6 MB. Do not return
  the raw >10 MB game JS; ZIP it under 5.5 MB and check the runtime archive in
  the builder, server and client.
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
