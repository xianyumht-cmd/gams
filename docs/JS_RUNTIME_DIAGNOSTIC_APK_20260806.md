# JS runtime diagnostic APK — 2026-08-06

Branch: `diagnostic/js-runtime-logging-20260806`

This build keeps the production client flow and adds a privacy-preserving diagnostic layer around the injected JavaScript runtime.

Recorded events:

- native activity/WebView lifecycle;
- script length and SHA-256 only;
- document-start injection support and failures;
- masked navigation/resource/download events;
- Fetch/XHR method, URL fingerprint, status and duration;
- DOM selector fingerprints and hit counts;
- `noname.*` API inventory, calls, returns, promise resolution/rejection and duration;
- console argument shapes, uncaught errors and unhandled rejections;
- page lifecycle and compact DOM snapshots.

Explicitly excluded:

- exact URLs, host names and page titles;
- page text or business names;
- cookies, activation keys, tokens and authorization headers;
- request or response bodies;
- raw selector strings;
- raw console strings.

The user exports logs from the toolbar: **日志 → 导出并发送**. The exported ZIP contains JSONL events and a privacy note.
