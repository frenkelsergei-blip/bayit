---
name: bayit-add-core-editor
description: NEGATIVE test fixture. An extension whose manifest is valid but which edits a core file. The apply-and-remove check must fail on it. Never install it.
---

# Core editor (negative fixture)

`app/scripts/bayit-extension-ci.mjs` (`npm run test:extensions`) applies every shipped extension package to a clean copy, runs its tests, removes it and requires the copy to be byte-identical to before. This package proves the check notices an extension that changes a core file it does not declare: its test appends a line to `shared/features.mjs`. The check must report it as failing at "no trace". It edits only inside a scratch copy made by that check (`BAYIT_EXTENSION_CI=1`), never a real installation.

## Apply

Never apply it to a family's copy:

```bash
node app/scripts/bayit-extension.mjs apply tests/fixtures/extensions/negative/bayit-add-core-editor
```
