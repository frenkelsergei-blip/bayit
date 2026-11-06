-- Installation-owned security state. No record text or credentials belong in the audit table.
CREATE TABLE member_identities(household_id TEXT NOT NULL,member_id TEXT NOT NULL,user_id TEXT,telegram_user_id TEXT,bound_at INTEGER NOT NULL,PRIMARY KEY(household_id,member_id));
INSERT INTO member_identities(household_id,member_id,user_id,bound_at) SELECT household_id,member_id,user_id,CAST(strftime('%s','now') AS INTEGER)*1000 FROM memberships;
INSERT INTO member_identities(household_id,member_id,telegram_user_id,bound_at) SELECT household_id,member_id,telegram_user_id,CAST(strftime('%s','now') AS INTEGER)*1000 FROM telegram_links WHERE 1 ON CONFLICT(household_id,member_id) DO UPDATE SET telegram_user_id=excluded.telegram_user_id;
ALTER TABLE invitations ADD COLUMN identity_verified INTEGER NOT NULL DEFAULT 0;
ALTER TABLE telegram_link_tokens ADD COLUMN expected_telegram_user_id TEXT;
ALTER TABLE telegram_link_tokens ADD COLUMN claim_id TEXT;
CREATE UNIQUE INDEX member_telegram_identity ON member_identities(household_id,telegram_user_id) WHERE telegram_user_id IS NOT NULL;
CREATE TRIGGER preserve_member_identity BEFORE INSERT ON memberships WHEN EXISTS(SELECT 1 FROM member_identities WHERE household_id=NEW.household_id AND member_id=NEW.member_id AND user_id IS NOT NULL AND user_id<>NEW.user_id) BEGIN SELECT RAISE(ABORT,'This member belongs to another identity.');END;
-- A managed Telegram chat is not proof of the child's future Google identity. Google enrollment requires fresh chat approval.
DELETE FROM telegram_links WHERE EXISTS(SELECT 1 FROM memberships m WHERE m.household_id=telegram_links.household_id AND m.member_id=telegram_links.member_id AND m.role='child');
DELETE FROM telegram_link_tokens WHERE EXISTS(SELECT 1 FROM memberships m WHERE m.household_id=telegram_link_tokens.household_id AND m.member_id=telegram_link_tokens.member_id AND m.role='child');
UPDATE member_identities SET telegram_user_id=NULL WHERE EXISTS(SELECT 1 FROM memberships m WHERE m.household_id=member_identities.household_id AND m.member_id=member_identities.member_id AND m.role='child');
CREATE TRIGGER child_google_enrollment BEFORE INSERT ON memberships WHEN NEW.role='child' AND NOT EXISTS(SELECT 1 FROM member_identities WHERE household_id=NEW.household_id AND member_id=NEW.member_id AND user_id IS NOT NULL) BEGIN DELETE FROM telegram_links WHERE household_id=NEW.household_id AND member_id=NEW.member_id;DELETE FROM telegram_link_tokens WHERE household_id=NEW.household_id AND member_id=NEW.member_id;UPDATE member_identities SET telegram_user_id=NULL WHERE household_id=NEW.household_id AND member_id=NEW.member_id;END;
CREATE TRIGGER bind_member_identity AFTER INSERT ON memberships BEGIN INSERT INTO member_identities(household_id,member_id,user_id,bound_at) VALUES(NEW.household_id,NEW.member_id,NEW.user_id,CAST(strftime('%s','now') AS INTEGER)*1000) ON CONFLICT(household_id,member_id) DO UPDATE SET user_id=COALESCE(member_identities.user_id,excluded.user_id);END;
ALTER TABLE telegram_links ADD COLUMN turns_scope TEXT;
ALTER TABLE telegram_links ADD COLUMN turns_revision INTEGER;
ALTER TABLE push_subscriptions ADD COLUMN session_id TEXT;
CREATE TABLE session_auth(session_token TEXT PRIMARY KEY,user_id TEXT NOT NULL,authenticated_at INTEGER NOT NULL);
-- Existing sessions must confirm identity again for sensitive actions. Only newly issued sessions are recent.
CREATE TRIGGER session_authenticated AFTER INSERT ON sessions BEGIN INSERT OR REPLACE INTO session_auth VALUES(NEW.sessionToken,NEW.userId,CAST(strftime('%s','now') AS INTEGER)*1000); END;
CREATE TRIGGER session_revoked AFTER DELETE ON sessions BEGIN DELETE FROM session_auth WHERE session_token=OLD.sessionToken;DELETE FROM push_subscriptions WHERE session_id=OLD.id;END;
CREATE TABLE security_audit(id TEXT PRIMARY KEY,household_id TEXT,actor_id TEXT NOT NULL,action TEXT NOT NULL,resource_id TEXT,result TEXT NOT NULL,created_at INTEGER NOT NULL);
CREATE INDEX security_audit_actor ON security_audit(household_id,actor_id,created_at);
CREATE TABLE security_rate_limits(bucket TEXT PRIMARY KEY,window INTEGER NOT NULL,count INTEGER NOT NULL,expires_at INTEGER NOT NULL);
CREATE TABLE security_leases(name TEXT PRIMARY KEY,token TEXT NOT NULL,expires_at INTEGER NOT NULL);
CREATE TABLE file_quotas(household_id TEXT PRIMARY KEY,used_bytes INTEGER NOT NULL DEFAULT 0,reserved_bytes INTEGER NOT NULL DEFAULT 0);
INSERT INTO file_quotas(household_id,used_bytes) SELECT household_id,SUM(size) FROM files GROUP BY household_id;
CREATE TABLE file_reservations(id TEXT PRIMARY KEY,household_id TEXT NOT NULL,file_id TEXT NOT NULL,size INTEGER NOT NULL,created_at INTEGER NOT NULL,UNIQUE(household_id,file_id));
ALTER TABLE files ADD COLUMN deleting_at INTEGER;
