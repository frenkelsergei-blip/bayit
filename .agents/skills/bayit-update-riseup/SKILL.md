---
name: bayit-update-riseup
description: Adapt Bayit's optional RiseUp connection when RiseUp changes its external API or the @riseup-oss/mcp package releases a new version, then prepare a release. Use when RiseUp syncing breaks, RiseUp announces API changes, or someone asks to update the RiseUp integration.
---

# Update the RiseUp connection

Everything RiseUp-specific is in `app/cloud/riseup.mjs`. Read `docs/riseup.md` ("When RiseUp changes its API") and the rules in `.agents/skills/README.md`.

1. **Find out what changed.** Read the release notes and source of the official MIT package [`@riseup-oss/mcp`](https://github.com/riseup-oss/mcp). It documents the endpoints, scopes and transaction fields. Compare them with what Bayit expects:
   - `RISEUP_API_VERSION` and the base URL
   - `riseupGet()` error mapping (401 means a revoked token, 403 means a missing scope)
   - `rowFromRiseup()` field mapping
   - `CATEGORY_MAP`
   - `syncRiseup()` endpoints (`/api/external/transactions?cashflowMonth=`, `/api/external/balances/current`).

   To read the package source, download it into its own empty folder outside the repo and only read it; don't run it.
2. **Change the mapping** in `app/cloud/riseup.mjs` only. Keep:
   - upsert by RiseUp's transaction id, keeping Bayit category edits
   - removal of rows RiseUp no longer returns, but never wiping a month RiseUp returned empty
   - the owner's visibility
   - encrypted tokens.
3. **Update `RISEUP_API_VERSION`** to the new package or API version.
4. **Update the synthetic fixtures** in `tests/riseup.test.mjs` to the new response shape, and add a test for every new or renamed field. Run `cd app && npm run test:domain`.
5. **Schema.** Add a new migration file in `app/cloud/migrations/` only if new stored fields are needed. Never edit an applied migration.
6. **Release.** Add a release-note line ("RiseUp: updated to … ") in `app/src/app-version.jsx`, then hand over to `bayit-release`. A person with a RiseUp account should press **Sync now** on the RiseUp card after the release, to confirm it with real data.

Never test with someone's real RiseUp token in code, logs or tests. They paste it in the app.
