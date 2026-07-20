# GG control-center baseline

Frozen before the v1.4 control-center work.

- Stable base commit: `93de898c4c69d60386140cdfbb90f5be7c6669d5`
- Client: GG `1.3.1` (`versionCode 7`)
- Administrator: GG 管理器 `1.2.1` (`versionCode 6`)
- Worker API: v2
- Current secure-client session: 2 hours
- Current secure-client offline grace: 6 hours
- Current runtime lease: 6 hours
- Current challenge lifetime: 90 seconds
- Current self-unbind penalty: 6 hours
- Current self-unbind cooldown: 24 hours
- Current self-unbind limit: 5 per 30 days
- Existing clients remain compatible while v3 is developed.

Rollout order:

1. Add D1 control-center schema and defaults.
2. Deploy a backward-compatible Worker v3.
3. Add dynamic policy support to GG v1.4.0.
4. Upgrade GG 管理器 to the complete control console.
5. Run migration, lifecycle, build, static and compatibility tests.
6. Merge only after all checks pass.
