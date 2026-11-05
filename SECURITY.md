# Security policy

Please **do not open public issues for security problems.** Report them privately through GitHub's **"Report a vulnerability"** (Security → Advisories) on this repository.

Include the affected version or commit, steps to reproduce, and the impact. We aim to acknowledge reports within a few days.

## Scope notes

- Each installation is operated by whoever deploys it. Secrets (Google OAuth, `AUTH_SECRET`, `APP_ENCRYPTION_KEY`, Claude keys, Telegram tokens) belong to that operator.
- Household separation and record visibility are enforced server-side in `app/cloud/state.mjs` and the API handlers. A way to read or change another household's or person's private data counts as a vulnerability.
- Data is not end-to-end encrypted: the installation operator can read the database. That is a documented limitation, not a vulnerability.
