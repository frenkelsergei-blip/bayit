# Self-hosting Bayit

Bayit runs entirely on **your own Cloudflare account**: a Pages project with a Function, a D1 database, a private R2 bucket, optional Workers AI, and a tiny cron Worker for reminders. The free Cloudflare plan is enough for a family. Every external service (Google sign-in, Claude, Telegram) uses credentials **you** create.

> Prefer your own machine, a NAS, a Raspberry Pi or another cloud provider? See [Run Bayit anywhere with Docker](self-hosting-docker.md).

> Time: about 30–45 minutes. You need a Cloudflare account, a Google account, Node.js 20+, and the `wrangler` CLI (installed with the app).

## 1. Get the code and dependencies

```bash
git clone https://github.com/frenkelsergei-blip/bayit.git
cd bayit/app
npm install
npx wrangler login
```

## 2. Create the Cloudflare resources

```bash
npx wrangler d1 create bayit-home          # copy the database_id it prints
npx wrangler r2 bucket create bayit-home-files
npx wrangler pages project create bayit    # choose a project name; your site becomes https://<name>.pages.dev
```

Put the `database_id` into `app/wrangler.jsonc` (and `app/wrangler.worker.jsonc`, which is only used for local tests) in place of `<your-d1-database-id>`. If you chose a different project name, update the `--project-name` in the `deploy:cloud` script in `app/package.json`.

Apply the database schema:

```bash
npx wrangler d1 migrations apply bayit-home --remote
```

## 3. Google sign-in

1. In Google Cloud Console → **Google Auth Platform**, create an OAuth client of type **Web application**.
2. Add this authorized redirect URI: `https://<your-project>.pages.dev/api/auth/callback/google`
3. Only the `openid email profile` scopes are used. While the app is in **Testing**, add the Gmail addresses of the people who will sign in (up to 100). Publishing it to everyone may require Google's review.

## 4. Secrets

Generate two random secrets and store all four values as **Pages secrets**. Never put them in files or frontend variables.

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # use for AUTH_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # use for APP_ENCRYPTION_KEY

npx wrangler pages secret put AUTH_SECRET --project-name bayit
npx wrangler pages secret put APP_ENCRYPTION_KEY --project-name bayit
npx wrangler pages secret put GOOGLE_CLIENT_ID --project-name bayit
npx wrangler pages secret put GOOGLE_CLIENT_SECRET --project-name bayit
```

`APP_ENCRYPTION_KEY` encrypts each household's Claude key and Telegram bot token. If you change it later, households have to re-enter those credentials.

## 5. Deploy

```bash
npm run deploy:cloud
```

Open your site, sign in with Google, and create your family. Invite others in **Settings → Family** (each link works once and expires).

## 6. Reminders (optional, for Telegram)

Pages cannot run on a schedule, so a small Worker wakes once a minute and asks your site to send due reminders.

1. In `app/wrangler.cron.jsonc`, set `BAYIT_ORIGIN` to your site address.
2. Create one more random secret and store it in **both** places:
   ```bash
   npx wrangler pages secret put REMINDER_CRON_SECRET --project-name bayit
   npm run deploy:reminders
   npx wrangler secret put REMINDER_CRON_SECRET --config wrangler.cron.jsonc
   ```
3. A new cron schedule can take a few minutes to start. **Settings → Notifications → Telegram** shows when it last ran.

## 7. Connect the extras (inside the app)

| Feature | Where | You need |
| --- | --- | --- |
| AI (Ask AI, Telegram chat, photos, money tips) | Settings → AI | An API key from **Claude (Anthropic), OpenAI, Google Gemini, xAI Grok**, or any OpenAI-compatible service (OpenRouter, Groq, Together, or a self-hosted Ollama/LM Studio behind https). Each household picks its own provider and key. |
| Telegram bot | Settings → Notifications → Telegram | A bot token from **@BotFather**. Each person taps **Connect** and then **Start**. |
| Voice messages | Settings → Notifications → Telegram → Photos & voice | Cloudflare Workers AI. It's already bound as `AI` in `wrangler.jsonc` and runs on your account's daily allowance. |
| Money | Household → Money → Import statement | Bank Leumi or Max statement PDFs. No bank passwords are needed. |

## Updating

```bash
git pull
cd app && npm install
npx wrangler d1 migrations apply bayit-home --remote   # applies only new migrations
npm run deploy:cloud
```

## What the operator can see

Bayit keeps households and private records apart **inside the app**, and the server enforces it. Whoever controls the Cloudflare account can still read the D1 database directly. Tell the families who use your installation.
