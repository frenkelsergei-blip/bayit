# Remove the __NAME_EN__ connection

Run `node app/scripts/bayit-extension.mjs remove __ID__`. It deletes `shared/extensions/__ID__.mjs`, `app/src/extensions/__ID__-panel.jsx` and `tests/extension-__ID__.test.mjs`, takes its lines out of `shared/extensions/connections.mjs` and `app/src/extensions/connection-panels.jsx`, and its record out of `shared/extensions/installed.json`. Rebuild the app afterwards.

Anything the family set up at __NAME_EN__ itself (an account, a code) stays there until they remove it. Bayit never deletes family data on removal.
