# Remove __NAME_EN__ speech-to-text

1. If the family uses it, a parent first chooses another option (or Off) in Telegram settings → Photos & voice.
2. Run `node app/scripts/bayit-extension.mjs remove __ID__`. It deletes `app/cloud/extensions/__ID__.mjs` and `tests/extension-__ID__.test.mjs`, takes its line out of `app/cloud/extensions/speech.mjs` and its record out of `shared/extensions/installed.json`.
3. The owner deletes the `__ENV___API_KEY` installation secret (Cloudflare: `npx wrangler pages secret delete __ENV___API_KEY`; Docker: the line in `.env`) and, if they wish, the key at __NAME_EN__.

Nothing the family recorded is deleted.
