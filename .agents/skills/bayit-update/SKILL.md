---
name: bayit-update
description: Update a self-hosted Bayit installation (Cloudflare or Docker) to the latest version safely, including database migrations and installed extensions, with a backup first. Use when someone asks to "update / upgrade Bayit", "get the new version", or the app says a newer version exists.
---

# Update Bayit

Nothing live changes until step 7. Until then the person can always go back. Two things are never lost:
- **Saved records**, including records of extensions, live in the database (Cloudflare D1, or the Docker `bayit-data` volume), not in the code. Never run `docker compose down -v`, never delete the volume or the D1 database, and never edit or skip a migration. Migrations only add.
- **Installed extensions** (listed in `shared/extensions/installed.json`) are kept outside the copy in step 3 and put back in step 5. Never stash, reset, discard or copy over `shared/extensions/`, `app/cloud/extensions/`, `app/src/extensions/` or `tests/extension-*` by hand.

## Which way they got Bayit

- **git** (the folder has `.git`): `git pull`, or a merge of `upstream/main` in a fork.
- **a download** (no `.git`): the new version goes into a new folder next to the old one.
- **Docker** builds the image from this folder (`docker compose up -d --build`), so it follows whichever of the two above. There is no ready-made image to pull.

## Steps

1. **See what's new.** git: `git fetch`, then show the new entries in `app/src/app-version.jsx` (`RELEASE_NOTES`) and new files in `app/cloud/migrations/` (`git diff --stat HEAD origin/main -- app/cloud/migrations`). Download: the same files in the new version. Run `node app/scripts/bayit-extension.mjs check` and tell the person which extensions they have. If they edited core code themselves (`git status` shows core files), help them keep it (commit it) before going on.
2. **Back up** (ask first):
   - Cloudflare: `npx wrangler d1 export bayit-home --remote --output=bayit-backup-<date>.sql`, run in `app/`. Keep it outside the repository and never commit it.
   - Docker: use the volume backup command from `docs/self-hosting-docker.md`.
3. **Keep the extensions**, outside the copy:
   ```bash
   node app/scripts/bayit-extension.mjs keep ../bayit-kept-extensions-<date>
   ```
   It copies each extension (its record, its files as they are now, its package in `local-extensions/`), then takes them out of the copy, so the local registry files are exactly as upstream ships them and the update cannot conflict with them. Saved records are not touched. If it says the extensions have problems, stop and fix those first (`bayit-check`).
   - If this copy answers `Usage: …` (older than `keep`), use the new version's tool on this copy. git: `mkdir -p ../bayit-update-tool && for f in bayit-extension.mjs bayit-extension-keep.mjs local-registries.mjs; do git show origin/main:app/scripts/$f > ../bayit-update-tool/$f; done`, then `node ../bayit-update-tool/bayit-extension.mjs keep ../bayit-kept-extensions-<date> --root .` Download: `node <new-folder>/app/scripts/bayit-extension.mjs keep ../bayit-kept-extensions-<date> --root <old-folder>`.
4. **Get the code.**
   - git: `git status` now shows no changes under the extension folders (an untracked `local-extensions/` is fine). Note the current commit (`git rev-parse HEAD`; `keep` also wrote it into `keep.json`). Then `git pull --ff-only` (or merge `upstream/main`).
   - Download: unpack the new version into a new folder. Copy over only the person's own settings: `.env` (Docker), `app/wrangler*.jsonc` with their database id, `app/.dev.vars` (Cloudflare local). Keep the old folder until step 8 is done.
   - Then `cd app && npm install`.
5. **Put the extensions back** in the new version:
   ```bash
   node app/scripts/bayit-extension.mjs restore ../bayit-kept-extensions-<date>
   ```
   Each extension is applied again with its kept files and lines regenerated in the new registry files; its own tests (for a feature module, the conformance suite) run against the new Bayit. One that does not fit is left out completely, the others go back, and the command exits with 1 and prints the reason and three choices. Read them to the person in plain words and wait for their choice:
   1. **Keep the old Bayit for now:** git `git reset --hard <commit from keep.json>`; download: go back to the old folder. Then run `restore` with the same folder there. Everything is as before, and nothing was deployed.
   2. **Update without that extension:** go on. Its saved records stay stored and hidden, and come back when a version that fits is installed.
   3. **Ask its author** for a version that fits (send them the message), and keep the old Bayit meanwhile (choice 1).
   If `restore` says an extension needs `npm install --save-exact …`, ask, run it, and run `restore` again.
6. **Check:** `node app/scripts/bayit-extension.mjs check`, then in `app/`: `npm run test:domain` and `npm run build:cloud`. Stop and report if any fails; the choices in step 5 apply (choice 1 goes back).
7. **Apply** (ask first; this changes the live site):
   - Cloudflare: `npx wrangler d1 migrations apply bayit-home --remote`, then `npm run deploy:cloud`. If `app/cloud/reminder-cron.mjs` changed, also run `npm run deploy:reminders`.
   - Docker: `docker compose up -d --build`. Migrations run automatically on start.
8. **Verify:** run `node app/scripts/bayit-doctor.mjs --cloudflare|--docker`. It must show the new version and the same extensions. Then ask the person to open **Settings → About & updates**, and each extension's screen. Keep the kept-extensions folder (it is small) until they confirm.

If a migration fails, stop. Don't deploy code that expects the new schema; report the error. The backup from step 2 is the way back.
