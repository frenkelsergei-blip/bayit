# Channel contract

A **channel** is a way Bayit talks to a family member outside the app: today Telegram, later perhaps WhatsApp. This is Modular Bayit work package 2.3 (`docs/modular-bayit-plan.md`). The contract is only as large as the Telegram behaviour that exists today; it does not add features.

- Core registry: `app/cloud/channels.mjs` (`CHANNELS`, Telegram first).
- Local registry, shipped empty and never edited upstream: `app/cloud/extensions/channels.mjs` → `EXTRA_CHANNELS` (see `docs/extensions-registry.md`).
- Core delivery: `app/cloud/channel-delivery.mjs`. The minute tick: `app/cloud/scheduler.mjs`.
- First channel: `app/cloud/telegram.mjs` (`TELEGRAM_CHANNEL`), with its message layout in `app/cloud/telegram-format.mjs`.
- Conformance: `tests/channel-conformance.mjs`, run by `tests/channels.test.mjs` against Telegram and a test-only sample channel registered through the local file.

## Who does what

| Core (does not change per channel) | Channel |
|---|---|
| Sign-in, the household, the CSRF origin check, rate limits and the audit record for every settings request (`worker.mjs`) | The settings endpoints under its own path: status, connect, link a person's chat, unlink, test |
| What each person may see: `deliveryView(visibleState(state, member), member)`, so private items, other people's items and switched-off features never reach a message | Turning a planned message into its own format (text, buttons) |
| What is due and for whom: reminders, the morning summary, approvals, overdue tasks, "completed by", changes to things assigned to me, finance, insurance, vouchers and Bayit AI alerts, quiet hours, the per-person limit per tick | Receiving its own inbound messages (text, photo, voice, documents, button presses) and verifying them |
| Sending each message at most once (`notification_deliveries`, keyed by channel id), retrying only temporary failures, the scheduler heartbeat and the old-record cleanup | Its own storage: tokens, links, button payloads, snoozes |
| The once-a-minute tick and its secret, the lease that stops two ticks running together | Sending, and saying whether a failure was temporary or the person blocked the channel |

## A channel object

```js
{
 id:'telegram',                          // lowercase; also notification_deliveries.channel
 name:{en:'Telegram',he:'טלגרם'},
 feature:'telegram',                      // a Features-registry id; delivery is skipped for a person who has it off
 apiPath:'/api/telegram/',                // must be '/api/'+id+'/'
 hookPath:'/api/telegram/hook/',          // must be apiPath+'hook/'
 api(request,env,user,home,path,url),     // settings endpoints → Response (called only after core sign-in checks)
 webhook(request,env,hookId),             // inbound → Response (called BEFORE sign-in: verify everything yourself)
 delivery:{                               // scheduled delivery, driven by core
  targets(env),                           // → [{householdId, …}] households with this channel connected (bounded)
  recipients(env,target),                 // → [{memberId, …}] people reachable now (linked, not blocked)
  open(env,target),                       // → connection (e.g. the decrypted token); a throw skips the household
  prepare(env,connection),                // optional, errors ignored (Telegram: re-registers its command menu)
  dueSnoozes(env,target,now),             // optional → [{id, memberId, item}] snoozed reminders now due
  snoozeSent(env,id,now),                 // optional; core calls it before re-checking the snoozed item
  render(message,ctx),                    // → [text, buttons] for one planned message (below); called once, after core claimed it
  send(env,connection,recipient,[text,buttons],lang),  // → {messageId?}; throws {transient} or {blocked}
  correct(env,connection,recipient,burst,ctx),         // optional → number of sent reminders corrected in place
  blocked(env,householdId,memberId),      // mark the person unreachable; core stops sending to them this tick
  cleanup(env,at),                        // → D1 statements for this channel's expired rows; run in core's batch
 }
}
```

An extension channel may have no other fields. `joinRegistry` (`shared/extension-registry.mjs`) checks every entry when the module loads: a new id, the fields above with the right types, `name` in both languages, a known feature, the two paths, and an id that is not one of core's own `/api/` areas (`RESERVED_API`). A bad entry stops the app's start and the tests with a message naming it.

### Planned messages (`render`)

Core decides *what* is sent; `render(message, ctx)` decides how it looks. `message.type` is one of:

| type | fields | Telegram today |
|---|---|---|
| `reminder` | `item` (event, task, routine or home-care occurrence with `record`), `snoozed` | 🔔 card; ✓ Done for today's task; Snooze 10 min when `snoozable` and not already snoozed |
| `change` | `burst` (`shared/change-notices.mjs`) | ✏️/🗑️/👤 card |
| `digest` | – (uses `ctx.visible`) | Morning summary with ✓ buttons for up to 4 open tasks |
| `approval` | `task`, `by` (member) | ⏳ card with Approve |
| `overdue` | `alert` | ⏰ card, ✓ Done for the assignee today |
| `completed` | `task`, `by` (member) | 🎉 card |
| `finance`, `insurance` | `message` `{title, detail, icon?}` | alert card |
| `bayit-ai`, `voucher` | `message` `{title, body, url}` | alert card with an "Open" link to `ctx.origin` |

`ctx` = `{env, connection, recipient, householdId, memberId, role, lang, date, time, origin, visible, members, nameOf}`. `visible` is already the person's delivery view; a channel never reads `home.state` for content.

### Inbound and buttons

`webhook` receives the channel's own updates. It must, before touching any household data:
1. find the connection by an unguessable hook id and verify the provider's signature or secret (Telegram: `X-Telegram-Bot-Api-Secret-Token` compared by hash with `sameDigest`), answering 404/401 otherwise;
2. ignore repeated updates (Telegram: `telegram_updates`);
3. answer only a linked person in a private chat; anyone else gets only linking instructions;
4. read and change data only as that member: `loadHousehold`, `deliveryView(visibleState(…))`, `commitAsMember`/`applyAIPlan`, the Features registry (`stateFeatureContext`), and `runAssistant(…, {channel})` for AI;
5. always acknowledge the provider (so a bad update is not retried forever) and keep errors generic.

Button presses carry only a short random id; the payload stays on the server, belongs to one member and is single-use.

### Linking a person's chat

Linking is the channel's own flow, under the same rules Telegram uses (`child-identity.mjs`): each person links their own chat; a parent may link a child profile that has no account of its own; a one-time, expiring start code; and the first chat identity bound to a child stays bound.

### Status

`GET <apiPath>status` answers every member of the household with at least `{connected, canManage, members:[{id, linked, canLink}]}` and never contains a token, secret or another person's chat name.

## What a channel may never do

- Read or send another household's data. Everything is looked up by the household the verified connection belongs to.
- Show a person anything `deliveryView(visibleState(…))` hides from them, or act as anyone but the linked member.
- Log message content, tokens, chat ids or file contents. Errors are logged as status codes only (Telegram: `console.error('Bayit Telegram update failed:', status, telegramStatus)`).
- Return a token or secret in any response, or store one outside encrypted storage (`encryptKey` with its own associated data).
- Work in group chats (Telegram leaves them, so private items stay private).
- Write `notification_deliveries`, the scheduler heartbeat or another channel's tables; send scheduled messages outside core's delivery loop.
- Contact any address except its provider's, through `externalFetch` (`outbound.mjs`), so the Docker host's outbound policy applies.
- Replace or reorder a core channel: extra channels come after them and need new ids.

## Not part of the seam yet (honest limits)

- **Commands and button actions** (`/today`, `/tasks`, `/shopping`, Apply/Undo, insurance and statement imports, photo and voice) are still written inside `telegram.mjs`, because their text is Telegram HTML. Moving them to core needs a channel-neutral message model, which would be a new format with one user; it is left for the second channel (4.3) to shape.
- **Recent sign-in for channel settings.** `worker.mjs` asks for a recent Google sign-in by path (`/api/(ai|telegram|…)/(link|links|…)`). An extension channel's link endpoints are not on that list, and the security audit log names only known services (others are recorded as `session.*`). Adding channels there is a security change and needs its own review.
- **Member removal and key rotation** name Telegram's tables directly (`family-management.mjs`, `credential-rotation.mjs`). An extension channel must clean up its own rows and should keep its secret in a store that rotation already covers, until core gets a hook for this.
- **Delivery choices** (`financeDeliveryMessages`, `bayitAIDeliveryMessages`, voucher messages) are asked with `channel:'telegram'` semantics; core passes the channel id, and a person's preferences only know Telegram and Push today.
