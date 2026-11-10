# Remove My AI

1. If the family uses My AI, a parent first chooses another provider in the AI window (or Bayit falls back to no AI).
2. Run:

```bash
node app/scripts/bayit-extension.mjs remove my-ai
```

This deletes `shared/extensions/my-ai.mjs` and `tests/extension-my-ai.test.mjs`, takes its line out of `shared/extensions/ai-providers.mjs` and its record out of `shared/extensions/installed.json`. The saved key stays encrypted in the household secrets until a parent removes it in the AI window.
