CREATE TABLE IF NOT EXISTS kids_parent_controls (
 household_id TEXT PRIMARY KEY REFERENCES households(id) ON DELETE CASCADE,
 salt TEXT NOT NULL,
 pin_hash TEXT NOT NULL,
 version INTEGER NOT NULL DEFAULT 1,
 updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS kids_bonus_grants (
 household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 child_id TEXT NOT NULL,
 actor_id TEXT NOT NULL,
 amount INTEGER NOT NULL CHECK(amount BETWEEN 1 AND 10000),
 reason TEXT NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(household_id,id)
);
CREATE INDEX IF NOT EXISTS kids_bonus_child_history ON kids_bonus_grants(household_id,child_id,created_at DESC,id DESC);
