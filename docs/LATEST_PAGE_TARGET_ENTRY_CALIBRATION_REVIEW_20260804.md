# Latest-page target-entry calibration review — 2026-08-04

## Source

- Workflow run: `30928725220`
- Artifact: `latest-page-target-entry-calibration`
- Common menu coordinate: portrait CSS `(328, 740)`

## Safe execution result

- five pages completed;
- both runtime files loaded on every page;
- no fatal browser error;
- no uncaught page error;
- no order request was observed or allowed;
- no runtime file, Android client, production default channel or authorization outcome changed;
- no payment was completed;
- no candidate APK was built.

## Per-page result

- Page 1: target screen visually confirmed; three target read requests appeared in the seven-second target window.
- Page 2: candidate click produced no visual change and no target request. The coordinate is invalid.
- Page 3: target screen visually confirmed; three target read requests appeared in the seven-second target window.
- Page 4: target screen visually confirmed; no new target read request appeared because the screen used already-loaded data.
- Page 5: the exploratory center click only changed the title animation. Opening the common menu still produced the save/load/settings panel, not the target screen.

Validated target-entry pages: `3/5`.

## Conclusion

- `captureOk: true`
- `targetEntryVisualValidated: false`
- `validatedPages: 3`
- overall `ok: false`
- project promotion allowed: `false`

The next run must be limited to pages 2 and 5:

- Page 2: retry a lower/centered point on the same vertical menu item, near portrait CSS `(230, 540)`.
- Page 5: click the title graphic near portrait CSS `(90, 400)` rather than the character center; capture after each of two safe taps, then reopen the common menu.

The first/second/re-entry functional sequence remains blocked until all five target entries are positively validated.
