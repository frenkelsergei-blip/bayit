---
name: bayit-update
description: Update a self-hosted Bayit installation (Cloudflare or Docker) to the latest version safely, including database migrations, with a backup first. Use when someone asks to "update / upgrade Bayit", "get the new version", or the app says a newer version exists.
---

# Update Bayit

1. **See what's new.** Fetch the latest code without merging it yet (`git fetch`). Show the new entries in `app/src/app-version.jsx` (`RELEASE_NOTES`) and any new files in `app/cloud/migrations/`. Mention local changes (`git status`); if they edited code, help them keep it (commit or stash) before merging.
2. **Back up** (ask first):
   - Cloudflare: `npx wrangler d1 export bayit-home --remote --output=bayit-backup-<date>.sql`, run in `app/`. Keep it outside the repository and never commit it.
   - Docker: use the volume backup command from `docs/self-hosting-docker.md`.
3. **Get the code:** `git pull` (or merge `upstream/main` in a fork). Run `cd app && npm install`.
4. **Check:** run `npm run test:domain` and `npm run build:cloud`. Stop and report if either fails.
5. **Apply** (ask first; this changes the live site):
   - Cloudflare: `npx wrangler d1 migrations apply bayit-home --remote`, then `npm run deploy:cloud`. If `app/cloud/reminder-cron.mjs` changed, also run `npm run deploy:reminders`.
   - Docker: `docker compose up -d --build`. Migrations run automatically on start.
6. **Verify:** run `node app/scripts/bayit-doctor.mjs --cloudflare|--docker`. It must show the new version. Then ask the person to open **Settings → About & updates**.

If a migration fails, stop. Don't deploy code that expects the new schema; report the error. The backup from step 2 is the way back.
