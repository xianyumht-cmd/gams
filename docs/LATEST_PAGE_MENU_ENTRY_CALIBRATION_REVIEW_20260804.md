# Latest-page menu-entry calibration review — 2026-08-04

## Source

- Workflow run: `30927101878`
- Artifact: `latest-page-menu-entry-calibration`
- Capture coordinate: portrait CSS `(50, 180)`
- Pages: five supplied target pages

## Capture result

The capture-only workflow completed safely:

- five pages completed;
- both runtime files loaded on all five pages;
- no fatal browser error;
- no uncaught page error;
- no order request was observed or allowed;
- no runtime file, Android client, production default channel or authorization outcome changed;
- no payment was completed;
- no candidate APK was built.

## Visual validation

The coordinate did not open the intended common side menu on any page.

- Page 1: before and after images were identical.
- Page 2: before and after images were identical.
- Page 3: only normal animated/background pixels changed; no menu opened.
- Page 4: the page advanced to unrelated scene content; no menu opened.
- Page 5: normal title/text animation changed; no menu opened.

Validated menu-entry pages: `0/5`.

## Conclusion

- `captureOk: true`
- `menuEntryValidated: false`
- `validatedPages: 0`
- overall `ok: false`

The first coordinate was based on a rotated-layout assumption and is invalid. The next calibration must use the actual portrait screenshot coordinate of the common menu control, approximately around screenshot `(655, 1480)`, corresponding to portrait CSS near `(328, 740)`. This remains a calibration coordinate only and must be visually validated before any downstream interaction is attempted.
