# Remove the Example Bank statement format

```bash
node app/scripts/bayit-extension.mjs remove example-bank
```

This deletes `shared/extensions/example-bank.mjs` and `tests/extension-example-bank.test.mjs`, takes its line out of `shared/extensions/statement-formats.mjs` and its record out of `shared/extensions/installed.json`. Nothing else was changed by apply, so nothing else needs undoing. Statements already imported stay in Expenses.
