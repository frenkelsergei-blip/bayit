---
name: bayit-localize
description: Adapt Bayit to another country, timezone, currency or language (beyond Hebrew and English). Use when someone outside Israel installs Bayit, or asks to change the timezone, currency symbol, or add a language.
---

# Country, timezone, currency and language

Read `docs/extending.md` ("Country, timezone and currency", "Languages and copy") and the rules in `.agents/skills/README.md`.

## Timezone and currency (small, safe)

1. Edit `shared/home-config.mjs`: `HOME_TIMEZONE` (an IANA name, e.g. `Europe/Berlin`), `HOME_CURRENCY` (ISO code, e.g. `EUR`) and `HOME_CURRENCY_SYMBOL`. Dates, reminders, statements and the AI assistant read the timezone from there.
2. Search `app/src` and `app/cloud` for remaining hard-coded `₪` or `'ILS'` (`grep -rn "₪\|'ILS'" app/src app/cloud shared`). Replace them with the config values, using small exact edits.
3. Statement import is Israel-specific (Leumi, Max) and so is RiseUp. Tell the person, and offer `bayit-add-statement-format` for their own bank.
4. Run `cd app && npm run test:domain && npm run build:cloud`. Then open the app and check dates and amounts in Today, Calendar and Expenses.

## A new language (bigger)

Copy is written inline as `a.T('English','עברית')`, plus `design-system/copy.en.json` and `copy.he.json`.

1. Agree the approach with the person first. The recommended path is a third argument, `a.T(en, he, {xx:'…'})`, with a fallback to English, extended in `T()` in `app/src/App.jsx`, plus `copy.xx.json`. The language picker lives in Profile and Settings.
2. RTL is chosen from the language. Mark new RTL languages explicitly.
3. Translate in batches by screen, verify each screen in the browser on phone and desktop, and keep the design rules (heavy rounded type: check the font covers the script).

Never machine-translate legal, privacy or money text without telling the person it needs a native speaker's review.
