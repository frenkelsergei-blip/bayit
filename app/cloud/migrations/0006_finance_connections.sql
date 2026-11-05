-- Optional live finance connections (RiseUp first). One connection per person; the token is encrypted
-- with APP_ENCRYPTION_KEY and never returned. Visibility of the synced data is chosen by its owner.
CREATE TABLE IF NOT EXISTS finance_connections(
  household_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  scopes TEXT NOT NULL DEFAULT '[]',
  visibility TEXT NOT NULL DEFAULT 'selected',
  allowed_ids TEXT NOT NULL DEFAULT '[]',
  months_back INTEGER NOT NULL DEFAULT 3,
  prefer_over_statements INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'new',
  last_error TEXT,
  last_sync_at INTEGER,
  last_attempt_at INTEGER,
  last_count INTEGER NOT NULL DEFAULT 0,
  balances TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(household_id,member_id,provider)
);
