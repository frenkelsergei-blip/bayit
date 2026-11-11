---
name: bayit-install-docker
description: Run a person's own copy of Bayit with Docker on any machine (home computer, NAS, Raspberry Pi, free or paid cloud server, container host), including HTTPS, sign-in with passkeys and/or Google, backups and updates. Use when someone wants to self-host Bayit without Cloudflare, "run it locally", "on my server / Pi / VPS", or "with Docker".
---

# Run Bayit anywhere with Docker

The same server code as Cloudflare, with a SQLite file and a local folder in a Docker volume. Read `.agents/skills/README.md` (rules) and `docs/self-hosting-docker.md` (the manual) first. Nothing here changes app code.

## Ask first

1. **Where will it run?** This machine, another machine they can SSH into, or a cloud server they will create. For a cloud server, tell them to check the provider's current free-tier terms. Never sign them up for anything paid.
2. **How will the family sign in?** Passkeys ("מפתח גישה", face/fingerprint/screen lock; no Google Cloud setup, the owner uses a one-time setup code), Google, or both. Passkeys are on by default.
3. **On this computer only, or on the family's phones?**
   - **This computer only** (real use, no domain): `http://localhost:8080` with passkeys and the setup code from the log. It works **only in a browser on that same computer**: phones on the home network cannot use `http://192.168.x.x` (browsers refuse passkeys there, and Google refuses such addresses too). Looking around first: `http://localhost:8080/?demo=1` (sample data, kept only in that browser).
   - **The family's phones** need a **public https address**, because passkeys, Google sign-in and Telegram require one: **a domain they own** pointed at the machine (the Caddy HTTPS profile: DNS record, ports 80 and 443 forwarded on the router, a home IP that may change), or a tunnel. Say plainly that this needs networking knowledge, and that the tunnel route is **not tested by Bayit** (see "Behind a proxy" in `docs/self-hosting-docker.md`). For a family without that knowledge, recommend the Cloudflare install (`bayit-install-cloudflare`): it gives an https address with nothing to run at home. Choose the address before inviting the family (moving later means new passkeys for everyone).

## Steps

All commands run in the repository root on the target machine.

1. **Docker and git:** check `docker version`, `docker compose version` and `git --version`. If Docker is missing, point to Docker Desktop (https://docs.docker.com/get-started/get-docker/) or Docker Engine on Linux; the person installs and starts it. If git is missing they can install it (https://git-scm.com/downloads; on a Mac, typing `git` offers the command-line tools) or download the repository as a ZIP from GitHub. If port 8080 is taken, set `BAYIT_PORT` **and** the port in `BAYIT_ORIGIN`.
2. **Settings:** run `cp .env.example .env`, then fill in `.env` together:
   - `BAYIT_ORIGIN`: the exact address people will open (`https://…` for real use).
   - `BAYIT_DOMAIN`: only with the Caddy profile.
   - Passkeys (the default, no Google Cloud project): nothing to fill in. Google only: `BAYIT_PASSKEYS=off`.
   - Google only/both: `BAYIT_BOOTSTRAP_EMAIL`: the owner's verified Google email; keep registration private. Existing household memberships remain admitted. (With a bootstrap email set, Bayit does not make a setup code by itself; set `BAYIT_SETUP_CODE` too if they want both ways open.)
   - Google only/both: `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`: the person pastes these into `.env` themselves. Never echo them.
   - `BAYIT_TRUSTED_PROXIES`: with the Caddy profile set the compose network's subnet (from `docker network inspect`, e.g. `172.18.0.0/16`; Caddy 2 overwrites `X-Forwarded-For`, which is required). Cloudflare Tunnel / Tailscale: their handling of an incoming `X-Forwarded-For` is not verified, so follow "Behind a proxy" in the doc before listing them. Leave empty for `http://localhost`. Without it every visitor counts as the proxy and one stranger can block passkey sign-in for the family (see "Behind a proxy" in `docs/self-hosting-docker.md`).
   - `BAYIT_ORIGIN` is final: changing it later breaks every stored passkey (everyone then needs the owner's recovery code or a new passkey).
   - Leave `AUTH_SECRET`, `APP_ENCRYPTION_KEY` and `REMINDER_CRON_SECRET` empty to have them generated once in the data volume, or set them from a password manager.
The app port is loopback-only. Preserve the original keys and follow `docs/security-hardening.md` for encrypted offline backup/restore and rotation. Damaged installation keys must never be silently regenerated.
3a. **Google sign-in client** (Google path, real use only): Google Auth Platform → Clients → **Web application**, with redirect URI `<BAYIT_ORIGIN>/api/auth/callback/google`. While the app is in Testing, add each family member as a test user.
4. **Start:**
   - On this computer: `docker compose up -d --build`
   - With a domain: `docker compose --profile https up -d --build`. Ports 80 and 443 must reach the machine.
   - With a tunnel (not tested by Bayit; only if they already run one): point it at `http://localhost:8080`, set `BAYIT_ORIGIN` to the tunnel address and leave `BAYIT_TRUSTED_PROXIES` empty unless they have checked how the tunnel sets `X-Forwarded-For`.
4a. **First owner with passkeys:** at the first start Bayit prints `First-time setup code: …` in the log and saves it in `setup-code.txt` in the data volume. The person reads it themselves: `docker compose logs bayit` (or the file). Don't copy it into chat. They open the address, choose "Start setting up", type it, their name, create the passkey, then create the family. The code, the file and the log line disappear once setup is done.
5. **Check:** `node app/scripts/bayit-doctor.mjs --docker`. This needs Node.js 22.13+ on the machine; otherwise run `docker compose ps` and `curl <BAYIT_ORIGIN>/api/health`.
6. **Backups:** show the backup **and the restore** commands from `docs/self-hosting-docker.md` (the volume is `<folder>_bayit-data`; `docker volume ls` shows it), and say the archive holds the database, the files and the generated secrets, so keep it private. Suggest a scheduled backup (cron on Linux), but don't create one without asking. Offer to test the restore once.

## Finish

- Give the address. They open it: the first-run wizard asks for the setup code, their name and a passkey, then the family's name. With Google they sign in with Google instead. Then `bayit-connect` for the optional extras.
- **If the only parent loses every passkey:** `docker compose exec bayit node recovery-cli.mjs` prints a one-time recovery code (the running server accepts it at once); then "Own this installation and can't sign in?" on the sign-in screen. Other people are helped back in by a parent (Settings › Family, works after 24 hours).
- **Be clear about the differences from Cloudflare:**
  - Telegram voice messages use the household AI key (OpenAI or Gemini; Claude cannot transcribe audio). Workers AI is Cloudflare-only.
  - They're responsible for updates (`bayit-update`), backups and uptime.
- Report what the doctor verified and what it didn't (real Google sign-in needs them to try it).
