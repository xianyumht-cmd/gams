# JavaScript maintenance workspace

This branch contains static-analysis tools and maintenance documentation for the current `noname.js`, modified `game.js`, and the current official H5 runtime baseline.

## Scope

- Runtime, APK, Worker and release behavior are not modified here.
- Third-party full JavaScript source is not copied into the documentation.
- Runtime probe query values are redacted before reports are committed.
- Differences between modified and current official bundles are observational because their official build dates do not match.

## Start here

1. `project-understanding.md` — overall architecture and maintenance model.
2. `second-stage-findings.md` — official runtime graph, Webpack dependency conclusion and bundle differences.
3. `endpoint-catalog.md` — known endpoint families and maintenance purpose.
4. `data-dictionary.md` — user, mall, order, save and runtime fields.
5. `generated/failure-diagnosis.md` — troubleshoot by symptom.
6. `generated/update-runbook.md` — fixed update and rollback procedure.

## Generated baselines

- `generated/` contains the modified runtime baseline and reconstructed anchors.
- `official-current/` contains the current official page resource inventory, browser observations, entry comparison and modified-versus-official report.

Important reports:

- `generated/baseline.json`
- `generated/reconstructed-anchors.json`
- `official-current/snapshot.json`
- `official-current/browser-probe.json`
- `official-current/webpack-entry-dependencies.md`
- `official-current/modified-vs-current-official.md`

## Refresh tools

```text
tools/js_maintenance/analyze_runtime_fast.py
tools/js_maintenance/refine_obfuscated_anchors.py
tools/js_maintenance/capture_official_dependencies.py
tools/js_maintenance/resolve_dynamic_chunks.py
tools/js_maintenance/browser_dependency_probe.mjs
tools/js_maintenance/webpack_registry_probe.mjs
tools/js_maintenance/analyze_webpack_entry_dependencies.py
tools/js_maintenance/compare_modified_current_official.py
```

The direct baseline analyzer also provides a `compare` subcommand for two `baseline.json` files. Browser probes are deliberately manual/controlled and should not run on every branch push.
