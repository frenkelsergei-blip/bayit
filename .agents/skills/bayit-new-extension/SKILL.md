---
name: bayit-new-extension
description: Create a brand-new Bayit extension from scratch (a new AI provider, bank statement format, speech-to-text service, sign-in method, connection card or a whole screen with its own records), correctly, without knowing Bayit's internals, and publish it for other families. Use when someone wants to add a capability to Bayit that no existing skill covers, asks "how do I build an extension / plugin / add-on", or wants to share one.
---

# Create a new Bayit extension

Bayit grows like NanoClaw: **core stays small, capabilities arrive as extensions.** An extension is a few new files plus one line in a local registry file that upstream ships empty and never edits, so updating Bayit never breaks it. This skill turns an idea into a complete extension package, checks it, installs it in the person's own copy, and shows how to share it.

Read first: `docs/extension-skills.md` (the package format) and the rules in `.agents/skills/README.md`. The scaffold script is `app/scripts/bayit-new-extension.mjs`; it writes from `templates/` in this folder.

## 1. Ask what they want, in plain words

One question: "What should Bayit be able to do that it can't today?" Then map the answer to a seam (`node app/scripts/bayit-new-extension.mjs seams` prints this list with the contract to read for each):

| They want… | Kind | Notes |
|---|---|---|
| Bayit's AI helper to run on another model or service | `ai-provider` | `bayit-add-ai-provider` has more detail on wire formats |
| Expenses to read another bank's or card's statement PDF | `statement-format` | `bayit-add-statement-format` has more detail on reconciling |
| Voice messages transcribed by another service | `speech` | |
| Another way to sign in (an OAuth / OpenID provider) | `signin` | **Needs a security review** before a family uses it |
| A new card in Settings › Accounts & connections | `connection` | Today a card can show a guide and a panel; it has no server route of its own yet |
| A new screen with its own records (a "feature module") | `feature` | Contract `docs/feature-module-contract.md`. First version: its own screen and records only; no outside services, Today card, reminders, Telegram, Statistics or Bayit AI. It appears in "More" like any place and can be pinned; parents switch it in Settings › Features |
| Another messaging channel (WhatsApp, Signal, …) | not yet | The contract exists (`docs/channel-contract.md`), but a working channel still needs core changes it lists under "Not part of the seam yet" |
| Running Bayit somewhere new (a host) | not an extension | Follow `docs/host-contract.md` and `tests/host-conformance.mjs` in its own folder |

If the idea fits no seam, **say so honestly. Never patch core files to make it fit.** The options are: (a) ask upstream for a new seam (an issue describing the need; core accepts new seams, fixes, security fixes and simplifications), (b) wait for a seam that is coming, or (c) keep a private core change, knowing every Bayit update may conflict with it and it can't be shared as an extension.

## 2. Scaffold the package

Agree on an id (lowercase letters, digits and `-`; e.g. `acme-bank`) and the name in English and Hebrew, then:

```bash
node app/scripts/bayit-new-extension.mjs <kind> <id> --name "English name" --he "שם בעברית"
```

It writes `local-extensions/<id>/` (`--out <folder>` to choose): `SKILL.md`, `REMOVE.md`, `extension.json`, `payload/` (the code at its final paths) and `tests/extension-<id>.test.mjs`, and prints every `TODO(bayit)` spot. It refuses an id already used by core or an installed extension.

The test has two parts. The **conformance** test (the seam's contract: registered, passes the same check core entries pass) passes from the start. The **behaviour** test fails with "Not written yet" until the real logic is filled in, so an unfinished extension can never be installed.

## 3. Fill in the TODOs

- Check every outside detail (addresses, auth, response shapes, prices) in the provider's **current official docs**. Don't guess.
- Replace each `https://….invalid` placeholder in the payload and in `extension.json` → `outbound` with the real origin(s); `apply` refuses placeholders. `outbound` lists every outside address the code calls, and nothing else.
- Tests use **synthetic data only**: fake names, amounts, account numbers and keys. Stub `fetch` (or `env.OUTBOUND_FETCH`); never call the real service from a test.
- Adjust the package's own `SKILL.md` (what it adds in the family's words, what to ask first, Troubleshooting) and `REMOVE.md`.
- New npm packages go in `extension.json` → `dependencies` at exact versions; `apply` prints the `npm install --save-exact …` command, and the person agrees before it runs because it downloads code.

## 4. Apply, check, remove

```bash
node app/scripts/bayit-extension.mjs apply local-extensions/<id>
node app/scripts/bayit-extension.mjs check
cd app && npm run test:domain && npm run build:cloud
```

`apply` copies the files, adds the registry line(s), records the install in `shared/extensions/installed.json`, then loads the registries and runs the package's tests. If anything fails it rolls back completely; fix the package and apply again. Never copy files or edit registry files by hand. `test:domain` also runs the seam's own conformance suite (for example `tests/speech-providers.test.mjs`) over every installed entry.

Then check it in the app as the package's `SKILL.md` says: Hebrew and English, light and night, phone and desktop.

To take it out: `node app/scripts/bayit-extension.mjs remove <id>`. It leaves the copy byte for byte as it was before apply. To ship a new version, raise `version` and `apply … --update`.

## 5. Publish it for other families

- Put the package in its own repository or a fork, as `.agents/skills/bayit-add-<id>/` (the folder `local-extensions/<id>/` already has everything), and share the link. Another family asks their agent to apply it, and their agent reviews it against the rules below first.
- **Contribution policy (like NanoClaw):** Bayit's core accepts bug fixes, security fixes, simplifications and new seams. Capabilities arrive as extensions, not core pull requests. If an extension needs something core lacks, propose the seam.
- Never publish anything from a real household: no real statements, keys, names or screenshots with family data.

## The extension rules

Check the package against these before applying or sharing it. They protect families' data.

1. **Never edit core files.** An extension adds its own files and lines in local registry files, and only through `bayit-extension.mjs`.
2. **Never store, print or log an API key, token or password.** Family keys stay in the encrypted household secrets; installation keys are set by the owner as installation secrets (`wrangler pages secret put`, or `.env` on Docker). Never in a file, `extension.json`, chat, logs or tests.
3. **Never read another household's data**, and enforce owner and visibility on the server (`visibleState`, `canSee`), never only in the UI.
4. **Removal leaves no trace**: `remove` restores the copy exactly, and `REMOVE.md` says what to undo outside it (a secret, an account). Family data the extension created is never deleted on removal.
5. Hebrew and English, RTL, light and night, phone to desktop, using the design system's shared controls and real icons (`docs/design-system/index.html`).
6. Every outside address is declared in `outbound` and called through `externalFetch` (`app/cloud/outbound.mjs`).

## Troubleshooting

- "is already a … entry": the id is taken by core or an installed extension; pick another.
- "outbound still lists the placeholder": replace the `.invalid` origin in `extension.json`.
- "did not pass, so nothing was changed … Not written yet": a behaviour test still fails; the message names the file to finish.
- "does not export" / "does not parse" for a connection panel: the panel's export name must match `extension.json`, and the JSX must be valid.
- `check` says a file "was changed after it was applied": someone edited the installed copy instead of the package. Move the change into the package's `payload/`, then `remove <id> --force` and apply the package again.
