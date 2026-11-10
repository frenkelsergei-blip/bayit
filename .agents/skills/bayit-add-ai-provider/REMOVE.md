# Remove an AI provider added with this skill

This skill itself changes nothing in Bayit. Each provider it made is its own extension:

1. If the family uses that provider, a parent first chooses another one in the AI window.
2. `node app/scripts/bayit-extension.mjs remove <id>` deletes its files, its line in `shared/extensions/ai-providers.mjs` and its record in `shared/extensions/installed.json`.
3. Delete `local-extensions/<id>/` only if the person no longer wants to re-apply it.

The saved key stays encrypted in the household secrets until a parent removes it in the AI window.
