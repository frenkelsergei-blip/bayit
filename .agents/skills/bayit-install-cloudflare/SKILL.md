---
name: bayit-install-cloudflare
description: Install a person's own copy of Bayit on their own Cloudflare account (free tier), with their own address, Google sign-in, database and file storage. Use when someone wants to "set up / install / host / deploy Bayit", "get my own Bayit link", or run it on Cloudflare.
---

# Install Bayit on your own Cloudflare

Security release gate: apply migrations 0008/0009, deploy the private PDF worker, then publish the main app and scheduler. Follow `docs/security-hardening.md`; verify the actual origin returned by Pages, including any assigned suffix. Never infer a successful Google login, live delivery, PDF CPU allowance or restore from configuration alone.

The result: Bayit at `https://<project>.pages.dev`, on the person's own Cloudflare account. Their family's data stays in their account. Nothing in this flow changes app code. Read `.agents/skills/README.md` (rules) and `docs/self-hosting.md` (the full manual) first.

## Before you start, ask

1. **Project name.** It becomes the address `https://<project>.pages.dev`. Use lowercase letters, digits and dashes, e.g. `cohen-bayit`.
2. Do they have a **Cloudflare account** (free) and a **Google account** for the sign-in setup? If not, send them to sign up and wait.
3. Do they want **Telegram reminders** now? Telegram is optional; the scheduler is required even without Telegram for retention and file cleanup.
4. Which **verified Google email** will own the new installation? Configure it privately as `BAYIT_BOOTSTRAP_EMAIL` (or use the operator allowlist). A new private installation does not admit the first arbitrary Google user.

## Steps

Run commands from `app/` unless noted. Explain each step in one sentence before running it.

1. **Dependencies and login.** Run `npm install`, then `npx wrangler login`. The person approves the login in their browser.
2. **Create the resources.**
   - `npx wrangler d1 create bayit-home`: note the `database_id` it prints.
   - `npx wrangler r2 bucket create bayit-home-files`
   - `npx wrangler pages project create <project> --production-branch main`

   If a name is taken in their account, pick another and pass it to the next step with `--database`/`--bucket`.
3. **Point the code at them:** `node scripts/bayit-configure.mjs --project <project> --database-id <database_id>`. This edits `wrangler.jsonc`, `wrangler.worker.jsonc`, `wrangler.cron.jsonc` and the deploy script; it changes nothing else.
4. **Database schema:** `npx wrangler d1 migrations apply bayit-home --remote`. Confirm with the person first; it writes to their database.
5. **Private PDF reader:** deploy `npx wrangler deploy --config wrangler.pdf.jsonc` before publishing Pages. Keep workers.dev/preview URLs disabled and verify the `PDF_READER` service name matches this project. It has no database or credentials; test a fictional PDF against the installation's actual CPU allowance, without silently selecting a paid plan.
6. **Google sign-in.** Guide the person (they click; you never handle their Google password):
   1. Google Cloud Console → **Google Auth Platform** → **Clients** → Create client → **Web application**.
   2. Authorized redirect URI: `https://<project>.pages.dev/api/auth/callback/google`
   3. While in **Testing**, add each family member's Gmail as a test user.
7. **Secrets.** These commands prompt the person to paste or type the value; never put values on the command line or in files.
   - Have the person generate independent 32-byte secrets privately in their password manager and paste them directly into the Wrangler prompts. Never generate/read/print the secret values in agent output.
   - `npx wrangler pages secret put AUTH_SECRET --project-name <project>`
   - `npx wrangler pages secret put APP_ENCRYPTION_KEY --project-name <project>`. Preserve the original key and follow the versioned rotation procedure in docs/security-hardening.md; never replace it without retaining the prior key ring.
   - `npx wrangler pages secret put BAYIT_BOOTSTRAP_EMAIL --project-name <project>`: the owner's verified Google email.
   - `npx wrangler pages secret put GOOGLE_CLIENT_ID --project-name <project>`
   - `npx wrangler pages secret put GOOGLE_CLIENT_SECRET --project-name <project>`
8. **Deploy** (ask first): `npm run deploy:cloud`.
9. **Scheduler (required for retention; Telegram delivery remains optional):**
   - Generate one more random value.
   - Run `npx wrangler pages secret put REMINDER_CRON_SECRET --project-name <project>`, then `npm run deploy:reminders`, then `npx wrangler secret put REMINDER_CRON_SECRET --config wrangler.cron.jsonc` with the **same** value.
   - Redeploy with `npm run deploy:cloud`.
10. **Check:** `node scripts/bayit-doctor.mjs --cloudflare`. Fix anything marked ✖ before saying it's done.

## Finish

- Tell the person their address. Ask them to open it, sign in with Google and create their family.
- Explain that others join through **Settings → Family → Invite**, with one link per person.
- Then offer `bayit-connect` to connect AI, Telegram and RiseUp.
- Say plainly what was verified (the doctor's output) and what wasn't, e.g. "Google sign-in works once you sign in yourself."
- **Operator note:** whoever controls the Cloudflare account can read the database directly. Tell them, if other families will use this installation.
