# Testing

## Unit tests (fast, no network)

```bash
cd app
npm run test:domain   # tests/*.test.mjs: permissions, recurrence, shopping lists, AI contract, reminders, expenses, RiseUp sync
npm run test:sites    # packaging checks
npm run build:cloud   # production client build
```

Finance tests use **synthetic** statement rows only. Do not add real bank or card statements to the repository.

## End-to-end (local Cloudflare runtime, fake external APIs)

These run against `wrangler dev` with a local D1 database and fixture Google sessions. Telegram, Anthropic and speech are replaced by a fake server on `127.0.0.1:8899`, started by the test itself. Nothing reaches the real services.

```bash
cd app
PERSIST=$(mktemp -d)
npx wrangler d1 migrations apply bayit-home --local --config wrangler.worker.jsonc --persist-to $PERSIST
npx wrangler d1 execute bayit-home --local --config wrangler.worker.jsonc --persist-to $PERSIST --file ../tests/e2e/cloud-fixtures.sql
npm run build:cloud
npx wrangler dev --config wrangler.worker.jsonc --port 8791 --persist-to $PERSIST \
  --var AUTH_SECRET:local-test-auth-secret-0123456789abcdef \
  --var GOOGLE_CLIENT_ID:local-test --var GOOGLE_CLIENT_SECRET:local-test \
  --var APP_ENCRYPTION_KEY:$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))") \
  --var TELEGRAM_API_ORIGIN:http://127.0.0.1:8899 --var AI_TEST_ORIGIN:http://127.0.0.1:8899 \
  --var SPEECH_TEST_ORIGIN:http://127.0.0.1:8899 --var RISEUP_TEST_ORIGIN:http://127.0.0.1:8899 \
  --var REMINDER_CRON_SECRET:local-test-cron-secret
```

In a second terminal:

```bash
cd app
BAYIT_TEST_ORIGIN=http://127.0.0.1:8791 WRANGLER_PERSIST=$PERSIST npm run test:telegram
BAYIT_TEST_ORIGIN=http://127.0.0.1:8791 npm run test:cloud-api
```

The `*_TEST_ORIGIN` variables accept **loopback addresses only**, and production never sets them.
