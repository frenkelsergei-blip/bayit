-- Each household chooses its AI provider (Claude, OpenAI, Gemini, Grok or a custom OpenAI-compatible endpoint).
ALTER TABLE household_secrets ADD COLUMN provider TEXT NOT NULL DEFAULT 'anthropic';
ALTER TABLE household_secrets ADD COLUMN base_url TEXT;
