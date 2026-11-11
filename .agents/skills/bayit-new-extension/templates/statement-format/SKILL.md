---
name: bayit-add-__ID__
description: Teaches Bayit to import __NAME_EN__ statement PDFs in Expenses, as an extension, reconciled with the printed totals. Use when a family wants to import statements from __NAME_EN__.
---

# __NAME_EN__ statements

## What it adds

Expenses → Import reads **__NAME_EN__** statement PDFs. Every import is checked against the totals printed on the statement; a statement that does not reconcile is reported, not imported silently. It calls no outside address.

## Ask first

- Nothing to set up. A parent needs one real statement only to check it in the app; never put it in the package.

## Apply

```bash
node app/scripts/bayit-extension.mjs apply <this folder>
```

## Verify

```bash
node app/scripts/bayit-extension.mjs check
```

Then a parent imports one real __NAME_EN__ statement in Expenses and compares the total and the number of rows with the paper.

## Troubleshooting

- "This statement format is not supported yet": `detect` does not recognise this statement's first rows (a new layout or another product of the same bank).
- A check fails: a column was read in the wrong place, or a row type (fees, refunds, foreign currency) is missing. Add a synthetic row of that type to the test, then fix `parse`.

Remove it with `REMOVE.md`.
