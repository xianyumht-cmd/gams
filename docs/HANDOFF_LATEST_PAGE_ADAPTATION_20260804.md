# Latest-page adaptation handoff — 2026-08-04

## User correction that controls the next phase

The user states that the two runtime files include a default-enabled no-login mode. A clean browser profile must therefore not be used as a reason to stop the diagnostic flow. Page login-state warnings remain evidence that the current flow diverges before the expected completion point.

This statement does not authorize fabricating authentication, account state, orders, balances, entitlements or successful purchase responses. Compatibility work must remain within authorized page execution, lifecycle handling and read-only diagnostics.

## Current production safety boundary

- The production default runtime channel has not been switched.
- code19, code20, code21 and code22 remain isolated diagnostic candidates.
- No previous candidate is recorded as a confirmed fix.
- No code23 APK was built or deployed.
- Client page, navigation and prior white-screen-related code remain unchanged.
- Future compatibility work may observe and preserve authorized state, but must not forge login state or purchase success.

## Completed evidence

### File integrity

The repository publication, encryption, download, decryption and UTF-8 round trip were verified byte-for-byte. Silent file damage is excluded.

Evidence:

- `docs/RUNTIME_ROUNDTRIP_INTEGRITY_20260804.json`
- `docs/RUNTIME_ROUNDTRIP_INTEGRITY_20260804.md`

### Version-isolation tests

- code19: callback-only candidate; repeat defect remained.
- code20: alternate second-file delivery path; repeat defect remained.
- code21: historical second-file candidate; repeat defect remained.
- code22: complete historical pair candidate; built and signed successfully, but not recorded as a confirmed repeat fix.

### Five supplied mobile target URLs

The five supplied URLs were tested in real Chromium with a mobile WebView-style environment and the client-equivalent resource and navigation policy.

Confirmed:

- all five pages loaded;
- both runtime files loaded in every injected case;
- no injected case became blank after matching the client navigation policy;
- no fatal browser error or uncaught page error occurred in the valid page comparison;
- the fixed entry could be opened, closed and opened again after page re-entry;
- the purchase page was reached;
- a first purchase-control interaction reached the page response UI in calibrated cases;
- the current/historical version pairs behaved the same before and during the first purchase-control interaction;
- no real payment was completed.

Evidence:

- `docs/TARGET_PAGE_WEBVIEW_BROWSER_TEST_STATUS.json`
- `docs/TARGET_PAGE_MENU_FLOW_TEST_STATUS.json`
- `docs/TARGET_PAGE_PURCHASE_ACTION_TEST_STATUS.json`
- artifacts `target-page-webview-browser-test`, `target-page-menu-flow-test`, and `target-page-purchase-action-probe`

## Latest compatibility attempt

A temporary `1.1.5 + 1.0.5` browser-only candidate was tested against all five supplied URLs. The acceptance gate failed and correctly prevented APK construction.

Recorded outcome:

- no fatal browser or page error;
- the compatibility module loaded and refreshed;
- none of the expected completion counters advanced;
- the page entered a newer hidden session-check sequence before the later purchase request path;
- the failed sequence did not reach the page's expected completion callback;
- no code23 APK was produced;
- the production default channel was not changed.

Evidence:

- `docs/LATEST_PAGE_COMPAT_ACCEPTANCE_STATUS.json`
- `docs/LATEST_PAGE_SESSION_CONTRACT_STATUS.json`
- `docs/LATEST_PAGE_SESSION_SCRIPT_STATUS.json`
- artifacts `latest-page-compat-acceptance`, `latest-page-session-contract`, and `latest-page-session-script`

## Invalid or incomplete conclusions that must not be reused

1. The first browser blank-page result was caused by a browser-policy mismatch and is invalid.
2. A page login warning in a clean browser is not an acceptable reason to stop read-only diagnosis.
3. A successful first interaction does not prove the repeat defect is fixed.
4. The previous third-action coordinate result is incomplete because page re-entry can show a resume/restore screen before the purchase page is reached.
5. code22 must not be promoted solely because it uses historical files.
6. The failed `1.1.5` candidate must not be packaged or promoted.
7. A synthetic login, synthetic order or fabricated purchase-success response is not a valid compatibility fix.

## Updated defect statement

The authorized diagnostic target is:

1. Load each supplied mobile page directly.
2. Confirm both runtime files load exactly as intended.
3. Open, close and reopen the runtime entry.
4. Reach the purchase page through normal page navigation.
5. Record the exact authorized request sequence for the first and second same-page interactions.
6. Leave and re-enter, handle any resume/restore screen, and record the third interaction.
7. Record page navigation, lifecycle changes, cookies/storage availability, callback registration and errors.
8. Verify that the Android client remains in the browser and does not return to its activation screen.

## Safe latest-page adaptation direction

The next candidate may use the current production runtime-file baseline and add only compatibility handling that preserves legitimate state and current page lifecycle behavior.

Permitted coverage:

- repeated handler installation without duplicate UI;
- reused elements and property/attribute assignment paths;
- current fetch, XHR and JSONP observation and compatibility with documented responses;
- page re-entry, visibility restoration and resume/restore screens;
- callback registration timing and idempotent lifecycle restoration;
- read-only request, response, storage and navigation tracing;
- no change to Android MainActivity, client network hosts, navigation behavior, prior white-screen-related code or the production default runtime channel.

Not permitted:

- forging a logged-in identity;
- suppressing or bypassing an authorization decision;
- fabricating an order, balance, entitlement or successful purchase response;
- completing real payment in automated tests.

## Acceptance matrix for the next safe candidate

Run the current production baseline and a diagnostics-only candidate against all five supplied URLs.

For every URL record:

- initial page load;
- both runtime-file load counts;
- entry open/close/reopen;
- purchase page reached;
- first and second same-page authorized request sequences;
- page leave/re-entry and resume/restore handling;
- third authorized request sequence;
- main-frame URL history;
- non-HTTP navigation attempts;
- dialogs, console errors and request failures;
- callback registration and invocation timing;
- cookie, local storage and session storage availability without exposing secret values;
- whether the Android client activation screen is shown in the signed APK test.

A compatibility change may be promoted only after it passes the read-only matrix and the remaining failure is shown to be a legitimate page API or lifecycle incompatibility rather than an authorization decision.

## Next deliverable

Build an isolated diagnostics-only candidate that records the current page lifecycle and request sequence without changing authorization outcomes. Use the result to make a narrow compatibility correction only where the current page API or lifecycle contract has changed. Keep the production default channel unchanged until the same-device result is confirmed.
