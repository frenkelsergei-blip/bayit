# Updating and backups

Bayit shows the running version in **Settings → About & updates**, and tells you when a newer version is deployed. What changed is in [CHANGELOG.md](../CHANGELOG.md).

> An AI agent can do this with you: ask "Update my Bayit" in an agent that reads skills (the [bayit-update](../.agents/skills/bayit-update/SKILL.md) skill). It backs up first and asks before changing anything live.

## Before every update: back up

**Cloudflare** (from `app/`):

```bash
npx wrangler d1 export bayit-home --remote --output=bayit-backup-$(date +%F).sql
```

Keep the file outside the repository and never commit it. D1 also keeps point-in-time history (Time Travel: 7 days on the free plan, 30 days on paid plans), which you can restore with `npx wrangler d1 time-travel restore`. Neither covers the files in R2 (documents and photos). To keep those too, copy the bucket with a tool such as `rclone`.

**Docker:** back up the whole data volume. It holds the database, the files and, if you didn't set them in `.env`, the generated secrets.

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

The volume is named `<folder>_bayit-data`; `docker volume ls` shows it.

**Always keep `APP_ENCRYPTION_KEY` with your backups**, in a password manager. Without it, the stored AI keys, bot tokens and other connection credentials can't be decrypted. [security-hardening.md](security-hardening.md) covers encrypted offline backups, restores and key rotation. Test a restore at least once.

## Update

**Cloudflare** (from the repository root, then `app/`):

```bash
git pull
cd app && npm install
npm run test:domain && npm run build:cloud          # stop here if either fails
npx wrangler d1 migrations apply bayit-home --remote # applies only the new migrations
npm run deploy:cloud
npm run deploy:reminders                             # only if app/cloud/reminder-cron.mjs changed
```

If you changed the project or database names with `bayit-configure.mjs`, commit those files once (`git commit -am "My Cloudflare names"`) before your first `git pull`; otherwise git refuses to pull when an update touches them. If git reports a conflict in a `wrangler*.jsonc` file, keep your names and IDs.

**Docker:**

```bash
git pull
docker compose up -d --build
```

Migrations run automatically on start, in order and only once each.

## Check

```bash
node app/scripts/bayit-doctor.mjs --cloudflare --origin https://<project>.pages.dev   # or --docker
```

It must show the new version. If a migration fails, don't deploy the new code; your backup is the way back.

## Getting updates when you have your own changes

If you forked Bayit and changed it, add this repository as `upstream` and merge its releases:

```bash
git remote add upstream https://github.com/frenkelsergei-blip/bayit.git
git fetch upstream
git merge upstream/main
```
