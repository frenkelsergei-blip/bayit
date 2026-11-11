# Wanted extensions

Ideas for extensions families would use. Each one fits a seam that exists today, so it can be built without changing Bayit's own code. Start with [Building extensions](building-extensions.md); the `bayit-new-extension` skill writes the package for you.

Building one? Open an issue saying which one, so two people don't build the same thing.

**Difficulty:** **Easy** means mostly filling in a template. **Medium** means real logic and careful tests. **Hard** means security-sensitive or with many edge cases.

## Bank and card statements

Kind: `statement-format` (skill `bayit-add-statement-format`). You need a real statement to look at, but the tests and anything you publish must use a made-up copy.

| Idea | Difficulty | Notes |
| --- | --- | --- |
| Discount Bank statements | Medium | Every total must match the totals printed on the statement, and the running balance. |
| Bank Hapoalim statements | Medium | Same. |
| Mizrahi-Tefahot statements | Medium | Same. |
| Isracard, Cal or American Express card statements | Medium | Reading them works today. Linking the bank's card payment to the card's charges, so nothing is counted twice, still needs a seam (see below). |
| A bank or card from another country | Medium | Pair it with the `bayit-localize` skill for currency and timezone. |

## AI providers

Kind: `ai-provider` (skill `bayit-add-ai-provider`). Easy when the service speaks one of the three formats Bayit already knows (Claude's, OpenAI's Responses, or OpenAI-compatible Chat Completions) from one fixed `https` address.

| Idea | Difficulty | Notes |
| --- | --- | --- |
| Mistral | Easy | OpenAI-compatible. |
| DeepSeek | Easy | OpenAI-compatible. Check that it handles tool calls well, since Ask AI depends on them. |
| OpenRouter or Groq as named choices | Easy | Today they work through "Custom"; a named entry adds a "Get a key" link. |

## Speech-to-text for voice messages

Kind: `speech`. Medium: the provider must work from both Cloudflare and Docker, record its cost in the AI usage list, and fail only with "could not be transcribed".

| Idea | Difficulty | Notes |
| --- | --- | --- |
| A dedicated transcription service (for example Deepgram or AssemblyAI) | Medium | Check its Hebrew quality before publishing. |
| A self-hosted Whisper server | Medium | Docker installations only, and the owner must allow its private address (`AI_PRIVATE_ORIGINS`). A Cloudflare installation cannot reach a home network. |

## Sign-in methods

Kind: `signin`. **Hard**: a sign-in method decides who can enter a family's home, so it needs a security review before anyone uses it. It must return an email address that the provider itself verified.

| Idea | Difficulty | Notes |
| --- | --- | --- |
| Microsoft account sign-in | Hard | Through Auth.js's provider. |
| A family's own OpenID Connect server (for example Authentik or Keycloak at home) | Hard | Must verify email addresses. |

## Screens with their own records

Kind: `feature`. Medium. The first version gives a screen, its own records with Bayit's privacy choices, and the family on/off switch. No reminders, Today card, Telegram, AI, outside services or files yet.

| Idea | Difficulty | Notes |
| --- | --- | --- |
| Lent & borrowed: what we lent, to whom, and when it came back | Medium | A test-only sample exists in `tests/fixtures/extensions/bayit-add-lending/`; a real, published version is wanted. |
| Gift ideas and wish lists | Medium | Private by default, so a surprise stays a surprise. |
| Board-game nights: who played, who won | Medium | |
| Reading log for parents and kids | Medium | Children can add their own records (`childrenMay: 'write'`). |
| Pet care log: vet visits, vaccines, food | Medium | Without reminders until that surface exists. |
| Kids' sizes: clothes, shoes, height over time | Medium | Records about a child, kept by parents. |
| Chore swap: who traded which chore | Medium | Uses `people` fields; it cannot change Bayit's own tasks. |

## Needs a seam

These are good ideas that can't be extensions yet, because Bayit has no place for them to plug in. Building one today means changing Bayit's own code. If you want to work on one, [propose the seam](../CONTRIBUTING.md#proposing-a-new-seam) first.

| Idea | What is missing |
| --- | --- |
| WhatsApp or Signal reminders | The channel contract exists, but a working channel still needs core changes: confirming identity for its settings, cleanup when a member leaves, key rotation and its commands ([channel-contract.md](channel-contract.md)). WhatsApp also needs a WhatsApp Business account and approved message templates. |
| Today widgets: weather, school timetable, birthdays | Today widgets have no local registry yet. Weather would also need an outside service. |
| Linking a card company's charges to the bank's card payment | Card companies are listed in Bayit's own code (`CARD_ISSUERS`). |
| Your own spending categories for merchants, as a package | Category rules are in Bayit's own code (`RULES`). Families can already teach categories in the app. |
| AI services with their own request format (for example Azure OpenAI or Amazon Bedrock) | A new format is a core change until AI adapters have a registry. |
| Live bank sync, like the RiseUp connection | Connections have no server routes of their own yet. |
| Reminders, a Today card, Telegram messages, statistics or AI for a screen with its own records | Each is a later surface of feature modules and needs a separate decision. |
| Fingerprint or face sign-in (passkeys) | Planned for Bayit itself; needs core changes and a security review ([sign-in-methods.md](sign-in-methods.md)). |
