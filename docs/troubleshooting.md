# Troubleshooting

**Start with the doctor.** From the repository root:

```bash
node app/scripts/bayit-doctor.mjs --cloudflare --origin https://<project>.pages.dev
node app/scripts/bayit-doctor.mjs --docker --origin http://localhost:8080
```

It checks your tools, configuration, secret names (never their values), migrations, reachability, the sign-in setup and the running version. It prints a fix for each ✖. It needs Node.js 22.13 or newer.

The doctor can't see your outside accounts. For those, open **Settings → Accounts & connections** in the app: every card shows a live status.

An AI agent can do this with you: open the repository in an agent that reads skills and ask "Is my Bayit set up correctly?" (the [bayit-check](../.agents/skills/bayit-check/SKILL.md) skill).

## Signing in

| Symptom | Fix |
| --- | --- |
| `Error 400: redirect_uri_mismatch` | The Google client's redirect URI must be exactly `<your address>/api/auth/callback/google`. See [Google sign-in setup](google-sign-in.md). |
| Google says "Access blocked" | The Google app is in Testing and this account isn't a test user. Add it under **Audience → Test users**. |
| "The installation owner must allow your account…" | Only the owner (`BAYIT_BOOTSTRAP_EMAIL`) and invited people can join. The owner sends an invitation from **Settings → Family → Invite**. |
| "Sign-in is awaiting the owner's setup" | `GOOGLE_CLIENT_ID` or `GOOGLE_CLIENT_SECRET` is missing. Add it, then redeploy (Cloudflare) or restart (Docker). |
| Docker: sign-in fails or loops | `BAYIT_ORIGIN` must be exactly the address people open, including `https://`. Google sign-in needs https; see [Docker → public address](self-hosting-docker.md#sign-in-and-a-public-address). |

## Telegram

| Symptom | Fix |
| --- | --- |
| Card says "Bot ready · link your chat" | Each person presses **Connect**, then **Start** in Telegram. |
| Card says "Paused" | That person blocked the bot. Unblock it in Telegram and press **Start**. |
| Reminders don't arrive | The card shows when the scheduler last ran. On Cloudflare, check that `wrangler.cron.jsonc` has your address and that `REMINDER_CRON_SECRET` is the same on the Pages project and the scheduler Worker ([step 8](self-hosting.md#8-the-scheduler)). Also check quiet hours in **Settings → Notifications**. |
| The bot doesn't understand plain messages | Plain messages and photos need the AI connection. |
| Voice messages don't work | Voice uses Cloudflare Workers AI, so it isn't available with Docker. |

## AI

| Symptom | Fix |
| --- | --- |
| AI card says "Needs attention" | The key was revoked or ran out of credit. A parent pastes a new key on the AI card. |
| A custom provider is refused | Its address must be https and allowed: see `AI_ALLOWED_ORIGINS` and `AI_PRIVATE_ORIGINS` in [security-hardening.md](security-hardening.md). |

## Notifications on a device

| Symptom | Fix |
| --- | --- |
| No option to turn them on (iPhone) | Add Bayit to the Home Screen from Safari first, then open it from there. |
| Turned on, but nothing arrives | Check the browser or system notification permission for Bayit, quiet hours, and that the scheduler is running. |

## Statements and RiseUp

| Symptom | Fix |
| --- | --- |
| "The installation owner must deploy the private PDF reader…" | Cloudflare: run `npm run deploy:cloud` from `app/`; it deploys the reader first. Check that `wrangler.jsonc` points `PDF_READER` at `<project>-pdf`. |
| Totals don't match | Bayit refuses imports whose totals don't reconcile. Only Bank Leumi and Max formats are supported so far. |
| RiseUp card says "Needs attention" | The token was revoked or is missing the תקציב (budget) permission. Create a new token; see [riseup.md](riseup.md). |

## After an update

If the app shows an error about the database or a missing table, apply the new migrations (see [Updating and backups](updating-and-backups.md)). **Settings → About & updates** shows the running version.

## Still stuck?

Open an [issue](https://github.com/frenkelsergei-blip/bayit/issues/new). Include the doctor's output, the version from **Settings → About & updates**, and whether you use Cloudflare or Docker. **Never paste keys, tokens or secrets.** Report security problems privately; see [SECURITY.md](../SECURITY.md).
