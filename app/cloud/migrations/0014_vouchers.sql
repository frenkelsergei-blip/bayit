-- Vouchers have a private owner. Redemption credentials stay outside household state and AI context.
CREATE TABLE IF NOT EXISTS vouchers (
 household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
 owner_id TEXT NOT NULL,
 id TEXT NOT NULL,
 metadata TEXT NOT NULL,
 ciphertext TEXT,
 version INTEGER NOT NULL DEFAULT 1,
 PRIMARY KEY (household_id, owner_id, id)
);
