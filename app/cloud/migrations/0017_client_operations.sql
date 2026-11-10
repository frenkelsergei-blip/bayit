-- Offline edits (2026-11-09): each queued change carries a client operation id. The server records the ids it
-- applied, so a change retried after a lost answer (flaky network, timeout) is never applied twice.
-- The app tolerates this table being absent: it then relies on the revision check and field merge only.
CREATE TABLE IF NOT EXISTS client_operations(
 household_id TEXT NOT NULL,
 member_id TEXT NOT NULL,
 op_id TEXT NOT NULL,
 revision INTEGER NOT NULL,
 applied_at INTEGER NOT NULL,
 PRIMARY KEY(household_id,member_id,op_id)
);
CREATE INDEX IF NOT EXISTS client_operations_age ON client_operations(household_id,applied_at);
