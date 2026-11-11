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
   - **Passkeys not offered** (no "Sign in with a passkey" button): `BAYIT_ORIGIN` is missing or is not an https name (`http://localhost` works only on that computer; an IP address never works), or `BAYIT_PASSKEYS=off`. Check `<address>/api/config`: `passkeys.address` must be true.
   - **Docker behind a proxy and passkey sign-in says "Too many requests" for everyone:** `BAYIT_TRUSTED_PROXIES` is empty (the doctor warns with ⚠). Set it as in `docs/self-hosting-docker.md` ("Behind a proxy"), usually the Caddy compose network's subnet (e.g. `172.18.0.0/16`), and restart. Only proxies that overwrite or append `X-Forwarded-For` may be listed.
   - **Every passkey stopped working at once:** `BAYIT_ORIGIN` changed (or the custom domain moved). Passkeys belong to the address they were made on; put the old address back, or use the owner's recovery code and have everyone create a new passkey.
   - **"This browser can't use passkeys":** the link opened inside another app (WhatsApp, Telegram). Open it in Safari or Chrome.
   - **"This passkey isn't recognised here":** it belongs to another Bayit address (the address changed) or was removed. A parent uses Settings › Family › "Help them get back in" (works after 24 hours); the only parent uses an operator recovery code (Cloudflare: the person runs `node app/scripts/bayit-setup-code.mjs` in their own terminal and saves it with `wrangler pages secret put BAYIT_RECOVERY_CODE`; Docker: `docker compose exec bayit node recovery-cli.mjs`).
   - **Setup code refused:** it was mistyped (dashes and case don't matter), setup is already finished (the code is dead after the first owner), or 5 tries in 15 minutes / 30 a day were used up; wait, the code itself is still safe. Docker: the code is in `docker compose logs bayit` and `setup-code.txt` in the data volume while setup is open.
   - **Google "Access blocked":** the person isn't a test user of the Google sign-in app, or the redirect URI doesn't exactly match `<address>/api/auth/callback/google`.
5. Re-run the doctor after fixes. Report what is now verified and what still depends on the person trying it.

Never print, log or ask the person to paste secret values into chat.
