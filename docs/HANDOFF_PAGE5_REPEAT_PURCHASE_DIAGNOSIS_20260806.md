# Page 5 repeat-purchase diagnosis handoff — 2026-08-06

## Current checkpoint

- Working branch: `diagnostics/page5-guard-full-entry-20260805`
- Implementation under test: `fix/page5-missing-constructor-mobile-bridge-20260806`
- Runtime SHA-256: `57765fbb8d9a0529ed1463623f1bed9c05052e76396a6aaa89fdd2ecc673bc72`
- Production default channel: unchanged
- Android client code: unchanged
- APK built in this phase: no
- Confirmed compatibility fix: no

## Reproduced behavior

The browser matrix reproduces the complete sequence consistently:

1. The first final action reaches its result and remains on the target page.
2. Closing the result and reopening the same item details on the same page works.
3. The second final action in the same runtime instance enters the session-navigation branch and leaves the target page.
4. A complete page/runtime reentry restores the third action to the same behavior as the first.

The following are excluded as the immediate cause:

- page entry coordinates;
- list loading;
- item-card opening;
- final-action coordinates;
- page close and reopen;
- duplicate event listeners;
- page errors or blocked mutations.

## Shop-page close/reopen A/B result

Run: `31070720454`

Artifact:

- name: `page5-shop-close-reopen-purchase-probe`
- ID: `8955621806`
- digest: `sha256:9b9f888f8099598fa5628eaa406fb5ea7c51be6cff30540179c3d3e0663a8fdf`

Result:

- page return changed the screen;
- reopening loaded the list again;
- list read count: `4`;
- list request count: `1`;
- second item detail opened normally;
- second final action still produced one session request and one external navigation;
- full reentry third action stayed on the page;
- page error count: `0`;
- blocked mutation count: `0`.

Recorded status:

- `docs/PAGE5_SHOP_CLOSE_REOPEN_PURCHASE_PROBE_STATUS.json`
- commit: `60e7199103122d5f74995f1c38d8f8fa9fe590b0`

Conclusion: closing and reopening only the page does not reset the runtime state.

## Three-attempt callback-scope result

Run: `31071348661`

Artifact:

- name: `page5-purchase-scope-triplet-probe`
- ID: `8955829075`
- digest: `sha256:4af2f9ce57da7ebc6723e2eaeef4404d649da3198753aaf446836004931424de`

The persistent callback breakpoints captured all three attempts:

- first: one snapshot;
- second: four snapshots through the session branch;
- third after full reentry: one snapshot.

At the shared pre-router callback:

- first decoded usage value: `0`;
- second decoded usage value: `1`;
- third-after-reentry decoded usage value: `0`;
- configured maximum: `1` on all captured attempts;
- requested quantity: `1`.

The second attempt alone continued through:

1. pre-router callback;
2. post-router callback;
3. action router;
4. session entry.

The first and third attempts did not continue through the latter three breakpoints.

Recorded status:

- `docs/PAGE5_PURCHASE_SCOPE_TRIPLET_PROBE_STATUS.json`
- commit: `56a2c750ad0124f81fc6f5badb58d229a0ee57cf`

## Refined conclusion

The state change is not an unreset event-handler flag. It is the runtime's recorded usage changing from `0` to `1` while the configured maximum remains `1`. The second action therefore fails the local `current + requested <= maximum` condition and continues to the normal session path.

A complete runtime reentry makes the local usage appear as `0` again. Deliberately reconstructing the runtime after every result, clearing that value, increasing the maximum, short-circuiting the session path, or forcing the first branch would change the authorization/limit outcome rather than repair a lifecycle defect. No such patch was applied.

## Other preserved evidence

- `docs/PAGE5_SECOND_PURCHASE_CALLBACK_SCOPE_STATUS.json`
- callback-scope artifact ID: `8955379002`
- callback-scope digest: `sha256:4eeeeb20e68d3cbe4303f10581ba38934f984b260b5bdf3f53bd0aca17671e9a`
- status commit: `b9b8403ae78130eea57b980468b7047c72d2be71`
- `docs/PAGE5_SECOND_PURCHASE_CALLCHAIN_SLICE_STATUS.json`
- call-chain artifact ID: `8949917252`

## Invalid conclusions to avoid

- Do not treat repeated list opening as a completed fix.
- Do not promote the current implementation branch as fixing the second same-runtime action.
- Do not describe the recorded usage value as a stale callback marker.
- Do not repeat historical rollback matrices.
- Do not build or distribute an APK that resets usage, changes the maximum, fabricates state, or suppresses the session decision.

## Safe continuation boundary

A future compatibility candidate may only improve ordinary authorized navigation, UI cleanup, callback disposal, or instance reconstruction that preserves the same usage and maximum values. It must not:

- fabricate login state;
- alter an authorization or limit result;
- fabricate an order, balance, entitlement or successful response;
- suppress a legitimate session decision;
- reset recorded usage to obtain another first-action outcome;
- complete a real mutation in automated tests.

## Final status for this investigation

- Root cause identified: yes.
- Duplicate listener/lifecycle defect confirmed: no.
- Safe JS correction available for the requested second-success behavior: no.
- Runtime modified: no.
- Android source modified: no.
- New APK built: no.
- Existing production/default channel modified: no.
