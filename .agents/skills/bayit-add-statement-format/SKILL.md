---
name: bayit-add-statement-format
description: Teach Bayit to import a new bank or credit-card statement PDF (another bank, card company or country) as an extension, with totals reconciled against the statement and synthetic tests. Use when someone wants Expenses to read statements from a bank or card that isn't supported yet.
---

# Add a bank or card statement format

This is a **generator** skill (`docs/extension-skills.md`): it writes a new extension package for one statement format into `local-extensions/<id>/`, then applies it with `app/scripts/bayit-extension.mjs`. The result is recorded in `shared/extensions/installed.json` and registered only in `shared/extensions/statement-formats.mjs`. Built-in formats (Leumi, Max) are always recognised first.

Read first: `docs/extension-skills.md`, `docs/extensions-registry.md` (statement formats) and the rules in `.agents/skills/README.md`.

## Privacy first

The person will likely share a real statement so you can see its layout.

- Work on it **only locally**: never commit it, never paste its contents into issues, tests or commit messages, and delete any extracted text files when done.
- Build tests from **synthetic** rows that copy the layout with fake names and amounts.

## Ask the person first

1. Which bank or card company, and is it a bank account statement or a card statement?
2. May you read one real statement locally to learn the layout? (Optional; without it you need its exact layout from them.)

## Write the package

1. **Look at the layout.** Extract positioned text the way the app does (`app/cloud/statement-pdf.mjs` with `unpdf`) into a temporary file outside the repo. Find the header row and column x-positions, the date and amount formats, credit vs debit columns or signs, and every printed total (per card, per charge date, opening and closing balance).
2. **Pick an id** (lowercase, digits, `-`), e.g. `discount` or `isracard`. Copy `template/` from this skill to `local-extensions/<id>/` and rename `my-bank` to the id and `MY_BANK` to an UPPER_SNAKE name everywhere: file names, `extension.json`, the payload, the test, `SKILL.md` and `REMOVE.md`.
3. **Detect it** in `detect(rows)`: a reliable marker only this issuer prints near the top, such as its name or the statement title.
4. **Parse it** in `parse(rows)`: return the shape of `parseLeumi` (`kind:'bank'`, `transactions`) or `parseMax` (`kind:'card'`, `cards`) in `shared/finance-parse.mjs`.
   - Use column positions from the header row, not fixed text order.
   - Amounts are agorot/cents integers, negative for money out.
5. **Reconcile.** Add `checks` comparing your sums with every printed total, and the running balance chain for bank statements. A check that fails shows in the import preview; never hide it.
6. **Tests** in `tests/extension-<id>.test.mjs`, from synthetic rows: a normal month, refunds and credits, installments, foreign currency, and a deliberately wrong total so a check fails.
7. Fill in the package's own `SKILL.md` and `REMOVE.md`.

Two things are still core, not extension, and need a contribution upstream if the format needs them (tell the person; do not edit `shared/finance.mjs`):
- linking a bank's card payment to a new card company (`CARD_ISSUERS`), which prevents double counting;
- new merchant category keywords (`RULES`).

## Apply and verify

```bash
node app/scripts/bayit-extension.mjs apply local-extensions/<id>
node app/scripts/bayit-extension.mjs check
cd app && npm run test:domain && npm run build:cloud
```

`apply` refuses rather than overwriting anything and rolls back if the format fails the registry check or its tests. Fix the package and apply again.

If the person agrees, they import their real statement in the app and confirm every check is ✔ and the totals match the paper. Report which checks pass on their file and which cases you couldn't test (e.g. "no foreign purchases in this sample").

## Troubleshooting

- The app still says "not supported yet": `detect` did not match; compare the marker with the first 40 rows of the extracted text.
- A Leumi or Max statement is read by the new format: it cannot be, built-ins win; check you imported the right file.
- A balance check fails on a real statement: a row was missed or a sign is wrong; never relax the check to make it pass.

## Share it

The package in `local-extensions/<id>/` is complete, with synthetic tests only. To publish it for other families, move it to its own skill folder `.agents/skills/bayit-add-<id>/` (`docs/extension-skills.md`, "Publishing").
