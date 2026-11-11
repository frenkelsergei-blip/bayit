---
name: bayit-connect
description: Walk a family through connecting Bayit's outside accounts inside the app (sign-in with a passkey or Google for each person, the AI provider, the Telegram bot and each person's chat, optional RiseUp), step by step, with honest status checks. Use when someone asks how to connect AI, Telegram, RiseUp, or "what do I need to set up after installing".
---

# Connect AI, Telegram and RiseUp

Everything is connected **in the app**, at **Settings → Accounts & connections**. Every card there shows a live status (Connected / Needs attention / Not connected). This skill guides the person; it doesn't change code. Keys and tokens are pasted by the person into the app, never into chat. The server encrypts them and never shows them again.

Go one connection at a time. Ask which ones they want; all except sign-in are optional.

## Signing in (each person): a passkey and/or Google

Each person signs in with their own account. A parent invites others in **Settings → Family → Invite**: one link per person, single use, with an expiry. Children can be managed profiles without an account.
- **Passkey ("מפתח גישה"):** the invited person opens the link (in Safari or Chrome, not inside WhatsApp's or Telegram's built-in browser), writes their name and taps "Create a passkey on this device". Face, fingerprint or screen lock; no password. Tell them never to share it or create it on a shared device.
- **Google:** "Continue with Google" on the same invitation; Google is set up by the installation owner (`bayit-install-*`).
- Anyone can add a passkey later in **Settings → Privacy → Account security**, and confirm "it's you" with a touch before changing connections.
- Lost every passkey: a parent opens **Settings → Family**, "Help them get back in"; the link works after 24 hours and the person is told and can cancel. Children get back in from their own Telegram chat with `/account`.

## AI assistant (one per household, a parent connects it)

Used for Ask AI, Telegram chat, photos and expense tips.

1. The person picks a provider: Claude (Anthropic), OpenAI, Google Gemini, xAI Grok, or any OpenAI-compatible service at an https address.
2. They create an API key on the provider's site. The AI card links to the right page. Mention that the provider bills them for usage; Bayit has daily limits per person.
3. On the AI card, choose the provider and paste the key. Bayit checks it and lists the models; choose one.
4. ✔ when the card says **Connected** with the model name.

## Telegram (bot once per household, then each person links their own chat)

1. In Telegram, open **@BotFather**, send `/newbot`, choose a name and username, and copy the token.
2. A parent pastes the token on the Telegram card. The card shows "Bot connected" with the bot's @name.
3. Each person presses **Connect** next to their name, and then **Start** in the Telegram chat that opens. Parents can link a child's profile.
4. Optional: the morning summary time, photos (needs AI) and voice messages (Cloudflare Workers AI, or the household AI key with OpenAI or Gemini).
5. ✔ when **Send test** reports that Telegram accepted the message *and* the person sees it in their chat.
6. Show them the **/** menu in the chat: /today, /tasks (tap ✓ to complete), /week, /shopping (tap to check off), /lists, /note, /expenses and /mine. They can also just write, e.g. “move the dentist to Thursday at 10” or “mark the laundry done”. Every change waits for **Apply** and can be undone.

## RiseUp (optional, each adult connects their own)

For people who already use RiseUp and want bank and card transactions in Expenses without importing PDFs. Details are in `docs/riseup.md`.

1. In RiseUp, create a token at <https://input.riseup.co.il/developer/tokens>. Tick **תקציב** (budget), plus **יתרות בנק** for balances.
2. On the RiseUp card, paste the token and choose who can see the transactions: **Both parents** or **Only me**. Choose how many months to sync, and whether RiseUp replaces imported statements for those months.
3. ✔ when the card says **Connected** with a last-sync time and a transaction count.

Children never see expenses. Private connections aren't visible to other adults.

## Finish

Summarize which cards are Connected and which the person chose to skip. Tell them **Settings → Accounts & connections** is where to check or change any of them later.
