-- Maps credentials are separate from household record JSON and never returned by status APIs.
CREATE TABLE IF NOT EXISTS maps_connections(
 household_id TEXT PRIMARY KEY,
 places_ciphertext TEXT NOT NULL,
 embed_ciphertext TEXT NOT NULL,
 search_verified_at TEXT NOT NULL,
 updated_by TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS maps_usage(
 household_id TEXT NOT NULL,
 member_id TEXT NOT NULL,
 minute INTEGER NOT NULL,
 requests INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(household_id,member_id,minute)
);
