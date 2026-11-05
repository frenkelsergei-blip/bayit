-- Optional link from a child invitation to an existing managed child profile.
ALTER TABLE invitations ADD COLUMN member_id TEXT;
