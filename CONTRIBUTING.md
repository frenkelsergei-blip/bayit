# Contributing to Bayit

Thanks for helping families run their homes a little more together. Please be kind and patient with everyone taking part.

## Ways to help

- **Report a bug** or **suggest a feature**: open an [issue](https://github.com/frenkelsergei-blip/bayit/issues/new). Include the version (Settings → About & updates), Cloudflare or Docker, and steps to reproduce.
- **Improve the guides**: if a setup step confused you, that's a bug too.
- **Add support** for your bank, language, AI provider or Today widget. The [agent skills](.agents/skills/README.md) and [extending.md](docs/extending.md) describe each extension point.
- **Security problems** go privately; see [SECURITY.md](SECURITY.md). Never in a public issue.

## Set up for development

You need Node.js 22.13 or newer and git.

```bash
git clone https://github.com/<you>/bayit.git
cd bayit/app
npm ci
npm run dev -- --host 127.0.0.1 --port 4173   # open http://127.0.0.1:4173/?demo=1
```

The demo uses a fictional family and saves nothing. To work on the server, Telegram or AI flows locally, see [docs/testing.md](docs/testing.md); it uses fake providers, so you don't need real keys.

## Making a change

1. **Open an issue first** for anything bigger than a small fix, so we can agree on the direction.
2. **Fork and branch:** `git checkout -b feature/short-name`.
3. **Add or update tests** for behaviour you change. Unit tests live in `tests/` and run with `node --test`.
4. **Run the checks** before opening a pull request. CI runs the same ones:
   ```bash
   cd app && npm ci && npm run test:domain && npm run test:sites && npm run build:cloud
   ```
5. **Open a pull request.** Describe what you checked: which screens, Hebrew and English, light and night, and phone and desktop.
6. A maintainer reviews it. Small, focused pull requests are reviewed fastest.

## Guidelines

- **Privacy first:** every record has an owner and a visibility, enforced on the server. AI, reminders, statistics and widgets use the same rules.
- **No secrets or personal data in commits:** no API keys, tokens, real statements, real photos or account IDs. Use the fictional sample family. GitHub secret scanning is on.
- **Bilingual and responsive:** new UI text needs English and Hebrew (`T('…','…')`), must work right-to-left, and must not scroll sideways on a 390 px phone.
- **Design system:** use the tokens in `design-system/` and `app/src/tokens.css`, and real icons (Bayit PNGs, OpenMoji or Phosphor). See [AGENTS.md](AGENTS.md).
- **Honest UI:** never show "sent", "connected" or "saved" unless the server or provider confirmed it.
- **Dependencies:** prefer none. Any new dependency needs an open-source license compatible with MIT; add it to [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
- **Release notes:** user-visible changes get an English and Hebrew line in `app/src/app-version.jsx`. That's also where [CHANGELOG.md](CHANGELOG.md) comes from.

## License of contributions

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE), the same as the project.
