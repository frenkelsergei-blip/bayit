---
name: bayit-install-docker
description: Run a person's own copy of Bayit with Docker on any machine (home computer, NAS, Raspberry Pi, free or paid cloud server, container host), including HTTPS, Google sign-in, backups and updates. Use when someone wants to self-host Bayit without Cloudflare, "run it locally", "on my server / Pi / VPS", or "with Docker".
---

# Run Bayit anywhere with Docker

The same server code as Cloudflare, with a SQLite file and a local folder in a Docker volume. Read `.agents/skills/README.md` (rules) and `docs/self-hosting-docker.md` (the manual) first. Nothing here changes app code.

## Ask first

1. **Where will it run?** This machine, another machine they can SSH into, or a cloud server they will create. For a cloud server, tell them to check the provider's current free-tier terms. Never sign them up for anything paid.
2. **Just trying it, or real family use?** Trying it needs no domain: use `http://localhost:8080/?demo=1`. Real use needs a **public https address**, because Google sign-in and Telegram require one:
   - **a domain they own** pointed at the server (the Caddy HTTPS profile), or
   - **a tunnel** (Cloudflare Tunnel or Tailscale Funnel) when the machine is at home and they don't want to open ports.

## Steps

All commands run in the repository root on the target machine.

1. **Docker:** check `docker version` and `docker compose version`. If they're missing, give the official install instructions for that OS; the person installs Docker.
2. **Settings:** run `cp .env.example .env`, then fill in `.env` together:
   - `BAYIT_ORIGIN`: the exact address people will open (`https://…` for real use).
   - `BAYIT_DOMAIN`: only with the Caddy profile.
   - `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`: the person pastes these into `.env` themselves. Never echo them.
   - Leave `AUTH_SECRET`, `APP_ENCRYPTION_KEY` and `REMINDER_CRON_SECRET` empty to have them generated once in the data volume, or set them from a password manager.
3. **Google sign-in client** (real use only): Google Auth Platform → Clients → **Web application**, with redirect URI `<BAYIT_ORIGIN>/api/auth/callback/google`. While the app is in Testing, add each family member as a test user.
4. **Start:**
   - Trying it: `docker compose up -d --build`
   - With a domain: `docker compose --profile https up -d --build`. Ports 80 and 443 must reach the machine.
   - With a tunnel: start the tunnel to `http://localhost:8080` and set `BAYIT_ORIGIN` to the tunnel address.
5. **Check:** `node app/scripts/bayit-doctor.mjs --docker`. This needs Node.js 22.13+ on the machine; otherwise run `docker compose ps` and `curl <BAYIT_ORIGIN>/api/health`.
6. **Backups:** show the backup command from `docs/self-hosting-docker.md`, and say the data volume holds the database, the files and the generated secrets. Suggest a scheduled backup (cron on Linux), but don't create one without asking.

## Finish

- Give the address. They sign in, create their family, then use `bayit-connect`.
- **Be clear about the differences from Cloudflare:**
  - Telegram voice messages are off (Workers AI is Cloudflare-only).
  - They're responsible for updates (`bayit-update`), backups and uptime.
- Report what the doctor verified and what it didn't (real Google sign-in needs them to try it).
