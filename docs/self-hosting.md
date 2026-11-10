# Install Bayit on your own Cloudflare account

Bayit runs entirely on **your own Cloudflare account**. It uses a Pages project with a Function, a D1 database, a private R2 bucket, a small private Worker that reads bank statements, a scheduler Worker, and optionally Workers AI for voice messages (or the household AI key). The free Cloudflare plan is enough for a family. Every outside service (Google sign-in, your AI provider, Telegram) uses accounts and keys **you** create.

> Prefer your own computer, a NAS, a Raspberry Pi or another provider? See [Run Bayit anywhere with Docker](self-hosting-docker.md).
>
> Would you rather have an AI agent walk you through it? Open the repository in Claude Code, Codex or another agent that reads skills, and ask "Install Bayit on my Cloudflare". The [skill](../.agents/skills/bayit-install-cloudflare/SKILL.md) follows these same steps.

**Time:** about 45 minutes.

**You need:**
- a Cloudflare account (free) and a Google account;
- Node.js 22.13 or newer, and git;
- the Google email of the person who will own the installation.

## 1. Get the code

```bash
git clone https://github.com/frenkelsergei-blip/bayit.git
cd bayit/app
npm install
npx wrangler login          # approve in the browser window that opens
```

Run every command below from the `app` folder unless it says otherwise.

## 2. Create your Cloudflare resources

Pick a **project name**: lowercase letters, digits and dashes, such as `cohen-bayit`. It becomes your address, `https://<project>.pages.dev`.

```bash
npx wrangler d1 create bayit-home                                  # note the database_id it prints
npx wrangler r2 bucket create bayit-home-files
npx wrangler pages project create <project> --production-branch main
```

If a name is already taken in your account, choose another one. Then pass it to the next step with `--database <name>` or `--bucket <name>`.

## 3. Point the code at your resources

```bash
node scripts/bayit-configure.mjs --project <project> --database-id <database_id>
```

This writes only names and IDs, never secrets. It updates `wrangler.jsonc`, `wrangler.worker.jsonc`, `wrangler.pdf.jsonc`, `wrangler.cron.jsonc` and the deploy script in `package.json`. Review the changes with `git diff`.

## 4. Create the database tables

```bash
npx wrangler d1 migrations apply bayit-home --remote
```

## 5. Google sign-in

Everyone signs in with their own Google account. Create the sign-in client by following **[Google sign-in setup](google-sign-in.md)**, using this redirect URI:

```
https://<project>.pages.dev/api/auth/callback/google
```

## 6. Secrets

Secrets are stored as **Pages secrets**. Each command below prompts you to paste the value, so it never appears in a file, in your shell history or in the frontend.

Create two independent random values. A password manager's generator works, or:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

```bash
npx wrangler pages secret put AUTH_SECRET --project-name <project>             # random value 1
npx wrangler pages secret put APP_ENCRYPTION_KEY --project-name <project>      # random value 2
npx wrangler pages secret put BAYIT_BOOTSTRAP_EMAIL --project-name <project>   # the owner's Google email
npx wrangler pages secret put GOOGLE_CLIENT_ID --project-name <project>
npx wrangler pages secret put GOOGLE_CLIENT_SECRET --project-name <project>
```

- **`APP_ENCRYPTION_KEY`** encrypts every household's AI key, bot token and other connection credentials. Keep a copy in your password manager. Never replace it without the key-rotation steps in [security-hardening.md](security-hardening.md), or households will have to reconnect.
- **`BAYIT_BOOTSTRAP_EMAIL`** decides who may create the first household. A new installation does not let any Google user in. The owner signs in, creates the family and invites everyone else. To let more people create their own households, see the registration settings in [security-hardening.md](security-hardening.md).

## 7. Deploy

```bash
npm run deploy:cloud
```

This builds the app, deploys the private statement reader (`<project>-pdf`) and then publishes the site. The statement reader has no public address, database or credentials. Only your site can call it.

## 8. The scheduler

A small Worker wakes once a minute. It sends reminders (Telegram and phone notifications), the morning summary, and cleans up old files. Install it even if you don't use Telegram.

Create one more random value and store the **same** value in both places:

```bash
npx wrangler pages secret put REMINDER_CRON_SECRET --project-name <project>
npm run deploy:reminders
npx wrangler secret put REMINDER_CRON_SECRET --config wrangler.cron.jsonc
npm run deploy:cloud
```

A new schedule can take a few minutes to start. **Settings → Accounts & connections → Telegram** shows when it last ran.

## 9. Check it

```bash
node scripts/bayit-doctor.mjs --cloudflare --origin https://<project>.pages.dev
```

The doctor checks your tools, configuration, secret names (never their values), migrations, the site, the sign-in setup and the running version. It prints a fix for every ✖.

Then open your address, sign in with the owner's Google account and create your family. Invite the others in **Settings → Family → Invite**: one link per person, each used once.

## 10. Connect the extras

Everything else is connected inside the app, at **Settings → Accounts & connections**. Every card shows a live status. See **[Connections](connections.md)** for:
- your AI provider;
- the Telegram bot;
- notifications on phones and computers;
- Google Maps;
- RiseUp;
- bank statement import.

## Updating and backups

See **[Updating and backups](updating-and-backups.md)**.

## Something isn't working

See **[Troubleshooting](troubleshooting.md)**, or run the doctor again.

## What the operator can see

Bayit keeps households and private records apart **inside the app**, and the server enforces it. Whoever controls the Cloudflare account can still read the D1 database directly. Tell the families who use your installation. The [security hardening guide](security-hardening.md) covers account security, key rotation, backups and recovery.
