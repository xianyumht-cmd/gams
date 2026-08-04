# Target-page browser diagnosis — 2026-08-04

## Scope

This diagnosis used the five mobile target URLs supplied by the user.

The execution environment did not provide an Android emulator or ADB. Therefore, the signed APK itself was not installed or executed. The tests used real Chromium with a mobile WebView-style user agent and reproduced the client runtime delivery policy as closely as possible.

No real payment was completed.

## Version pairs

1. Current first file plus historical second file:
   - first: `1.1.4`
   - second: `1.0.2`
2. Full historical pair:
   - first: `1.1.1`
   - second: `1.0.2`

All input sizes and SHA-256 values were verified before execution.

## Invalid first browser result

The first browser run allowed a navigation to `about:blank` that the Android client blocks through its non-HTTP navigation policy.

As a result, that run reached a blank page before the interactive flow and cannot be used as evidence for or against the repeat-execution defect.

The later tests reproduced the client policy and blocked the same non-HTTP navigation.

## WebView-equivalent page comparison

A total of 15 cases completed:

- 5 page-only baselines;
- 5 cases using `1.1.4 + 1.0.2`;
- 5 cases using `1.1.1 + 1.0.2`.

Confirmed results:

- All 15 cases completed without a fatal browser error.
- None of the page-only cases became blank.
- None of the 10 injected cases became blank after the client-equivalent navigation policy was applied.
- Both runtime files were requested and served in all 10 injected cases.
- No uncaught page error was recorded.
- The non-HTTP blank-page navigation attempt was observed and blocked in all 10 injected cases.
- The current and full-historical pairs behaved the same at this stage.

Evidence:

- `docs/TARGET_PAGE_WEBVIEW_BROWSER_TEST_STATUS.json`
- artifact: `target-page-webview-browser-test`

## Entry-panel repetition test

The fixed floating entry was clicked in all 30 attempts:

- first attempt on the same page;
- second attempt on the same page;
- third attempt after re-entering the target page.

Observed behavior for both version pairs and all five URLs:

- First click opened the panel.
- Second click on the same page closed the panel.
- After re-entering the page, the entry opened the panel again.
- Both version pairs behaved identically.

The earlier automated login count was a text-classification false positive caused by wording displayed inside the panel. No main-frame login redirect was recorded in these panel-only attempts.

Evidence:

- `docs/TARGET_PAGE_MENU_FLOW_TEST_STATUS.json`
- artifact: `target-page-menu-flow-test`

## Canvas interaction probes

The target page's later interactive controls are rendered inside a canvas and are not exposed as normal DOM buttons.

Coordinate probes established:

1. The first tested bottom control was not the purchase entry and issued an external application wake request.
2. The page reached its main interactive screen after approximately 25–28 seconds in the clean CI environment.
3. Current and full-historical pairs showed the same screen and navigation behavior before entering the purchase screen.

Evidence:

- `docs/TARGET_PAGE_COORDINATE_PROBE_STATUS.json`
- `docs/TARGET_PAGE_MENU_COORDINATE_PROBE_STATUS.json`
- `docs/TARGET_PAGE_SHOP_COORDINATE_PROBE_STATUS.json`

## What this diagnosis proves

- Repository publication and runtime encryption/decryption are not causing the repeat defect.
- The second-file delivery path is not the sole cause.
- Changing the second-file version from `1.0.5` to `1.0.2` does not change the device result.
- Before the canvas purchase flow, the full historical pair does not show a behavioral difference from the current-first pair on any of the five supplied target pages.
- The initial browser blank page was a browser-policy mismatch, not a valid reproduction of the user's device defect.

## What remains unproven

The clean browser session does not contain the user's device cookies or authenticated target-page state. The purchase controls are canvas-rendered and require calibrated touch interaction. Therefore, this browser diagnosis does not yet prove that an upstream page-flow change is the root cause, and it does not prove that the full historical pair restores repeated purchasing.

## Next valid test

Install and test the signed code22 APK on the same device and account state used for code19–code21:

1. Complete the first purchase action.
2. Repeat the action without leaving the page.
3. Leave and re-enter the page, then repeat it.
4. Record whether the client returns to its activation screen and how long the transition takes.

Interpretation:

- If code22 repeats successfully, the regression lies in the first-file changes between `1.1.1` and `1.1.4`.
- If code22 still executes only once, both historical file versions are effectively excluded and the next candidate must add read-only runtime tracing around the purchase transition, page navigation and client lifecycle without changing the two files or white-screen-related client code.
