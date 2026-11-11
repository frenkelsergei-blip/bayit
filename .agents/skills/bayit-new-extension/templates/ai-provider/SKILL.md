---
name: bayit-add-__ID__
description: Adds __NAME_EN__ to Bayit's AI provider choice, as an extension. Use when a family wants Bayit's AI helper to run on __NAME_EN__.
---

# __NAME_EN__ (AI provider)

## What it adds

**__NAME_EN__** in **Settings → Accounts & connections → AI helper**, next to the built-in providers. <!-- TODO(bayit): one sentence in the family's words -->
It calls only the addresses in `extension.json` → `outbound`.

## Ask first

- Does the family already have a __NAME_EN__ account and a key? Creating them is the person's job. The key is pasted by a parent in the app, never in chat or files.

## Apply

```bash
node app/scripts/bayit-extension.mjs apply <this folder>
```

## Verify

```bash
node app/scripts/bayit-extension.mjs check
```

Then a parent opens the AI window, chooses __NAME_EN__, pastes the key, asks one question, and checks that a prepared change still waits for **Apply**.

## Troubleshooting

- "This key was not accepted": the key belongs to another provider or was copied with a space; the parent creates a new one.
- No models listed: the account has no credit, or the provider changed its model list.

Remove it with `REMOVE.md`.
