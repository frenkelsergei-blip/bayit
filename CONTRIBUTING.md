# Contributing to Bayit

Thanks for helping families run their homes a little more together.

1. **Open an issue first** for anything bigger than a small fix, so we can agree on the direction.
2. **Fork and branch:** `git checkout -b feature/short-name`.
3. **Run the checks** before opening a pull request:
   ```bash
   cd app && npm ci && npm run test:domain && npm run test:sites && npm run build:cloud
   ```
4. **Describe what you checked** in the PR: which screens, Hebrew and English, light and night, and phone and desktop.

## Guidelines

- **Privacy first:** every record has an owner and visibility, enforced on the server. AI, reminders, statistics and widgets use the same rules.
- **No secrets or personal data in commits:** no API keys, tokens, real statements, real photos, or account IDs.
- **Bilingual and responsive:** new UI text needs English and Hebrew (`a.T('…','…')`), must work in RTL, and must avoid sideways scrolling on a 390 px phone.
- **Design system:** use the tokens in `design-system/` and `app/src/tokens.css`, and real icons (Bayit PNGs, OpenMoji or Phosphor). See `AGENTS.md`.
- **Honest UI:** never show "sent", "connected" or "saved" unless the server or provider confirmed it.
- **Small, reviewable changes** with tests where it makes sense.

Extension points are described in [docs/extending.md](docs/extending.md).
