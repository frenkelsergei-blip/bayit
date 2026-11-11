# Bayit skills

Skills an AI coding agent (Claude Code, Codex, or any tool that reads `SKILL.md` folders) can follow to **install, configure, update and extend** Bayit. Clone the repository, open it in your agent, and ask in your own words, for example:

- "Install Bayit on my Cloudflare account."
- "Run Bayit with Docker on my Raspberry Pi."
- "Update my Bayit to the latest version."
- "Help me connect Telegram and my AI key."
- "Add Discount Bank statement import."
- "Add Mistral as an AI provider."
- "I want to build my own Bayit extension and share it."

| Skill | What it does |
|---|---|
| `bayit-install-cloudflare` | Your own copy on your own free Cloudflare account, with your own address |
| `bayit-install-docker` | Your own copy on any machine with Docker: home computer, NAS, Raspberry Pi, cloud server |
| `bayit-check` | Diagnoses an installation and explains each fix |
| `bayit-update` | Moves an installation to the latest version safely |
| `bayit-connect` | Walks a family through connecting Google sign-in, AI, Telegram and RiseUp in the app |
| `bayit-localize` | Country, timezone, currency and language |
| `bayit-add-ai-provider` | Writes and applies an extension that adds an AI provider |
| `bayit-add-statement-format` | Writes and applies an extension that adds a bank or card statement format, reconciled with the printed totals |
| `bayit-new-extension` | Creates a new extension from scratch for any seam (AI provider, statement format, speech, sign-in, connection), with its conformance test, and explains how to publish it |
| `bayit-add-today-widget` | Adds a Today screen widget (still a core change: Today widgets have no extension seam yet) |
| `bayit-update-riseup` | Adapts the RiseUp connection when RiseUp changes its API |
| `bayit-release` | For maintainers: version, release notes, checks, deploy |

Claude Code reads `.claude/skills/` (a link to this folder). Codex and other agents read `.agents/skills/`.

## Two kinds of skills

- **Operational** skills hold instructions only. They install, connect, check, update or release a copy and never add code: `bayit-install-*`, `bayit-check`, `bayit-connect`, `bayit-update`, `bayit-localize`, `bayit-update-riseup`, `bayit-release`.
- **Extension** skills (`bayit-add-*`) add a capability as a package: `SKILL.md`, `REMOVE.md`, `extension.json`, `payload/` and `tests/`. The agent applies it with `node app/scripts/bayit-extension.mjs apply <package-folder>`, which copies the files, adds one line to a local registry file, records it in `shared/extensions/installed.json`, and rolls everything back if a check fails. `remove <id>` reverses it exactly. A **generator** (`bayit-add-ai-provider`, `bayit-add-statement-format`) writes a new package into `local-extensions/<id>/` from its `template/`, then applies it.

### Write your own

Ask your agent to use `bayit-new-extension`, or run `node app/scripts/bayit-new-extension.mjs seams` and then `node app/scripts/bayit-new-extension.mjs <kind> <id> --name "…" --he "…"`: it writes a complete package with the seam's conformance test and a behaviour test that fails until the real logic is written. The format is in `docs/extension-skills.md`. Check it with `apply`, `check`, `npm run test:domain` and `remove` in a copy you can throw away. Core accepts fixes, security fixes, simplifications and new seams; capabilities arrive as extension skills.

## Rules every skill follows

These come from `AGENTS.md` and protect the families who use Bayit.

1. **Configure, don't rewrite.** Installation skills only set names, IDs and secrets and run the provided scripts (`app/scripts/bayit-configure.mjs`, `app/scripts/bayit-doctor.mjs`). They never change app code.
2. **Secrets stay secret.** Never write keys, tokens, passwords or OAuth secrets into files in the repository, logs, commit messages or chat. Secrets go into `wrangler pages secret put` prompts (typed by the person) or into `.env`, which is git-ignored. Never print a secret back.
3. **The person stays in control.** Ask before anything that costs money, publishes, deploys, deletes data or changes a live installation. Creating a Cloudflare, Google or Telegram account, signing in and pasting keys are done by the person; the agent explains exactly where to click.
4. **Be honest about status.** Never say something works until it was checked (`bayit-doctor`, the app's **Settings → Accounts & connections**, or a real test message). Say clearly what was not verified.
5. **Privacy rules are part of the product.** Every record has an owner and visibility (`private`, `family`, `selected`). Extensions must enforce them on the server (`visibleState`, `canSee`), and AI, reminders, statistics and widgets follow the same rules. Never commit real bank statements or personal data; tests use synthetic data.
6. **Keep the look.** Cream, cobalt, navy and yellow, heavy rounded type, real image assets and Phosphor/OpenMoji icons, Hebrew RTL and English LTR, light and night, phone, tablet and desktop.
7. **Prove it.** Run `cd app && npm run test:domain` and `npm run build:cloud` after any code change, and add tests for new behavior.
