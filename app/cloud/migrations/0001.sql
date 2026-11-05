CREATE TABLE IF NOT EXISTS "accounts" (
    "id" text NOT NULL,
    "userId" text NOT NULL DEFAULT NULL,
    "type" text NOT NULL DEFAULT NULL,
    "provider" text NOT NULL DEFAULT NULL,
    "providerAccountId" text NOT NULL DEFAULT NULL,
    "refresh_token" text DEFAULT NULL,
    "access_token" text DEFAULT NULL,
    "expires_at" number DEFAULT NULL,
    "token_type" text DEFAULT NULL,
    "scope" text DEFAULT NULL,
    "id_token" text DEFAULT NULL,
    "session_state" text DEFAULT NULL,
    "oauth_token_secret" text DEFAULT NULL,
    "oauth_token" text DEFAULT NULL,
    PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS "sessions" (
    "id" text NOT NULL,
    "sessionToken" text NOT NULL,
    "userId" text NOT NULL DEFAULT NULL,
    "expires" datetime NOT NULL DEFAULT NULL, 
    PRIMARY KEY (sessionToken)
);
CREATE TABLE IF NOT EXISTS "users" (
    "id" text NOT NULL DEFAULT '',
    "name" text DEFAULT NULL,
    "email" text DEFAULT NULL,
    "emailVerified" datetime DEFAULT NULL,
    "image" text DEFAULT NULL, 
    PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS "verification_tokens" (
    "identifier" text NOT NULL,
    "token" text NOT NULL DEFAULT NULL,
    "expires" datetime NOT NULL DEFAULT NULL, 
    PRIMARY KEY (token)
);
CREATE UNIQUE INDEX IF NOT EXISTS account_identity ON accounts(provider,providerAccountId);
CREATE TABLE IF NOT EXISTS households(id TEXT PRIMARY KEY,name TEXT NOT NULL,created_by TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS memberships(household_id TEXT NOT NULL,user_id TEXT NOT NULL,member_id TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('parent','adult','child')),created_at TEXT NOT NULL,PRIMARY KEY(household_id,user_id),UNIQUE(household_id,member_id));
CREATE TABLE IF NOT EXISTS household_data(household_id TEXT PRIMARY KEY,state TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS invitations(token_hash TEXT PRIMARY KEY,household_id TEXT NOT NULL,role TEXT NOT NULL,created_by TEXT NOT NULL,expires_at INTEGER NOT NULL,used_by TEXT,used_at INTEGER);
CREATE TABLE IF NOT EXISTS household_secrets(household_id TEXT PRIMARY KEY,ciphertext TEXT,model TEXT,models TEXT,verified INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS ai_usage(household_id TEXT NOT NULL,member_id TEXT NOT NULL,day TEXT NOT NULL,requests INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(household_id,member_id,day));

CREATE TABLE IF NOT EXISTS files(id TEXT PRIMARY KEY,household_id TEXT NOT NULL,owner_id TEXT NOT NULL,object_key TEXT NOT NULL,filename TEXT NOT NULL,mime TEXT NOT NULL,size INTEGER NOT NULL,created_at TEXT NOT NULL);
