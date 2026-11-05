---
name: bayit-check
description: Diagnose a Bayit installation (Cloudflare or Docker) and explain each problem with its fix, without exposing secrets. Use when someone says Bayit "doesn't work", "can't sign in", "Telegram stopped", "is it set up correctly?", or before and after an update.
---

# Check a Bayit installation

1. Ask whether the installation runs on **Cloudflare** or **Docker**, and its address. Skip this if `app/wrangler.jsonc` and `.env` make it obvious.
2. Run `node app/scripts/bayit-doctor.mjs --cloudflare --origin <address>`, or `--docker`. The doctor checks the tools, configuration, secrets (by name only), migrations, reachability, sign-in configuration and the running version, and prints a fix for each ✖.
3. Explain each ✖ in plain words, propose its fix, and ask before running anything that changes the installation (secrets, migrations, deploys, restarts).
4. **Problems the doctor can't see.** Check these in the app at **Settings → Accounts & connections**: every card shows a live status.
   - **AI "Needs attention":** the key was revoked or ran out of credit. A parent replaces it on the AI card.
   - **Telegram "Bot ready · link your chat":** each person presses Connect, then Start in Telegram. "Paused" means they blocked the bot.
   - **Telegram reminders not arriving:** the Telegram card shows when the scheduler last ran. On Cloudflare, check `wrangler.cron.jsonc` and that `REMINDER_CRON_SECRET` matches on both the Pages project and the Worker.
   - **RiseUp "Needs attention":** the token was revoked or is missing the תקציב permission. The person creates a new token and pastes it on the RiseUp card.
   - **Google "Access blocked":** the person isn't a test user of the Google sign-in app, or the redirect URI doesn't exactly match `<address>/api/auth/callback/google`.
5. Re-run the doctor after fixes. Report what is now verified and what still depends on the person trying it.

Never print, log or ask the person to paste secret values into chat.
