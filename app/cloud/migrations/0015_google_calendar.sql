CREATE TABLE IF NOT EXISTS google_calendar_connections (
 household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
 owner_id TEXT NOT NULL,
 ciphertext TEXT NOT NULL,
 scopes TEXT NOT NULL,
 sharing INTEGER NOT NULL DEFAULT 0,
 output_calendar TEXT,
 PRIMARY KEY(household_id,owner_id)
);
CREATE TABLE IF NOT EXISTS google_calendar_oauth (
 state_hash TEXT PRIMARY KEY,
 household_id TEXT NOT NULL,
 owner_id TEXT NOT NULL,
 ciphertext TEXT NOT NULL,
 expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS google_calendar_links (
 household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
 owner_id TEXT NOT NULL,
 event_id TEXT NOT NULL,
 direction TEXT NOT NULL CHECK(direction IN ('import','export')),
 calendar_id TEXT NOT NULL,
 remote_id TEXT NOT NULL,
 last_key TEXT,
 status TEXT NOT NULL DEFAULT 'pending',
 checked_at INTEGER,
 next_at INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(household_id,owner_id,event_id),
 UNIQUE(household_id,owner_id,direction,calendar_id,remote_id)
);
CREATE INDEX IF NOT EXISTS google_calendar_due ON google_calendar_links(next_at);
