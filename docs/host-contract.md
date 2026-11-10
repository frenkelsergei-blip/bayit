# Bayit host contract

Bayit has one server, `app/cloud/worker.mjs`. A **host** is whatever runs it and hands it the outside world. Two hosts exist today:

| Host | Entry point | Where it lives |
| --- | --- | --- |
| Cloudflare | Pages Functions (`dist/pages/_worker.js`, built by `app/cloud/prepare-pages.mjs`), or a Worker with static assets (`app/wrangler.worker.jsonc`) | `app/wrangler*.jsonc`, `app/cloud/prepare-pages.mjs`, `app/cloud/reminder-cron.mjs`, `app/cloud/pdf-worker.mjs`, `app/cloud/pdf-binding.mjs` |
| Node / Docker | `app/host/node-server.mjs`, bundled to `dist/host/server.mjs` by `app/host/build-host.mjs` | `app/host/`, `compose.yaml` |

This document lists everything the server expects from a host. It was written by reading the code on 2026-11-10 (work package 2.6 of `docs/modular-bayit-plan.md`). Each item says whether it is required, what the server does when it is missing, which file it comes from, and which test checks it. `tests/host-conformance.mjs` is the conformance suite. `tests/host.test.mjs` runs it against the Node host, and the database and file-store parts against Cloudflare's local D1 and R2 (Miniflare).

The contract also has to hold for the planned single Cloudflare Worker (`docs/audits/2026-11-10-one-click-cloudflare-feasibility.md`). Where that plan changes how a duty is met, the item says so. The duty itself does not change.

## 1. The calling convention

**Required.** The host calls `worker.fetch(request, env)` (`app/cloud/worker.mjs:118`) for every HTTP request and awaits a standard `Response`.

- `request` is a WHATWG `Request`. **`request.url` must carry the installation's public origin**, for example `https://home.example/api/session`, never an internal address. The server builds absolute links and checks from it: the `Origin` check for every write (`worker.mjs:77`), invitation links (`worker.mjs:90`), `publicOrigin` in `/api/config` (`worker.mjs:69`), the Telegram webhook address (`telegram.mjs:158`, `:179`), reminder links (`telegram.mjs:480`), and Auth.js callback URLs, because Auth.js runs with `trustHost: true` (`auth.mjs:25`). The Node host rewrites every request onto `BAYIT_ORIGIN` and sets `Host` to match (`node-server.mjs:54-61`).
- The host **must not trust forwarded headers**. Node drops `x-forwarded-*`, `forwarded`, `cf-connecting-ip`, `x-real-ip` (`node-server.mjs:58`) and refuses any `Host` it does not recognise with 421 (`node-server.mjs:55-56`). `BAYIT_INTERNAL_HOSTS` adds trusted internal host names for a proxy. Cloudflare handles this itself.
- Request bodies are passed as a stream (`duplex: 'half'`). The server enforces its own size limits: 700 KB for state changes (`worker.mjs:107`), 10 MB for attachments (`files.mjs:6`), 5 MB for statements (`pdf-limits.mjs:1`). So the host must accept bodies of at least 10 MB and must not buffer them unbounded. Node allows a 60-second request (`node-server.mjs:74`).
- `Set-Cookie` headers must reach the client as separate headers (`node-server.mjs:64`). Auth.js sets several cookies on one response.
- `ctx` is not used. `worker.fetch` takes `(request, env)` only. Node passes a `ctx` with `waitUntil` (`node-server.mjs:40`) for future use. The single Worker would add `scheduled(controller, env, ctx)` next to `fetch` (section 5).
- `HEAD` requests must be answered without a body.

Runtime globals the server uses (any current Workers runtime or Node 22+ has them): `fetch`, `Request`, `Response`, `Headers`, `URL`, Web Streams with `getReader()`, `crypto.subtle` (SHA-256, HMAC, AES-GCM, ECDSA and ECDH P-256, used by `util.mjs`, `registration.mjs:6` and `push.mjs:20-49`), `crypto.randomUUID`, `crypto.getRandomValues`, `atob`/`btoa`, `TextEncoder`/`TextDecoder`, `AbortSignal.timeout`, and `Intl` with full time-zone data (the home time zone `Asia/Jerusalem`, `shared/home-config.mjs:3`, used by `util.mjs:14-15`). The server code imports no `node:*` modules.

Test: `the running host serves the app, its API and security headers, and refuses unknown hosts` (Node). Body size limits and multi-cookie responses have no host-level test.

## 2. Database: `env.DB`

**Required.** A Cloudflare D1-compatible database with SQLite semantics. Without it nothing works: `/api/health` reports `storage: false` and 503 (`worker.mjs:67`), and `securitySchemaReady` refuses every API call (`schema-ready.mjs:3`, `worker.mjs:70`).

Methods actually used, by the server and by `@auth/d1-adapter` (which uses only `prepare`, `bind`, `first`, `run`):

| Call | Must return | Used for |
| --- | --- | --- |
| `DB.prepare(sql)` | a statement; preparing the same SQL again is allowed | everywhere (about 370 call sites) |
| `stmt.bind(...values)` | a **new** statement; the original can be bound again | everywhere |
| `stmt.first()` | the first row as a plain object, or `null` | lookups, upserts with `RETURNING` (`leases.mjs:2`, `security.mjs:8`) |
| `stmt.first(column)` | that column of the first row, or `null` when there is no row | `message-plan.mjs:69`, `voucher-delivery.mjs:8` |
| `stmt.all()` | `{success: true, results: [rows], meta}` | lists |
| `stmt.run()` | `{success: true, results: [], meta: {changes, …}}`; with `RETURNING`, `results` holds the returned rows | writes; **`meta.changes` decides outcomes** (household quota `worker.mjs:88`, invitation join `:91`, optimistic state commit `:107`, file reservations `files.mjs:42`, `:49`, credential rotation `credential-rotation.mjs:17`, Telegram claims `telegram.mjs:203`, `:424`) |
| `DB.batch([stmts])` | an array with one result per statement, same shapes as `run`/`all` | **must be one transaction**: all succeed or none do. Used for household creation, joining, file quota bookkeeping, session revocation, maintenance, credential rotation |

Not used by the server: `exec`, `raw`, `dump`, `meta.last_row_id`, `meta.duration`. `exec` is used only by the Node migrator and tests.

Values: the server binds strings, numbers, booleans (stored as 1/0) and `null`. **Real D1 refuses `undefined`.** The Node adapter turns it into `NULL` (`d1-sqlite.mjs:7`), so server code must never rely on that.

SQL dialect: SQLite, including JSON1 (`json_each`, `json_extract`, `json_type`; for example `worker.mjs:107`, `files.mjs:14`, `credential-rotation.mjs:14`), `sqlite_master` for table checks (`schema-ready.mjs:3`, `credential-rotation.mjs:8`, `kids-parent.mjs:9`, `vouchers.mjs:8`, `payment-sources.mjs:12`, `home-suggestions.mjs:49`), `rowid` (`credential-rotation.mjs:11`), `INSERT OR IGNORE`, `ON CONFLICT … DO UPDATE … WHERE`, and `RETURNING` (SQLite 3.35 or later). Foreign keys are on in Node (`d1-sqlite.mjs:29`) and always on in D1.

Concurrency: requests and the scheduler run concurrently. Correctness relies on single-statement atomicity, `batch` atomicity and conditional updates, not on locks held across requests. Leases are rows in `security_leases` (`leases.mjs`). Node uses WAL with a 5-second busy timeout (`d1-sqlite.mjs:29`).

Tests: `database: prepare, bind, first, all and run return D1 result shapes`, `database: upserts with RETURNING …`, `database: batch() is one transaction …`, `database: the SQLite dialect the server relies on …` (Node and Miniflare D1). `Node D1 adapter binds undefined as NULL; real D1 refuses it …` records the difference.

## 3. Migrations

**Required, a host duty.** The host applies `app/cloud/migrations/*.sql` in file-name order, once each, and records each name in `d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at …)`. The table name and shape are Wrangler's. The server reads that table: it is ready only when the security tables exist **and** `0009_security.sql` is recorded (`schema-ready.mjs:3`). Each migration must apply atomically with its record.

- Cloudflare: `wrangler d1 migrations apply` (`app/wrangler.jsonc` `migrations_dir`). The single-Worker plan moves this into the Worker as one `batch()` per migration, since D1 has no `BEGIN`/`COMMIT` (feasibility audit §3).
- Node: `migrate()` at every start (`d1-sqlite.mjs:42-53`, `node-server.mjs:33`), each file plus its record inside `BEGIN … COMMIT`.

When missing: `/api/health` returns 503 with `code: 'SCHEMA_UPDATE_REQUIRED'`, `/api/config` reports `updateRequired`, and every other API call is refused without changing anything (`worker.mjs:67-70`).

Tests: `migrations run in order, once each, and are recorded in d1_migrations`, `an unmigrated database refuses changes; a migrated one is ready and runs a full scheduler tick` (Node). Cloudflare's migrator is Wrangler and is not run by the suite.

## 4. File store: `env.FILES`

**Optional.** An R2-compatible object store for private attachments.

Used: `put(key, Uint8Array, {httpMetadata: {contentType}})` (`files.mjs:44`), `get(key)` returning `null` or an object with `body` (a stream), `size` and `httpMetadata.contentType` (`files.mjs:25-26`), and `delete(key)` with a single key (`files.mjs:16`, `:50`, `:55`). `head` is part of both implementations but is not called by the server today. Keys look like `<household>/<file id>/<reservation>` (`files.mjs:37`).

- The store must be **private**: nothing in it may be reachable except through `/api/files/…`, which checks membership, ownership and document visibility (`files.mjs:19-26`).
- Overwriting a key replaces content and type. Deleting a missing key is not an error.
- A host that maps keys to file paths must refuse keys that escape its folder (`file-store.mjs:8`). R2 keys are opaque, so R2 has no such check.
- Quota is enforced in the database (`file_quotas`), not by the store.

When missing: `/api/files/*` answers 503 "File storage is not configured" (`files.mjs:20`), `/api/config` reports `storage.files: false` (`worker.mjs:69`), and the scheduler skips file maintenance (`files.mjs:54`).

Tests: `file store keeps content, type and size; get/head of a missing key is null; delete removes it` (Node and Miniflare R2), including the path-escape refusal for Node.

## 5. Scheduler

**Required for reminders, digests, push, the hourly RiseUp sync, calendar sync, home suggestions, Bayit AI and all clean-up.** Once a minute, the host sends:

```
POST <public origin>/api/internal/reminders
Authorization: Bearer <REMINDER_CRON_SECRET>
```

through `worker.fetch` (`worker.mjs:72`, `telegram.mjs:476-489`). The bearer is compared by digest. A missing or wrong secret gets 401. A tick holds the `reminder-tick` lease, so overlapping ticks are skipped safely, and it stops its own work after 45 seconds. Each tick runs `maintenance()` (`security.mjs:19-30`): expired sessions, invitations, previews, audit rows, rate-limit rows, stale push subscriptions and file tombstones. The request URL's origin becomes the origin of links in reminders (`telegram.mjs:480`), so it must be the public origin. Node uses `BAYIT_ORIGIN`, or loopback when there is none.

- Cloudflare: a separate cron Worker (`app/cloud/reminder-cron.mjs`, `app/wrangler.cron.jsonc`, `* * * * *`) that needs `BAYIT_ORIGIN` and the same `REMINDER_CRON_SECRET`. The single-Worker plan replaces it with a `scheduled` handler in the same Worker. That handler would still pass through the same tick (secret check included) or call `runReminderTick` directly.
- Node: `setInterval` every 60 seconds, plus a first tick 5 seconds after start (`node-server.mjs:78-79`).

When missing: nothing scheduled happens and nothing is cleaned up. The app keeps working for interactive use. No error is shown.

Tests: `an unmigrated database refuses changes; a migrated one is ready and runs a full scheduler tick` (wrong secret refused, full tick on an empty installation, the lease is released). **Not tested:** that a host's timer actually fires every minute.

## 6. Statement and document PDF reader

**Optional, but when provided it must be isolated.** PDF.js (through `unpdf`) parses untrusted bank statements. A small PDF can need a lot of CPU and memory, so parsing must not share a heap or thread with household data, secrets or the request loop (SEC-20 in `docs/audits/2026-11-06-information-security-audit.md`; `docs/security-hardening.md`). The server asks for rows through `pdfRows(bytes, env)` (`statement-pdf.mjs:13`), used by statement import (`finance.mjs:35`), message plans (`message-plan.mjs:54`) and document analysis (`document-analysis.mjs:19`). Two ways to provide it:

1. **A platform reader.** The host calls `installPlatformPDFReader(bytes => rows)` once at start (`statement-pdf.mjs:11`). Node does this with a `worker_threads` worker that has a 128 MB heap, a 15-second hard timeout and at most two at once (`pdf-isolate.mjs`, `node-server.mjs:39`). The host must call `checkPDFBudget(env)` first (daily limit `PDF_DAILY_LIMIT`, `pdf-budget.mjs:4`), as Node does.
2. **A service binding `env.PDF_READER`** with `fetch(Request)` answering `POST https://pdf.internal/parse` (a PDF body, at most 5 MB) with `{rows}` or `{error}` (`pdf-binding.mjs`). On Cloudflare this is `bayit-pdf-reader` (`app/cloud/pdf-worker.mjs`, `app/wrangler.pdf.jsonc`): no database, bucket, AI, secrets or public route. The feasibility audit keeps it separate in the single-Worker plan.

Rows are `{page, y, items: [{x, y, s}], text}`, top to bottom, items right to left. Inputs over 5 MB get 413, a non-PDF gets 415, and parse limits get 413 or 422 (`statement-pdf.mjs:15-29`). The server also limits concurrent PDF work with leases (`withPDFSlot`, `pdf-budget.mjs:5`).

When missing: PDF import answers 503 with `code: 'PDF_READER_SETUP_REQUIRED'` and saves nothing (`pdf-binding.mjs:7`). Everything else works.

Tests: `the PDF reader returns positioned text rows and refuses non-PDF and oversized input` (Node), `Node statement reader admits two PDFs at a time …`, and the existing hard-timeout test (`tests/security-recovery.test.mjs`, SEC-20). **Not tested by the suite:** isolation itself, which the suite cannot observe generically. Each host must argue it in its own tests or documentation. The Cloudflare reader Worker is not run by the suite.

## 7. Speech (voice messages)

**Optional.** The provider contract is documented at the top of `app/cloud/speech.mjs` (work package 2.2). Two core providers:
- `cloudflare` runs Whisper (`@cf/openai/whisper-large-v3-turbo`) on `env.AI.run(model, input)`. It is available only where the host provides `env.AI`.
- `household-ai` (`app/cloud/speech-household-ai.mjs`) transcribes through the household's own AI key (OpenAI `/audio/transcriptions`, Gemini Interactions, or a custom OpenAI-compatible service that lists a transcription model). It needs only `env.DB`, `APP_ENCRYPTION_KEY` and outbound fetch, so it works on every host, including Docker. It is unavailable with a reason when the household's AI is Claude, Grok or not connected.

Extensions add providers in `app/cloud/extensions/speech.mjs`; every provider passes `tests/speech-providers.test.mjs`.

When `env.AI` is missing: the Cloudflare option is listed as unavailable with its reason, and `/api/voice` reports `available: false` unless the household chose another provider. Node provides no `env.AI`.

Tests: none in the host suite (speech has its own tests, `tests/speech-providers.test.mjs`).

## 8. Outbound requests

**Required: a policy, and the host decides how it is enforced.** Provider calls go through `externalFetch(env, url, options)` (`outbound.mjs:37-43`). It uses `env.OUTBOUND_FETCH` when the host supplies one, and the global `fetch` otherwise. It always sets `redirect: 'manual'` and refuses any 3xx, so credentials never follow a redirect. Address policy is installation configuration, never request input: custom AI providers must be on the built-in list, `AI_ALLOWED_ORIGINS` or `AI_PRIVATE_ORIGINS` (`outbound.mjs:16-23`), and push endpoints must be known push services or `PUSH_ALLOWED_ORIGINS` (`outbound.mjs:24-29`). Response bodies are read with size caps (`boundedBytes`, `boundedJSON`).

What the host must add:

- **On a platform that cannot reach private networks** (Cloudflare Workers), nothing more. `env.OUTBOUND_FETCH` is absent and the global `fetch` is used.
- **On a machine that can reach a home or cloud network** (Node, any VM or container), the host **must** supply `env.OUTBOUND_FETCH`. It must allow only `https:` (plain `http:` only for the loopback test origins), refuse credentials in the URL, resolve DNS once, refuse private or reserved addresses (`isPrivateAddress`, `outbound.mjs:6-11`) unless the origin is in `AI_PRIVATE_ORIGINS`, connect to exactly the checked address (no second lookup), refuse redirects, and time out (Node: 20 seconds). See `app/host/outbound-fetch.mjs`. A host that forgets it silently falls back to an unpinned global `fetch`.

Calls that bypass `externalFetch` today, so a host's `OUTBOUND_FETCH` does not cover them: Google Places (`maps.mjs:12`), RiseUp (`riseup.mjs:20`), the Cloudflare speech provider's test origin (`speech.mjs`, loopback only; the `household-ai` speech provider uses `externalFetch`) and Auth.js's Google sign-in (inside `@auth/core`). All use fixed provider addresses, so the risk is low, but they are listed in section 13.

Tests: `outbound fetch refuses plain http, credentials in the address and private or reserved addresses`, `outbound fetch returns provider responses and never follows redirects` (Node), `Node outbound fetch connects to the exact address it checked, and only operator-listed private origins pass`. Also `tests/security-remediation.test.mjs` (SEC-01) and `tests/outbound-workers.test.mjs` (the Workers runtime refuses redirects through `externalFetch`).

## 9. Secrets and key generation

| Name | Required | Shape | Used by | When missing |
| --- | --- | --- | --- | --- |
| `AUTH_SECRET` | yes | at least 32 characters | Auth.js session signing (`auth.mjs:25`), invitation permits (`registration.mjs:6`), child links (`kids-parent.mjs:16-19`) | sign-in is off: `authReady` is false (`auth.mjs:24`) and every signed-in API answers 503 (`worker.mjs:76`) |
| `APP_ENCRYPTION_KEY` | yes | 32 bytes, base64 | AES-GCM encryption of stored provider credentials (AI keys, bot tokens, map keys, RiseUp tokens, push keys, vouchers, calendar tokens) with per-record additional data (`util.mjs:20-21`, `credential-keys.mjs`) | AI status reports `available: false` (`worker.mjs:44`) and saving any credential answers 503 (`util.mjs:20`) |
| `REMINDER_CRON_SECRET` | yes | at least 24 characters | the scheduler bearer (`telegram.mjs:478`), operator credential rotation (`worker.mjs:73`, which refuses a secret under 24 characters) | every tick is refused, so nothing scheduled runs |
| `APP_ENCRYPTION_KEY_ID`, `APP_ENCRYPTION_KEYS_JSON` | optional | key ID; JSON ring of older keys | key rotation (`credential-keys.mjs`, `credential-rotation.mjs`) | the ID defaults to `main` |

Host duties:

- **Generate once, never regenerate.** A new installation needs fresh random values. An existing installation must never get new ones silently, because that orphans every stored credential. Node generates them on first start into `secrets.json` (mode 0600) beside the database, accepts each value or a `<NAME>_FILE` path instead, and refuses to start when a database exists but its key file is missing, damaged or incomplete (`installation-secrets.mjs`). Cloudflare today: the operator sets them with `wrangler secret put` and the cron Worker needs the same `REMINDER_CRON_SECRET`. The single-Worker plan generates absent ones at build time and aborts, never regenerates, if listing fails (feasibility audit §4).
- Keep them out of logs, out of the static files and out of the repository.

Tests: `installation secrets have the required lengths, persist across restarts and encrypt credentials` (Node). Refusal to regenerate and `_FILE` inputs: `tests/security-recovery.test.mjs` (SEC-19).

## 10. Configuration values

Plain values the host passes into `env`. Node passes exactly the list in `node-server.mjs:34`, and test-only values through `node-server.mjs:37`.

| Name | Required | Effect | When missing |
| --- | --- | --- | --- |
| `BAYIT_ORIGIN` | yes, for any public installation | the public origin; Node refuses to bind beyond loopback without it, or with a non-HTTPS value (`node-server.mjs:25-28`); push VAPID subject (`push.mjs:128`); Telegram `/account` links outside a request (`telegram.mjs:229`) | loopback only; push falls back to a `mailto:` subject |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | for sign-in | Google sign-in (`auth.mjs:24-25`) | sign-in and every signed-in API answer 503 "awaiting the owner's setup" (`worker.mjs:75-76`); `/api/health` and `/api/config` still work |
| `BAYIT_BOOTSTRAP_EMAIL`, `BAYIT_ALLOWED_EMAILS`, `BAYIT_REGISTRATION_MODE`, `BAYIT_MAX_HOUSEHOLDS` | optional | who may sign in and create households (`registration.mjs`) | a private installation: existing members, the allowlist and invitations only; one household (`registration.mjs:17-23`) |
| `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET` | optional | Google Calendar connection (`google-calendar.mjs:13`, `:30`, `:95`) | the calendar connection is unavailable |
| `AI_ALLOWED_ORIGINS`, `AI_PRIVATE_ORIGINS`, `PUSH_ALLOWED_ORIGINS` | optional | outbound policy (section 8) | built-in lists only |
| `PDF_DAILY_LIMIT` | optional | statement reads per day, 1 to 200 (`pdf-budget.mjs:4`) | 20 |
| `HOME_TIMEZONE` | no effect | Node passes it, but the server uses the constant in `shared/home-config.mjs:3` | — |
| `TELEGRAM_API_ORIGIN`, `AI_TEST_ORIGIN`, `ANTHROPIC_TEST_ORIGIN`, `SPEECH_TEST_ORIGIN`, `RISEUP_TEST_ORIGIN`, `PUSH_TEST_ORIGIN`, `MAPS_TEST_ORIGIN` | tests only | honoured only for `http://127.0.0.1:<port>` (`util.mjs:10`, `outbound-fetch.mjs:9`) | real provider addresses |

Node-only process settings, not passed to the server: `HOST`, `PORT`, `DATA_DIR`, `STATIC_DIR`, `MIGRATIONS_DIR`, `BAYIT_INTERNAL_HOSTS`.

Bindings, besides the values above: `DB` (section 2), `FILES` (section 4), `ASSETS` (section 11), `PDF_READER` (section 6), `AI` (section 7), `OUTBOUND_FETCH` (section 8).

Tests: `Node host refuses a public bind without BAYIT_ORIGIN and a non-HTTPS public origin`. The other values are covered by feature tests, not by the host suite.

## 11. Static files and security headers

**Required.** Every path outside `/api/` goes to `env.ASSETS.fetch(request)` (`worker.mjs:68`), which serves the built client (`app/dist/client`) with a single-page-app fallback: an unknown path without a file extension (or ending in `.html`) gets `index.html`; a missing file with an extension gets 404 (`node-server.mjs:45-52`; Cloudflare `not_found_handling: single-page-application`). It must never serve anything outside the client folder. Hashed files under `/assets/` may be cached as immutable, and HTML and `/version.json` must be `no-cache` (`node-server.mjs:50`), so updates reach families.

Security headers: every response that passes through `worker.fetch` gets `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY` (`SAMEORIGIN` only for `/api/maps/embed`), `Permissions-Policy: camera=(), microphone=(self), geolocation=()`, the Content-Security-Policy, and `Strict-Transport-Security` on HTTPS (`security-headers.mjs:4`, `worker.mjs:118`). The CSP authorises the client's inline boot scripts by hash. The host build must therefore define `__BAYIT_CSP__` from `buildPolicy()` in `app/scripts/security-policy.mjs` (`build-host.mjs:6-8`, `prepare-pages.mjs:3-5`). Without it, the fallback CSP has no hashes and the boot scripts are blocked. A platform that serves static files without running the worker (Cloudflare Pages; the Worker with `run_worker_first: ["/api/*"]`) must apply the same headers itself: `dist/pages/_headers` (`prepare-pages.mjs:7`).

Tests: the `running host …` check covers the SPA fallback, 404 for missing assets, immutable caching, `HEAD`, traversal attempts, headers and the 421 refusal (Node). The CSP and HSTS on HTTPS: `tests/security-remediation.test.mjs` (SEC-03/17/22). **Not tested:** Cloudflare's `_headers` output.

## 12. HTTPS, origin, and backup and restore

**HTTPS: required for any installation reachable by other devices.** Google sign-in, secure cookies (`__Secure-authjs.session-token`, `security.mjs:3`), push, the microphone, passkeys and the Telegram webhook (Telegram calls `https://<origin>/api/telegram/hook/<secret>`) all need it. Cloudflare provides HTTPS. Node expects a TLS reverse proxy in front (the `caddy` profile in `compose.yaml`) and an exact HTTPS `BAYIT_ORIGIN`. Plain HTTP is accepted only on loopback (`node-server.mjs:26-28`). The address is part of identity: passkeys and Google redirect URIs are bound to the hostname, so moving to another origin means re-registering them.

**Backup and restore: required duty, host-specific means.** The database, the file store and the installation keys are one recovery unit. Credentials in the database cannot be decrypted without the original `APP_ENCRYPTION_KEY` (`docs/security-hardening.md`). Node: `backup-cli.mjs backup|restore --stopped` writes one encrypted archive (scrypt plus AES-256-GCM) of `bayit.sqlite` (an online SQLite backup), `files/` and `secrets.json`, restores only into an empty folder and checks database integrity (`backup.mjs`). Cloudflare: D1 Time Travel or an export for the database, R2 separately, and the secrets kept by the operator (`docs/self-hosting.md:13`). Offline credential rotation must run against the stopped installation (`rotate-credentials.mjs`).

Tests: backup and restore are tested in `tests/security-recovery.test.mjs` (SEC-19) for Node only. **Not tested:** HTTPS termination itself, and any Cloudflare backup procedure.

## 13. Where Cloudflare leaks outside the host layer

Recorded, not changed (work package 2.6 is behaviour-preserving). Each is a candidate for a later seam.

| Where | What |
| --- | --- |
| `app/cloud/worker.mjs:69` | `/api/config` always reports `storage.provider: 'cloudflare-d1'`, also on Node. |
| `app/cloud/worker.mjs:72`, `app/cloud/telegram.mjs:476-480` | The scheduler is an authenticated HTTP endpoint because Pages cannot run on a schedule. A host must call itself over `worker.fetch` with a bearer secret instead of calling a tick function. |
| `app/cloud/worker.mjs:118` | The server exports only `fetch`. No `scheduled` handler yet (single-Worker plan). |
| `app/cloud/speech.mjs` (`CLOUDFLARE`) | The built-in `cloudflare` speech provider reads `env.AI` directly. This is the only use of Workers AI; other hosts use the `household-ai` provider instead. |
| `app/cloud/statement-pdf.mjs:11-13`, `app/cloud/pdf-binding.mjs:7-9` | The server falls back to the Cloudflare service binding `env.PDF_READER` (and the fixed address `https://pdf.internal/parse`) when no platform reader is installed. The setup error names "deploy the private PDF reader". |
| `app/cloud/outbound.mjs:38` | When a host supplies no `OUTBOUND_FETCH`, outbound calls use the global `fetch`. That is safe on Workers only. |
| `app/cloud/outbound.mjs:39-40` | `redirect: 'manual'` exists because Workers rejects `redirect: 'error'` (correct on every host; Workers-motivated). |
| `app/cloud/maps.mjs:12`, `app/cloud/riseup.mjs:20`, `app/cloud/speech.mjs` (`CLOUDFLARE`, test origin only) | Direct global `fetch`, bypassing `env.OUTBOUND_FETCH`. |
| `app/cloud/schema-ready.mjs:3` | Readiness depends on Wrangler's `d1_migrations` table name. Every host's migrator must use it. |
| `app/cloud/reminder-cron.mjs`, `app/cloud/pdf-worker.mjs`, `app/cloud/pdf-binding.mjs`, `app/cloud/prepare-pages.mjs`, `app/wrangler*.jsonc` | Cloudflare host files live in the core folders (`app/cloud/`, `app/`) rather than in a host folder next to `app/host/`. |
| `app/cloud/finance.mjs:81`, `app/cloud/push.mjs:2` | Comments that cite Cloudflare (harmless). |
| `app/src/general-settings.jsx:23` | The client says "Cloudflare · connected" for every server installation. |
| `app/src/App.jsx:325` (`CloudSetup`), `app/src/App.jsx:362` | The client describes storage as "Cloudflare D1" and "Cloudflare R2" and the installation as a Cloudflare installation. |
| `app/src/telegram-settings.jsx` (`voiceRow`) | The voice menu lists every speech provider from the server registry, including "Cloudflare Workers AI · this installation" on every host; where `env.AI` is absent it is disabled with the reason underneath. |
| `shared/connections.mjs:47` | The "About this installation" copy lists Cloudflare and Docker as the supported places. That copy is accurate today, but a third host would need its own line. |

## 14. Adding a host

A new host is an extension (`AGENTS.md`, modular entry; `docs/modular-bayit-plan.md`). Proposed layout. Nothing below exists yet, and no skill has been created.

```
.claude/skills/bayit-add-host-<name>/
  SKILL.md            when to use it, what the person needs (account, CLI), the steps, how to verify
  REMOVE.md           how to remove every file it added
  extension.json      {id: "host-<name>", seam: "host", files: [...], outbound: [...], minimumBayit: "..."}
  payload/
    app/hosts/<name>/
      server.mjs      entry point: builds env (section 10), calls worker.fetch (section 1), runs the scheduler (5)
      database.mjs    env.DB, if the platform has no D1-compatible database (2), plus its migrator (3)
      files.mjs       env.FILES, if attachments are supported (4)
      outbound.mjs    env.OUTBOUND_FETCH, if the platform can reach private networks (8)
      pdf.mjs         the isolated reader, if statement import is supported (6)
      secrets.mjs     first-start key generation that never regenerates (9)
      build.mjs       bundles server.mjs with __BAYIT_CSP__ and copies dist/client and the migrations (11)
      README.md       HTTPS, backup and restore, update steps for this platform (12)
    tests/host-<name>.test.mjs   calls runHostConformance({...}) from tests/host-conformance.mjs
    docs/self-hosting-<name>.md
```

Reuse before writing: a host that runs Node can import `app/host/d1-sqlite.mjs`, `file-store.mjs`, `installation-secrets.mjs`, `outbound-fetch.mjs` and `pdf-isolate.mjs` as they are, and only replace process start-up, static serving and the scheduler. A Workers-like platform can reuse `app/cloud/pdf-worker.mjs` behind a binding.

Minimum to pass: `database`, `migrate`, `installation` and `serve` (sections 1-3, 5, 9-11). `files`, `pdfReader` and speech are optional features. `outboundFetch` is required unless the platform blocks private networks itself; then the factory returns `null` and the README says why.

Running the suite against the new host:

```js
// tests/host-<name>.test.mjs
import {runHostConformance,MIGRATIONS} from './host-conformance.mjs';
runHostConformance({
 name:'<name>',
 database:()=>openDatabase(),                 // fresh and empty each call
 migrate:db=>applyMigrations(db,MIGRATIONS),  // returns the names applied
 files:()=>openFiles(), fileKeysArePaths:true,
 installation:async()=>({secrets:()=>loadOrCreateSecrets(dir),cleanup:()=>removeDir(dir)}),
 outboundFetch:env=>createFetch(env),         // or ()=>null
 pdfReader:()=>readIsolated,
 serve:async({staticDir})=>({origin,stop}),   // start the real host process on loopback
});
```

```bash
cd app && node --test ../tests/host-<name>.test.mjs
```

`npm run test:domain` runs it with everything else. A check whose hook is missing is reported as skipped with the reason, so a partial host shows exactly what it lacks.

Registration: a host is an entry point, not a registry line, so it adds nothing to the core. It is recorded in `shared/extensions/installed.json` like other extensions. Two gaps: `app/scripts/local-registries.mjs` has no `host` seam, and `bayit-doctor` treats a recorded seam entry without a matching registry line as a problem. A `host` seam check ("`app/hosts/<id>/server.mjs` exists and its conformance test passes") would have to be added to the doctor before the first host skill ships. Moving today's two hosts to `app/hosts/node/` and `app/hosts/cloudflare/` (section 13) would make them the examples, but that is a separate change.

## 15. What the conformance suite does not test yet

- That a host's scheduler actually fires every minute (section 5).
- PDF parser isolation as such, and the Cloudflare reader Worker (section 6).
- Speech through `env.AI` (section 7).
- Outbound calls that bypass `externalFetch`: Maps, RiseUp, Auth.js (section 8).
- Cloudflare's migrator, secrets, outbound behaviour, static serving and `_headers` (sections 3, 9, 11). Only Cloudflare's D1 and R2 run in the suite.
- Request bodies of 10 MB and multiple `Set-Cookie` headers through the host (section 1).
- HTTPS termination and backup on Cloudflare (section 12). Node backup is tested in `tests/security-recovery.test.mjs`.
