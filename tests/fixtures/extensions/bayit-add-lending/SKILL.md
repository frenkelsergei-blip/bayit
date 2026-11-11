---
name: bayit-add-lending
description: Test fixture for Bayit's feature-module seam. Adds the "Lent & borrowed" screen with its own records. Never install it in a family's copy.
---

# Add "Lent & borrowed" (test fixture)

This package exists so `tests/feature-modules.test.mjs` can apply, check and remove a real feature module end to end. It is the smallest complete module: a feature entry and a manifest (`shared/extensions/lending.mjs`), a screen entry with a lazily loaded screen (`app/src/extensions/lending.jsx`, `app/src/extensions/lending/lending-screen.jsx`) and its own synthetic tests, which run the core conformance suite.

## Ask first

Nothing: it needs no key, no choice and no outside address. Feature modules may not call outside services in the first version.

## Apply

```bash
node app/scripts/bayit-extension.mjs apply tests/fixtures/extensions/bayit-add-lending
```

## Verify

```bash
node app/scripts/bayit-extension.mjs check
cd app && npm run test:domain && npm run build:cloud
```

A parent turns it on in Settings › Features. Remove it with `REMOVE.md`.
