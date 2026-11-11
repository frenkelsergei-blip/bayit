# Remove __NAME_EN__ statements

Run `node app/scripts/bayit-extension.mjs remove __ID__`. It deletes `shared/extensions/__ID__.mjs` and `tests/extension-__ID__.test.mjs`, takes its line out of `shared/extensions/statement-formats.mjs` and its record out of `shared/extensions/installed.json`.

Transactions already imported stay in Expenses: Bayit never deletes family data on removal. New __NAME_EN__ statements are refused as "not supported yet".
