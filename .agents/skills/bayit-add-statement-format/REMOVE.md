# Remove a statement format added with this skill

This skill itself changes nothing in Bayit. Each format it made is its own extension:

1. `node app/scripts/bayit-extension.mjs remove <id>` deletes its files, its line in `shared/extensions/statement-formats.mjs` and its record in `shared/extensions/installed.json`.
2. Delete `local-extensions/<id>/` only if the person no longer wants to re-apply it.
3. Delete any statement text you extracted while writing it (it was kept outside the repository).

Transactions already imported stay in Expenses.
