-- Payment sources (cards and bank accounts). The app tolerates this migration missing: it then falls back to the
-- older columns and keeps no per-card choices.
-- RiseUp: card_issuer now always holds RiseUp's institution id ('max', 'leumiBank'…) and the nickname the person set
-- in RiseUp moves to account_label, so a nickname no longer hides which company the card is from.
ALTER TABLE finance_transactions ADD COLUMN account_label TEXT;
-- The family's choices per source: whose it is, whether it is shared, its last four digits when the source does not say
-- (RiseUp never sends them), and an optional name. source_key is the raw key from shared/payment-sources.mjs sourceOf():
-- 'riseup:<RiseUp account code>' or '<issuer>:<last 4>'. Money data: only the adult-only finance API reads or writes it,
-- and it only returns rows for sources the viewer has transactions from.
CREATE TABLE IF NOT EXISTS finance_sources(
 household_id TEXT NOT NULL,
 source_key TEXT NOT NULL,
 last4 TEXT,
 owner_id TEXT,
 shared INTEGER,
 label TEXT,
 updated_by TEXT NOT NULL,
 updated_at INTEGER NOT NULL,
 PRIMARY KEY(household_id,source_key)
);
