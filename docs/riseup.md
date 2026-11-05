# RiseUp connection (optional)

[RiseUp](https://riseup.co.il) is a licensed Israeli financial-information service. It already connects to banks and card companies (Bank Leumi, Max, Isracard and others). If you use RiseUp, Bayit can read your transactions from it every day, so you don't have to import statement PDFs by hand.

The connection is **optional**. Statement import keeps working, and you can use both.

## What it does

- Reads your transactions (and, if allowed, your current bank balances) from RiseUp's official external API. It is **read-only**: Bayit cannot move money or change anything in RiseUp.
- Refreshes once a day through the scheduler Worker (`bayit-reminders`). You can also press **Sync now**.
- Keeps the months you choose (1, 3, 6 or 12) in sync. A transaction RiseUp removes or excludes is removed from Bayit. A month for which RiseUp returns nothing is left untouched.
- Maps RiseUp categories to Bayit categories. A category you change in Bayit is kept on the next sync.
- Avoids double counting. RiseUp's own cash-flow month is used, credit-card bill payments that RiseUp excludes stay excluded, and (when **Use RiseUp instead of imported statements** is on) imported Leumi/Max statement rows are set aside for the months RiseUp covers. The Expenses page says how many rows were set aside.

## Connect

Each adult connects their **own** RiseUp account. Children never see expenses.

1. Have a RiseUp account with your bank and cards connected inside RiseUp.
2. Open RiseUp's developer tokens page, <https://input.riseup.co.il/developer/tokens>, and create a token with **תקציב** (budget). Add **יתרות בנק** (bank balances) to show balances. Copy the token; RiseUp shows it only once.
3. In Bayit, open **Household → Expenses → Connect RiseUp**, paste the token, choose who can see the transactions, and press **Connect RiseUp**.

Bayit loads the chosen months right away and reports how many transactions arrived. A wrong or revoked token is rejected, and nothing is stored.

## Privacy

- The token is encrypted with AES-GCM (`APP_ENCRYPTION_KEY`), bound to the household and the person, stored only on the server, and never returned to the browser or written to logs.
- **Both parents** shares the transactions and balances with the other adults in the home. **Only me** keeps them private: other adults don't see the rows, the balances, or the connection itself. You can change this at any time, and existing rows follow the new choice.
- Visibility is enforced by the server (`visibleFinance` in `app/cloud/finance.mjs`). AI tips use the same visible rows, and they send totals and categories only.
- **Disconnect** deletes the encrypted token. You choose whether to keep or remove the transactions already loaded. You can also revoke the token in RiseUp at any time; Bayit then shows **RiseUp needs attention** and stops retrying until you paste a new token.

## When RiseUp changes its API

Everything RiseUp-specific lives in one file, `app/cloud/riseup.mjs`:

- `RISEUP_API_VERSION` names the API version Bayit was built against. It currently matches the official MIT package [`@riseup-oss/mcp`](https://github.com/riseup-oss/mcp) 0.7.0, which documents the endpoints and fields.
- `rowFromRiseup()` maps a RiseUp transaction to a Bayit row, and `CATEGORY_MAP` maps RiseUp category labels.
- `riseupGet()` maps RiseUp errors: 401 means a revoked token; 403 names the missing scope.

To adopt a new RiseUp version:

1. Read the release notes of `@riseup-oss/mcp` (or RiseUp's announcement) and compare the endpoints and transaction fields with `rowFromRiseup()`.
2. Update the mapping and `RISEUP_API_VERSION`.
3. Update the synthetic fixtures in `tests/riseup.test.mjs` to the new shape, and run `npm run test:domain`.
4. Bump the app version, add a release note, and release. A database migration is needed only if new stored fields are added.

## Testing without RiseUp

`tests/riseup.test.mjs` runs the mapping and the full sync against a simulated RiseUp API and an in-memory SQLite database built from the real migrations. For a local browser check, start a fake RiseUp server on a loopback port and pass `--var RISEUP_TEST_ORIGIN:http://127.0.0.1:<port>` to `wrangler dev`. `RISEUP_TEST_ORIGIN` is accepted only for loopback addresses, and production never sets it.
