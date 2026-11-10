-- "Who we pay": the family's corrections to the provider list (renames, merges, hidden providers, providers added
-- by hand, optional AI labels) and the last optional AI summary. One row for the shared money view of the household
-- (scope_key 'family', visible to every adult) and one per adult for their private view ('private:<member id>').
-- Amounts and names are money data: only the adult-only finance API reads or writes this table.
CREATE TABLE IF NOT EXISTS finance_providers(
 household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
 scope_key TEXT NOT NULL,
 settings TEXT NOT NULL DEFAULT '{}',
 ai TEXT,
 version INTEGER NOT NULL DEFAULT 1,
 updated_by TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 PRIMARY KEY(household_id,scope_key)
);
