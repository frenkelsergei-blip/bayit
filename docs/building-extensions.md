# Building extensions

This page is for people who want to make a Bayit extension. If you only want to add one to your family's Bayit, read [Extensions](extensions.md) instead.

An extension is a package of new files plus one line in a **local registry file**: a list that Bayit ships empty and never edits, so updates never conflict with what you add. You never change Bayit's own files.

## Start with the skill

Open your copy of Bayit in Claude Code, Codex or another agent that reads skills, and ask: "I want to build a Bayit extension that …". The agent uses the [`bayit-new-extension`](../.agents/skills/bayit-new-extension/SKILL.md) skill. It finds the right kind, writes a complete package, and leaves marked `TODO(bayit)` spots for the real logic.

Without an agent:

```bash
node app/scripts/bayit-new-extension.mjs seams
node app/scripts/bayit-new-extension.mjs <kind> <id> --name "English name" --he "שם בעברית"
```

`seams` lists every kind and the contract to read for it. The package is written to `local-extensions/<id>/`.

Each package has two kinds of test. The **conformance** test (does it follow the kind's rules?) passes from the start. The **behaviour** test fails with "Not written yet" until you write the real logic. Outside addresses start as `https://….invalid` placeholders, which install refuses. So an unfinished extension cannot be installed.

## Pick the kind

| Kind (`<kind>`) | Contract | Conformance test |
| --- | --- | --- |
| AI provider (`ai-provider`) | [extensions-registry.md](extensions-registry.md) (AI providers), `shared/ai-providers.mjs` | `tests/extensions.test.mjs`, `tests/ai-providers.test.mjs` |
| Bank or card statement (`statement-format`) | `shared/finance-parse.mjs` (same shape as `parseLeumi` / `parseMax`, with reconciliation checks) | `tests/extensions.test.mjs`, `tests/finance.test.mjs` |
| Speech-to-text (`speech`) | The comment at the top of `app/cloud/speech.mjs` | `tests/speech-providers.test.mjs` |
| Sign-in method (`signin`) | [sign-in-methods.md](sign-in-methods.md). Needs a security review. | `tests/signin-methods.test.mjs` |
| Connection card (`connection`) | The comment at the top of `shared/connections.mjs`; panels in `app/src/extensions/connection-panels.jsx` | `tests/connections.test.mjs` |
| Screen with its own records (`feature`) | [feature-module-contract.md](feature-module-contract.md) | `tests/feature-module-conformance.mjs` |
| Messaging channel | [channel-contract.md](channel-contract.md). No scaffold yet; a working channel still needs core changes. | `tests/channel-conformance.mjs` |
| A new place to run Bayit | Not an extension: [host-contract.md](host-contract.md) | `tests/host-conformance.mjs` |

The two generator skills [`bayit-add-ai-provider`](../.agents/skills/bayit-add-ai-provider/SKILL.md) and [`bayit-add-statement-format`](../.agents/skills/bayit-add-statement-format/SKILL.md) give more detail for their kinds.

If your idea fits none of these, it needs a new seam (a new place where extensions can plug in). Don't change Bayit's own files to make it fit; see [Proposing a new seam](../CONTRIBUTING.md#proposing-a-new-seam).

## The package

```
bayit-add-<name>/
  SKILL.md         what it adds, what to ask first, apply, verify, Troubleshooting
  REMOVE.md        how to undo it, including anything outside the copy
  extension.json   id, version, names, seam, files, registry lines, outside addresses, dependencies
  payload/         the files, at their final paths
  tests/           its tests
```

The full format, including where files may go and every `extension.json` field, is in [extension-skills.md](extension-skills.md). How registry lines are joined is in [extensions-registry.md](extensions-registry.md).

## The rules

Every extension must:

1. enforce owner and visibility on the server, never only in the screen;
2. keep keys only in the encrypted household secrets: never in files, logs, chat, tests or `extension.json`;
3. have English and Hebrew text, and work right-to-left, in light and night, on phone, tablet and desktop;
4. use Bayit's design system (`docs/design-system/index.html` in the repository): its shared controls and real icons, no one-off styles;
5. list every outside address it calls in `outbound`, and call it through `externalFetch` (`app/cloud/outbound.mjs`);
6. test with made-up data only: no real statements, names, account numbers or keys.

The install script can check only some of this, so whoever installs your extension (and their agent) reads it against these rules first.

## Test apply and remove

Work in a copy you can throw away.

```bash
node app/scripts/bayit-extension.mjs apply local-extensions/<id>
node app/scripts/bayit-extension.mjs check
cd app && npm run test:domain && npm run build:cloud
```

`apply` refuses to overwrite anything, runs the kind's checks and your tests, and rolls back completely if anything fails. Then look at it in the app: English and Hebrew, light and night, phone and desktop.

```bash
node app/scripts/bayit-extension.mjs remove <id>
```

`remove` must leave the copy byte for byte as it was before `apply`. To ship a new version, raise `version` in `extension.json` and run `apply local-extensions/<id> --update`.

## Publish it

- Put the package in your own repository (or a fork of Bayit) as `.agents/skills/bayit-add-<id>/`. The folder `local-extensions/<id>/` already has everything it needs.
- Share the link. Another family asks their agent to install it from there.
- Say plainly in its `SKILL.md` what it does, which outside addresses it calls, and what it costs if it uses a paid service.
- Never publish anything from a real household: no real statements, keys, names, or screenshots of family data.

You don't need Bayit's permission to publish an extension. You can also offer it to the Bayit repository as a pull request that adds only its skill folder; it is never merged into Bayit's own code. See [CONTRIBUTING.md](../CONTRIBUTING.md). For ideas, see [Wanted extensions](extensions-wanted.md).
