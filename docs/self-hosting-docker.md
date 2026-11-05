# Run Bayit anywhere with Docker

Bayit's default home is Cloudflare's free tier ([self-hosting.md](self-hosting.md)): no server to look after, and nothing to pay for a family. Docker is the **optional** alternative for people who prefer their own machine or another provider. It runs the **same server code**. Only the platform pieces are swapped:

| Cloudflare | Docker |
|---|---|
| D1 database | A SQLite file in the data volume |
| R2 private files | A folder in the data volume |
| Pages static hosting | The same server serves the app |
| Cron Worker (`bayit-reminders`) | A built-in timer, every minute |
| Workers AI (voice transcription) | Not available yet: voice messages are off. Photos, chat and everything else work. |

Everything else is identical: the AI providers (Claude, OpenAI, Gemini, Grok, custom), Telegram, RiseUp, statement import, privacy rules and encryption.

## Where can it run?

Anything that runs Docker on amd64 or arm64:

- **A computer at home**: a Mac, Windows or Linux PC, a NAS, or a Raspberry Pi 4/5 (64-bit). It costs nothing extra, but the machine must stay on.
- **A free cloud server**: some providers have always-free small virtual machines (for example Oracle Cloud and Google Cloud). Terms, regions and limits change, so check the current free-tier rules before you rely on one.
- **A small paid server (VPS)** from any provider. The smallest plans are enough for a family.
- **Container platforms** that run a Dockerfile with a persistent volume (for example Fly.io or Render). The data volume must be persistent.

## Quick start (on your computer)

```bash
git clone https://github.com/frenkelsergei-blip/bayit.git
cd bayit
cp .env.example .env
docker compose up -d --build
```

Open <http://localhost:8080/?demo=1> to look around with sample data. The first start creates the database and generates the installation secrets (`AUTH_SECRET`, `APP_ENCRYPTION_KEY`, `REMINDER_CRON_SECRET`) in the data volume.

## Sign-in and a public address

Real accounts use Google sign-in, and Google sends people back to an **https** address. Telegram also delivers messages to an https address. So for real use, Bayit needs a public https address. Choose one:

1. **Your own domain with automatic HTTPS (Caddy).** Point a domain (e.g. `bayit.example.com`) at your server, open ports 80 and 443, and set in `.env`:
   ```
   BAYIT_DOMAIN=bayit.example.com
   BAYIT_ORIGIN=https://bayit.example.com
   ```
   Then run `docker compose --profile https up -d --build`. Caddy gets and renews the certificate.
2. **A tunnel, with no open ports**: Cloudflare Tunnel or Tailscale Funnel can give a machine at home an https address. Set `BAYIT_ORIGIN` to that address.

Then create the Google sign-in client:

1. In Google Cloud → Google Auth Platform → **Clients**, create a **Web application** client.
2. Add the authorized redirect URI `<BAYIT_ORIGIN>/api/auth/callback/google`, for example `https://bayit.example.com/api/auth/callback/google`.
3. Put `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`, and run `docker compose up -d` again.
4. While the Google app is in **Testing**, add each family member's Google account as a test user.

`BAYIT_ORIGIN` must be exactly the address people open, because sign-in and the server's request checks depend on it.

## Your data and backups

Everything lives in the `bayit-data` volume:

- `bayit.sqlite`: the household database
- `files/`: private documents and photos
- `secrets.json`: the generated installation secrets (only when they're not set in `.env`)

**Back up the whole volume**, and keep `APP_ENCRYPTION_KEY` with it. Without that key, stored AI keys, bot tokens and RiseUp tokens can't be decrypted; people would just have to enter them again. A simple backup:

```bash
docker compose stop bayit
docker run --rm -v bayit_bayit-data:/data -v "$PWD":/backup busybox tar czf /backup/bayit-backup.tgz -C /data .
docker compose start bayit
```

(The volume name is `<folder>_bayit-data`; `docker volume ls` shows it.)

## Updating

```bash
git pull
docker compose up -d --build
```

Database migrations run automatically on start, in order and only once each. **Settings → About & updates** shows the running version.

## Without Docker

The same server runs on Node.js 22.13 or newer:

```bash
cd app
npm ci
npm run build:host
DATA_DIR=./data PORT=8080 npm run start:host
```

## What's different from Cloudflare, honestly

- **Voice messages** (Telegram) need Cloudflare Workers AI and are off with Docker. Another speech provider can be added in `app/cloud/speech.mjs` (see [extending.md](extending.md)).
- **You run the server**: updates, backups, disk space and uptime are yours. Cloudflare's free tier does that for you.
- The adapters are in `app/host/`: `d1-sqlite.mjs` (database), `file-store.mjs` (files), `node-server.mjs` (web server and timer). The test suites in `tests/e2e` pass against both hosts. To run them against a Docker or Node server, set `BAYIT_TEST_ORIGIN` to its address and `BAYIT_SQLITE` to its database file.
