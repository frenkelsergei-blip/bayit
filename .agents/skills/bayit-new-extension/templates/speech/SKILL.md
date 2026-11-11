---
name: bayit-add-__ID__
description: Lets Bayit transcribe voice messages (Telegram voice notes, voice questions) with __NAME_EN__, as an extension. Use when a family wants __NAME_EN__ for speech-to-text.
---

# __NAME_EN__ speech-to-text

## What it adds

**__NAME_EN__** in **Telegram settings → Photos & voice**, as a choice for transcribing voice messages. It calls only the address in `extension.json` → `outbound`. <!-- TODO(bayit): the price in one line -->

## Ask first

- Does the owner of the installation have a __NAME_EN__ account and key? They create it themselves and set it as an installation secret, typed by them, never pasted in chat:
  - Cloudflare: `cd app && npx wrangler pages secret put __ENV___API_KEY`
  - Docker: `__ENV___API_KEY=…` in the `.env` file, then restart.

## Apply

```bash
node app/scripts/bayit-extension.mjs apply <this folder>
```

## Verify

```bash
node app/scripts/bayit-extension.mjs check
```

Then a parent chooses __NAME_EN__ in Photos & voice and sends one short voice message to the bot.

## Troubleshooting

- "not available" next to __NAME_EN__: the key is not set on this installation, or the server was not restarted after setting it.
- "could not be transcribed": the key was rejected, the account has no credit, or the audio format is not one the provider accepts.

Remove it with `REMOVE.md`.
