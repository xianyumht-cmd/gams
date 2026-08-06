# Page 5 repeat-purchase diagnosis handoff — 2026-08-06

## Current checkpoint

- Working branch: `diagnostics/page5-guard-full-entry-20260805`
- Implementation under test: `fix/page5-missing-constructor-mobile-bridge-20260806`
- Runtime SHA-256: `57765fbb8d9a0529ed1463623f1bed9c05052e76396a6aaa89fdd2ecc673bc72`
- Production default channel: unchanged
- Android client code: unchanged
- APK built in this phase: no
- Confirmed fix: no

## Reproduced behavior

The browser matrix now reproduces the complete sequence consistently:

1. The first purchase action reaches its result and remains on the target page.
2. Closing the result and reopening product details on the same page works.
3. The second final purchase action in the same runtime instance enters the session-navigation branch and leaves the target page.
4. A complete page/runtime reentry restores the third purchase action to the same behavior as the first.

The following are excluded as the immediate cause:

- shop entry coordinates;
- product list loading;
- product card opening;
- final-action coordinates;
- shop-page close and reopen;
- page errors or blocked order mutations.

## Shop-page close/reopen A/B result

Run: `31070720454`

Artifact:

- name: `page5-shop-close-reopen-purchase-probe`
- ID: `8955621806`
- digest: `sha256:9b9f888f8099598fa5628eaa406fb5ea7c51be6cff30540179c3d3e0663a8fdf`

Result:

- shop page return changed the screen;
- reopening the shop loaded the list again;
- list read count: `4`;
- list request count: `1`;
- second product detail opened normally;
- second final action still produced one session request and one external navigation;
- full reentry third action stayed on the page;
- page error count: `0`;
- blocked order count: `0`.

Recorded status:

- `docs/PAGE5_SHOP_CLOSE_REOPEN_PURCHASE_PROBE_STATUS.json`
- commit: `60e7199103122d5f74995f1c38d8f8fa9fe590b0`

Conclusion: closing and reopening only the shop page does not reset the stale runtime state.

## Three-attempt callback-scope result

Run: `31071348661`

Artifact:

- name: `page5-purchase-scope-triplet-probe`
- ID: `8955829075`
- digest: `sha256:4af2f9ce57da7ebc6723e2eaeef4404d649da3198753aaf446836004931424de`

The persistent callback breakpoints captured all three attempts:

- first: one snapshot;
- second: four snapshots through the abnormal branch;
- third after full reentry: one snapshot.

At the shared pre-router callback:

- first runtime marker value: `0`;
- second runtime marker value: `1`;
- third-after-reentry runtime marker value: `0`.

The second attempt alone continued through:

1. pre-router callback;
2. post-router callback;
3. purchase router;
4. session entry.

The first and third attempts did not continue through the latter three breakpoints.

Recorded status:

- `docs/PAGE5_PURCHASE_SCOPE_TRIPLET_PROBE_STATUS.json`
- commit: `56a2c750ad0124f81fc6f5badb58d229a0ee57cf`

Conclusion: the defect is tied to a runtime-instance-local lifecycle marker. Full page/runtime reentry resets it; shop-page close/reopen does not.

## Other preserved evidence

- `docs/PAGE5_SECOND_PURCHASE_CALLBACK_SCOPE_STATUS.json`
- callback-scope artifact ID: `8955379002`
- callback-scope digest: `sha256:4eeeeb20e68d3cbe4303f10581ba38934f984b260b5bdf3f53bd0aca17671e9a`
- status commit: `b9b8403ae78130eea57b980468b7047c72d2be71`

## Invalid conclusions to avoid

- Do not treat product-list repeat opening as a completed purchase fix.
- Do not promote the current implementation branch as fixing same-runtime repeat purchase.
- Do not repeat the historical version rollback matrix.
- Do not treat workflow conclusion `failure` as probe failure when execution and artifact upload succeeded; several runs failed only during status publication because generated files left the worktree dirty.
- Do not build an APK from the present diagnostic state.

## Safe continuation boundary

The next compatibility candidate must address runtime lifecycle cleanup or legitimate instance reconstruction only. It must not:

- fabricate login state;
- alter an authorization result;
- fabricate an order, balance, entitlement or successful response;
- suppress a legitimate session decision;
- complete real payment in automated tests.

A candidate is not accepted until the browser matrix verifies:

1. first action remains on the page;
2. second action in the continued user flow remains on the page;
3. third action after reentry remains on the page;
4. all three product details open;
5. no page errors;
6. no external navigation;
7. no real order mutation;
8. production default and Android client remain unchanged.

## Next task

Create a lifecycle-only candidate in an authorized test environment that reconstructs the affected runtime instance after the result is closed, then run the three-attempt matrix. Do not patch the session-entry branch or force the runtime marker value directly.
