# Remove __NAME_EN__ sign-in

1. Make sure every member can still sign in another way (Google, or another method) before removing it.
2. Run `node app/scripts/bayit-extension.mjs remove __ID__`. It deletes `app/cloud/extensions/__ID__.mjs` and `tests/extension-__ID__.test.mjs`, takes its line out of `app/cloud/extensions/signin.mjs` and its record out of `shared/extensions/installed.json`.
3. The owner deletes the `__ENV___CLIENT_ID` and `__ENV___CLIENT_SECRET` installation secrets and the OAuth app at __NAME_EN__.

Accounts and family data stay; existing sessions end when they expire or are signed out in Settings → Devices & security.
