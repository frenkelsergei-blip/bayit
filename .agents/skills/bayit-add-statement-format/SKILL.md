---
name: bayit-add-statement-format
description: Teach Bayit to import a new bank or credit-card statement PDF (another bank, card company or country), with totals reconciled against the statement and synthetic tests. Use when someone wants Expenses to read statements from a bank or card that isn't supported yet.
---

# Add a bank or card statement format

Read "A new bank or card statement format" in `docs/extending.md` and the rules in `.agents/skills/README.md`.

## Privacy first

The person will likely share a real statement so you can see its layout.

- Work on it **only locally**: never commit it, never paste its contents into issues, tests or commit messages, and delete any extracted text files when done.
- Build tests from **synthetic** rows that copy the layout with fake names and amounts.

## Steps

1. **Look at the layout.** Extract positioned text the way the app does (`app/cloud/statement-pdf.mjs` with `unpdf`) into a temporary file outside the repo. Find:
   - the header row and column x-positions
   - the date and amount formats
   - credit vs debit columns or signs
   - the printed totals (per card, per charge date, opening and closing balance).
2. **Detect it.** Teach `detectFormat()` in `shared/finance-parse.mjs` a reliable marker: the issuer name or the statement title.
3. **Parse it.** Write `parseYourBank(rows)` returning `{issuer, kind:'bank'|'card', transactions|cards, checks}`.
   - Use column positions from the header row, not fixed text order.
   - Amounts are agorot/cents integers, negative for money out.
4. **Reconcile.** Add `checks` comparing your sums with every printed total, and the running balance chain for bank statements. A check that fails must show up in the import preview; never hide it.
5. **No double counting.** For a card company, add it to `CARD_ISSUERS` in `shared/finance.mjs`. That links the bank's card payment to the card's charge groups.
6. **Categories.** Add any merchant keyword rules to `RULES` in `shared/finance.mjs`.
7. **Tests.** In `tests/finance.test.mjs`, add synthetic rows covering:
   - a normal month
   - refunds and credits
   - installments
   - foreign currency
   - a deliberately wrong total, so the check fails.
8. Run `cd app && npm run test:domain && npm run build:cloud`.
9. If the person agrees, import their real statement locally and confirm every check is ✔ and the totals match the paper.

Report which checks pass on their real file and which cases you couldn't test (e.g. "no foreign purchases in this sample").
