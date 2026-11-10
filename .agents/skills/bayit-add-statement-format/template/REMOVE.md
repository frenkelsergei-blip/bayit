# Remove My Bank statements

```bash
node app/scripts/bayit-extension.mjs remove my-bank
```

This deletes `shared/extensions/my-bank.mjs` and `tests/extension-my-bank.test.mjs`, takes its line out of `shared/extensions/statement-formats.mjs` and its record out of `shared/extensions/installed.json`. Transactions already imported stay in Expenses; new My Bank PDFs are reported as "not supported yet".
