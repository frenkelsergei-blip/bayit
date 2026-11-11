# Remove __NAME_EN__

Run `node app/scripts/bayit-extension.mjs remove __ID__`. It deletes `shared/extensions/__ID__.mjs`, `app/src/extensions/__ID__.jsx`, `app/src/extensions/__ID__/__ID__-screen.jsx` and `tests/extension-__ID__.test.mjs`, takes its lines out of `shared/extensions/features.mjs`, `shared/extensions/modules.mjs` and `app/src/extensions/screens.jsx`, and its record out of `shared/extensions/installed.json`. Rebuild the app afterwards.

What the family saved stays stored and hidden: applying the package again brings it back. To delete it on purpose, a parent downloads a copy first (`GET /api/households/<id>/extensions/__ID__/export`), then deletes it (`POST /api/households/<id>/extensions/__ID__/delete` with `{"confirm":"__ID__","baseRevision":…}`, recent sign-in required).
