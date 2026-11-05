# Extending Bayit

Bayit is built so families and contributors can adapt it. These are the main extension points, from easiest to deepest.

> **Using an AI coding agent?** The repository ships skills in `.agents/skills/` (Claude Code reads them through `.claude/skills/`) that walk through installing, updating and each extension below. Ask your agent, for example, "add Discount Bank statement import". See [.agents/skills/README.md](../.agents/skills/README.md).

## Country, timezone and currency

`shared/home-config.mjs` holds `HOME_TIMEZONE`, `HOME_CURRENCY` and `HOME_CURRENCY_SYMBOL`. Dates, reminders, statements and the AI assistant all read the timezone from there. Currency formatting in the Money page currently uses ₪, so search `app/src/money*.jsx` for `₪` if you change it.

## Languages and copy

Interface text is written inline as `a.T('English','עברית')`, and shared copy lives in `design-system/copy.en.json` and `copy.he.json`. Adding a third language means extending `T()` in `app/src/App.jsx`. RTL is chosen from the language.

## A new Today widget

Widgets are rendered in `Today()` in `app/src/App.jsx`:
1. Add a key and a label to `labels`.
2. Add the key to the list of switchable widgets in the customize panel (you can gate it, for example to adults or signed-in households).
3. Add a render branch `key==='yourkey'?<YourWidget app={a} ui={{Button,Icon}}/>`.

`app/src/money-detail.jsx` (`MoneyWidget`, `BillsWidget`) is a complete example, including one shared data request per household. Widgets must only show records the viewer may see, either from the server's filtered data or `a.visible(...)`.

## A new bank or card statement format

`shared/finance-parse.mjs` turns positioned PDF text rows (produced by `app/cloud/statement-pdf.mjs` with pdf.js) into transactions.
1. Teach `detectFormat()` to recognise the statement.
2. Write `parseYourBank(rows)` returning `{issuer, kind:'bank'|'card', transactions|cards, checks}`. Use column positions from the header row, not fixed text order.
3. **Reconcile:** add `checks` that compare your parsed sums with the totals printed on the statement, and the running balance for bank statements. Imports show these checks before anything is saved.
4. For a card company, add its name to `CARD_ISSUERS` in `shared/finance.mjs`, so the bank's card payment is linked to the card's charge groups instead of being counted twice.
5. Add synthetic tests to `tests/finance.test.mjs`. **Never commit real statements.**

Categories and their keyword rules are in `shared/finance.mjs` (`CATEGORIES`, `RULES`). Households can also teach categories per merchant in the app.

## A live finance connection

`app/cloud/riseup.mjs` is the template: a read-only token per person, encrypted with `encryptKey()`, a `sync` that upserts rows by the provider's transaction id (keeping category edits), and `refreshDueConnections()` called from the scheduler tick. Connections live in the `finance_connections` table, and their rows use `import_id` `<provider>:<member>` and the owner's visibility. Keep all provider-specific fields in one file and record the provider's API version there, so a provider update is a small, tested change. See [riseup.md](riseup.md).

## A speech-to-text provider

`app/cloud/speech.mjs` lists providers in `SPEECH_PROVIDERS` and implements `transcribe(env, provider, bytes)`. Add a provider id, an availability check in `speechAvailability`, and a branch in `transcribe`. Store any key encrypted with `encryptKey()` from `app/cloud/util.mjs`, as the Telegram token is. Add the option to the provider picker in `app/src/telegram-settings.jsx`.

## AI providers

Households choose their provider in **Settings → Accounts & connections → AI assistant**. The list lives in `shared/ai-providers.mjs` and the adapters in `app/cloud/ai-providers.mjs`. Every provider uses one of three wire formats:

| Format | Providers | Notes |
| --- | --- | --- |
| `anthropic` | Claude | Messages API |
| `responses` | OpenAI | Responses API, which Codex models require |
| `chat` | Gemini, Grok, Custom | OpenAI-compatible Chat Completions (OpenRouter, Groq, Together, Ollama, LM Studio…) |

`generate()` takes one request shape (system prompt, history, prompt, images, tools, optional forced tool) and returns one response shape: text and `tool_use` blocks. `normalizeAITools()`, Apply/Undo and all visibility rules therefore work unchanged.

**Add a provider that speaks an existing format:** add one entry to `AI_PROVIDERS` (id, name, format, base URL, key hint, where to get a key). If its model list needs filtering, add a rule in `listModels()`.

**Add a new wire format:** add a branch in `generate()` and `listModels()` that maps the tools to the provider's function-calling format and converts the reply back. Add a test in `tests/ai-providers.test.mjs` with a stubbed `fetch`.

Keep the contract: **never save changes without Apply, never widen visibility, and treat record text as untrusted data.** Custom endpoints must use https.

## Messaging channels

`app/cloud/telegram.mjs` shows the full pattern: per-household bot credentials, one-time links per person, a webhook with a secret header, single-use buttons stored server-side, and reminders built from `visibleState()` for each recipient. WhatsApp (Meta Cloud API) would follow the same shape, but it needs approved message templates outside the 24-hour customer-service window.

## Ground rules

- Every record carries `ownerId` and `visibility` (`private`, `family`, or `selected` with `allowedIds`). Check access on the server (`app/cloud/state.mjs`), not only in the UI.
- Never log or return secrets. Keys are encrypted at rest with `APP_ENCRYPTION_KEY`.
- Keep the design system: cream, cobalt, navy and yellow, the heavy rounded type, and real generated or OpenMoji/Phosphor icons. Support both RTL and LTR, light and night, and phone, tablet and desktop. See `AGENTS.md`.
