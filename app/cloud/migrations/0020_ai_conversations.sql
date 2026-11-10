-- בית AI conversation history (user request 2026-11-10): every question and answer in the app, private to the person
-- who asked. Searchable and paged; a conversation can be reopened and continued. The code tolerates these tables missing.
CREATE TABLE IF NOT EXISTS ai_conversations (
 household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 member_id TEXT NOT NULL,
 title TEXT NOT NULL,
 scope TEXT NOT NULL DEFAULT 'family',
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL,
 turns INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(household_id,id)
);
CREATE INDEX IF NOT EXISTS ai_conversations_member ON ai_conversations(household_id,member_id,updated_at);
CREATE TABLE IF NOT EXISTS ai_turns (
 household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
 conversation_id TEXT NOT NULL,
 seq INTEGER NOT NULL,
 member_id TEXT NOT NULL,
 question TEXT NOT NULL,
 answer TEXT NOT NULL DEFAULT '',
 plan TEXT,
 sources TEXT,
 voice INTEGER NOT NULL DEFAULT 0,
 created_at INTEGER NOT NULL,
 PRIMARY KEY(household_id,conversation_id,seq)
);
CREATE INDEX IF NOT EXISTS ai_turns_member ON ai_turns(household_id,member_id,created_at);
