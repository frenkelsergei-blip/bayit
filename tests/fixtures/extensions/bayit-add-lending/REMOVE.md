# Remove "Lent & borrowed"

```bash
node app/scripts/bayit-extension.mjs remove lending
```

This deletes the module's four files and takes its lines out of `shared/extensions/features.mjs`, `shared/extensions/modules.mjs` and `app/src/extensions/screens.jsx`, and its record out of `shared/extensions/installed.json`.

**What the family saved stays stored and hidden** (feature-module rule, 2026-11-10). Applying the package again brings everything back. To delete it on purpose, a parent first downloads a copy (`GET /api/households/<id>/extensions/lending/export`) and then deletes it (`POST /api/households/<id>/extensions/lending/delete` with `{"confirm":"lending","baseRevision":…}`, recent sign-in required).
