# Remaining target-entry calibration review — 2026-08-04

## Source

- Workflow run: `30929501667`
- Artifact: `latest-page-remaining-target-entry-calibration`
- Pages retested: 2 and 5 only

## Safe execution result

- two pages completed;
- both runtime files loaded on both pages;
- no fatal browser error;
- no uncaught page error;
- no order request was observed or allowed;
- no runtime file, Android client, production default channel or authorization outcome changed;
- no payment was completed;
- no candidate APK was built.

## Per-page result

### Page 2

The retry coordinate portrait CSS `(230, 540)` successfully opened the target screen.

- visual target screen confirmed;
- three target read requests appeared in the seven-second target window;
- no order request appeared.

Page 2 target-entry status: validated.

### Page 5

Two safe taps at portrait CSS `(90, 400)` only completed or replayed the title graphic animation. They did not leave the cover screen and did not produce a target read request.

The later common-menu tap at `(328, 740)` also did not open the visible `菜单` control. Screenshot geometry shows this page places the control farther right than the other pages. The visible menu icon center is approximately portrait CSS `(351, 741)`.

Page 5 target-entry status: not validated.

## Combined target-entry progress

- Pages 1, 2, 3 and 4: validated.
- Page 5: pending.
- Validated pages: `4/5`.

The first/second/re-entry functional sequence remains blocked until page 5 has a positively validated target-screen route.

## Exact next step

Run a page-5-only capture with a single safe tap on the actual visible `菜单` icon near portrait CSS `(351, 741)`. Capture before and after and block all order requests. If the panel opens, calibrate its page-specific target entry without testing purchase actions yet.
