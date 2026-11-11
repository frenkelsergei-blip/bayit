-- Passkey sign-in ("מפתח גישה"), docs/passkey-sign-in-design.md §5A. The same file runs on Cloudflare D1 and Docker SQLite.
-- Only public keys, counters, flags and labels are stored. No private key, biometric or device identifier reaches the server.
CREATE TABLE passkey_credentials(
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL,
 public_key BLOB NOT NULL,
 counter INTEGER NOT NULL DEFAULT 0,
 transports TEXT,
 device_type TEXT,
 backed_up INTEGER NOT NULL DEFAULT 0,
 name TEXT,
 rp_id TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 last_used_at INTEGER
);
CREATE INDEX passkey_credentials_user ON passkey_credentials(user_id);
-- Server-stored, single-use ceremony challenges (deleted by the verify that reads them; 5 minutes).
-- `data` holds what the matching verify needs (the permit it is bound to, the new user handle and chosen name).
CREATE TABLE webauthn_challenges(id TEXT PRIMARY KEY,challenge TEXT NOT NULL,purpose TEXT NOT NULL,user_id TEXT,permit TEXT,data TEXT,expires_at INTEGER NOT NULL);
-- Exactly one row once the first owner has finished setup; its presence closes the setup code for good.
CREATE TABLE installation_setup(id INTEGER PRIMARY KEY CHECK(id=1),owner_user_id TEXT NOT NULL,rp_id TEXT NOT NULL,origin TEXT NOT NULL,completed_at INTEGER NOT NULL);
-- SHA-256 of every setup and operator recovery code that was used, so none works twice.
CREATE TABLE used_codes(code_hash TEXT PRIMARY KEY,purpose TEXT NOT NULL,used_at INTEGER NOT NULL);
ALTER TABLE invitations ADD COLUMN purpose TEXT NOT NULL DEFAULT 'join';
ALTER TABLE invitations ADD COLUMN target_user_id TEXT;
ALTER TABLE invitations ADD COLUMN usable_at INTEGER;
CREATE INDEX invitations_recovery_target ON invitations(target_user_id) WHERE target_user_id IS NOT NULL;
