-- Telegram delivery for each household's own bot, plus the reminder delivery log.
-- Bot tokens are AES-GCM encrypted with APP_ENCRYPTION_KEY, bound to the household ID.
CREATE TABLE IF NOT EXISTS telegram_bots(
  household_id TEXT PRIMARY KEY,
  ciphertext TEXT NOT NULL,
  bot_id TEXT NOT NULL,
  bot_username TEXT NOT NULL,
  hook_id TEXT NOT NULL UNIQUE,
  secret_hash TEXT NOT NULL,
  connected_by TEXT NOT NULL,
  connected_at TEXT NOT NULL
);
-- One private Telegram chat per household member. A chat links only after the recipient presses Start.
CREATE TABLE IF NOT EXISTS telegram_links(
  household_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  telegram_user_id TEXT NOT NULL,
  telegram_name TEXT,
  linked_at TEXT NOT NULL,
  blocked INTEGER NOT NULL DEFAULT 0,
  turns TEXT,
  turns_at INTEGER,
  PRIMARY KEY(household_id,member_id),
  UNIQUE(household_id,chat_id)
);
-- One-time Start links. Only SHA-256 hashes are stored.
CREATE TABLE IF NOT EXISTS telegram_link_tokens(
  token_hash TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  created_by TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);
-- Inline-button payloads (Telegram callback data is limited to 64 bytes).
CREATE TABLE IF NOT EXISTS telegram_actions(
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);
-- Webhook retries are processed once.
CREATE TABLE IF NOT EXISTS telegram_updates(
  household_id TEXT NOT NULL,
  update_id INTEGER NOT NULL,
  received_at INTEGER NOT NULL,
  PRIMARY KEY(household_id,update_id)
);
CREATE TABLE IF NOT EXISTS telegram_snoozes(
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  due_at INTEGER NOT NULL,
  sent_at INTEGER
);
-- Each reminder/digest/update is claimed once per channel before it is sent.
CREATE TABLE IF NOT EXISTS notification_deliveries(
  household_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  delivery_key TEXT NOT NULL,
  status TEXT NOT NULL,
  detail TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(household_id,member_id,channel,delivery_key)
);
CREATE INDEX IF NOT EXISTS telegram_snoozes_due ON telegram_snoozes(due_at) WHERE sent_at IS NULL;
CREATE INDEX IF NOT EXISTS notification_deliveries_age ON notification_deliveries(created_at);
-- Last successful scheduler run, shown in Settings so a stopped schedule is visible.
CREATE TABLE IF NOT EXISTS service_heartbeats(name TEXT PRIMARY KEY,at INTEGER NOT NULL,detail TEXT);
