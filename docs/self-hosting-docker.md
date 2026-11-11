# Run Bayit anywhere with Docker

Bayit's default home is Cloudflare's free tier ([self-hosting.md](self-hosting.md)): no server to look after, and nothing to pay for a family. Docker is the alternative for people who prefer their own machine or another provider. It runs the **same server code**. Only the platform pieces are swapped:

| Cloudflare | Docker |
|---|---|
| D1 database | A SQLite file in the data volume |
| R2 private files | A folder in the data volume |
| Pages static hosting | The same server serves the app |
| Cron Worker (`bayit-reminders`) | A built-in timer, every minute |
| Workers AI (voice transcription) | Not available. Voice messages use the household AI key instead (OpenAI or Gemini; Claude cannot transcribe audio). |

Everything else is identical: the AI providers (Claude, OpenAI, Gemini, Grok, custom), Telegram, RiseUp, statement import, privacy rules and encryption.

> Would you rather have an AI agent walk you through it? Open the repository in an agent that reads skills and ask "Run Bayit with Docker on my Raspberry Pi" (the [bayit-install-docker](../.agents/skills/bayit-install-docker/SKILL.md) skill).

**You need:** Docker with Compose v2 and git (links below). For the family's phones: a public https address (see below). No Google account is needed: everyone signs in with a passkey.

## Where can it run?

Anything that runs Docker on amd64 or arm64:

- **A computer at home**: a Mac, Windows or Linux PC, a NAS, or a Raspberry Pi 4/5 (64-bit). It costs nothing extra, but the machine must stay on.
- **A free cloud server**: some providers have always-free small virtual machines (for example Oracle Cloud and Google Cloud). Terms, regions and limits change, so check the current free-tier rules before you rely on one.
- **A small paid server (VPS)** from any provider. The smallest plans are enough for a family.
- **Container platforms** that run a Dockerfile with a persistent volume (for example Fly.io or Render). The data volume must be persistent.

## Quick start: on this computer

This gives you a working Bayit on this computer, with passkeys, no domain and no Google.

- A **terminal** is the window where you type commands: **Terminal** on a Mac, **PowerShell** on Windows.
- **Docker** runs Bayit in a container. Install [Docker Desktop](https://docs.docker.com/get-started/get-docker/) and start it (Linux: Docker Engine with the Compose plugin).
- **git** downloads the code. Get it from [git-scm.com](https://git-scm.com/downloads) (on a Mac, typing `git` in Terminal offers to install it), or download the ZIP from GitHub, unpack it and skip the first command.

```bash
git clone https://github.com/frenkelsergei-blip/bayit.git
cd bayit
cp .env.example .env
docker compose up -d --build
docker compose logs bayit
```

1. The last command prints `First-time setup code: …` (also saved as `setup-code.txt` in the data volume).
2. Open <http://localhost:8080> in a browser **on this computer**, choose **Start setting up** and type the code (case and dashes don't matter).
3. Type your name, create a passkey (face, fingerprint or the computer's screen lock), and name your family. A short wizard then suggests which parts of Bayit to show; you can skip it.

That's it: tasks, calendar and shopping work, and everything stays after a restart (it lives in the `bayit-data` volume; see [backups](#your-data-and-backups)). The first start also generates the installation secrets (`AUTH_SECRET`, `APP_ENCRYPTION_KEY`, `REMINDER_CRON_SECRET`) in that volume.

- **Only browsers on this computer can open it.** Phones on your Wi-Fi cannot, and passkeys refuse `http://192.168…` addresses. For phones, see the next section.
- **Just looking?** <http://localhost:8080/?demo=1> shows a sample family; changes stay in that browser only.
- **Port 8080 taken?** In `.env` (a hidden file; open it with any text editor) set `BAYIT_PORT=8090` **and** `BAYIT_ORIGIN=http://localhost:8090`, then run `docker compose up -d` again.

## For the family's phones: a public https address

Phones (passkeys), Google sign-in and Telegram all need a public **https** address. Decide it before you invite the family: passkeys belong to the address they were made on, so moving later means new passkeys for everyone (if you set up on `http://localhost` first, the owner gets back in with `recovery-cli`, see [Passkeys](#passkeys)).

- **The simple way for a family:** install Bayit on Cloudflare instead ([Install on Cloudflare](self-hosting.md)). It gives an https address with nothing to run at home.
- **Your own domain with automatic HTTPS (Caddy)**, if you are comfortable with DNS and your router: point a domain (e.g. `bayit.example.com`) at this machine's public IP address, forward ports 80 and 443 on the router to this machine (this does not work if your internet provider uses CGNAT; a home IP that changes needs dynamic DNS), and set in `.env`:
   ```
   BAYIT_DOMAIN=bayit.example.com
   BAYIT_ORIGIN=https://bayit.example.com
   BAYIT_TRUSTED_PROXIES=<the compose network's subnet, see "Behind a proxy">
   ```
   Then run `docker compose --profile https up -d --build`. Caddy gets and renews the certificate.
- **Tunnels** (Cloudflare Tunnel, Tailscale Funnel) can also give a home machine an https address, but Bayit has **not tested** them yet; read "Behind a proxy" below before using one.

Then:

1. **Google sign-in** (optional; skip it with passkeys, see [Passkeys](#passkeys)): create the client with [Google sign-in setup](google-sign-in.md), using the redirect URI `<BAYIT_ORIGIN>/api/auth/callback/google` (for example `https://bayit.example.com/api/auth/callback/google`). Put `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`.
2. **The owner (with Google):** set `BAYIT_BOOTSTRAP_EMAIL` in `.env` to the Google email of the person who will create the family. A new installation doesn't let arbitrary Google accounts in; everyone else joins with an invitation from **Settings → Family → Invite**. Keep `BAYIT_REGISTRATION_MODE=private` unless you deliberately run Bayit for several families (see [security-hardening.md](security-hardening.md)).
3. Run `docker compose up -d` again (with `--profile https` if you use Caddy).

`BAYIT_ORIGIN` must be exactly the address people open, because sign-in and the server's request checks depend on it. The app's own port listens on this machine only; Caddy or your tunnel is the public entrance.

## Passkeys

> **New in 1.59.0, not yet tested on real phones.** Passkey sign-in ("מפתח גישה": Face ID, fingerprint or the phone's screen lock) passed an independent code review, but it has not been tried on real phones yet. It is on by default in the code. To offer Google only, set `BAYIT_PASSKEYS=off`. Google sign-in keeps working either way, and both can run side by side.

**Sign-in:** passkeys ("מפתח גישה", face/fingerprint/screen lock) are on by default and need no Google Cloud setup; Google is optional (both can run side by side; `BAYIT_PASSKEYS=off` turns passkeys off). Passkeys need `BAYIT_ORIGIN` to be your final https address, or `http://localhost:8080` for use **only in a browser on the same computer** (phones on the home network cannot use `http://192.168.x.x`; browsers refuse passkeys there). Choose the address before inviting the family: moving it later means everyone creates a new passkey. An invitation opened inside WhatsApp's or Telegram's built-in browser may not offer passkeys: open it in Safari or Chrome.

**First owner with passkeys:** while nobody has set Bayit up (and no `BAYIT_BOOTSTRAP_EMAIL` is set), the first start prints `First-time setup code: …` in the log (`docker compose logs bayit`) and saves it as `setup-code.txt` in the data volume (only its digest is in `secrets.json`). Open the address, choose "Start setting up", type it (case and dashes don't matter), your name, create the passkey, then name the family. The code works once; the file and the log line are gone after setup. To offer both paths with a bootstrap email, also set `BAYIT_SETUP_CODE`. Only ever type the code on your own Bayit address.

**Lost every passkey:** a parent helps others back in from Settings › Family (the link works after 24 hours; the person is told and can cancel). If the only parent is locked out: `docker compose exec bayit node recovery-cli.mjs` prints a one-time recovery code the running server accepts at once; choose "Own this installation and can't sign in?".

**Behind a proxy (`BAYIT_TRUSTED_PROXIES`).** Bayit limits passkey sign-in and code tries per visitor address. It uses the connection's own address and ignores any address a visitor claims. With an https address there is always a proxy in front, so every visitor arrives from the proxy; list the proxy in `BAYIT_TRUSTED_PROXIES` (comma-separated addresses or IPv4 ranges) so Bayit uses the address the proxy forwards (`X-Forwarded-For`, right-most hop that is not a proxy). Leaving it empty behind a proxy lets one stranger block passkey sign-in for the whole family; `bayit-doctor --docker` warns about it. What to set:
- **Only a proxy that overwrites or appends `X-Forwarded-For` may be listed.** A proxy that passes the visitor's own header through unchanged lets a visitor choose their address. Bayit takes the right-most address that is not a listed proxy, and ignores the header entirely if it holds anything that is not an IP address.
- **Caddy profile (this compose file):** Caddy 2 overwrites the header for visitors it does not trust, so it is safe. List the compose network's subnet, not all of Docker's range: run `docker network inspect $(docker compose ps -q caddy | xargs docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}')` (or `docker network ls`, then inspect the `<project>_default` network) and use its `Subnet`, for example `BAYIT_TRUSTED_PROXIES=172.18.0.0/16`. `172.16.0.0/12` also works with this compose file as shipped (the app port is published on `127.0.0.1` only), but then any container on this machine could claim an address.
- **Cloudflare Tunnel or Tailscale Serve/Funnel on the same machine** (pointing at `http://localhost:8080`): they reach Bayit through Docker's port mapping from the bridge gateway (Linux: usually `172.17.0.1`, so `BAYIT_TRUSTED_PROXIES=172.17.0.1`; Docker Desktop on a Mac: `192.168.65.1`). **Not yet verified:** whether these tunnels overwrite or pass through an incoming `X-Forwarded-For`. Check the tunnel's own documentation for how it sets `X-Forwarded-For`; until you know it overwrites or appends it, leave the list empty, which is safe but counts all visitors together.
- **Your own proxy on another machine:** its address exactly. IPv6 proxies are listed as exact addresses (IPv6 ranges are not supported).
- **No proxy (`http://localhost:8080` on this computer):** leave it empty.
Never list an address that ordinary visitors can connect from directly, and never publish the app port itself on a public address.

**Choose the address once.** Passkeys belong to `BAYIT_ORIGIN`. Changing it later makes every stored passkey stop working; a passkey-only family then gets back in only with the owner's recovery code and new passkeys for everyone.

## Check it

```bash
node app/scripts/bayit-doctor.mjs --docker --origin <BAYIT_ORIGIN>
```

This needs Node.js 22.13 or newer on the machine. Without Node, run `docker compose ps` and `curl <BAYIT_ORIGIN>/api/health`.

Then sign in as the owner, create your family, and connect the extras (AI, Telegram, notifications, Maps, RiseUp) in the app. See **[Connections](connections.md)**.

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

To restore that archive (this replaces everything in the volume):

```bash
docker compose stop bayit
docker run --rm -v bayit_bayit-data:/data -v "$PWD":/backup busybox sh -c 'rm -rf /data/* && tar xzf /backup/bayit-backup.tgz -C /data'
docker compose start bayit
```

(The volume name is `<folder>_bayit-data`; `docker volume ls` shows it. The archive holds the installation secrets: keep it private and move it out of the repository folder.)

Keep `APP_ENCRYPTION_KEY` and the original secrets safe, and test a restore once. [security-hardening.md](security-hardening.md) covers encrypted offline backups and key rotation. Never let damaged keys be silently regenerated.

## Updating

```bash
git pull
docker compose up -d --build
```

Database migrations run automatically on start, in order and only once each. **Settings → About & updates** shows the running version. Back up first; see [Updating and backups](updating-and-backups.md).

## Without Docker

The same server runs on Node.js 22.13 or newer:

```bash
cd app
npm ci
npm run build:host
DATA_DIR=./data PORT=8080 npm run start:host
```

## What's different from Cloudflare, honestly

- **Voice messages** (Telegram) use the household AI key when it is OpenAI or Gemini (Claude cannot transcribe audio). Another speech provider can be added as an extension (see [extensions-registry.md](extensions-registry.md)).
- **You run the server**: updates, backups, disk space and uptime are yours. Cloudflare's free tier does that for you.
- The adapters are in `app/host/`: `d1-sqlite.mjs` (database), `file-store.mjs` (files), `node-server.mjs` (web server and timer). The test suites in `tests/e2e` pass against both hosts. To run them against a Docker or Node server, set `BAYIT_TEST_ORIGIN` to its address and `BAYIT_SQLITE` to its database file.
