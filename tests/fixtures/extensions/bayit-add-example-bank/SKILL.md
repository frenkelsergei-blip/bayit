---
name: bayit-add-example-bank
description: Test fixture for Bayit's extension format. Adds the fictional "Bayit Example Bank" statement format. Never install it in a family's copy.
---

# Add the Example Bank statement format (test fixture)

This package exists so `tests/extension-skills.test.mjs` can apply and remove a real extension end to end. It reads a fictional bank's statement and shows the smallest complete extension: one payload file, one registry line, its own synthetic tests.

## Ask first

Nothing: it needs no key, no choice and no outside address.

## Apply

```bash
node app/scripts/bayit-extension.mjs apply tests/fixtures/extensions/bayit-add-example-bank
```

## Verify

```bash
node app/scripts/bayit-extension.mjs check
cd app && npm run test:domain && npm run build:cloud
```

Remove it with `REMOVE.md`.
