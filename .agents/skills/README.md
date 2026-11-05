# Bayit skills

Skills an AI coding agent (Claude Code, Codex, or any tool that reads `SKILL.md` folders) can follow to **install, configure, update and extend** Bayit. Clone the repository, open it in your agent, and ask in your own words, for example:

- "Install Bayit on my Cloudflare account."
- "Run Bayit with Docker on my Raspberry Pi."
- "Update my Bayit to the latest version."
- "Help me connect Telegram and my AI key."
- "Add Discount Bank statement import."
- "Add Mistral as an AI provider."

| Skill | What it does |
|---|---|
| `bayit-install-cloudflare` | Your own copy on your own free Cloudflare account, with your own address |
| `bayit-install-docker` | Your own copy on any machine with Docker: home computer, NAS, Raspberry Pi, cloud server |
| `bayit-check` | Diagnoses an installation and explains each fix |
| `bayit-update` | Moves an installation to the latest version safely |
| `bayit-connect` | Walks a family through connecting Google sign-in, AI, Telegram and RiseUp in the app |
| `bayit-localize` | Country, timezone, currency and language |
| `bayit-add-ai-provider` | Adds an AI provider |
| `bayit-add-statement-format` | Adds a bank or card statement format that reconciles with the printed totals |
| `bayit-add-today-widget` | Adds a Today screen widget |
| `bayit-update-riseup` | Adapts the RiseUp connection when RiseUp changes its API |
| `bayit-release` | For maintainers: version, release notes, checks, deploy |

Claude Code reads `.claude/skills/` (a link to this folder). Codex and other agents read `.agents/skills/`.

## Rules every skill follows

These come from `AGENTS.md` and protect the families who use Bayit.

1. **Configure, don't rewrite.** Installation skills only set names, IDs and secrets and run the provided scripts (`app/scripts/bayit-configure.mjs`, `app/scripts/bayit-doctor.mjs`). They never change app code.
2. **Secrets stay secret.** Never write keys, tokens, passwords or OAuth secrets into files in the repository, logs, commit messages or chat. Secrets go into `wrangler pages secret put` prompts (typed by the person) or into `.env`, which is git-ignored. Never print a secret back.
3. **The person stays in control.** Ask before anything that costs money, publishes, deploys, deletes data or changes a live installation. Creating a Cloudflare, Google or Telegram account, signing in and pasting keys are done by the person; the agent explains exactly where to click.
4. **Be honest about status.** Never say something works until it was checked (`bayit-doctor`, the app's **Settings → Accounts & connections**, or a real test message). Say clearly what was not verified.
5. **Privacy rules are part of the product.** Every record has an owner and visibility (`private`, `family`, `selected`). Extensions must enforce them on the server (`visibleState`, `canSee`), and AI, reminders, statistics and widgets follow the same rules. Never commit real bank statements or personal data; tests use synthetic data.
6. **Keep the look.** Cream, cobalt, navy and yellow, heavy rounded type, real image assets and Phosphor/OpenMoji icons, Hebrew RTL and English LTR, light and night, phone, tablet and desktop.
7. **Prove it.** Run `cd app && npm run test:domain` and `npm run build:cloud` after any code change, and add tests for new behavior.
