---
name: bayit-add-__ID__
description: Adds the __NAME_EN__ screen to Bayit, with the family's own records, as a feature module. Use when a family wants __NAME_EN__ in their Bayit.
---

# __NAME_EN__

## What it adds

A **__NAME_EN__** screen at `#x/__ID__` with its own records, which a parent turns on in **Settings › Features**. <!-- TODO(bayit): what it keeps, in the family's words -->

Rules every feature module keeps (first version): records are owned, private by default and shared with the core's control; an adults-only module never reaches a child; no outside services, no Today card, reminders, Telegram, Statistics or Bayit AI. Removing it keeps what the family saved, hidden; applying it again brings it back.

## Ask first

- Is it for everyone or adults only, and may children add records or only read them?

## Apply

```bash
node app/scripts/bayit-extension.mjs apply <this folder>
```

## Verify

```bash
node app/scripts/bayit-extension.mjs check
cd app && npm run test:domain && npm run build:cloud
```

Then turn it on in Settings › Features and open `#x/__ID__` in Hebrew and English, light and night, on a phone and a desktop, as a parent, another adult and a child.

Remove it with `REMOVE.md`.
