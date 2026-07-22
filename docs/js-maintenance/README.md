# JavaScript maintenance workspace

This branch contains static-analysis tools and maintenance documentation for the current `noname.js`, modified `game.js`, historical official reference candidates, and the current official H5 runtime baseline.

## Scope

- Runtime, APK, Worker and release behavior are not modified here.
- Third-party full JavaScript source is not copied into the documentation.
- Runtime probe query values are redacted before reports are committed.
- Differences between modified and official bundles are treated as observations, not automatic proof of customization.
- Historical similarity scores rank reference candidates but do not prove direct source lineage.

## Start here

1. `project-understanding.md` — overall architecture and maintenance model.
2. `noname-lifecycle.md` — confirmed initialization order and object responsibilities.
3. `maintenance-dependency-matrix.md` — troubleshoot directly from user-visible symptoms.
4. `second-stage-findings.md` — official runtime graph, Webpack dependency conclusion and bundle differences.
5. `historical-reference-family.md` — 2025-08 through 2025-10 official reference family and confidence limits.
6. `noname-ast/resolved-methods.md` — function-level `object.method` map and line ranges.
7. `endpoint-catalog.md` — known endpoint families and maintenance purpose.
8. `data-dictionary.md` — user, mall, order, save and runtime fields.
9. `generated/failure-diagnosis.md` — troubleshoot by symptom.
10. `generated/update-runbook.md` — fixed update and rollback procedure.

## Generated baselines

- `generated/` contains the modified runtime baseline and reconstructed anchors.
- `official-current/` contains the current official page resource inventory, browser observations, entry comparison and modified-versus-current-official report.
- `historical-search/` contains Wayback metadata, structural candidate ranking and deep fingerprints.
- `noname-ast/` contains the function graph, resolved computed method names and behavior categories.

Important reports:

```text
generated/baseline.json
generated/reconstructed-anchors.json
official-current/snapshot.json
official-current/browser-probe.json
official-current/webpack-entry-dependencies.md
official-current/modified-vs-current-official.md
historical-search/historical-search.json
historical-search/historical-deep-comparison.md
noname-ast/noname-function-graph.json
noname-ast/noname-resolved-methods.json
```

## Main findings already established

```text
modified noname.js: 1.1.1 / 331,550 bytes
modified game.js: 1.0.2 / 11,589,175 bytes
modified internal logic version marker: 1.2.4
reconstructed SAL surface: 150 names
Webpack entry: 71269
external side-effect dependency order: 36728 → 6886 → 75640
closest historical reference family: official 2025-08 through 2025-10
best deep historical reference: 202510170003
best size/semantic structural reference: 202509100001
noname AST functions: 446
resolved object methods: 94
resolved call graph edges: 1,065
```

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
tools/js_maintenance/find_historical_official_baselines_fast.py
tools/js_maintenance/compare_historical_candidates_deep.py
tools/js_maintenance/analyze_noname_ast.mjs
tools/js_maintenance/refine_noname_ast_aliases.mjs
```

The first archive finder `find_historical_official_baselines.py` remains an exhaustive manual fallback; the bounded `*_fast.py` version is the normal choice.

The direct baseline analyzer provides a `compare` subcommand for two `baseline.json` files. Browser and archive probes are deliberately manual/controlled and should not run on every branch push.
