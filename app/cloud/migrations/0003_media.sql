-- Photos and voice messages in Telegram. Voice stays off until a parent chooses a speech provider.
CREATE TABLE IF NOT EXISTS media_settings(
  household_id TEXT PRIMARY KEY,
  photos INTEGER NOT NULL DEFAULT 1,
  speech_provider TEXT NOT NULL DEFAULT 'off',
  updated_by TEXT,
  updated_at TEXT
);
-- Transcribed seconds per household per day, capped to protect the installation's own allowance.
CREATE TABLE IF NOT EXISTS speech_usage(
  household_id TEXT NOT NULL,
  day TEXT NOT NULL,
  seconds INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(household_id,day)
);
