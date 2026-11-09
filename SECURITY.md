# Security policy

## Reporting a vulnerability

Please **do not open public issues for security problems.**

Report privately through GitHub: **Security → Report a vulnerability** on this repository ([direct link](https://github.com/frenkelsergei-blip/bayit/security/advisories/new)). Include:
- the affected version (Settings → About & updates) or commit;
- whether it's Cloudflare or Docker;
- steps to reproduce, and the impact.

Never include real keys, tokens or family data. Use the fictional demo family (`/?demo=1`) where you can.

**What happens next:**
- We aim to acknowledge reports within a few days, and keep you updated while we investigate.
- We fix confirmed vulnerabilities as quickly as we can, with critical ones first.
- We credit reporters in the advisory and the changelog unless they prefer not to be named.
- Fixed vulnerabilities are published as GitHub security advisories and noted in [CHANGELOG.md](CHANGELOG.md).

## Supported versions

Only the **latest release** gets security fixes. Bayit is self-hosted, so operators should update promptly; see [docs/updating-and-backups.md](docs/updating-and-backups.md).

## Scope

In scope: the code in this repository, including the server (`app/cloud`, `app/host`), the client, the scheduler and PDF reader Workers, and the agent skills.

**Counts as a vulnerability**, for example:
- reading or changing another household's or another person's private data;
- bypassing installation admission (owner approval and invitations);
- getting at stored credentials (AI keys, bot tokens, RiseUp or Maps keys);
- abusing the server to reach internal networks;
- injecting script into another person's session.

Household separation and record visibility are enforced server-side in `app/cloud/state.mjs` and the API handlers.

**Not a vulnerability:**
- **The operator can read their installation's database.** Data is not end-to-end encrypted, and the operator holds the keys. That's a documented limitation.
- Problems that need an attacker to already control the operator's Cloudflare account, server, or `.env`/secrets.
- Missing hardening that the operator chose to disable (for example `BAYIT_REGISTRATION_MODE=open`).

## Secrets belong to the operator

Each installation is operated by whoever deploys it. Its secrets belong to that operator:
- the Google OAuth client, `AUTH_SECRET` and `APP_ENCRYPTION_KEY`;
- the scheduler secret;
- each household's AI keys and Telegram bot tokens.

Hardening, key rotation, backups and recovery are described in [docs/security-hardening.md](docs/security-hardening.md).
