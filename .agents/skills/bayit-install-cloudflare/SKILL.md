---
name: bayit-install-cloudflare
description: Install a person's own copy of Bayit on their own Cloudflare account (free tier), with their own address, Google sign-in, database and file storage. Use when someone wants to "set up / install / host / deploy Bayit", "get my own Bayit link", or run it on Cloudflare.
---

# Install Bayit on your own Cloudflare

The result: Bayit at `https://<project>.pages.dev`, on the person's own Cloudflare account. Their family's data stays in their account. Nothing in this flow changes app code. Read `.agents/skills/README.md` (rules) and `docs/self-hosting.md` (the full manual) first.

## Before you start, ask

1. **Project name.** It becomes the address `https://<project>.pages.dev`. Use lowercase letters, digits and dashes, e.g. `cohen-bayit`.
2. Do they have a **Cloudflare account** (free) and a **Google account** for the sign-in setup? If not, send them to sign up and wait.
3. Do they want **Telegram reminders** now? That adds the scheduler (step 6).

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
5. **Google sign-in.** Guide the person (they click; you never handle their Google password):
   1. Google Cloud Console → **Google Auth Platform** → **Clients** → Create client → **Web application**.
   2. Authorized redirect URI: `https://<project>.pages.dev/api/auth/callback/google`
   3. While in **Testing**, add each family member's Gmail as a test user.
6. **Secrets.** These commands prompt the person to paste or type the value; never put values on the command line or in files.
   - `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`: run it twice and tell the person to use one value for each command below. They paste the values directly into the prompts.
   - `npx wrangler pages secret put AUTH_SECRET --project-name <project>`
   - `npx wrangler pages secret put APP_ENCRYPTION_KEY --project-name <project>`. Warn: keep this value. Changing it later means every family re-enters its AI key, bot token and RiseUp token.
   - `npx wrangler pages secret put GOOGLE_CLIENT_ID --project-name <project>`
   - `npx wrangler pages secret put GOOGLE_CLIENT_SECRET --project-name <project>`
7. **Deploy** (ask first): `npm run deploy:cloud`.
8. **Reminders (optional, for Telegram):**
   - Generate one more random value.
   - Run `npx wrangler pages secret put REMINDER_CRON_SECRET --project-name <project>`, then `npm run deploy:reminders`, then `npx wrangler secret put REMINDER_CRON_SECRET --config wrangler.cron.jsonc` with the **same** value.
   - Redeploy with `npm run deploy:cloud`.
9. **Check:** `node scripts/bayit-doctor.mjs --cloudflare`. Fix anything marked ✖ before saying it's done.

## Finish

- Tell the person their address. Ask them to open it, sign in with Google and create their family.
- Explain that others join through **Settings → Family → Invite**, with one link per person.
- Then offer `bayit-connect` to connect AI, Telegram and RiseUp.
- Say plainly what was verified (the doctor's output) and what wasn't, e.g. "Google sign-in works once you sign in yourself."
- **Operator note:** whoever controls the Cloudflare account can read the database directly. Tell them, if other families will use this installation.
