-- בית AI (Bayit AI) recommendations, 2026-11-10. Rules find things worth a check (v1: money); each finding is shown as a
-- task with the AI flag to the adults who may see its rows. The code tolerates these tables being missing.
CREATE TABLE IF NOT EXISTS bayit_ai_settings (
 household_id TEXT PRIMARY KEY REFERENCES households(id) ON DELETE CASCADE,
 settings TEXT NOT NULL DEFAULT '{}',
 updated_by TEXT,
 updated_at INTEGER,
 last_run_at INTEGER NOT NULL DEFAULT 0,
 next_run_at INTEGER NOT NULL DEFAULT 0,
 last_result TEXT
);
CREATE INDEX IF NOT EXISTS bayit_ai_settings_due ON bayit_ai_settings(next_run_at);

-- One row per finding and money view ("family", or "private:<member>"). The finding id is stable, so a finding is
-- never opened twice. status: open | ok | action | dismissed | expired.
CREATE TABLE IF NOT EXISTS bayit_ai_findings (
 household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
 scope_key TEXT NOT NULL,
 id TEXT NOT NULL,
 kind TEXT NOT NULL,
 area TEXT NOT NULL DEFAULT 'money',
 provider_key TEXT,
 data TEXT NOT NULL,
 viewer_ids TEXT NOT NULL DEFAULT '[]',
 assignee_ids TEXT NOT NULL DEFAULT '[]',
 level INTEGER NOT NULL DEFAULT 1,
 status TEXT NOT NULL DEFAULT 'open',
 created_at INTEGER NOT NULL,
 answered_at INTEGER,
 answered_by TEXT,
 task_id TEXT,
 ai_text TEXT,
 PRIMARY KEY(household_id,scope_key,id)
);
CREATE INDEX IF NOT EXISTS bayit_ai_findings_status ON bayit_ai_findings(household_id,status,created_at);

-- "Not relevant" learning: never suggest this kind for this provider again in this money view (undo in Settings).
CREATE TABLE IF NOT EXISTS bayit_ai_suppressions (
 household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
 scope_key TEXT NOT NULL,
 rule_key TEXT NOT NULL,
 label TEXT,
 created_by TEXT,
 created_at INTEGER NOT NULL,
 PRIMARY KEY(household_id,scope_key,rule_key)
);

-- Each person's own digest choice (off / daily / weekly, time, Push, Telegram). Private to that person.
CREATE TABLE IF NOT EXISTS bayit_ai_prefs (
 household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
 member_id TEXT NOT NULL,
 prefs TEXT NOT NULL DEFAULT '{}',
 PRIMARY KEY(household_id,member_id)
);
