# Remove the core editor (negative fixture)

```bash
node app/scripts/bayit-extension.mjs remove core-editor
```

Remove does not undo the line its test added to `shared/features.mjs`; that leftover is exactly what the apply-and-remove check must catch.
