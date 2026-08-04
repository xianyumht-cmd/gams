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
4. The calibrated touch sequence entered the purchase screen for both version pairs.
5. The clean browser session displayed a page-level request to log in again or check the network for both version pairs.

Evidence:

- `docs/TARGET_PAGE_COORDINATE_PROBE_STATUS.json`
- `docs/TARGET_PAGE_MENU_COORDINATE_PROBE_STATUS.json`
- `docs/TARGET_PAGE_SHOP_COORDINATE_PROBE_STATUS.json`

## Purchase-action probe

A final 10-case probe used both version pairs across all five supplied target URLs. Each case attempted:

1. entering the purchase screen;
2. a first purchase-control tap;
3. a second tap on the same page;
4. re-entering the target page and attempting a third tap.

Confirmed results:

- All 10 cases completed without a fatal browser error.
- No uncaught page error was recorded.
- Both version pairs remained on the supplied target URL; no main-frame login redirect occurred in the clean browser session.
- The calibrated first target reached the purchase list under both version pairs.
- Its first purchase-control tap opened the item detail panel under both version pairs.
- Its second same-page tap closed that detail panel under both version pairs.
- Current and full-historical screenshots matched at the purchase-list and first-action stages for that calibrated target.
- The page displayed a login/network warning after the purchase-control tap.
- After page re-entry, target-page resume prompts and per-page canvas layouts prevented a single fixed coordinate from producing a valid third purchase action across all five targets. Third-action screenshots must not be interpreted as a repeat-purchase result.

Evidence:

- `docs/TARGET_PAGE_PURCHASE_ACTION_TEST_STATUS.json`
- artifact: `target-page-purchase-action-probe`

## What this diagnosis proves

- Repository publication and runtime encryption/decryption are not causing the repeat defect.
- The second-file delivery path is not the sole cause.
- Changing the second-file version from `1.0.5` to `1.0.2` does not change the device result.
- Before and through the calibrated first purchase-control interaction, the full historical pair does not show a meaningful behavioral difference from the current-first pair.
- The initial browser blank page was a browser-policy mismatch, not a valid reproduction of the user's device defect.
- Both version pairs can load the supplied page and enter the purchase list.

## Superseding correction from the user

The two runtime files provide a default-enabled no-login capability. Therefore, a missing target-page login state is not a valid reason to stop purchase testing, and the login/network warning observed in the clean browser is evidence that the current compatibility path did not complete its intended local response.

The earlier statements that a successful purchase required the user's authenticated browser state are superseded and must not be used for future decisions.

The valid acceptance rule is now:

1. continue through the purchase action in a clean browser profile;
2. require the first local response to succeed without target-page login;
3. require a second same-page local response;
4. re-enter the page, handle any resume/restore prompt, and require a third local response;
5. verify that the signed Android candidate remains in the browser and does not return to the activation screen.

## Updated next phase

The next candidate uses the current runtime baseline (`1.1.4 + 1.0.5`) and adds an isolated latest-page compatibility layer. It must cover repeated request handling, reused script elements, property and attribute URL assignment, fetch/XHR/JSONP-style paths, and page lifecycle restoration while leaving Android MainActivity, client hosts, navigation behavior, prior white-screen-related code and the production default runtime channel unchanged.

Canonical handoff:

- `docs/HANDOFF_LATEST_PAGE_ADAPTATION_20260804.md`
- `docs/LATEST_PAGE_COMPAT_ACCEPTANCE_STATUS.json`
