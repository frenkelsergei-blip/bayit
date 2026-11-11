# Contributing to Bayit

Thanks for helping families run their homes a little more together. Please be kind and patient with everyone taking part.

## Add abilities as extensions, not to the core

Bayit's core stays small: the app every family shares, plus the places where new abilities plug in. A new ability (another bank, AI service, sign-in method, a new screen) comes as an **extension**: a package that a family adds to their own copy and can remove again. This keeps Bayit simple, keeps updates from breaking anyone's additions, and lets each family choose what it wants.

We borrowed this approach from [NanoClaw](https://github.com/qwibitai/nanoclaw), whose contribution guide sums it up as "Don't add features. Add skills."

**The core accepts:**

- bug fixes;
- security fixes (report them privately first, see below);
- simplifications, and changes that remove code;
- clearer guides and better wording;
- **new seams**: a new place where extensions can plug in, when a real extension needs it (see below).

**Please build these as extensions instead:**

- support for another bank, card company, AI provider, speech service or sign-in method;
- a new screen or list for something families keep track of;
- a new connection card;
- anything only some families want.

A pull request that adds a new ability to Bayit's own code will usually be closed with a pointer to [Building extensions](docs/building-extensions.md). It is not a judgement on the idea.

**Offering an extension:** you can publish it in your own repository, or open a pull request that adds only its folder under `.agents/skills/bayit-add-<name>/`. It must pass its own tests, apply and remove cleanly on a fresh copy, and meet the [extension rules](docs/building-extensions.md#the-rules).

### Proposing a new seam

If your idea fits none of the existing kinds of extension, open an issue first, before writing code. Describe:

1. what a family could do with it, in plain words;
2. at least one real extension that would use the seam (yours is fine);
3. what the extension would need from Bayit: data it reads or writes, outside services it calls, keys it keeps, screens it shows;
4. how privacy holds: who may see what, and what children may not see.

A seam comes with a short written contract, a conformance test every entry must pass, and a local registry file that ships empty. Look at [channel-contract.md](docs/channel-contract.md) or [feature-module-contract.md](docs/feature-module-contract.md) for the shape. Seams that touch sign-in, keys or other families' data also need a security review. [Wanted extensions](docs/extensions-wanted.md) lists ideas that are waiting for a seam.

## Other ways to help

- **Report a bug** or **suggest an idea**: open an [issue](https://github.com/frenkelsergei-blip/bayit/issues/new/choose). The forms ask for what we need.
- **Improve the guides**: if a setup step confused you, that's a bug too.
- **Build an extension** from the [Wanted list](docs/extensions-wanted.md).

## Security problems

Report them privately; see [SECURITY.md](SECURITY.md). Never in a public issue or pull request. This includes a problem you find in an extension's rules or tools.

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
2. **Fork and branch:** `git checkout -b fix/short-name`.
3. **Add or update tests** for behaviour you change. Unit tests live in `tests/` and run with `node --test`.
4. **Run the checks** before opening a pull request. CI runs the same ones:
   ```bash
   cd app && npm ci && npm run test:domain && npm run test:sites && npm run build:cloud
   ```
5. **Open a pull request** and fill in the template. Describe what you checked: which screens, Hebrew and English, light and night, and phone and desktop.
6. A maintainer reviews it. Small, focused pull requests are reviewed fastest.

## Guidelines

- **Privacy first:** every record has an owner and a visibility, enforced on the server. AI, reminders, statistics, widgets and extensions use the same rules.
- **No secrets or personal data in commits:** no API keys, tokens, real statements, real photos or account IDs. Use the fictional sample family. GitHub secret scanning is on.
- **Bilingual and responsive:** new UI text needs English and Hebrew (`T('…','…')`), must work right-to-left, and must not scroll sideways on a 390 px phone.
- **Design system:** use the tokens in `design-system/` and `app/src/tokens.css`, and real icons (Bayit PNGs, OpenMoji or Phosphor). See [AGENTS.md](AGENTS.md).
- **Honest UI:** never show "sent", "connected" or "saved" unless the server or provider confirmed it.
- **Dependencies:** prefer none. Any new dependency needs an open-source license compatible with MIT; add it to [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). An extension pins its own dependencies to exact versions.
- **Release notes:** user-visible changes get an English and Hebrew line in `app/src/app-version.jsx`. That's also where [CHANGELOG.md](CHANGELOG.md) comes from.

## License of contributions

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE), the same as the project.
