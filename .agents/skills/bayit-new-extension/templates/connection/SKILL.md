---
name: bayit-add-__ID__
description: Adds a __NAME_EN__ card to Bayit's Settings › Accounts & connections, with its setup guide and panel, as an extension. Use when a family wants __NAME_EN__ listed among their connections.
---

# __NAME_EN__ connection

## What it adds

A **__NAME_EN__** row under **Settings › Accounts & connections › More connections** (optional, never counted in the To start bar), with the same guide layout as every other connection and its own panel. <!-- TODO(bayit): what it brings, in the family's words, and which outside addresses it calls -->

## Ask first

- Does the family have a __NAME_EN__ account? Creating it is the person's job; codes are pasted by them in the app, never in chat or files.

## Apply

```bash
node app/scripts/bayit-extension.mjs apply <this folder>
```

## Verify

```bash
node app/scripts/bayit-extension.mjs check
cd app && npm run build:cloud
```

Then open Settings › Accounts & connections in Hebrew and English, light and night, on a phone and a desktop: the row is under More connections, its guide opens, and its panel opens from the last step.

## Troubleshooting

- The row is missing: the panel line in `app/src/extensions/connection-panels.jsx` is missing (`check` reports it), or the person is a child and the entry is `adultsOnly`.
- The build fails in `__ID__-panel.jsx`: an import path; extension files import shared parts from `../`.

Remove it with `REMOVE.md`.
