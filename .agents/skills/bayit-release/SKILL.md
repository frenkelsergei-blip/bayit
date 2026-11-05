---
name: bayit-release
description: For Bayit maintainers - cut a release - version bump, bilingual release notes, tests, build, database migrations, deploy to Cloudflare, live verification, and syncing the public repository. Use when asked to "release", "ship", "deploy a new version" or "publish to GitHub".
---

# Release Bayit

Releasing changes a live installation and publishes code. **Get explicit approval from the person first**, and again before pushing to the public repository if that wasn't part of the request. Several agents may edit the same folder; coordinate before you start.

1. **What's in it.**
   - List the changes since the last release. Read `app/src/app-version.jsx` and ask other active sessions/agents whether their work is finished.
   - Don't ship unfinished work that happens to be in the folder: ask its owner, or leave it out.
2. **Version and notes.**
   - Bump `version` in `app/package.json`, using semver: new features bump the minor version, fixes the patch.
   - Add one entry at the top of `RELEASE_NOTES` in `app/src/app-version.jsx`: short user-facing lines, each in English **and** Hebrew.
3. **Checks.** Run `cd app && npm run test:domain && npm run build:cloud`. For server changes, also run the end-to-end suites in `docs/testing.md` (fake external services, never real keys).
4. **Migrations.**
   - Run `npx wrangler d1 migrations list bayit-home --remote`.
   - Apply pending ones (`… apply bayit-home --remote`) **before** deploying code that needs them.
   - New code must tolerate a missing new table during the switch.
5. **Deploy:** `npm run deploy:cloud`. Add `npm run deploy:reminders` only if `app/cloud/reminder-cron.mjs` changed.
6. **Verify live.**
   - `/version.json` shows the new version and build ID.
   - `node scripts/bayit-doctor.mjs --cloudflare` passes.
   - The site loads on desktop and phone without console errors.
   - On a deploy that touched reminders, the scheduler heartbeat has run since the deploy.
7. **Public repository** (when this installation has one): run `work/export-public.sh`, review the diff, make sure the leak scan passes, commit with the noreply email, push, and confirm CI (tests and the Docker build) is green.
8. **Tell people.** Send the build ID to other active sessions. Give the person a short summary: what shipped, the build ID, and anything not verified.
