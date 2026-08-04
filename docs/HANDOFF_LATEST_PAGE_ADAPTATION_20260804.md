# Latest-page adaptation handoff — 2026-08-04

## User correction that controls the next phase

The two runtime files provide a default-enabled no-login capability. A clean browser profile must therefore not be treated as a reason to stop the purchase-flow test. Login-state warnings from the target page are observations only; the acceptance flow must continue through the purchase action.

## Current production safety boundary

- The production default runtime channel has not been switched.
- code19, code20, code21 and code22 remain isolated diagnostic candidates.
- No previous candidate is recorded as a confirmed fix.
- Client page, navigation and prior white-screen-related code must remain unchanged while the runtime-file adaptation is tested.

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
- a first purchase action reached its local response UI in calibrated cases;
- the current/historical version pairs behaved the same before and during the first purchase action;
- no real payment was completed.

Evidence:

- `docs/TARGET_PAGE_WEBVIEW_BROWSER_TEST_STATUS.json`
- `docs/TARGET_PAGE_MENU_FLOW_TEST_STATUS.json`
- `docs/TARGET_PAGE_PURCHASE_ACTION_TEST_STATUS.json`
- artifacts `target-page-webview-browser-test`, `target-page-menu-flow-test`, and `target-page-purchase-action-probe`

## Invalid or incomplete conclusions that must not be reused

1. The first browser blank-page result was caused by a browser-policy mismatch and is invalid.
2. A target-page login warning in a clean browser is not an acceptable stopping condition because the no-login capability is default-enabled.
3. A successful first purchase action does not prove the repeat defect is fixed.
4. The previous third-action coordinate result is incomplete because page re-entry can show a resume/restore screen before the purchase page is reached.
5. code22 must not be promoted solely because it uses historical files.

## Updated defect statement

The required behavior is:

1. Load either mobile target URL directly.
2. Open the runtime entry.
3. Enter the purchase page without requiring target-page login.
4. Complete a first local purchase action.
5. Complete a second local purchase action on the same page.
6. Leave and re-enter, clear any resume/restore screen, then complete a third local purchase action.
7. The Android client must remain in the browser and must not return to its activation screen.

## Latest-page adaptation direction

The next candidate must use the current production runtime-file baseline and add only a compatibility layer for the latest page request and lifecycle behavior.

Required coverage:

- repeated request handling on the same page;
- reused script elements and both property/attribute URL assignment paths;
- current fetch, XHR and JSONP-style delivery paths;
- page re-entry, visibility restoration and resume/restore screens;
- idempotent hooks with no duplicate UI or duplicate response;
- default-enabled no-login state reapplied after lifecycle changes;
- no change to Android MainActivity, client network hosts, navigation behavior, prior white-screen-related code or the production default runtime channel.

## Acceptance matrix for the next candidate

Run both the current production baseline and the adapted candidate against all five supplied URLs.

For every URL record:

- initial page load;
- both runtime-file load counts;
- entry open/close/reopen;
- purchase page reached;
- first local purchase response;
- second same-page local purchase response;
- page leave/re-entry;
- resume/restore screen handling;
- third local purchase response;
- main-frame URL history;
- non-HTTP navigation attempts;
- dialogs, console errors and request failures;
- whether the Android client activation screen is shown in the signed APK test.

A candidate passes only when all five URLs complete all three purchase actions and no case returns to the activation screen.

## Next deliverable

Build an isolated code23 candidate from the current runtime baseline with latest-page compatibility, run the five-URL browser matrix, build/sign the APK only after static and browser checks pass, and keep the production default channel unchanged until the user confirms the same-device result.
