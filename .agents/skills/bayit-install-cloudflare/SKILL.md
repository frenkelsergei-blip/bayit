---
name: bayit-install-cloudflare
description: Install a person's own copy of Bayit on their own Cloudflare account (free tier), with their own address, sign-in with passkeys and/or Google, database and file storage. Use when someone wants to "set up / install / host / deploy Bayit", "get my own Bayit link", or run it on Cloudflare.
---

# Install Bayit on your own Cloudflare

Order: database migrations, then `npm run deploy:cloud` (it deploys the private statement reader first, then the site), then the scheduler. Verify the actual address Pages returns, including any assigned suffix. Never infer a successful sign-in, live delivery, PDF CPU allowance or restore from configuration alone.

The result: Bayit at `https://<project>.pages.dev`, on the person's own Cloudflare account. Their family's data stays in their account. Nothing in this flow changes app code. Read `.agents/skills/README.md` (rules) and `docs/self-hosting.md` (the full manual) first.

## Before you start, ask

1. **Project name.** It becomes the address `https://<project>.pages.dev`. Use lowercase letters, digits and dashes, e.g. `cohen-bayit`.
2. Do they have a **Cloudflare account** (free)? If not, send them to sign up and wait.
2a. **How will the family sign in?**
   - **Passkeys (the default; recommended):** "מפתח גישה" — face, fingerprint or screen lock, no password and no Google Cloud project. The owner proves they installed Bayit with a one-time **setup code** (step 7a). Skip steps 6 and the Google lines of step 7.
   - **Google only:** steps 6 and 7, and `BAYIT_PASSKEYS=off`.
   - **Both:** passkeys and Google side by side; anyone can add a passkey later in Settings › Privacy › Account security.
   Passkeys need the final https address: **choose the address now, before inviting the family** — moving to another address later means everyone creates a new passkey.
3. Do they want **Telegram reminders** now? Telegram is optional; the scheduler is required even without Telegram for retention and file cleanup.
4. With Google: which **verified Google email** will own the new installation? Configure it privately as `BAYIT_BOOTSTRAP_EMAIL` (or use the operator allowlist). A new private installation does not admit the first arbitrary Google user. Passkeys only: no email; the setup code decides the owner (step 7a).

## Steps

Run commands from `app/` unless noted. Explain each step in one sentence before running it.

1. **Dependencies and login.** This needs Node.js 22.13 or newer (https://nodejs.org, the LTS installer) and git (https://git-scm.com/downloads), in a terminal (Terminal on a Mac, PowerShell on Windows). Run `npm install`, then `npx wrangler login`. The person approves the login in their browser.
2. **Create the resources.**
   - `npx wrangler d1 create bayit-home`: note the `database_id` it prints.
   - `npx wrangler r2 bucket create bayit-home-files`
   - `npx wrangler pages project create <project> --production-branch main`

   If a name is taken in their account, pick another and pass it to the next step with `--database`/`--bucket`.
3. **Point the code at them:** `node scripts/bayit-configure.mjs --project <project> --database-id <database_id>`. This edits `wrangler.jsonc`, `wrangler.worker.jsonc`, `wrangler.pdf.jsonc`, `wrangler.cron.jsonc` and the deploy script in `package.json`; it changes nothing else. If they cloned with git, suggest committing these once (`git commit -am "My Cloudflare names"`) so later updates can merge.
4. **Database schema:** `npx wrangler d1 migrations apply bayit-home --remote`. Confirm with the person first; it writes to their database.
5. **Private PDF reader:** nothing to run here: `npm run deploy:cloud` (step 8) deploys it (`<project>-pdf`) before the site. Its config keeps workers.dev and preview URLs off; after step 8, check the `PDF_READER` service name in `wrangler.jsonc` matches `<project>-pdf`. It has no database or credentials. Before promising statement import, test a fictional PDF against the installation's actual CPU allowance, without silently selecting a paid plan.
6. **Google sign-in** (skip for passkeys only). Guide the person (they click; you never handle their Google password):
   1. Google Cloud Console → **Google Auth Platform** → **Clients** → Create client → **Web application**.
   2. Authorized redirect URI: `https://<project>.pages.dev/api/auth/callback/google`
   3. While in **Testing**, add each family member's Gmail as a test user.
7. **Secrets.** These commands prompt the person to paste or type the value; never put values on the command line or in files.
   - Have the person generate independent 32-byte secrets privately (a password manager's generator, or in **their own terminal**: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`) and paste them directly into the Wrangler prompts. Never generate/read/print the secret values in agent output.
   - `npx wrangler pages secret put AUTH_SECRET --project-name <project>`
   - `npx wrangler pages secret put APP_ENCRYPTION_KEY --project-name <project>`. Preserve the original key and follow the versioned rotation procedure in docs/security-hardening.md; never replace it without retaining the prior key ring.
   - Google only: `npx wrangler pages secret put BAYIT_BOOTSTRAP_EMAIL --project-name <project>`: the owner's verified Google email.
   - Google only: `npx wrangler pages secret put GOOGLE_CLIENT_ID --project-name <project>` and `npx wrangler pages secret put GOOGLE_CLIENT_SECRET --project-name <project>`.
7a. **Passkeys** (on by default; skip only if they want Google only, then also set `BAYIT_PASSKEYS` to `off`).
   - `npx wrangler pages secret put BAYIT_ORIGIN --project-name <project>`: exactly `https://<project>.pages.dev` (or their custom domain), no trailing slash. Passkeys are bound to this address and Bayit never takes it from request headers; without it passkeys are not offered. A preview address (`<hash>.<project>.pages.dev`) can never use them. **Changing `BAYIT_ORIGIN` later (e.g. moving to a custom domain) breaks every stored passkey**: decide the final address first.
   - **Setup code:** ask the person to run `node scripts/bayit-setup-code.mjs` in **their own terminal** (from `app/`), copy the code it prints into their password manager, then run `npx wrangler pages secret put BAYIT_SETUP_CODE --project-name <project>` and paste it. You never see the code. It works once: after the first owner finishes, it is dead even if the secret stays (they may delete it with `npx wrangler pages secret delete BAYIT_SETUP_CODE`).
   - Tell them: only ever type this code on their own Bayit address.
8. **Deploy** (ask first): `npm run deploy:cloud`.
9. **Scheduler (required for retention; Telegram delivery remains optional):**
   - Generate one more random value.
   - Run `npx wrangler pages secret put REMINDER_CRON_SECRET --project-name <project>`, then `npm run deploy:reminders`, then `npx wrangler secret put REMINDER_CRON_SECRET --config wrangler.cron.jsonc` with the **same** value.
   - Redeploy with `npm run deploy:cloud`.
10. **Check:** `node scripts/bayit-doctor.mjs --cloudflare`. Fix anything marked ✖ before saying it's done.

## Finish

- Tell the person their address. **Passkeys:** they open it, choose "Start setting up", type the code, their name, create the passkey on their phone or computer, then create their family. **Google:** they sign in with Google and create their family.
- Passkey limits to say plainly: they need the https address (no `http://`); an invitation opened inside WhatsApp's or Telegram's built-in browser may not offer passkeys, so open it in Safari or Chrome; never share a passkey with another family member or create it on a shared device.
- **If the only parent loses every passkey:** they run `node scripts/bayit-setup-code.mjs` in their own terminal again, save it with `npx wrangler pages secret put BAYIT_RECOVERY_CODE --project-name <project>`, and choose "Own this installation and can't sign in?" on the sign-in screen. Other people are helped back in by a parent (Settings › Family › "Help them get back in", which works after 24 hours).
- Explain that others join through **Settings → Family → Invite**, with one link per person.
- Then offer `bayit-connect` to connect AI, Telegram and RiseUp.
- Say plainly what was verified (the doctor's output) and what wasn't, e.g. "Google sign-in works once you sign in yourself."
- **Operator note:** whoever controls the Cloudflare account can read the database directly. Tell them, if other families will use this installation.
