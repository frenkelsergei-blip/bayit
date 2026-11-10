CREATE TABLE IF NOT EXISTS home_suggestions (
 household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
 owner_id TEXT NOT NULL,
 enabled INTEGER NOT NULL DEFAULT 0,
 snapshot TEXT NOT NULL DEFAULT '[]',
 marks TEXT NOT NULL DEFAULT '{}',
 next_at INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(household_id,owner_id)
);
CREATE INDEX IF NOT EXISTS home_suggestions_due ON home_suggestions(enabled,next_at);
