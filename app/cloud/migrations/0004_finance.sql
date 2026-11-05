-- Household money: imported bank and card statements. Adults only; each row carries owner + visibility.
CREATE TABLE IF NOT EXISTS finance_imports(
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  source TEXT NOT NULL,
  kind TEXT NOT NULL,
  file_name TEXT,
  period_from TEXT,
  period_to TEXT,
  statement_date TEXT,
  status TEXT NOT NULL,
  payload TEXT,
  checks TEXT,
  tx_count INTEGER NOT NULL DEFAULT 0,
  new_count INTEGER NOT NULL DEFAULT 0,
  visibility TEXT NOT NULL DEFAULT 'selected',
  allowed_ids TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  applied_at INTEGER
);
CREATE INDEX IF NOT EXISTS finance_imports_household ON finance_imports(household_id,created_at);
CREATE TABLE IF NOT EXISTS finance_transactions(
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  import_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  visibility TEXT NOT NULL,
  allowed_ids TEXT NOT NULL DEFAULT '[]',
  source TEXT NOT NULL,
  account TEXT,
  member_id TEXT,
  date TEXT NOT NULL,
  charge_date TEXT,
  month TEXT NOT NULL,
  description TEXT NOT NULL,
  name_key TEXT NOT NULL,
  amount INTEGER NOT NULL,
  currency TEXT,
  original_amount INTEGER,
  category TEXT NOT NULL,
  kind TEXT NOT NULL,
  card_issuer TEXT,
  balance INTEGER,
  seq INTEGER,
  installment_n INTEGER,
  installment_of INTEGER,
  standing_order INTEGER NOT NULL DEFAULT 0,
  foreign_tx INTEGER NOT NULL DEFAULT 0,
  fingerprint TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(household_id,fingerprint)
);
CREATE INDEX IF NOT EXISTS finance_transactions_month ON finance_transactions(household_id,month);
CREATE INDEX IF NOT EXISTS finance_transactions_import ON finance_transactions(import_id);
-- Card charge totals printed by the card company; used to avoid counting a bank card payment twice.
CREATE TABLE IF NOT EXISTS finance_groups(
  household_id TEXT NOT NULL,
  issuer TEXT NOT NULL,
  card TEXT NOT NULL,
  kind TEXT NOT NULL,
  charge_date TEXT NOT NULL,
  total INTEGER NOT NULL,
  import_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  visibility TEXT NOT NULL,
  allowed_ids TEXT NOT NULL DEFAULT '[]',
  PRIMARY KEY(household_id,issuer,card,kind,charge_date)
);
-- Which family member a card or account belongs to.
CREATE TABLE IF NOT EXISTS finance_cards(
  household_id TEXT NOT NULL,
  source TEXT NOT NULL,
  account TEXT NOT NULL,
  member_id TEXT,
  holder TEXT,
  PRIMARY KEY(household_id,source,account)
);
-- Learned categories: "always put this merchant in this category".
CREATE TABLE IF NOT EXISTS finance_rules(
  household_id TEXT NOT NULL,
  name_key TEXT NOT NULL,
  category TEXT NOT NULL,
  created_by TEXT NOT NULL,
  PRIMARY KEY(household_id,name_key)
);
