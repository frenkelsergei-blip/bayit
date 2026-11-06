-- Web Push (phone/desktop notifications from the installed app).
-- One VAPID key pair per installation; the private key is AES-GCM encrypted with APP_ENCRYPTION_KEY.
CREATE TABLE IF NOT EXISTS push_config(
  id TEXT PRIMARY KEY,
  public_key TEXT NOT NULL,
  private_ciphertext TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
-- One row per device that a household member enabled. Removed when the push service reports it expired.
CREATE TABLE IF NOT EXISTS push_subscriptions(
  endpoint_hash TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  device TEXT,
  created_at INTEGER NOT NULL,
  last_ok_at INTEGER,
  failures INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS push_subscriptions_member ON push_subscriptions(household_id,member_id);
