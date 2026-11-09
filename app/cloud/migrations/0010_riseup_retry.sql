-- Preserve the actual attempt/success times separately from provider-requested backoff.
ALTER TABLE finance_connections ADD COLUMN next_attempt_at INTEGER;
