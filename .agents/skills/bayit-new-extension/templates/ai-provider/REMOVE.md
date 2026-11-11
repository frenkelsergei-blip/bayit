# Remove __NAME_EN__

1. If the family uses __NAME_EN__, a parent first chooses another provider in the AI window.
2. Run `node app/scripts/bayit-extension.mjs remove __ID__`. It deletes `shared/extensions/__ID__.mjs` and `tests/extension-__ID__.test.mjs`, takes its line out of `shared/extensions/ai-providers.mjs` and its record out of `shared/extensions/installed.json`.

The saved key stays encrypted in the household secrets until a parent removes it in the AI window. Bayit never deletes family data on removal.
