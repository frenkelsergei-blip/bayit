# Connections: AI, Telegram, notifications, Maps and more

After installing, everything is connected **inside the app**, at **Settings → Accounts & connections**. A parent does it once for the household, and each card shows a live status: *Connected*, *Needs attention* or *Not connected*. Everything here is optional; Bayit works without any of it.

Keys and tokens are pasted into the app only. The server checks them, encrypts them with your installation's `APP_ENCRYPTION_KEY` and never shows them again. They're never sent back to the browser.

> An AI agent can walk you through this: open the repository in Claude Code, Codex or another agent that reads skills, and ask "Help me connect Telegram". It uses the [bayit-connect](../.agents/skills/bayit-connect/SKILL.md) skill.

## AI assistant

Used for **Ask AI**, chatting with the Telegram bot, reading photos, and expense tips. One provider and key per household; a parent connects it.

1. Create an API key with one provider:

   | Provider | Where to get a key |
   | --- | --- |
   | Claude (Anthropic) | <https://console.anthropic.com/settings/keys> |
   | OpenAI | <https://platform.openai.com/api-keys> |
   | Google Gemini | <https://aistudio.google.com/apikey> |
   | xAI Grok | <https://console.x.ai/> |
   | Any OpenAI-compatible service | Its own console. Examples: OpenRouter, Groq, Together, or your own Ollama or LM Studio behind https. |

2. **Settings → Accounts & connections → AI assistant:** choose the provider and paste the key. Bayit checks it and lists the models; pick one.
3. It's done when the card says **Connected** with the model name.

The provider bills you for what you use. Bayit has a daily limit per person. The AI sees only what the asking person is allowed to see, and nothing is saved until someone taps **Apply**. A custom provider on an unusual address may need `AI_ALLOWED_ORIGINS`, or `AI_PRIVATE_ORIGINS` for a model server on your own network; see [security-hardening.md](security-hardening.md).

## Telegram bot

Your family's own bot sends reminders with **Done** and **Snooze**, a morning summary and approval requests. It answers the **/** menu and understands plain messages, photos and (on Cloudflare) voice.

**Create the bot (once per household):**
1. In Telegram, open **@BotFather** and send `/newbot`.
2. Choose a display name (for example "Cohen home") and a username ending in `bot` (for example `cohen_home_bot`).
3. BotFather replies with a **token** like `123456789:AA…`. Treat it like a password.
4. In Bayit, a parent opens **Settings → Accounts & connections → Telegram** and pastes the token. The card shows **Bot connected** with the bot's @name. Bayit sets up the bot's webhook itself.

**Link each person's chat:**
1. On the same card, each person presses **Connect** next to their name, then **Start** in the Telegram chat that opens. A parent can link a child's profile.
2. Press **Send test**. It's done when Telegram accepts the message *and* it arrives in the chat.

**What to try in the chat:**
- `/today`, `/tasks` (tap ✓ to complete), `/week`, `/shopping` (tap to check off), `/lists`, `/note`, `/expenses` and `/mine`.
- Or just write, for example "add milk and eggs to the shopping list", "move the dentist to Thursday at 10", or "mark the laundry done". This needs the AI connection. Every change waits for **Apply** and can be undone.

**Good to know:**
- Reminders and the morning summary need the **scheduler** ([Cloudflare step 8](self-hosting.md#8-the-scheduler); with Docker it's built in). The Telegram card shows when the scheduler last ran.
- Photos need the AI connection. **Voice messages** use Cloudflare Workers AI, so they're available on Cloudflare installations only.
- The bot replies in each person's Bayit language.

## Notifications on phones and computers

Each person turns these on for each of their devices: **Settings → Notifications → Notifications on this device**. Bayit generates the push keys itself, so there's nothing to configure.

- **iPhone and iPad:** open Bayit in Safari, choose **Share → Add to Home Screen**, open Bayit from the Home Screen, then turn notifications on. iOS allows web notifications only for Home Screen apps.
- **Android, Mac, Windows and Linux:** turn it on in a supported browser and allow notifications when asked.

Quiet hours, which reminders to receive, and the delivery channels are under **Settings → Notifications**.

## Google Maps (optional)

Adds address search and a small map to events and tasks. Without it, people can still type a place name. It needs a Google Cloud project with billing enabled and **two** restricted keys: a server key for Places API (New) and a browser key for Maps Embed API. A parent enters both in **Settings → Accounts & connections → Google Maps**. The full steps, restrictions and pricing notes are in [locations.md](locations.md).

## Bank and card statements

**Household → Expenses → Import statement:** upload Bank Leumi or Max statement PDFs. No bank passwords are involved. Bayit checks every total against the statement and doesn't keep the PDF itself. The statement reader runs as your installation's private Worker on Cloudflare, or inside the server with Docker. Other banks can be added; see [extending.md](extending.md).

## RiseUp (optional)

For people who already use RiseUp and want their bank and card transactions in Expenses without importing PDFs. Each adult connects their own account and chooses who can see it. See [riseup.md](riseup.md).

## Checking the status later

**Settings → Accounts & connections** is always the place to check, change or disconnect any of these. If something says *Needs attention*, see [Troubleshooting](troubleshooting.md).
