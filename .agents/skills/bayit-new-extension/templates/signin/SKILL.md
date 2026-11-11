---
name: bayit-add-__ID__
description: Adds "Continue with __NAME_EN__" to Bayit's sign-in screen, as an extension. Use when a family wants to sign in with __NAME_EN__. Needs a security review first.
---

# __NAME_EN__ sign-in

## What it adds

A **Continue with __NAME_EN__** button on the sign-in screen, once the owner has set it up. Who may join is still decided by Bayit (verified email, the owner's list, invitations); this only proves who someone is. It calls only the addresses in `extension.json` → `outbound`.

**Security review first.** A sign-in method decides who gets into a family's data. Do not offer it to a family until someone other than its author has reviewed it against `docs/sign-in-methods.md`.

## Ask first

- The owner creates an OAuth app at __NAME_EN__ with the callback `https://<their address>/api/auth/callback/__ID__`, then sets the two installation secrets themselves (typed by them, never pasted in chat):
  - Cloudflare: `cd app && npx wrangler pages secret put __ENV___CLIENT_ID` and `… __ENV___CLIENT_SECRET`
  - Docker: `__ENV___CLIENT_ID=…` and `__ENV___CLIENT_SECRET=…` in `.env`, then restart.

## Apply

```bash
node app/scripts/bayit-extension.mjs apply <this folder>
```

## Verify

```bash
node app/scripts/bayit-extension.mjs check
```

Then sign out, choose **Continue with __NAME_EN__**, and sign in with an address that is already a member. An address that is not invited must still be refused.

## Troubleshooting

- The button is missing: the two secrets are not set, or the server was not restarted.
- "redirect_uri mismatch": the callback at __NAME_EN__ must be exactly `https://<address>/api/auth/callback/__ID__`.
- Refused although invited: __NAME_EN__ did not report the email as verified.

Remove it with `REMOVE.md`.
