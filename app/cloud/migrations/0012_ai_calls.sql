-- AI usage ledger: one row per AI provider call that returned (including calls the app later refused, because the
-- provider still billed their tokens). Never stores prompt or answer text. Works the same for every provider.
-- cost_micros is US dollars × 1,000,000, computed once at write time; price_version names the price used
-- ("bayit:<date>" = Bayit's shipped list, "household:<id>" = a parent's own price), so a later price change never
-- rewrites past spend. Both are NULL when no price was known (tokens only); a parent may later price those calls only.
-- `day` is the household's local date (HOME_TIMEZONE), used for the daily chart and the credit start date.
CREATE TABLE IF NOT EXISTS ai_calls(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
 member_id TEXT NOT NULL,
 ts TEXT NOT NULL,
 day TEXT NOT NULL,
 feature TEXT NOT NULL,
 provider TEXT NOT NULL,
 model TEXT NOT NULL,
 input_tokens INTEGER NOT NULL DEFAULT 0,
 output_tokens INTEGER NOT NULL DEFAULT 0,
 cache_read_tokens INTEGER NOT NULL DEFAULT 0,
 cache_write_tokens INTEGER NOT NULL DEFAULT 0,
 cost_micros INTEGER,
 price_version TEXT,
 ok INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS ai_calls_household_day ON ai_calls(household_id,day);
CREATE INDEX IF NOT EXISTS ai_calls_unpriced ON ai_calls(household_id,provider,model) WHERE cost_micros IS NULL;

-- Prepaid credit a parent entered for one provider account (USD × 1,000,000) and the local date they read it on the
-- provider's billing page. One row per provider, so switching providers keeps each account's own estimate.
CREATE TABLE IF NOT EXISTS ai_credit(
 household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
 provider TEXT NOT NULL,
 amount_micros INTEGER NOT NULL CHECK(amount_micros>=0),
 since TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 updated_by TEXT NOT NULL,
 PRIMARY KEY(household_id,provider)
);

-- A parent's own price for a model (US$ per million tokens), for models Bayit's list does not know (new models,
-- custom endpoints) or when a provider changes its prices before a Bayit update. Append-only versions: the latest
-- version in effect on a call's day applies; active=0 stops using the household price from effective_from.
CREATE TABLE IF NOT EXISTS ai_price_overrides(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
 provider TEXT NOT NULL,
 model TEXT NOT NULL,
 input_per_m REAL,
 output_per_m REAL,
 cache_read_per_m REAL,
 cache_write_per_m REAL,
 active INTEGER NOT NULL DEFAULT 1,
 effective_from TEXT NOT NULL,
 created_at TEXT NOT NULL,
 created_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ai_price_overrides_model ON ai_price_overrides(household_id,provider,model);
